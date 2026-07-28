-- Higgsfield로 생성한 AI 소재(이미지/영상) 저장용 테이블 — Supabase SQL Editor에서 1회 실행

create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  kind text not null default 'image', -- 'image' | 'video'
  prompt text not null,
  image_url text,
  video_url text,
  source_image_url text, -- 영상 생성 시 입력으로 쓴 원본 이미지
  model text,
  created_at timestamptz not null default now()
);

create index if not exists creatives_user_id_idx on public.creatives (user_id);
create index if not exists creatives_client_id_idx on public.creatives (client_id);

alter table public.creatives enable row level security;

drop policy if exists "creatives_select_own" on public.creatives;
create policy "creatives_select_own"
  on public.creatives for select
  using (auth.uid() = user_id);

drop policy if exists "creatives_insert_own" on public.creatives;
create policy "creatives_insert_own"
  on public.creatives for insert
  with check (auth.uid() = user_id);

drop policy if exists "creatives_delete_own" on public.creatives;
create policy "creatives_delete_own"
  on public.creatives for delete
  using (auth.uid() = user_id);
