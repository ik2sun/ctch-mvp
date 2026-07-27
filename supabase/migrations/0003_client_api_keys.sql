-- 광고주별 매체 API 키 저장용 컬럼 — Supabase SQL Editor에서 1회 실행
-- 광고주마다 서로 다른 광고 계정/키를 쓰므로, 매체 API는 이제 이 컬럼들을 우선 사용하고
-- .env.local의 고정 키는 광고주에 값이 없을 때만 쓰는 폴백으로 남겨둔다.

alter table public.clients
  add column if not exists meta_access_token text,
  add column if not exists naver_ad_api_key text,
  add column if not exists naver_ad_secret text,
  add column if not exists naver_ad_customer_id text,
  add column if not exists gfa_api_key text,
  add column if not exists gfa_secret text,
  add column if not exists gfa_customer_id text,
  add column if not exists kakao_ad_api_key text,
  add column if not exists kakao_ad_secret text;

-- clients 테이블은 저장소에 RLS 마이그레이션이 없던 상태라 이번에 명시적으로 정의한다.
-- 이미 동일한 정책이 적용돼 있어도 drop → create로 안전하게 재적용된다.
alter table public.clients enable row level security;

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own"
  on public.clients for select
  using (auth.uid() = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own"
  on public.clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own"
  on public.clients for update
  using (auth.uid() = user_id);

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own"
  on public.clients for delete
  using (auth.uid() = user_id);
