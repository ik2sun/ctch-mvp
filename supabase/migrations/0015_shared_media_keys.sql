-- API 공용 키 — Supabase SQL Editor에서 1회 실행
-- 대행사(관리) 계정에서 발급한 매체 키를 한 번 등록해 두고, 광고주에는 광고계정 ID(고객 ID)만 넣어 조회한다.
-- 광고주 행에 개별 키가 있으면 그게 우선이고, 공용 키가 없으면 .env.local 값(META_ACCESS_TOKEN, NAVER_AD_*)으로 폴백한다.
--
-- channel: meta | naver | kakao | gfa | google_ads | ga4
-- config : 매체별 값(jsonb) — 예) naver {api_key, secret, owner_customer_id} / meta {access_token}
--          kakao {access_token, linked_at, scope} (공용 카카오 계정 비즈니스 인증 결과)
--
-- RLS를 켜고 정책을 하나도 만들지 않는다 → 브라우저(anon/authenticated)는 읽기·쓰기 모두 불가,
-- 서버의 service_role 클라이언트(lib/supabase/admin.ts)만 접근한다. 화면: /admin/api-keys (관리자·최고관리자)

create table if not exists public.shared_media_keys (
  channel text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.shared_media_keys enable row level security;
