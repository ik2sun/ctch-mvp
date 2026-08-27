-- 브랜드 키워드 모니터링: 광고주 브랜드 키워드에 타사가 파워링크로 노출되면 감지·기록하고
-- 담당자 메일로 알린다 — Supabase SQL Editor에서 1회 실행

create table if not exists public.brand_keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword text not null,
  owner_domain text not null, -- 광고주 소유 도메인 (이 도메인이 아닌 광고가 뜨면 침해로 간주)
  alert_email text not null, -- 침해 감지 시 알림을 받을 담당자 메일 (쉼표로 여러 명 가능)
  memo text,
  check_interval_hours integer, -- null = 수동, 6/12/24/168 = 시간 단위 자동 체크 주기
  created_at timestamptz not null default now(),
  unique (client_id, keyword)
);

create index if not exists brand_keywords_client_id_idx on public.brand_keywords (client_id);
create index if not exists brand_keywords_user_id_idx on public.brand_keywords (user_id);

alter table public.brand_keywords enable row level security;

drop policy if exists "brand_keywords_select_own" on public.brand_keywords;
create policy "brand_keywords_select_own"
  on public.brand_keywords for select
  using (auth.uid() = user_id);

drop policy if exists "brand_keywords_insert_own" on public.brand_keywords;
create policy "brand_keywords_insert_own"
  on public.brand_keywords for insert
  with check (auth.uid() = user_id);

drop policy if exists "brand_keywords_update_own" on public.brand_keywords;
create policy "brand_keywords_update_own"
  on public.brand_keywords for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "brand_keywords_delete_own" on public.brand_keywords;
create policy "brand_keywords_delete_own"
  on public.brand_keywords for delete
  using (auth.uid() = user_id);

-- 체크 이력 (키워드당 기기별로 1건씩 쌓인다)
create table if not exists public.brand_keyword_checks (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.brand_keywords (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  device text not null check (device in ('pc', 'mobile')),
  owner_matched_rank integer, -- 광고주 도메인이 발견된 순위 (없으면 null)
  ads_snapshot jsonb not null default '[]'::jsonb, -- 체크 시점 파워링크 상위 광고 전체
  infringing_ads jsonb not null default '[]'::jsonb, -- ads_snapshot 중 owner_domain이 아닌 광고만
  checked_at timestamptz not null default now()
);

create index if not exists brand_keyword_checks_keyword_id_idx on public.brand_keyword_checks (keyword_id);
create index if not exists brand_keyword_checks_checked_at_idx on public.brand_keyword_checks (checked_at desc);

alter table public.brand_keyword_checks enable row level security;

drop policy if exists "brand_keyword_checks_select_own" on public.brand_keyword_checks;
create policy "brand_keyword_checks_select_own"
  on public.brand_keyword_checks for select
  using (auth.uid() = user_id);

drop policy if exists "brand_keyword_checks_insert_own" on public.brand_keyword_checks;
create policy "brand_keyword_checks_insert_own"
  on public.brand_keyword_checks for insert
  with check (auth.uid() = user_id);

-- 담당자 메일 발송 이력 (같은 침해가 계속돼도 중복 발송하지 않기 위한 근거로도 쓴다)
create table if not exists public.brand_keyword_alerts (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.brand_keywords (id) on delete cascade,
  check_id uuid not null references public.brand_keyword_checks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  device text not null check (device in ('pc', 'mobile')),
  infringing_domains text[] not null default '{}',
  recipient text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now()
);

create index if not exists brand_keyword_alerts_keyword_id_idx on public.brand_keyword_alerts (keyword_id);
create index if not exists brand_keyword_alerts_sent_at_idx on public.brand_keyword_alerts (sent_at desc);

alter table public.brand_keyword_alerts enable row level security;

drop policy if exists "brand_keyword_alerts_select_own" on public.brand_keyword_alerts;
create policy "brand_keyword_alerts_select_own"
  on public.brand_keyword_alerts for select
  using (auth.uid() = user_id);

drop policy if exists "brand_keyword_alerts_insert_own" on public.brand_keyword_alerts;
create policy "brand_keyword_alerts_insert_own"
  on public.brand_keyword_alerts for insert
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
