-- 경쟁사 모니터링 — 키워드별 수집 영역 선택(2026-10-14)
-- powerlink = 파워링크, price = 네이버 가격비교, store = 네이버플러스 스토어
-- Supabase SQL Editor에서 1회 실행

alter table public.competitor_keywords
  add column if not exists collect_sections text[] not null default '{powerlink,price,store}';

notify pgrst, 'reload schema';
