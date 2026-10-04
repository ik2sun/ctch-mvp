-- 인스타 분석 고도화 — 카테고리(동일 카테고리 벤치마크) + 시각 분석(이미지 AI 태깅) 결과
alter table public.insta_analyses add column if not exists category text;          -- 패션/의류·슈즈/잡화·뷰티 … (사용자 지정)
alter table public.insta_analyses add column if not exists visual jsonb;           -- 게시물별 시각 태그(사람·피사체·톤·커버 텍스트)
alter table public.insta_analyses add column if not exists visual_at timestamptz;
create index if not exists insta_analyses_category on public.insta_analyses (category);
