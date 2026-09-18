-- 카카오모먼트 연동 — Supabase SQL Editor에서 1회 실행
-- 카카오모먼트 API는 API 키가 아니라 "비즈니스 토큰"(카카오 로그인 OAuth 토큰)으로 호출한다.
-- 광고계정 접근 권한이 있는 카카오계정으로 OAuth 연결 → 리프레시 토큰(약 60일)을 광고주 행에 저장하고
-- 액세스 토큰(약 12시간)은 만료 시 서버에서 자동 갱신한다. 기존 kakao_ad_api_key / kakao_ad_secret 컬럼은 쓰지 않는다.

alter table public.clients
  add column if not exists kakao_ad_account_id text,          -- 카카오모먼트 광고계정 번호 (adAccountId 헤더 값)
  add column if not exists kakao_access_token text,           -- 비즈니스 액세스 토큰 (서버 전용, 자동 갱신)
  add column if not exists kakao_token_expires_at timestamptz, -- 액세스 토큰 만료 시각
  add column if not exists kakao_refresh_token text,          -- 리프레시 토큰 (서버 전용)
  add column if not exists kakao_refresh_expires_at timestamptz, -- 리프레시 토큰 만료 시각 — 지나면 재연결 필요
  add column if not exists kakao_linked_at timestamptz;        -- 마지막 연결 시각
