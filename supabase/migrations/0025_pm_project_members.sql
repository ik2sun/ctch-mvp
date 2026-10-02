-- 캠페인 매니저 — '특정인'과 '캠페인 담당자'를 '프로젝트 멤버' 하나로 합침. Supabase SQL Editor에서 1회 실행(0024 다음).
-- pm_campaign_owners를 멤버 목록으로 쓴다: owner_email(주소 또는 '@도메인' = 회사 전체), owner_name, side(구분), match_text(맡은 캠페인), media, collect(메일 수집 대상).
--   match_text: '' = 맡은 캠페인 없음(메일 수집·연락처용) / '*' = 나머지 캠페인 전부 / 그 밖 = 캠페인 이름 포함 문자
--   메일 수집의 '특정인'(pm_client_settings.mail_addresses·mail_domains)은 collect=true인 멤버로 저장 때마다 자동으로 채운다.

alter table public.pm_campaign_owners add column if not exists side text not null default 'nmg'; -- nmg | client | partner
alter table public.pm_campaign_owners add column if not exists collect boolean not null default true;
alter table public.pm_campaign_owners alter column match_text set default '';

notify pgrst, 'reload schema';
