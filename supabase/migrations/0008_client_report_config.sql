-- 광고주별 AI 리포트 설정(활성 매체/주요 KPI/톤/고유 규칙) 저장용 테이블
-- Supabase SQL Editor에서 1회 실행

create table if not exists public.client_report_config (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  active_channels text[] not null default array['meta']::text[], -- 'meta' | 'naver'
  primary_kpi text not null default 'CPA',                       -- 'ROAS' | 'CPA' | 'CTR'
  report_tone text not null default 'professional',              -- 'professional' | 'executive' | 'friendly'
  custom_prompt_notes text,                                      -- 네이밍 규칙, 특이사항 등
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 담당자마다 같은 광고주에 대해 자기 설정을 1개씩 가진다
  unique (client_id, user_id)
);

create index if not exists client_report_config_client_id_idx on public.client_report_config (client_id);
create index if not exists client_report_config_user_id_idx on public.client_report_config (user_id);

-- updated_at 자동 갱신
create or replace function public.touch_client_report_config()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_report_config_set_updated_at on public.client_report_config;
create trigger client_report_config_set_updated_at
  before update on public.client_report_config
  for each row execute function public.touch_client_report_config();

alter table public.client_report_config enable row level security;

drop policy if exists "client_report_config_select_own" on public.client_report_config;
create policy "client_report_config_select_own"
  on public.client_report_config for select
  using (auth.uid() = user_id);

drop policy if exists "client_report_config_insert_own" on public.client_report_config;
create policy "client_report_config_insert_own"
  on public.client_report_config for insert
  with check (auth.uid() = user_id);

drop policy if exists "client_report_config_update_own" on public.client_report_config;
create policy "client_report_config_update_own"
  on public.client_report_config for update
  using (auth.uid() = user_id);

drop policy if exists "client_report_config_delete_own" on public.client_report_config;
create policy "client_report_config_delete_own"
  on public.client_report_config for delete
  using (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신 (없으면 "table not found in schema cache" 오류가 남아 있을 수 있음)
notify pgrst, 'reload schema';
