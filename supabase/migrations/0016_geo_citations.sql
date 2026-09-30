-- GEO 인용 추적: 비브랜드 질문을 AI 엔진(Claude·ChatGPT·Gemini)에 웹 검색 켜고 물어
-- 답변 원문·인용 URL을 저장하고 자사 언급·인용을 집계한다. 네이버 AI 브리핑은 수동 입력.
-- Supabase SQL Editor에서 1회 실행

-- 광고주별 추적 설정 (자사 도메인·브랜드 표기·경쟁사·주간 자동 측정)
create table if not exists public.geo_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  own_domains text[] not null default '{}', -- 예: {brand.com, brandmall.co.kr}
  brand_terms text[] not null default '{}', -- 언급 판정용 표기 (한글·영문·제품명)
  competitors text[] not null default '{}', -- 동시 호명 집계용
  engines text[] not null default '{claude,openai,gemini}',
  auto_weekly boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 질문 세트 (비브랜드 질문, 여정 단계, 추출 근거)
create table if not exists public.geo_prompts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  stage text not null default '정보 탐색', -- 정보 탐색 / 대안 비교 / 문제 해결 / 구매 직전
  evidence text, -- 질문을 뽑은 근거(페이지 원문·JSON-LD)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, query)
);
create index if not exists geo_prompts_client_idx on public.geo_prompts (client_id);

-- 측정 회차
create table if not exists public.geo_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null default 'manual' check (trigger in ('manual', 'cron')),
  engines text[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  total integer not null default 0,
  completed integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  settings_snapshot jsonb not null default '{}'::jsonb, -- 측정 시점의 도메인·브랜드·경쟁사
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists geo_runs_client_idx on public.geo_runs (client_id, started_at desc);

-- 응답 (질문 × 엔진 1건씩)
create table if not exists public.geo_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.geo_runs (id) on delete cascade,
  prompt_id uuid references public.geo_prompts (id) on delete set null,
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  engine text not null, -- claude / openai / gemini / naver
  model text,
  query text not null, -- 측정 시점 질문 원문
  stage text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  answer text,
  citations jsonb not null default '[]'::jsonb, -- [{rank,url,title,domain,own}] 답변이 실제로 인용한 출처
  sources jsonb not null default '[]'::jsonb, -- 검색은 했으나 답변에 인용 안 된 결과
  mentioned boolean,
  mention_order integer, -- 추적 브랜드(자사+경쟁사) 중 자사가 처음 등장한 순서
  mention_override boolean, -- 사람이 원문 대조 후 보정한 값 (null = 자동 판정 사용)
  own_cited boolean,
  own_cite_rank integer,
  competitors_mentioned text[] not null default '{}',
  manual boolean not null default false, -- 네이버 등 수동 입력
  usage jsonb,
  cost_usd numeric(10, 4),
  error text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists geo_answers_run_idx on public.geo_answers (run_id);
create index if not exists geo_answers_client_idx on public.geo_answers (client_id, created_at desc);

-- RLS: 본인 행만 (측정 실행·크론은 서버에서 service_role로 쓴다)
alter table public.geo_settings enable row level security;
alter table public.geo_prompts enable row level security;
alter table public.geo_runs enable row level security;
alter table public.geo_answers enable row level security;

drop policy if exists "geo_settings_own" on public.geo_settings;
create policy "geo_settings_own" on public.geo_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "geo_prompts_own" on public.geo_prompts;
create policy "geo_prompts_own" on public.geo_prompts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "geo_runs_select_own" on public.geo_runs;
create policy "geo_runs_select_own" on public.geo_runs for select
  using (auth.uid() = user_id);

drop policy if exists "geo_answers_select_own" on public.geo_answers;
create policy "geo_answers_select_own" on public.geo_answers for select
  using (auth.uid() = user_id);

drop policy if exists "geo_answers_update_own" on public.geo_answers;
create policy "geo_answers_update_own" on public.geo_answers for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
