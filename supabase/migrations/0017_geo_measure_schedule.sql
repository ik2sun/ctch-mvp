-- GEO 인용 추적: 측정 방식(안 함/수동/자동)과 자동 측정 주기·기간 — Supabase SQL Editor에서 1회 실행
alter table public.geo_settings
  add column if not exists measure_mode text not null default 'manual'
    check (measure_mode in ('off', 'manual', 'auto')), -- off = API 호출 안 함(수동 포함)
  add column if not exists interval_days integer not null default 7
    check (interval_days in (1, 3, 7, 14, 30)),
  add column if not exists auto_start date, -- null = 바로 시작
  add column if not exists auto_end date; -- null = 종료일 없음

-- 기존 주 1회 자동 측정 설정을 새 컬럼으로 옮긴다
update public.geo_settings set measure_mode = 'auto', interval_days = 7 where auto_weekly = true;

notify pgrst, 'reload schema';
