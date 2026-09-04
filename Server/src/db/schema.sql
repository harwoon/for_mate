-- For Mate 데이터베이스 스키마 (PostgreSQL)
-- 실행: psql -d formate -f src/db/schema.sql

-- 사용자
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL,
  email       VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255),
  provider    VARCHAR(50)  NOT NULL DEFAULT 'LOCAL',
  is_admin    BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login  TIMESTAMP,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 리프레시 토큰 저장용
CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- 품종 마스터 (자동완성용)
CREATE TABLE breeds (
  id       BIGSERIAL PRIMARY KEY,
  species  VARCHAR(20) NOT NULL,
  name     VARCHAR(50) NOT NULL,
  UNIQUE (species, name)
);

-- 실종 공고 (찾고있어요)
CREATE TABLE lost_posts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id),
  pet_name     VARCHAR(50)  NOT NULL,
  species      VARCHAR(20)  NOT NULL,
  breed        VARCHAR(50),
  color        VARCHAR(30),
  sex          VARCHAR(1),
  neuter_yn    VARCHAR(1),
  region       VARCHAR(100) NOT NULL,
  event_date   DATE         NOT NULL,
  description  TEXT,
  status       VARCHAR(10)  NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lost_filter ON lost_posts (species, breed, region, event_date);

-- 발견제보
CREATE TABLE found_posts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id),
  title        VARCHAR(100) NOT NULL,
  species      VARCHAR(20)  NOT NULL,
  breed        VARCHAR(50),
  color        VARCHAR(30),
  region       VARCHAR(100) NOT NULL,
  find_date    DATE         NOT NULL,
  description  TEXT,
  status       VARCHAR(10)  NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_found_filter ON found_posts (species, breed, region, find_date);

-- 구조동물 공고 (보호중이에요) - 공공데이터
CREATE TABLE rescue_animals (
  desertion_no   BIGINT PRIMARY KEY,
  happen_dt      DATE,
  happen_place   VARCHAR(200),
  up_kind_nm     VARCHAR(20) NOT NULL,
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
  region_sido    VARCHAR(30),   -- care_addr에서 파싱 (배치가 채움). 지역 필터용
  region_sigungu VARCHAR(40),   -- 예: "성남시 분당구", "부안군". 세종은 NULL
  rfid_cd        VARCHAR(50),
  notice_sdt     DATE,
  notice_edt     DATE,
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rescue_filter ON rescue_animals (up_kind_nm, kind_nm, happen_place, happen_dt);
CREATE INDEX idx_rescue_notice_edt ON rescue_animals (notice_edt);
CREATE INDEX idx_rescue_color_tags ON rescue_animals USING GIN (color_tags);
CREATE INDEX idx_rescue_region ON rescue_animals (region_sido, region_sigungu);

-- 사진 (실종/발견/구조동물 공통)
CREATE TABLE images (
  id              BIGSERIAL PRIMARY KEY,
  post_type       VARCHAR(10)  NOT NULL,
  lost_post_id    BIGINT REFERENCES lost_posts(id) ON DELETE CASCADE,
  found_post_id   BIGINT REFERENCES found_posts(id) ON DELETE CASCADE,
  desertion_no    BIGINT REFERENCES rescue_animals(desertion_no) ON DELETE CASCADE,
  image_url       VARCHAR(255) NOT NULL,
  is_primary      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),

  -- post_type에 맞는 컬럼 하나만 채워지도록 강제
  CHECK (
    (post_type = 'lost'   AND lost_post_id  IS NOT NULL AND found_post_id IS NULL AND desertion_no IS NULL) OR
    (post_type = 'found'  AND found_post_id IS NOT NULL AND lost_post_id  IS NULL AND desertion_no IS NULL) OR
    (post_type = 'rescue' AND desertion_no  IS NOT NULL AND lost_post_id  IS NULL AND found_post_id IS NULL)
  )
);

-- 이미지 임베딩
CREATE TABLE embeddings (
  id             BIGSERIAL PRIMARY KEY,
  image_id       BIGINT      NOT NULL UNIQUE REFERENCES images(id) ON DELETE CASCADE,
  vector_id      VARCHAR(100) NOT NULL,
  model_version  VARCHAR(30)  NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 매칭 결과 (실종 공고 <-> 구조동물)
CREATE TABLE matches (
  id                BIGSERIAL PRIMARY KEY,
  source_post_id    BIGINT    NOT NULL REFERENCES lost_posts(id) ON DELETE CASCADE,
  desertion_no      BIGINT    NOT NULL REFERENCES rescue_animals(desertion_no) ON DELETE CASCADE,
  similarity_score  REAL      NOT NULL,
  matched_date      DATE      NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (source_post_id, desertion_no, matched_date)
);

-- 매칭 후보 제외 (배치가 돌아도 유지된다)
CREATE TABLE match_exclusions (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                BIGINT    NOT NULL REFERENCES users(id),
  source_post_id         BIGINT    NOT NULL REFERENCES lost_posts(id) ON DELETE CASCADE,
  excluded_desertion_no  BIGINT    NOT NULL REFERENCES rescue_animals(desertion_no) ON DELETE CASCADE,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (source_post_id, excluded_desertion_no)
);

-- 북마크
CREATE TABLE bookmarks (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT    NOT NULL REFERENCES users(id),
  desertion_no  BIGINT    NOT NULL REFERENCES rescue_animals(desertion_no) ON DELETE CASCADE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, desertion_no)
);

-- 알림 (새벽 배치가 생성)
CREATE TABLE notifications (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT    NOT NULL REFERENCES users(id),
  lost_post_id      BIGINT    NOT NULL REFERENCES lost_posts(id) ON DELETE CASCADE,
  desertion_no      BIGINT    NOT NULL REFERENCES rescue_animals(desertion_no) ON DELETE CASCADE,
  similarity_score  REAL      NOT NULL,
  is_read           BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 신고
CREATE TABLE reports (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT      NOT NULL,
  post_type   VARCHAR(10) NOT NULL,
  user_id     BIGINT      NOT NULL REFERENCES users(id),
  reason      VARCHAR(50) NOT NULL,
  detail      TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- 고객센터 문의
CREATE TABLE inquiries (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id),
  type         VARCHAR(30),
  title        VARCHAR(200) NOT NULL,
  content      TEXT         NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
  answer       TEXT,                    -- 관리자 답변 내용
  answered_by  BIGINT       REFERENCES users(id),  -- 답변한 관리자
  answered_at  TIMESTAMP,               -- 답변 등록 시각
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
