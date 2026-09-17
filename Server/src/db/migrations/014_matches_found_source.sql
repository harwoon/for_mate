BEGIN;

ALTER TABLE matches
    ADD COLUMN found_post_id BIGINT
        REFERENCES found_posts(id)
        ON DELETE CASCADE;

ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS matches_source_reference_check;

ALTER TABLE matches
    ADD CONSTRAINT matches_source_reference_check CHECK (
        (
            source_type = 'rescue'
            AND desertion_no IS NOT NULL
            AND pawinhand_animal_id IS NULL
            AND found_post_id IS NULL
        )
        OR
        (
            source_type = 'pawinhand'
            AND desertion_no IS NULL
            AND pawinhand_animal_id IS NOT NULL
            AND found_post_id IS NULL
        )
        OR
        (
            source_type = 'found'
            AND desertion_no IS NULL
            AND pawinhand_animal_id IS NULL
            AND found_post_id IS NOT NULL
        )
    );

CREATE UNIQUE INDEX matches_lost_found_daily_unique
    ON matches (
        source_post_id,
        found_post_id,
        matched_date
    )
    WHERE source_type = 'found';

COMMIT;