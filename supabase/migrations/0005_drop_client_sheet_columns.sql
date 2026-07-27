-- 0004에서 추가한 광고주별 구글 시트 컬럼을 되돌린다 — Supabase SQL Editor에서 1회 실행
-- 실제로는 광고주별 개별 시트가 아니라 NMG 전사 공용 시트 1개(부서/팀/광고주 탭 구조)를 쓰는 것으로
-- 확인돼서, 이 접근(광고주 1곳당 스프레드시트 1개)은 폐기하고 별도의 "NMG 매출" 메뉴로 대체한다.
-- 0004가 이미 실행됐든 안 됐든 안전하게 동작한다.

alter table public.clients
  drop column if exists google_sheets_id,
  drop column if exists google_sheets_tab;
