-- 광고주별 목표 ROAS(%) — 소재 분석 판정 엔진(키우기·끄기 기준)과 성과 맵 기준선. 비어 있으면 화면이 500%를 기본값으로 쓴다.
alter table public.clients add column if not exists target_roas numeric;
-- 캠페인 유형별 목표(선택) — {"promo": 600, "ongoing": 450, "brand": 250}. 비어 있는 유형은 target_roas를 따른다.
alter table public.clients add column if not exists target_roas_rules jsonb;
