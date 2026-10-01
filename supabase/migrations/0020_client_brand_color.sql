-- 광고주 브랜드 색 — 사이드바·광고주 전환 목록의 이니셜 박스 색(#RRGGBB). 비어 있으면 화면에서 이름 기준 자동 색.
alter table public.clients
  add column if not exists brand_color text
  check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');
