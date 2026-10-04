-- 캠페인 오토파일럿 실행 기록 — 자동 세팅·최적화가 매체에 만든·바꾼 내용
-- RLS on·정책 없음 = service_role(서버 라우트)만 읽고 쓴다. user_id 칸 없음(0021 DO 블록 대상 아님)
create table if not exists public.autopilot_actions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  media text not null,              -- 'gfa'
  ad_account_no text,
  campaign_no bigint,
  kind text not null,               -- 'setup' | 'optimize'
  summary jsonb,                    -- 캠페인 이름, 광고그룹·소재 개수, 켜짐 여부, 오류 수
  detail jsonb,                     -- 만든 광고그룹·소재 번호와 이름, 세팅안, 오류
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists autopilot_actions_client_idx on public.autopilot_actions (client_id, created_at desc);
alter table public.autopilot_actions enable row level security;
