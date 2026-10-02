-- 캠페인 매니저 — 메일 수집 조건(특정인·키워드 교집합)과 민감 메일 추가 차단 목록. Supabase SQL Editor에서 1회 실행(0023 다음).

-- 조건: any = 특정인 또는 키워드 하나라도 맞으면 / all = 특정인 AND 키워드 둘 다 맞을 때만
alter table public.pm_client_settings add column if not exists mail_match text not null default 'any';

-- 민감 메일 추가 차단 목록(워크스페이스 전체 공통). 기본 차단 목록(급여·인사·경영지원 등)은 코드에 있어 끌 수 없고, 여기는 관리자가 더하는 것만.
-- kind: keyword(제목·본문 단어) | sender(주소 또는 도메인 — 보낸 사람·받는 사람 어느 쪽이든). 추가하면 이미 모은 메일 중 걸리는 것도 지운다.
create table if not exists public.pm_mail_block (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('keyword', 'sender')),
  value text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

alter table public.pm_mail_block enable row level security;

notify pgrst, 'reload schema';
