-- DINOv2 임베딩 적용: 1024차원 -> 512차원
-- 기존 MegaDescriptor 임베딩은 새 모델과 호환되지 않으므로 삭제 후 재생성한다.

BEGIN;

DROP INDEX IF EXISTS idx_embeddings_vector;

DELETE FROM embeddings;

ALTER TABLE embeddings
    ALTER COLUMN embedding TYPE VECTOR(512);

CREATE INDEX idx_embeddings_vector
    ON embeddings USING hnsw (embedding vector_cosine_ops);

COMMIT;