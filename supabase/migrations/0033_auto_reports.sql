-- 자동 리포트(AI 리포트 > 자동 리포트) — 광고주별 리포트 양식(학습한 구조)·일정·수신자와 실행 기록
-- RLS on · 정책 없음 = service_role만(라우트가 로그인·@nmg.co.kr·광고주 소유 확인 후 접근). 워크스페이스 구성원 누구나 만들고 고칠 수 있다.

create table if not exists public.auto_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  -- 학습한 리포트 구조(ReportSpec: 제목·섹션·지표·코멘트 방식)
  spec jsonb not null,
  -- 학습 원본(파일 이름·구글 문서 주소)과 원문 일부(다시 학습할 때 참고)
  source jsonb,
  -- 기간·비교·일정: { period, compare, frequency, weekday, monthDay }
  schedule jsonb not null,
  recipients text[] not null default '{}',
  -- 첨부 엑셀 여부 등 발송 옵션
  options jsonb not null default '{}',
  last_run_at timestamptz,
  last_status text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists auto_reports_client_idx on public.auto_reports(client_id);
alter table public.auto_reports enable row level security;

create table if not exists public.auto_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.auto_reports(id) on delete cascade,
  client_id uuid not null,
  -- preview(화면 미리보기) · manual(지금 발송) · cron(자동 발송)
  trigger text not null,
  status text not null, -- ok · sent · error
  period jsonb,
  subject text,
  html text,
  sent_to text[],
  error text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists auto_report_runs_report_idx on public.auto_report_runs(report_id, created_at desc);
alter table public.auto_report_runs enable row level security;
