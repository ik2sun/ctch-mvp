-- AI 마케팅 에이전트 > 제안서 저장용 테이블 — Supabase SQL Editor에서 1회 실행
-- 생성된 슬라이드(JSON)와 테마만 저장하고, 프레젠테이션 HTML은 조회 시점에
-- buildPresentationHtml()로 매번 다시 생성한다 (라이브러리 버전 등 하드코딩 방지).

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  client_name text not null,
  industry text,
  theme text not null default 'premium',
  brand_colors jsonb,
  slides jsonb not null,
  share_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_user_id_idx on public.proposals (user_id);
create index if not exists proposals_share_token_idx on public.proposals (share_token);

alter table public.proposals enable row level security;

-- 본인이 만든 제안서만 조회/수정/삭제 가능. 공개 공유 링크(/proposal/share/[token])는
-- service-role 클라이언트(lib/supabase/admin.ts)로 RLS를 우회해 share_token으로만 조회한다.
drop policy if exists "proposals_select_own" on public.proposals;
create policy "proposals_select_own"
  on public.proposals for select
  using (auth.uid() = user_id);

drop policy if exists "proposals_insert_own" on public.proposals;
create policy "proposals_insert_own"
  on public.proposals for insert
  with check (auth.uid() = user_id);

drop policy if exists "proposals_update_own" on public.proposals;
create policy "proposals_update_own"
  on public.proposals for update
  using (auth.uid() = user_id);

drop policy if exists "proposals_delete_own" on public.proposals;
create policy "proposals_delete_own"
  on public.proposals for delete
  using (auth.uid() = user_id);
