-- 구조동물 지역 필터용 컬럼 추가 (2026-09)
-- rescue_animals.care_addr 를 파싱해 배치가 채운다. 조회 5.1에서 등호 필터.
-- Supabase SQL 편집기에서 한 번 실행.

ALTER TABLE rescue_animals
  ADD COLUMN IF NOT EXISTS region_sido    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS region_sigungu VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_rescue_region
  ON rescue_animals (region_sido, region_sigungu);
