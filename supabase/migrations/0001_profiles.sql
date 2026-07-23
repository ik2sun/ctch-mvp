-- 관리자 승인 방식 회원 시스템 — Supabase SQL Editor에서 1회 실행
-- auth.users는 Supabase Auth가 관리하므로 직접 컬럼을 추가하지 않고,
-- 1:1로 연결되는 public.profiles를 별도로 둔다.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'viewer' check (role in ('superadmin', 'admin', 'manager', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 행만 조회 가능. 쓰기(승인/거절/역할변경)는 서버의 service-role 클라이언트로만
-- 수행하므로(RLS 우회) 별도의 update/insert 정책은 두지 않는다.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 회원가입(auth.users insert) 시 profiles 행을 기본값(pending/viewer)으로 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
