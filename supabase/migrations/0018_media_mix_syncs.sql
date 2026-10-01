-- 미디어믹스 최적화 — 예산 동기화(1-Click Sync) 실행 기록. Supabase SQL Editor에서 1회 실행
-- 실제 매체 예산을 바꾼 이력(누가·언제·매체별 일 예산 목표·캠페인별 변경 전후·성공/실패)을 남겨
-- 되돌릴 때 변경 전 값을 찾을 수 있게 한다. 테이블이 없어도 동기화 자체는 동작한다(기록만 건너뜀).

create table if not exists public.media_mix_syncs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  targets jsonb not null default '{}'::jsonb, -- 매체 → 일 예산 목표(원)
  context jsonb not null default '{}'::jsonb, -- 목표·총예산·기간·예측 성과
  results jsonb not null default '[]'::jsonb, -- [{key,label,results:[{id,name,ok,before,after,error}]}]
  created_at timestamptz not null default now()
);
create index if not exists media_mix_syncs_client_idx on public.media_mix_syncs (client_id, created_at desc);

alter table public.media_mix_syncs enable row level security;

drop policy if exists "media_mix_syncs own select" on public.media_mix_syncs;
create policy "media_mix_syncs own select" on public.media_mix_syncs
  for select using (auth.uid() = user_id);

drop policy if exists "media_mix_syncs own insert" on public.media_mix_syncs;
create policy "media_mix_syncs own insert" on public.media_mix_syncs
  for insert with check (auth.uid() = user_id);
