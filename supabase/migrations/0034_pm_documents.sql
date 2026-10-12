-- AI 매니저 자료실 — 상품소개서·기능 안내 등 업로드 문서를 학습(요약·핵심·주제별 정리)하고 검색용 조각으로 저장
-- client_id null = 모든 광고주 공용(매체 상품소개서 등), 값이 있으면 그 광고주 전용
-- RLS on · 정책 없음 = service_role만(라우트가 로그인·@nmg.co.kr·광고주 접근 확인). 워크스페이스 구성원 누구나 올리고 지울 수 있다

create table if not exists public.pm_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_path text, -- 저장소 원본(비공개 버킷 pm-docs, docs/…)
  kind text not null, -- pdf · pptx · docx · xlsx · google · text
  doc_type text, -- 매체 상품소개서 · 광고주 상품소개서 · 기능 안내 · 가이드 · 기타
  publisher text, -- 문서를 낸 회사·매체
  effective_date text, -- 문서 기준 시점(YYYY-MM 등)
  summary text,
  key_points jsonb not null default '[]',
  tags text[] not null default '{}',
  chars integer not null default 0,
  status text not null default 'ready', -- ready · error
  error text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists pm_documents_client_idx on public.pm_documents(client_id, created_at desc);
alter table public.pm_documents enable row level security;

create table if not exists public.pm_doc_chunks (
  id bigint generated always as identity primary key,
  doc_id uuid not null references public.pm_documents(id) on delete cascade,
  client_id uuid, -- 문서와 같은 값(검색 범위를 한 번에 거르려고 중복 저장)
  idx integer not null,
  kind text not null, -- digest(AI 주제별 정리) · raw(원문 조각)
  heading text,
  content text not null
);
create index if not exists pm_doc_chunks_doc_idx on public.pm_doc_chunks(doc_id, idx);
create index if not exists pm_doc_chunks_client_idx on public.pm_doc_chunks(client_id);
alter table public.pm_doc_chunks enable row level security;

-- 원본 파일 보관용 비공개 버킷(공개 버킷 shortform과 분리 — 내부 문서). 업로드는 서버가 만든 서명 주소로만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pm-docs', 'pm-docs', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/markdown', 'text/csv'
])
on conflict (id) do nothing;
