-- 광고주별 소재 분석 규칙(소재명 사전 + UTM 값 사전) — 소재 분석 화면 '분석 규칙'에서 엑셀로 올린다.
-- {"dict": {objectives, contents, products, models, tvc, targets: {코드: 의미}}, "utm": {source, medium, campaign, placement: {값: {label, kind?}}}, "fileName", "sourceUrl", "updatedAt"}
-- 비어 있으면 코드에 있는 기본 사전(르무통)과 기본 UTM 해석(pm·ongoing·tvc·branding)을 쓴다.
alter table public.clients add column if not exists naming_rules jsonb;
