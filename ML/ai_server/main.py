# python -m uvicorn main:app --port 8001
# uvicorn main:app --reload --port 8001
# uvicorn main:app --port 8001
import sys
from pathlib import Path

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
    save_embedding_row,
    save_to_db,
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

    
# 실종 동물, 포인핸드 크롤링 임베딩
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

                save_to_db(
                    animal.desertion_no,
                    url,
                    embedding,
                    animal.species,
                )

                results.append(
                    {
                        "desertion_no": animal.desertion_no,
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