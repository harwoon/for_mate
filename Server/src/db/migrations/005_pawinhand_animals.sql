-- 포인핸드 구조동물 수집 데이터 저장 구조 추가 (2026-09)
-- 포인핸드 원본 ID는 숫자가 아닐 수 있으므로 source_id를 문자열 UNIQUE 키로 사용한다.
-- 동물 본문은 pawinhand_animals, 사진은 기존 공통 images 테이블에 저장한다.

CREATE TABLE IF NOT EXISTS pawinhand_animals (
  id             BIGSERIAL PRIMARY KEY,
  source_id      VARCHAR(100) NOT NULL UNIQUE,
  notice_no      VARCHAR(100),
  detail_url     TEXT         NOT NULL,
  happen_dt      DATE,
  happen_place   VARCHAR(200),
  up_kind_nm     VARCHAR(20)  NOT NULL,
  kind_nm        VARCHAR(50),
  color_cd       VARCHAR(100),
  color_tags     TEXT[],
  age            VARCHAR(30),
  weight         VARCHAR(20),
  process_state  VARCHAR(30),
  sex_cd         VARCHAR(1),
  neuter_yn      VARCHAR(1),
  special_mark   TEXT,
  care_nm        VARCHAR(100),
  care_tel       VARCHAR(30),
  care_addr      VARCHAR(200),
  region_sido    VARCHAR(30),
  region_sigungu VARCHAR(40),
  rfid_cd        VARCHAR(50),
  notice_sdt     DATE,
  notice_edt     DATE,
  last_seen_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pawinhand_filter
  ON pawinhand_animals (up_kind_nm, kind_nm, happen_place, happen_dt);

CREATE INDEX IF NOT EXISTS idx_pawinhand_notice_edt
  ON pawinhand_animals (notice_edt);

CREATE INDEX IF NOT EXISTS idx_pawinhand_color_tags
  ON pawinhand_animals USING GIN (color_tags);

CREATE INDEX IF NOT EXISTS idx_pawinhand_region
  ON pawinhand_animals (region_sido, region_sigungu);

CREATE INDEX IF NOT EXISTS idx_pawinhand_last_seen_at
  ON pawinhand_animals (last_seen_at);

-- 외부 이미지 주소는 255자를 넘을 수 있으므로 길이 제한이 없는 TEXT로 확장한다.
ALTER TABLE images
  ALTER COLUMN image_url TYPE TEXT,
  DROP COLUMN IF EXISTS is_primary,
  ADD COLUMN IF NOT EXISTS pawinhand_animal_id BIGINT
    REFERENCES pawinhand_animals(id) ON DELETE CASCADE;

-- 기존 이름이 자동 생성된 images_check인 경우 제거한다.
ALTER TABLE images
  DROP CONSTRAINT IF EXISTS images_check;

-- 이전에 다른 이름으로 생성된 post_type CHECK도 찾아 제거한다.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'images'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%post_type%'
  LOOP
    EXECUTE format('ALTER TABLE images DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- post_type에 해당하는 FK 하나만 채워지도록 네 종류의 연결을 강제한다.
ALTER TABLE images
  ADD CONSTRAINT images_post_reference_check CHECK (
    (post_type = 'lost'
      AND lost_post_id IS NOT NULL
      AND found_post_id IS NULL
      AND desertion_no IS NULL
      AND pawinhand_animal_id IS NULL) OR
    (post_type = 'found'
      AND found_post_id IS NOT NULL
      AND lost_post_id IS NULL
      AND desertion_no IS NULL
      AND pawinhand_animal_id IS NULL) OR
    (post_type = 'rescue'
      AND desertion_no IS NOT NULL
      AND lost_post_id IS NULL
      AND found_post_id IS NULL
      AND pawinhand_animal_id IS NULL) OR
    (post_type = 'pawinhand'
      AND pawinhand_animal_id IS NOT NULL
      AND lost_post_id IS NULL
      AND found_post_id IS NULL
      AND desertion_no IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_images_pawinhand_animal
  ON images (pawinhand_animal_id, id)
  WHERE post_type = 'pawinhand';
