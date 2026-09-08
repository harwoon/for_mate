-- embeddings 벡터 저장 방식을 pgvector로 변경 (2026-09)
-- vector_id(참조 ID) 방식 대신 embedding 컬럼에 벡터를 직접 저장.
-- Supabase SQL 편집기에서 한 번 실행.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE embeddings
  DROP COLUMN IF EXISTS vector_id,
  ADD COLUMN IF NOT EXISTS embedding VECTOR(1024) NOT NULL;

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING hnsw (embedding vector_cosine_ops);