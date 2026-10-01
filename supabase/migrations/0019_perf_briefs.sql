-- 퍼포먼스 매니저 — 최신 정보 카드(전 사용자 공유). Supabase SQL Editor에서 1회 실행
-- 코드의 시드(features/perf-manager/briefSeed.ts)와 합쳐 보여주며, "최신 정보 업데이트" 버튼·주간 크론이 새 항목을 넣는다.
-- 쓰기는 서버(service_role)만, 읽기도 서버 라우트가 service_role로 하므로 정책은 두지 않는다(RLS on = 브라우저 직접 접근 차단).

create table if not exists public.perf_briefs (
  id text primary key,
  platform text not null, -- meta | google | naver | kakao | measurement | industry
  kind text not null default 'update', -- update | seminar | guide
  title text not null,
  date text not null, -- YYYY-MM-DD 또는 YYYY-MM (발표·행사일)
  summary text not null,
  takeaways jsonb not null default '[]'::jsonb,
  source_name text not null,
  source_url text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists perf_briefs_date_idx on public.perf_briefs (date desc);

alter table public.perf_briefs enable row level security;
