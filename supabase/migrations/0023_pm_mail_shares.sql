-- 캠페인 매니저 — 메일함 공유 허락(광고주별). Supabase SQL Editor에서 1회 실행(0022 다음).
-- 메일 동기화는 메일함 주인이 '이 광고주에 내 메일 공유'를 허락한 광고주에서만 그 메일함을 읽는다.
-- 허락할 때의 메일 규칙 지문(rules_hash)을 함께 저장 — 누가 규칙을 바꾸면 지문이 달라져 허락이 자동으로 풀리고 주인이 다시 확인해야 한다.
-- RLS on + 정책 없음 = service_role(서버 라우트)만 접근. user_id 칸 없음(0021 DO 블록 대상 아님).

create table if not exists public.pm_mail_shares (
  member_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  rules_hash text not null,
  shared_at timestamptz not null default now(),
  primary key (member_id, client_id)
);

alter table public.pm_mail_shares enable row level security;

notify pgrst, 'reload schema';
