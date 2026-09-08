# uvicorn main:app --reload --port 8001
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent / "scripts"))

import os
import psycopg2
from fastapi import FastAPI
from pydantic import BaseModel

# 작성한 파일(extract_embeddings.py) 불러오기라 밑줄 그어져도 오류 있는거 아님
from extract_embeddings import crop, download, extract_embedding, MODEL_VERSION

app = FastAPI()


class ImageIn(BaseModel):
    id: int
    image_url: str


class EmbedRequest(BaseModel):
    images: list[ImageIn]


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


@app.post("/embeddings/lost-posts")
def embed_lost_post_images(req: EmbedRequest):
    results = []
    for image in req.images:
        img = download(image.image_url)
        cropped = crop(img) if img is not None else None
        if cropped is None:
            results.append({"image_id": image.id, "status": "detect_failed"})
            continue
        embedding = extract_embedding(cropped)
        save_embedding(image.id, embedding)
        results.append({"image_id": image.id, "status": "ok"})
    return {"results": results}