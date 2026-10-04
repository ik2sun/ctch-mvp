-- 인스타 분석 히스토리 — 계정당 최신 1행(다시 분석하면 덮어씀). 워크스페이스 공용(누가 분석했든 모두 보임).
-- RLS on·정책 없음 = service_role만(서버 라우트가 로그인한 @nmg.co.kr 사용자에게만 읽기·쓰기 허용). user_id 칸 없음 — 0021 소유자 전용 정책이 붙지 않게.
create table if not exists public.insta_analyses (
  username text primary key,               -- 소문자 @핸들(@ 제외)
  full_name text,
  avatar text,                             -- 프로필 사진 data URL(인스타 CDN 주소는 며칠 뒤 만료되어 저장 시 내려받음)
  followers integer,
  posts_count integer,
  median_er double precision,              -- 0~1
  posts_per_week double precision,
  reel_view_rate double precision,
  is_mock boolean not null default false,
  profile jsonb not null,                  -- InstagramProfile 원본(리포트 다시 열기 — Apify 재호출 없이)
  diagnosis jsonb,                         -- AI 진단 결과
  analyzed_by text,
  analyzed_at timestamptz not null default now(),
  diagnosed_at timestamptz
);
create index if not exists insta_analyses_analyzed_at on public.insta_analyses (analyzed_at desc);
alter table public.insta_analyses enable row level security;

-- 광고주별 '내 브랜드 계정' — 인스타 분석 화면의 퀵 버튼
create table if not exists public.insta_brand_accounts (
  client_id uuid primary key references public.clients(id) on delete cascade,
  username text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.insta_brand_accounts enable row level security;
