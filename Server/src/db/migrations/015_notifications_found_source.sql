BEGIN;

ALTER TABLE notifications
    ADD COLUMN found_post_id BIGINT
        REFERENCES found_posts(id)
        ON DELETE CASCADE;

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_source_reference_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_source_reference_check CHECK (
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

CREATE UNIQUE INDEX notifications_lost_found_unique
    ON notifications (
        lost_post_id,
        found_post_id
    )
    WHERE source_type = 'found';

COMMIT;