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
from extract_embeddings import crop, download, extract_embedding, save_to_db, MODEL_VERSION

app = FastAPI()


class ImageIn(BaseModel):
    id: int
    image_url: str


class EmbedRequest(BaseModel):
    images: list[ImageIn]


class RescueAnimalIn(BaseModel):
    desertion_no: int
    image_urls: list[str]


class RescueEmbedRequest(BaseModel):
    animals: list[RescueAnimalIn]


def save_embedding(image_id: int, embedding) -> None:
    vector_literal = "[" + ",".join(map(str, embedding.tolist())) + "]"
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO embeddings (image_id, embedding, model_version)
                VALUES (%s, %s::vector, %s)
                ON CONFLICT (image_id) DO NOTHING
                """,
                (image_id, vector_literal, MODEL_VERSION),
            )
    finally:
        conn.close()

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
            embedding = extract_embedding(cropped)
            save_embedding(image.id, embedding)
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
                embedding = extract_embedding(cropped)
                save_to_db(animal.desertion_no, url, embedding)
                results.append({"desertion_no": animal.desertion_no, "status": "ok"})
            except Exception as e:
                print(f"에러 (desertion_no={animal.desertion_no}): {e}")
                results.append({"desertion_no": animal.desertion_no, "status": "error"})
    return {"results": results}