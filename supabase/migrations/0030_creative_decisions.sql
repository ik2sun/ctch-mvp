-- 소재 판정 기록 — '이번 주 결정 저장' 때 판정 스냅숏을 남기고, 다음에 열 때 실제로 껐는지(광고 상태)·이후 성과를 비교한다.
-- RLS on·정책 없음 = service_role만(서버 라우트가 광고주 접근 확인 후 읽기·쓰기). user_id 칸 없음 — 0021 소유자 전용 정책이 붙지 않게.
create table if not exists public.creative_decisions (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  period_since date,
  period_until date,
  target_roas numeric,
  ad_id text not null,
  ad_name text,
  adset_id text,
  status text not null,          -- scale | watch | kill | new | starved
  reason text,
  roas numeric,
  conversions numeric,
  cost numeric,
  decided_by text
);
create index if not exists creative_decisions_client_snapshot on public.creative_decisions (client_id, snapshot_at desc);
alter table public.creative_decisions enable row level security;
