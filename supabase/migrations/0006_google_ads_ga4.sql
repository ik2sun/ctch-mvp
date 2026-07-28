-- 구글 Ads / GA(Google Analytics) 연동용 컬럼 추가 — Supabase SQL Editor에서 1회 실행

alter table public.clients
  add column if not exists google_ads_customer_id text,
  add column if not exists google_ads_developer_token text,
  add column if not exists ga4_property_id text,
  add column if not exists ga4_service_account_json text;
