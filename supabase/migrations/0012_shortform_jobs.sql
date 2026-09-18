-- 숏폼 합성 작업 큐 + 클립/결과물 저장소 — Supabase SQL Editor에서 1회 실행
-- 흐름: 웹에서 클립 업로드(storage: shortform/clips/<job>/<shot>.mp4) → shortform_jobs(queued)
--       → 로컬 렌더 워커(short-form/worker/render_worker.py)가 합성 → storage: shortform/renders/<job>.mp4 → done

create table if not exists public.shortform_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_by text,                                  -- 담당자 표시용 이메일
  client_id uuid references public.clients (id) on delete set null,
  title text not null,
  platform text not null default 'veo_flow',        -- higgsfield | veo_flow | runway | luma
  template text not null default 'lemouton_veo',    -- short-form/<template> 디렉터리
  shots jsonb not null default '{}'::jsonb,         -- { "hook_feet": "clips/<job>/hook_feet.mp4", ... }
  copy jsonb not null default '{}'::jsonb,          -- { "discount_line": "...", "week_days": "..." }
  status text not null default 'queued',            -- queued | rendering | done | failed
  error text,
  log text,
  video_path text,                                  -- renders/<job>.mp4
  poster_path text,                                 -- renders/<job>.jpg
  duration_sec numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shortform_jobs_status_idx on public.shortform_jobs (status, created_at);
create index if not exists shortform_jobs_client_id_idx on public.shortform_jobs (client_id);

alter table public.shortform_jobs enable row level security;

-- 팀 공용 대시보드: 로그인한 사용자는 모두 조회, 쓰기는 본인 것만 (워커는 service_role 로 RLS 우회)
drop policy if exists "shortform_jobs_select_auth" on public.shortform_jobs;
create policy "shortform_jobs_select_auth"
  on public.shortform_jobs for select
  using (auth.role() = 'authenticated');

drop policy if exists "shortform_jobs_insert_own" on public.shortform_jobs;
create policy "shortform_jobs_insert_own"
  on public.shortform_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "shortform_jobs_update_own" on public.shortform_jobs;
create policy "shortform_jobs_update_own"
  on public.shortform_jobs for update
  using (auth.uid() = user_id);

drop policy if exists "shortform_jobs_delete_own" on public.shortform_jobs;
create policy "shortform_jobs_delete_own"
  on public.shortform_jobs for delete
  using (auth.uid() = user_id);

-- 저장소 버킷 (사내용이라 public 읽기. 외부 공개가 부담되면 public=false 로 바꾸고 signed URL 사용)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shortform', 'shortform', true, 209715200, array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "shortform_storage_read" on storage.objects;
create policy "shortform_storage_read"
  on storage.objects for select
  using (bucket_id = 'shortform');

drop policy if exists "shortform_storage_insert_auth" on storage.objects;
create policy "shortform_storage_insert_auth"
  on storage.objects for insert
  with check (bucket_id = 'shortform' and auth.role() = 'authenticated');

drop policy if exists "shortform_storage_delete_auth" on storage.objects;
create policy "shortform_storage_delete_auth"
  on storage.objects for delete
  using (bucket_id = 'shortform' and auth.role() = 'authenticated');
