-- 광고주별 구글 시트 매출 연동용 컬럼 — Supabase SQL Editor에서 1회 실행
-- 스프레드시트 ID/탭 이름은 비밀값이 아니라 meta_account_id처럼 일반 텍스트로 관리한다.
-- 실제 접근 권한은 서버의 구글 서비스 계정이 그 시트에 공유돼 있는지로 결정된다.

alter table public.clients
  add column if not exists google_sheets_id text,
  add column if not exists google_sheets_tab text default '매출현황';
