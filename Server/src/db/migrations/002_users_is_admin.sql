-- 관리자 권한 플래그 추가 (2026-09)
-- requireAdmin 미들웨어가 req.user.is_admin 을 확인한다.
-- Supabase SQL 편집기에서 한 번 실행.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 관리자 계정 지정 (이메일은 실제 운영 계정으로 교체)
-- UPDATE users SET is_admin = TRUE WHERE email = 'admin@example.com';
