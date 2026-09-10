"""
crop -> MegaDescriptor 임베딩 추출 -> DB(images/embeddings) 저장.

탐지기는 collect_dataset.py 와 동일 (torchvision Faster R-CNN v2, BSD-3).
"""
# MegaDescriptor모델 기준
# 모델이 바뀔 경우 모델 로드, 전처리, db 벡터 차원수 변경 필요
import os
from pathlib import Path

import cv2
import numpy as np
import psycopg2
import requests
import timm
import torch
import torch.nn.functional as F
from dotenv import load_dotenv
from torchvision import transforms as T
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

MEGADESCRIPTOR_CKPT = ML_DIR / "checkpoints" / "megadescriptor_mpdd_best.pth"
MODEL_VERSION = "megadescriptor-b224-mpdd-v1"   # embeddings.model_version 에 그대로 저장

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


# ── 2. MegaDescriptor (finetune_megadescriptor_official.ipynb 추론 셀과 동일) ──
_backbone = timm.create_model("hf-hub:BVRA/MegaDescriptor-B-224", num_classes=0, pretrained=False)
_ck = torch.load(MEGADESCRIPTOR_CKPT, map_location=DEVICE, weights_only=False)
_backbone.load_state_dict(_ck["model"])
_backbone.eval().to(DEVICE)

_embed_tf = T.Compose([
    T.ToPILImage(),
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
])


@torch.no_grad()
def extract_embedding(cropped_bgr):
    """crop() 결과(224x224 BGR) -> 1024-d L2-normalize 벡터."""
    rgb = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2RGB)
    x = _embed_tf(rgb).unsqueeze(0).to(DEVICE)
    return F.normalize(_backbone(x)).cpu().numpy()[0]  # shape (1024,)


# ── 3. DB 저장 ───────────────────────────────────────────
def save_to_db(desertion_no, image_url, embedding):
    """images 에 사진 등록 + embeddings 에 벡터 저장 (한 트랜잭션)."""
    vector_literal = "[" + ",".join(map(str, embedding.tolist())) + "]"
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO images (post_type, desertion_no, image_url)
                VALUES ('rescue', %s, %s)
                RETURNING id
                """,
                (desertion_no, image_url),
            )
            image_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO embeddings (image_id, embedding, model_version)
                VALUES (%s, %s::vector, %s)
                """,
                (image_id, vector_literal, MODEL_VERSION),
            )
    finally:
        conn.close()


# ── 4. 테스트 ────────────────────────────────────────────
if __name__ == "__main__":
    test_cases = [
        ("447515202600193", "http://openapi.animal.go.kr/openapi/service/rest/fileDownloadSrvc/files/shelter/2026/07/202608271408798.png"),
        ("447515202600193","http://openapi.animal.go.kr/openapi/service/rest/fileDownloadSrvc/files/shelter/2026/07/202608271408821.png")
    ]
    for desertion_no, url in test_cases:
        img = download(url)
        if img is None:
            continue
        cropped = crop(img)
        if cropped is None:
            print(f"{desertion_no}: 탐지 실패")
            continue
        emb = extract_embedding(cropped)
        print(f"{desertion_no}: shape={emb.shape}, norm={np.linalg.norm(emb):.3f}")
        save_to_db(desertion_no, url, emb)  # 임베딩 저장