# python -m uvicorn main:app --port 8001
# uvicorn main:app --reload --port 8001
# uvicorn main:app --port 8001
import os
import sys
from pathlib import Path

import psycopg2

sys.path.append(
    str(Path(__file__).resolve().parent.parent / "scripts")
)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# 작성한 파일(extract_embeddings.py) 불러오기라 밑줄 그어져도 오류 있는거 아님
from extract_embeddings import (
    MODEL_VERSION_KEY,
    crop,
    download,
    extract_embedding,
    is_duplicate_within_animal,
    save_embedding_row,
    save_image,
)

app = FastAPI()


class ImageIn(BaseModel):
    id: int
    image_url: str
    species: str


class EmbedRequest(BaseModel):
    images: list[ImageIn]
    model_version_key: str | None = None


class RescueAnimalIn(BaseModel):
    desertion_no: int
    image_urls: list[str]
    species: str


class RescueEmbedRequest(BaseModel):
    animals: list[RescueAnimalIn]
    model_version_key: str | None = None


# 요청한 모델 버전과 AI Server가 실제 로드한 모델 버전이 같은지 확인
def validate_model_version(requested_model_version):
    if requested_model_version is None:
        return

    if requested_model_version != MODEL_VERSION_KEY:
        raise HTTPException(
            status_code=409,
            detail=(
                "임베딩 모델 버전이 일치하지 않습니다: "
                f"requested={requested_model_version}, "
                f"ai_server={MODEL_VERSION_KEY}"
            )
        )

DEDUP_REF_COLUMNS = {
    "rescue": "desertion_no",
    "pawinhand": "pawinhand_animal_id",
    "found": "found_post_id"
}


def get_image_group(image_id):
    """
    image_id가 어떤 공고/개체에 속하는지 조회한다.

    rescue, pawinhand, found를 중복 제거 대상으로 사용
    """

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"]
    )

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    post_type,
                    desertion_no,
                    pawinhand_animal_id,
                    found_post_id
                FROM images
                WHERE id = %s
                """,
                (image_id,),
            )

            row = cur.fetchone()

    finally:
        conn.close()

    if row is None:
        return None, None, None

    (
        post_type,
        desertion_no,
        pawinhand_animal_id,
        found_post_id
    ) = row

    ref_col = DEDUP_REF_COLUMNS.get(
        post_type
    )

    if ref_col is None:
        return post_type, None, None
    
    if post_type == "rescue":
        ref_value = desertion_no
    elif post_type == "pawinhand":
        ref_value = pawinhand_animal_id
    elif post_type == "found":
        ref_value = found_post_id
    else:
        ref_value = None

    return (
        post_type,
        ref_col,
        ref_value,
    )
    
# 실종 동물 및 매칭 후보 이미지 임베딩
@app.post("/embeddings/lost-posts")
@app.post("/embeddings/images")
def embed_images(req: EmbedRequest):
    validate_model_version(
        req.model_version_key
    )

    results = []

    for image in req.images:
        try:
            img = download(image.image_url)
            cropped = crop(img) if img is not None else None

            if cropped is None:
                results.append(
                    {
                        "image_id": image.id,
                        "status": "detect_failed",
                    }
                )
                continue

            embedding = extract_embedding(
                cropped,
                image.species,
            )

            post_type, ref_col, ref_value = get_image_group(
                image.id
            )

            if (
                ref_col is not None
                and is_duplicate_within_animal(
                    post_type,
                    ref_col,
                    ref_value,
                    embedding,
                    image.species,
                )
            ):
                results.append(
                    {
                        "image_id": image.id,
                        "status": "duplicate_skipped",
                    }
                )
                continue

            save_embedding_row(
                image.id,
                embedding,
                image.species,
            )

            results.append(
                {
                    "image_id": image.id,
                    "status": "ok",
                }
            )

        except Exception as e:
            print(
                f"에러 (image_id={image.id}): {e}"
            )
            results.append(
                {
                    "image_id": image.id,
                    "status": "error",
                }
            )

    return {"results": results}


# 구조 동물 임베딩
@app.post("/embeddings/rescue-animals")
def embed_rescue_animals(req: RescueEmbedRequest):
    validate_model_version(
        req.model_version_key
    )

    results = []

    for animal in req.animals:
        for url in animal.image_urls:
            try:
                img = download(url)
                cropped = crop(img) if img is not None else None

                if cropped is None:
                    results.append(
                        {
                            "desertion_no": animal.desertion_no,
                            "status": "detect_failed",
                        }
                    )
                    continue

                embedding = extract_embedding(
                    cropped,
                    animal.species,
                )

                image_id = save_image(
                    "rescue",
                    "desertion_no",
                    animal.desertion_no,
                    url,
                )

                if is_duplicate_within_animal(
                    "rescue",
                    "desertion_no",
                    animal.desertion_no,
                    embedding,
                    animal.species,
                ):
                    results.append(
                        {
                            "desertion_no": animal.desertion_no,
                            "image_id": image_id,
                            "status": "duplicate_skipped",
                        }
                    )
                    continue

                save_embedding_row(
                    image_id,
                    embedding,
                    animal.species,
                )

                results.append(
                    {
                        "desertion_no": animal.desertion_no,
                        "image_id": image_id,
                        "status": "ok",
                    }
                )

            except Exception as e:
                print(
                    f"에러 (desertion_no={animal.desertion_no}): {e}"
                )
                results.append(
                    {
                        "desertion_no": animal.desertion_no,
                        "status": "error",
                    }
                )

    return {"results": results}