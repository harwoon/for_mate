"""
crop -> DINOv2 임베딩 추출 -> DB(images/embeddings) 저장.

탐지기는 collect_dataset.py 와 동일 (torchvision Faster R-CNN v2, BSD-3).
"""
# MegaDescriptor모델 기준
# 모델이 바뀔 경우 모델 로드, 전처리, db 벡터 차원수 변경 필요
import os
from pathlib import Path
from functools import lru_cache

import cv2
import numpy as np
import psycopg2
import requests
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoImageProcessor, AutoModel
from dotenv import load_dotenv
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
)

ML_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ML_DIR / ".env")

TARGET_SIZE = (224, 224)
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep",
                  "cow", "elephant", "bear", "zebra", "giraffe"}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# MEGADESCRIPTOR_CKPT = ML_DIR / "checkpoints" / "megadescriptor_mpdd_best.pth"
MODEL_VERSION_KEY = os.environ.get(
    "EMBEDDING_MODEL_VERSION_KEY",
    ""
).strip()

if not MODEL_VERSION_KEY:
    raise RuntimeError(
        "EMBEDDING_MODEL_VERSION_KEY가 설정되지 않았습니다."
    )

DOG_CKPT_NAME = os.environ.get(
    "DOG_EMBEDDING_CHECKPOINT",
    ""
).strip()

if not DOG_CKPT_NAME:
    raise RuntimeError(
        "DOG_EMBEDDING_CHECKPOINT가 설정되지 않았습니다."
    )

CAT_CKPT_NAME = os.environ.get(
    "CAT_EMBEDDING_CHECKPOINT",
    ""
).strip()

if not CAT_CKPT_NAME:
    raise RuntimeError(
        "CAT_EMBEDDING_CHECKPOINT가 설정되지 않았습니다."
    )

DOG_CKPT = (
    ML_DIR
    / "checkpoints"
    / DOG_CKPT_NAME
)

CAT_CKPT = (
    ML_DIR
    / "checkpoints"
    / CAT_CKPT_NAME
)

# ── 1. 탐지기 (collect_dataset.py 와 동일 설정) ──────────────
_DET_WEIGHTS = FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
_det_model = fasterrcnn_resnet50_fpn_v2(weights=_DET_WEIGHTS, box_score_thresh=0.5)
_det_model.eval().to(DEVICE)
_det_preprocess = _DET_WEIGHTS.transforms()
_COCO_CATEGORIES = _DET_WEIGHTS.meta["categories"]


@torch.no_grad()
def _detect_animals(img_bgr):
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    t = torch.from_numpy(rgb).permute(2, 0, 1).contiguous()
    out = _det_model([_det_preprocess(t).to(DEVICE)])[0]
    dets = []
    for box, label, score in zip(out["boxes"], out["labels"], out["scores"]):
        if _COCO_CATEGORIES[int(label)] in ANIMAL_CLASSES:
            x1, y1, x2, y2 = box.tolist()
            dets.append((x1, y1, x2, y2, float(score)))
    return dets


def resize_with_padding(img, size=TARGET_SIZE):
    tw, th = size
    h, w = img.shape[:2]
    s = min(tw / w, th / h)
    nw, nh = int(w * s), int(h * s)
    r = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((th, tw, 3), 114, np.uint8)
    y0, x0 = (th - nh) // 2, (tw - nw) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = r
    return canvas


def crop(img_bgr):
    """img_bgr: cv2로 읽은 원본. 동물 미탐지 시 None."""
    dets = _detect_animals(img_bgr)
    if not dets:
        return None
    x1, y1, x2, y2, _ = max(dets, key=lambda d: (d[2] - d[0]) * (d[3] - d[1]))
    h, w = img_bgr.shape[:2]
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(w, int(x2)), min(h, int(y2))
    c = img_bgr[y1:y2, x1:x2]
    return resize_with_padding(c) if c.size else None


def download(url):
    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        return cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"다운로드 실패: {url} ({e})")
        return None


# ── 2. DINOv2 + species별 projection ──────────────────────
DINO_BACKBONE_ID = "facebook/dinov2-small"

# crop()이 이미 224x224로 letterbox해두므로 프로세서의 기본 리사이즈/센터크롭
# (shortest_edge=256 -> 224 크롭)을 끈다. 켜두면 학습 때 쓴 train_dinov2_projection.py의
# 전처리(Resize((224,224)) 후 크롭 없음)와 어긋나 이미지 가장자리가 잘려나간다.
_dino_processor = AutoImageProcessor.from_pretrained(
    DINO_BACKBONE_ID,
    do_resize=False,
    do_center_crop=False
)

_dino_backbone = AutoModel.from_pretrained(
    DINO_BACKBONE_ID
)
_dino_backbone.eval().to(DEVICE)


def _load_projection(checkpoint_path):
    ckpt = torch.load(
        checkpoint_path,
        map_location=DEVICE,
        weights_only=True
    )

    if ckpt["backbone"] != DINO_BACKBONE_ID:
        raise ValueError(
            f"백본 불일치: {ckpt['backbone']}"
        )

    weight = ckpt["proj"]["weight"]
    out_dim, in_dim = weight.shape

    projection = nn.Linear(
        in_dim,
        out_dim,
        bias=False
    )

    projection.load_state_dict(
        ckpt["proj"]
    )

    projection.eval().to(DEVICE)

    return projection


_dog_projection = _load_projection(DOG_CKPT)
_cat_projection = _load_projection(CAT_CKPT)


@torch.no_grad()
def extract_embedding(cropped_bgr, species):
    """
    crop() 결과 이미지에서 DINOv2 임베딩을 추출한다.

    개     -> dog projection
    고양이 -> cat projection

    반환값: 512차원 L2-normalized vector
    """
    if species == "개":
        projection = _dog_projection
    elif species == "고양이":
        projection = _cat_projection
    else:
        raise ValueError(f"지원하지 않는 species입니다: {species}")

    rgb = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2RGB)

    inputs = _dino_processor(images=rgb, return_tensors="pt")

    pixel_values = inputs["pixel_values"].to(DEVICE)

    outputs = _dino_backbone(pixel_values=pixel_values)

    feature = outputs.pooler_output

    embedding = projection(feature)

    embedding = F.normalize(embedding, dim=1)

    return embedding.cpu().numpy()[0]


# ── 3. DB 저장 ───────────────────────────────────────────
# 같은 개체 안에서 거의 동일한 사진의 임베딩은 중복 저장하지 않는다.
# pgvector의 cosine distance = 1 - cosine similarity
# similarity 0.97 이상이면 distance 0.03 이하이므로 중복으로 판단한다.
DEDUP_SIMILARITY_THRESHOLD = float(
    os.environ.get(
        "DEDUP_SIMILARITY_THRESHOLD",
        "0.97"
    )
)

_ALLOWED_REF_COLUMNS = {
    "desertion_no",
    "pawinhand_animal_id",
    "found_post_id"
}

def _validate_ref_col(ref_col):
    if ref_col not in _ALLOWED_REF_COLUMNS:
        raise ValueError(
            f"허용되지 않은 ref_col입니다: {ref_col}"
        )
# 같은 동물(desertion_no/pawinhand_animal_id) 안에서 구도가 거의 같은 사진은
# 임베딩을 중복 저장하지 않는다 (매칭 시 사진 수가 많다는 이유만으로 유리해지는 걸 방지).
@lru_cache(maxsize=2)
def get_embedding_space(species):
    """
    현재 MODEL_VERSION_KEY와 species에 해당하는
    사용 가능한 임베딩 공간을 조회한다.

    DB에 등록된 checkpoint와
    실제 AI 서버가 사용하는 checkpoint도 일치하는지 확인한다.
    """

    if species == "개":
        configured_checkpoint = DOG_CKPT_NAME
    elif species == "고양이":
        configured_checkpoint = CAT_CKPT_NAME
    else:
        raise ValueError(
            f"지원하지 않는 species입니다: {species}"
        )

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"]
    )

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    es.id,
                    es.space_key,
                    es.embedding_dim,
                    es.checkpoint_name
                FROM embedding_spaces es
                JOIN model_versions mv
                    ON mv.id = es.model_version_id
                WHERE mv.version_key = %s
                  AND es.species = %s
                  AND es.is_usable = TRUE
                ORDER BY es.id ASC
                """,
                (
                    MODEL_VERSION_KEY,
                    species
                ),
            )

            rows = cur.fetchall()

    finally:
        conn.close()

    if len(rows) == 0:
        raise ValueError(
            "사용 가능한 임베딩 공간을 찾을 수 없습니다: "
            f"model={MODEL_VERSION_KEY}, "
            f"species={species}"
        )

    if len(rows) > 1:
        raise RuntimeError(
            "사용 가능한 임베딩 공간이 여러 개입니다: "
            f"model={MODEL_VERSION_KEY}, "
            f"species={species}"
        )

    (
        space_id,
        space_key,
        embedding_dim,
        checkpoint_name
    ) = rows[0]

    if checkpoint_name != configured_checkpoint:
        raise RuntimeError(
            "임베딩 공간과 checkpoint가 일치하지 않습니다: "
            f"DB={checkpoint_name}, "
            f"AI_SERVER={configured_checkpoint}"
        )

    return {
        "id": space_id,
        "space_key": space_key,
        "embedding_dim": embedding_dim,
        "checkpoint_name": checkpoint_name
    }

def is_duplicate_within_animal(
    post_type,
    ref_col,
    ref_value,
    embedding,
    species,
    threshold=DEDUP_SIMILARITY_THRESHOLD
):
    """
    같은 개체 + 같은 임베딩 공간에서
    cosine similarity가 threshold 이상인 벡터가 이미 존재하면 True.
    """

    _validate_ref_col(ref_col)

    space = get_embedding_space(
        species
    )

    if len(embedding) != space["embedding_dim"]:
        raise ValueError(
            "임베딩 차원 불일치: "
            f"실제={len(embedding)}, "
            f"공간={space['embedding_dim']}"
        )

    vector_literal = (
        "["
        + ",".join(
            map(
                str,
                embedding.tolist()
            )
        )
        + "]"
    )

    distance_threshold = 1 - threshold

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"]
    )

    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT 1
                FROM embeddings e
                JOIN images i
                    ON i.id = e.image_id
                WHERE i.post_type = %s
                  AND i.{ref_col} = %s
                  AND e.embedding_space_id = %s
                  AND (
                      e.embedding <=> %s::vector
                  ) <= %s
                LIMIT 1
                """,
                (
                    post_type,
                    ref_value,
                    space["id"],
                    vector_literal,
                    distance_threshold,
                ),
            )

            return cur.fetchone() is not None

    finally:
        conn.close()

def save_image(
    post_type,
    ref_col,
    ref_value,
    image_url
):
    """
    images 행만 저장하고 image_id를 반환한다.

    임베딩이 중복이어도 원본 사진 자체는 images에 유지한다.
    """

    _validate_ref_col(ref_col)

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"]
    )

    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO images (
                    post_type,
                    {ref_col},
                    image_url
                )
                VALUES (
                    %s,
                    %s,
                    %s
                )
                RETURNING id
                """,
                (
                    post_type,
                    ref_value,
                    image_url,
                ),
            )

            return cur.fetchone()[0]

    finally:
        conn.close()

def save_embedding_row(
    image_id,
    embedding,
    species
):
    """
    기존 임베딩을 덮어쓰지 않고
    현재 모델의 임베딩 공간에 벡터를 저장한다.
    """

    space = get_embedding_space(
        species
    )

    if len(embedding) != space["embedding_dim"]:
        raise ValueError(
            "임베딩 차원 불일치: "
            f"실제={len(embedding)}, "
            f"공간={space['embedding_dim']}"
        )

    vector_literal = (
        "["
        + ",".join(
            map(
                str,
                embedding.tolist()
            )
        )
        + "]"
    )

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"]
    )

    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO embeddings (
                    image_id,
                    embedding_space_id,
                    embedding,
                    model_version
                )
                VALUES (
                    %s,
                    %s,
                    %s::vector,
                    %s
                )
                ON CONFLICT (
                    image_id,
                    embedding_space_id
                )
                DO NOTHING
                """,
                (
                    image_id,
                    space["id"],
                    vector_literal,
                    MODEL_VERSION_KEY
                ),
            )

            return cur.rowcount > 0

    finally:
        conn.close()


# ── 4. DINOv2 임베딩 테스트 ───────────────────────────────
if __name__ == "__main__":
    test_cases = [
        (
            "개",
            "447515202600193",
            "http://openapi.animal.go.kr/openapi/service/rest/fileDownloadSrvc/files/shelter/2026/07/202608271408798.png"
        ),
        (
            "고양이",
            "447515202600193",
            "http://openapi.animal.go.kr/openapi/service/rest/fileDownloadSrvc/files/shelter/2026/07/202608271408821.png"
        ),
    ]

    for species, desertion_no, url in test_cases:
        print(f"\n[{species}] {desertion_no}")

        img = download(url)

        if img is None:
            print("이미지 다운로드 실패")
            continue

        cropped = crop(img)

        if cropped is None:
            print("동물 탐지 실패")
            continue

        emb = extract_embedding(
            cropped,
            species
        )

        print(
            f"shape={emb.shape}, "
            f"norm={np.linalg.norm(emb):.6f}"
        )

        # 테스트 스크립트라 DB에는 저장하지 않는다.
        # image_id = save_image("rescue", "desertion_no", desertion_no, url)