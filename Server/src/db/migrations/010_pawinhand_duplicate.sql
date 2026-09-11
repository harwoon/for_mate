-- 010_pawinhand_duplicate.sql
ALTER TABLE pawinhand_animals
  ADD COLUMN IF NOT EXISTS duplicate_of_desertion_no BIGINT REFERENCES rescue_animals(desertion_no);