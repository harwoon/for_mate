-- 외부 수집 이미지의 원본 URL과 R2 공개 URL을 구분한다.
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_images_pawinhand_source_url
  ON images (pawinhand_animal_id, source_url)
  WHERE post_type = 'pawinhand' AND source_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_images_rescue_source_url
  ON images (desertion_no, source_url)
  WHERE post_type = 'rescue' AND source_url IS NOT NULL;
