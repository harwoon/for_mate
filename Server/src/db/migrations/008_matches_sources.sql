BEGIN;

ALTER TABLE matches
    ADD COLUMN source_type VARCHAR(10) NOT NULL DEFAULT 'rescue',
    ADD COLUMN pawinhand_animal_id BIGINT REFERENCES pawinhand_animals(id) ON DELETE CASCADE,
    ALTER COLUMN desertion_no DROP NOT NULL;

ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS matches_source_post_id_desertion_no_matched_date_key;

ALTER TABLE matches ADD CONSTRAINT matches_source_reference_check CHECK (
    (source_type = 'rescue' AND desertion_no IS NOT NULL AND pawinhand_animal_id IS NULL) OR
    (source_type = 'pawinhand' AND desertion_no IS NULL AND pawinhand_animal_id IS NOT NULL)
);

CREATE UNIQUE INDEX matches_lost_rescue_daily_unique
    ON matches (source_post_id, desertion_no, matched_date) WHERE source_type = 'rescue';
CREATE UNIQUE INDEX matches_lost_pawinhand_daily_unique
    ON matches (source_post_id, pawinhand_animal_id, matched_date) WHERE source_type = 'pawinhand';

COMMIT;