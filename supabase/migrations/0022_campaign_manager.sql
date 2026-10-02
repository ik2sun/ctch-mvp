-- 캠페인 매니저(퍼포먼스 매니저 개편) — 담당자별 Gmail 연결, 광고주 메일 규칙·캠페인 담당자, 수집 메일, AI 정리.
-- 메일은 ① CTCH에서 담당자가 각자 Gmail 연결 → '메일 동기화' 또는 ② Claude Code Gmail MCP → scripts/pm-mail.ts import. 둘 다 같은 저장·중복 합치기.
-- Supabase SQL Editor에서 1회 실행(0021 다음).
-- 모든 테이블은 RLS on + 정책 없음 = service_role(서버 라우트)만 접근. 라우트가 로그인·워크스페이스·광고주 소유를 확인한다.
-- user_id 칸을 일부러 두지 않는다(0021의 DO 블록을 다시 돌려도 소유자 전용 쓰기 정책이 붙지 않게 — 담당자 누구나 자기 메일함 연결·규칙 관리).

-- 담당자 메일함 연결(1인 1개, 본인 구글 계정만). 토큰은 서버만 읽는다.
create table if not exists public.pm_mail_accounts (
  member_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  linked_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);

-- 광고주별 메일 규칙·시장 정보
create table if not exists public.pm_client_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  mail_domains text[] not null default '{}',   -- 광고주 측 메일 도메인 (예: lemouton.co.kr)
  mail_addresses text[] not null default '{}', -- 개별 주소 (대행사·제작사 등 도메인이 다른 상대)
  mail_keywords text[] not null default '{}',  -- 제목·본문 키워드 (광고주명·브랜드명)
  competitors text[] not null default '{}',    -- 경쟁사(시장 분석용)
  market_notes text,                           -- 업계·시장 메모
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 캠페인 담당자 — 캠페인 이름에 match_text가 들어 있으면 그 담당자. match_text '*' = 광고주 기본 담당자
create table if not exists public.pm_campaign_owners (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  owner_email text not null,
  owner_name text,
  match_text text not null default '*',
  media text, -- null = 전 매체, meta | naver | gfa | kakao
  created_at timestamptz not null default now()
);
create index if not exists pm_campaign_owners_client_idx on public.pm_campaign_owners (client_id);

-- 수집 메일 — 여러 담당자 메일함에 같은 메일이 있으면 1건만 두고 mailboxes에 메일함을 모은다
-- message_id = RFC Message-ID, 없으면 'k:보낸사람|보낸시각(분)|제목' (features/perf-manager/mailText.ts dedupKey)
create table if not exists public.pm_emails (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  message_id text not null,
  thread_id text,
  mailboxes text[] not null default '{}',
  from_addr text,
  from_name text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text,
  sent_at timestamptz,
  snippet text,
  body text,
  direction text, -- inbound(광고주 → NMG) | outbound(NMG → 광고주) | internal
  created_at timestamptz not null default now(),
  unique (client_id, message_id)
);
create index if not exists pm_emails_client_sent_idx on public.pm_emails (client_id, sent_at desc);

-- 메일 AI 정리(광고주당 1행)
create table if not exists public.pm_memory (
  client_id uuid primary key references public.clients (id) on delete cascade,
  memory jsonb not null,
  email_count integer not null default 0,
  last_email_at timestamptz,
  built_at timestamptz not null default now(),
  built_by text
);

alter table public.pm_mail_accounts enable row level security;
alter table public.pm_client_settings enable row level security;
alter table public.pm_campaign_owners enable row level security;
alter table public.pm_emails enable row level security;
alter table public.pm_memory enable row level security;

notify pgrst, 'reload schema';
