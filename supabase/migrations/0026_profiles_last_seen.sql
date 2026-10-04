-- 회원 관리 '최근 활동' — 대시보드 화면을 연 마지막 시각(ensureProfile이 5분 간격으로 기록).
-- auth.users.last_sign_in_at은 구글 로그인을 새로 할 때만 바뀌어서(세션 유지 중엔 그대로) 실제 접속을 알 수 없다.
alter table public.profiles add column if not exists last_seen_at timestamptz;
