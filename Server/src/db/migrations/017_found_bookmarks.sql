-- 발견제보 게시글도 기존 bookmarks 테이블에서 함께 관리한다.
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS found_post_id BIGINT REFERENCES found_posts(id) ON DELETE CASCADE;

ALTER TABLE bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_source_reference_check;

ALTER TABLE bookmarks
  ADD CONSTRAINT bookmarks_source_reference_check CHECK (
    (source_type = 'rescue'
      AND desertion_no IS NOT NULL
      AND pawinhand_animal_id IS NULL
      AND found_post_id IS NULL)
    OR
    (source_type = 'pawinhand'
      AND desertion_no IS NULL
      AND pawinhand_animal_id IS NOT NULL
      AND found_post_id IS NULL)
    OR
    (source_type = 'found'
      AND desertion_no IS NULL
      AND pawinhand_animal_id IS NULL
      AND found_post_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_found_unique
  ON bookmarks (user_id, found_post_id) WHERE source_type = 'found';
