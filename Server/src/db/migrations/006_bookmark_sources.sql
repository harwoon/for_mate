-- Apply after 005_pawinhand_animals.sql. Existing bookmarks retain their IDs and targets.
BEGIN;

ALTER TABLE bookmarks
    ADD COLUMN source_type VARCHAR(10) NOT NULL DEFAULT 'rescue',
    ADD COLUMN pawinhand_animal_id BIGINT REFERENCES pawinhand_animals(id) ON DELETE CASCADE,
    ALTER COLUMN desertion_no DROP NOT NULL;

ALTER TABLE bookmarks ADD CONSTRAINT bookmarks_source_reference_check CHECK (
    (source_type = 'rescue' AND desertion_no IS NOT NULL AND pawinhand_animal_id IS NULL) OR
    (source_type = 'pawinhand' AND desertion_no IS NULL AND pawinhand_animal_id IS NOT NULL)
);

-- The existing UNIQUE(user_id, desertion_no) continues to protect rescue bookmarks.
CREATE UNIQUE INDEX bookmarks_user_pawinhand_unique
    ON bookmarks (user_id, pawinhand_animal_id) WHERE source_type = 'pawinhand';

COMMIT;
