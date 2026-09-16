# python -m uvicorn main:app --port 8001
# uvicorn main:app --reload --port 8001
# uvicorn main:app --port 8001
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent / "scripts"))

import os
import psycopg2
from fastapi import FastAPI
from pydantic import BaseModel

# 작성한 파일(extract_embeddings.py) 불러오기라 밑줄 그어져도 오류 있는거 아님
from extract_embeddings import (
    crop,
    download,
    extract_embedding,
    save_image,
    save_embedding_row,
    is_duplicate_within_animal,
)

app = FastAPI()


class ImageIn(BaseModel):
    id: int
    image_url: str
    species: str


class EmbedRequest(BaseModel):
    images: list[ImageIn]


class RescueAnimalIn(BaseModel):
    desertion_no: int
    image_urls: list[str]
    species: str


class RescueEmbedRequest(BaseModel):
    animals: list[RescueAnimalIn]


# 동물 단위로 근접 중복 사진의 임베딩을 스킵할 post_type -> ref 컬럼.
# lost/found는 사용자가 직접 올린 사진(의도적으로 여러 각도)이라 대상에서 제외한다.
DEDUP_REF_COLUMNS = {
    "rescue": "desertion_no",
    "pawinhand": "pawinhand_animal_id",
}


def get_image_group(image_id: int):
    """image_id로 post_type과 중복 판정에 쓸 ref 컬럼/값을 조회한다.
    lost/found이거나 행이 없으면 ref_col=None을 반환한다."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT post_type, desertion_no, pawinhand_animal_id
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

    post_type, desertion_no, pawinhand_animal_id = row
    ref_col = DEDUP_REF_COLUMNS.get(post_type)
    if ref_col is None:
        return post_type, None, None

    ref_value = desertion_no if post_type == "rescue" else pawinhand_animal_id
    return post_type, ref_col, ref_value

# 실종 동물, 포인핸드 크롤링 임베딩
@app.post("/embeddings/lost-posts")
@app.post("/embeddings/images")
def embed_images(req: EmbedRequest):
    results = []
    for image in req.images:
        try:
            img = download(image.image_url)
            cropped = crop(img) if img is not None else None
            if cropped is None:
                results.append({"image_id": image.id, "status": "detect_failed"})
                continue
            embedding = extract_embedding(cropped, image.species)

            post_type, ref_col, ref_value = get_image_group(image.id)
            if ref_col and is_duplicate_within_animal(post_type, ref_col, ref_value, embedding):
                results.append({"image_id": image.id, "status": "duplicate_skipped"})
                continue

            save_embedding_row(image.id, embedding)
            results.append({"image_id": image.id, "status": "ok"})
        except Exception as e:
            print(f"에러 (image_id={image.id}): {e}")
            results.append({"image_id": image.id, "status": "error"})
    return {"results": results}

# 구조 동물 임베딩
@app.post("/embeddings/rescue-animals")
def embed_rescue_animals(req: RescueEmbedRequest):
    results = []
    for animal in req.animals:
        for url in animal.image_urls:
            try:
                img = download(url)
                cropped = crop(img) if img is not None else None
                if cropped is None:
                    results.append({"desertion_no": animal.desertion_no, "status": "detect_failed"})
                    continue
                embedding = extract_embedding(cropped, animal.species)

                image_id = save_image("rescue", "desertion_no", animal.desertion_no, url)

                if is_duplicate_within_animal("rescue", "desertion_no", animal.desertion_no, embedding):
                    results.append({"desertion_no": animal.desertion_no, "status": "duplicate_skipped"})
                    continue

                save_embedding_row(image_id, embedding)
                results.append({"desertion_no": animal.desertion_no, "status": "ok"})
            except Exception as e:
                print(f"에러 (desertion_no={animal.desertion_no}): {e}")
                results.append({"desertion_no": animal.desertion_no, "status": "error"})
    return {"results": results}