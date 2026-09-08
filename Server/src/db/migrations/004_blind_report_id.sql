-- 기존 실종 공고 테이블에 블라인드 처리 원인이 된 신고 ID를 저장하는 컬럼 추가
ALTER TABLE lost_posts
ADD COLUMN IF NOT EXISTS blind_report_id BIGINT REFERENCES reports(id);

-- 기존 발견제보 테이블에 블라인드 처리 원인이 된 신고 ID를 저장하는 컬럼 추가
ALTER TABLE found_posts
ADD COLUMN IF NOT EXISTS blind_report_id BIGINT REFERENCES reports(id);