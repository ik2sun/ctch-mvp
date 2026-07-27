// Supabase SQL Editor에서 1회 실행해야 하는 제안서 저장용 테이블 생성 SQL.
// 실제 정본은 supabase/migrations/0002_proposals.sql — 이 파일은 저장 실패 시
// UI에 안내 문구로 보여주기 위한 사본이므로, 마이그레이션 수정 시 함께 갱신할 것.
export const PROPOSALS_TABLE_SQL = `create table if not exists public.proposals (
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
`;
