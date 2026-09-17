-- 모델 버전 및 임베딩 공간 분리 관리
-- 같은 이미지에 모델/임베딩 공간별 벡터를 각각 저장할 수 있도록 변경한다.

BEGIN;

-- =========================================================
-- 1. 모델 버전 관리
-- =========================================================
CREATE TABLE model_versions (
    id              BIGSERIAL PRIMARY KEY,
    version_key     VARCHAR(100) NOT NULL UNIQUE,
    backbone        VARCHAR(150) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 2. 임베딩 공간 관리
--
-- 모델 버전은 하나의 실험/릴리즈 단위이고,
-- 실제 개/고양이 projection은 서로 다른 임베딩 공간으로 관리한다.
-- =========================================================
CREATE TABLE embedding_spaces (
    id                  BIGSERIAL PRIMARY KEY,
    model_version_id    BIGINT       NOT NULL
        REFERENCES model_versions(id) ON DELETE RESTRICT,

    space_key           VARCHAR(150) NOT NULL UNIQUE,
    species             VARCHAR(20)  NOT NULL,
    checkpoint_name     VARCHAR(255) NOT NULL,
    embedding_dim       INTEGER      NOT NULL DEFAULT 512,
    preprocessing_key   VARCHAR(150) NOT NULL,
    is_usable           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),

    CONSTRAINT embedding_spaces_species_check
        CHECK (species IN ('개', '고양이')),

    CONSTRAINT embedding_spaces_dimension_check
        CHECK (embedding_dim > 0)
);


-- =========================================================
-- 3. 기존 임베딩 보존용 legacy 모델
--
-- 기존 데이터는 같은 model_version 문자열을 사용했지만
-- 실제 checkpoint가 섞였을 가능성이 있으므로 정상 실험 공간으로
-- 사용하지 않고 legacy로 보존한다.
-- =========================================================
INSERT INTO model_versions (
    version_key,
    backbone,
    description,
    is_active
)
VALUES (
    'legacy-mixed-20260917',
    'facebook/dinov2-small',
    '기존 model_version 문자열이 동일하여 실제 checkpoint가 혼재될 가능성이 있는 기존 임베딩',
    FALSE
);


INSERT INTO embedding_spaces (
    model_version_id,
    space_key,
    species,
    checkpoint_name,
    embedding_dim,
    preprocessing_key,
    is_usable
)
VALUES
(
    (
        SELECT id
        FROM model_versions
        WHERE version_key = 'legacy-mixed-20260917'
    ),
    'legacy-mixed-20260917-dog',
    '개',
    'legacy-mixed',
    512,
    'legacy-unknown',
    FALSE
),
(
    (
        SELECT id
        FROM model_versions
        WHERE version_key = 'legacy-mixed-20260917'
    ),
    'legacy-mixed-20260917-cat',
    '고양이',
    'legacy-mixed',
    512,
    'legacy-unknown',
    FALSE
);


-- =========================================================
-- 4. embeddings에 임베딩 공간 FK 추가
-- =========================================================
ALTER TABLE embeddings
    ADD COLUMN embedding_space_id BIGINT;


ALTER TABLE embeddings
    ADD CONSTRAINT embeddings_embedding_space_id_fkey
    FOREIGN KEY (embedding_space_id)
    REFERENCES embedding_spaces(id)
    ON DELETE RESTRICT;


-- =========================================================
-- 5. 기존 임베딩을 species 기준 legacy 공간에 연결
-- =========================================================
WITH image_species AS (
    SELECT
        i.id AS image_id,

        CASE
            WHEN i.post_type = 'lost'
                THEN lp.species

            WHEN i.post_type = 'rescue'
                THEN ra.up_kind_nm

            WHEN i.post_type = 'pawinhand'
                THEN pa.up_kind_nm

            ELSE NULL
        END AS species

    FROM images i

    LEFT JOIN lost_posts lp
        ON lp.id = i.lost_post_id

    LEFT JOIN rescue_animals ra
        ON ra.desertion_no = i.desertion_no

    LEFT JOIN pawinhand_animals pa
        ON pa.id = i.pawinhand_animal_id
)

UPDATE embeddings e
SET embedding_space_id =
    CASE
        WHEN s.species = '개'
            THEN (
                SELECT id
                FROM embedding_spaces
                WHERE space_key = 'legacy-mixed-20260917-dog'
            )

        WHEN s.species = '고양이'
            THEN (
                SELECT id
                FROM embedding_spaces
                WHERE space_key = 'legacy-mixed-20260917-cat'
            )
    END
FROM image_species s
WHERE s.image_id = e.image_id;


-- 아직 공간을 결정하지 못한 임베딩이 있으면 migration 실패
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM embeddings
        WHERE embedding_space_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'embedding_space_id를 결정하지 못한 기존 임베딩이 있습니다.';
    END IF;
END $$;


-- 기존 데이터 연결 완료 후 필수값으로 변경
ALTER TABLE embeddings
    ALTER COLUMN embedding_space_id SET NOT NULL;


-- =========================================================
-- 6. 한 이미지 = 임베딩 1개 제한 제거
--
-- 기존:
--   UNIQUE (image_id)
--
-- 변경:
--   UNIQUE (image_id, embedding_space_id)
-- =========================================================
ALTER TABLE embeddings
    DROP CONSTRAINT embeddings_image_id_key;


ALTER TABLE embeddings
    ADD CONSTRAINT embeddings_image_space_key
    UNIQUE (image_id, embedding_space_id);


-- 공간 기준 조회용 인덱스
CREATE INDEX idx_embeddings_space
    ON embeddings (embedding_space_id);


COMMIT;