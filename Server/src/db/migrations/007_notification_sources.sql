-- 공고 업데이트 시 매칭 알림
BEGIN;

ALTER TABLE notifications
    ADD COLUMN source_type VARCHAR(10) NOT NULL DEFAULT 'rescue',
    ADD COLUMN pawinhand_animal_id BIGINT REFERENCES pawinhand_animals(id) ON DELETE CASCADE,
    ALTER COLUMN desertion_no DROP NOT NULL;

ALTER TABLE notifications ADD CONSTRAINT notifications_source_reference_check CHECK (
    (source_type = 'rescue' AND desertion_no IS NOT NULL AND pawinhand_animal_id IS NULL) OR
    (source_type = 'pawinhand' AND desertion_no IS NULL AND pawinhand_animal_id IS NOT NULL)
);

-- 같은 (실종 공고, 동물) 쌍으로 알림이 중복 생성되지 않도록 막는다 (한 쌍당 평생 1번만 알림).
CREATE UNIQUE INDEX notifications_lost_rescue_unique
    ON notifications (lost_post_id, desertion_no) WHERE source_type = 'rescue';
CREATE UNIQUE INDEX notifications_lost_pawinhand_unique
    ON notifications (lost_post_id, pawinhand_animal_id) WHERE source_type = 'pawinhand';

COMMIT;