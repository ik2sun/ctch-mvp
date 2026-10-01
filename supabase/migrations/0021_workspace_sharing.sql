-- 워크스페이스 공유 — 구글(@nmg.co.kr) 로그인 사용자는 모두 k2s@nmg.co.kr(소유자)의 데이터를 "읽기"만,
-- 저장·수정·삭제는 소유자만. Supabase SQL Editor에서 1회 실행(0018~0020 다음).
-- 소유자를 바꾸려면 workspace_owner_id()의 이메일과 .env의 SUPERADMIN_EMAIL을 함께 바꾼다.

-- 소유자 id — auth.users에서 이메일로 찾는다(security definer: 일반 사용자는 auth.users를 못 읽음)
create or replace function public.workspace_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = 'k2s@nmg.co.kr' limit 1
$$;

-- 열람 자격 — 승인된 프로필 + @nmg.co.kr 계정
create or replace function public.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.status = 'approved'
      and lower(u.email) like '%@nmg.co.kr'
  )
$$;

grant execute on function public.workspace_owner_id() to authenticated;
grant execute on function public.is_workspace_member() to authenticated;

-- user_id 칸이 있는 public 테이블 전부: 기존 정책을 지우고
--   읽기 = 소유자 행 + 열람 자격 / 쓰기(insert·update·delete) = 소유자 본인만
do $$
declare
  t record;
  p record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and c.table_name not in ('profiles', 'shared_media_keys')
  loop
    execute format('alter table public.%I enable row level security', t.table_name);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.table_name loop
      execute format('drop policy %I on public.%I', p.policyname, t.table_name);
    end loop;
    execute format(
      'create policy ws_read on public.%I for select using (user_id = public.workspace_owner_id() and public.is_workspace_member())',
      t.table_name);
    execute format(
      'create policy ws_insert on public.%I for insert with check (auth.uid() = public.workspace_owner_id() and user_id = auth.uid())',
      t.table_name);
    execute format(
      'create policy ws_update on public.%I for update using (auth.uid() = public.workspace_owner_id() and user_id = auth.uid()) with check (user_id = auth.uid())',
      t.table_name);
    execute format(
      'create policy ws_delete on public.%I for delete using (auth.uid() = public.workspace_owner_id() and user_id = auth.uid())',
      t.table_name);
    raise notice 'workspace policies: %', t.table_name;
  end loop;
end $$;

-- 숏폼·이미지 저장소 — 읽기는 기존대로(공개 URL), 올리기·지우기는 소유자만
drop policy if exists "shortform_storage_insert_auth" on storage.objects;
create policy "shortform_storage_insert_auth"
  on storage.objects for insert
  with check (bucket_id = 'shortform' and auth.uid() = public.workspace_owner_id());

drop policy if exists "shortform_storage_delete_auth" on storage.objects;
create policy "shortform_storage_delete_auth"
  on storage.objects for delete
  using (bucket_id = 'shortform' and auth.uid() = public.workspace_owner_id());
