-- 경쟁사 모니터링: 광고주별 감시 키워드 + 네이버 파워링크 순위 체크 이력
-- Supabase SQL Editor에서 1회 실행

create table if not exists public.competitor_keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword text not null,
  target_domain text not null, -- 순위를 추적할 사이트 도메인 (예: example.com)
  memo text,
  created_at timestamptz not null default now(),
  unique (client_id, keyword, target_domain)
);

create index if not exists competitor_keywords_client_id_idx on public.competitor_keywords (client_id);
create index if not exists competitor_keywords_user_id_idx on public.competitor_keywords (user_id);

alter table public.competitor_keywords enable row level security;

drop policy if exists "competitor_keywords_select_own" on public.competitor_keywords;
create policy "competitor_keywords_select_own"
  on public.competitor_keywords for select
  using (auth.uid() = user_id);

drop policy if exists "competitor_keywords_insert_own" on public.competitor_keywords;
create policy "competitor_keywords_insert_own"
  on public.competitor_keywords for insert
  with check (auth.uid() = user_id);

drop policy if exists "competitor_keywords_delete_own" on public.competitor_keywords;
create policy "competitor_keywords_delete_own"
  on public.competitor_keywords for delete
  using (auth.uid() = user_id);

-- 파워링크 순위 체크 이력 (키워드당 기기별로 1건씩 쌓인다)
create table if not exists public.competitor_rank_checks (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.competitor_keywords (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  device text not null check (device in ('pc', 'mobile')),
  matched_rank integer, -- 타겟 도메인이 발견된 순위 (없으면 null = 순위 밖)
  ads_snapshot jsonb not null default '[]'::jsonb, -- 체크 시점 파워링크 상위 광고 목록 [{rank, domain, title}]
  checked_at timestamptz not null default now()
);

create index if not exists competitor_rank_checks_keyword_id_idx on public.competitor_rank_checks (keyword_id);
create index if not exists competitor_rank_checks_checked_at_idx on public.competitor_rank_checks (checked_at desc);

alter table public.competitor_rank_checks enable row level security;

drop policy if exists "competitor_rank_checks_select_own" on public.competitor_rank_checks;
create policy "competitor_rank_checks_select_own"
  on public.competitor_rank_checks for select
  using (auth.uid() = user_id);

drop policy if exists "competitor_rank_checks_insert_own" on public.competitor_rank_checks;
create policy "competitor_rank_checks_insert_own"
  on public.competitor_rank_checks for insert
  with check (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신 (없으면 "table not found in schema cache" 오류가 남아 있을 수 있음)
notify pgrst, 'reload schema';
