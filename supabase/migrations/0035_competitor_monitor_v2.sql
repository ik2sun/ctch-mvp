-- 경쟁사 모니터링 개편(2026-10-14)
-- ① 타겟 도메인 선택 사항 ② 타겟 몰·브랜드 이름(가격비교·플러스 스토어 매칭) ③ 자동 체크 일시 중지
-- ④ 네이버 가격비교·네이버플러스 스토어 수집 결과
-- Supabase SQL Editor에서 1회 실행

alter table public.competitor_keywords alter column target_domain drop not null;

alter table public.competitor_keywords
  add column if not exists target_mall text,                         -- 가격비교·플러스 스토어에서 찾을 몰·브랜드 이름(선택)
  add column if not exists auto_paused boolean not null default false; -- true = 주기는 두고 자동 체크만 멈춤

-- 타겟 도메인이 비어도 같은 키워드를 두 번 등록하지 않게(null끼리는 unique 제약이 안 걸린다)
alter table public.competitor_keywords drop constraint if exists competitor_keywords_client_id_keyword_target_domain_key;
create unique index if not exists competitor_keywords_client_kw_target_uidx
  on public.competitor_keywords (client_id, keyword, coalesce(target_domain, ''));

-- 체크 1건(기기별)에 가격비교·플러스 스토어 상품 목록을 함께 저장
-- { "price": [ShopItem], "store": [ShopItem], "priceRank": n|null, "storeRank": n|null }
alter table public.competitor_rank_checks
  add column if not exists shopping_snapshot jsonb;

notify pgrst, 'reload schema';
