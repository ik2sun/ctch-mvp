-- 숏폼 생성 2단계: AI 스크립트(brief→script) + 사진형 템플릿(assets) + Veo API 자동 생성(mode=generate)
-- Supabase SQL Editor에서 1회 실행. 0012 이후에 실행한다.

alter table public.shortform_jobs
  add column if not exists gen_mode text not null default 'upload',   -- upload(클립/사진 업로드) | generate(Veo API로 클립 생성). 'mode'는 PostgREST가 집계함수로 해석해 피함
  add column if not exists brief jsonb not null default '{}'::jsonb,   -- 사용자 입력 브리프 {brand, product, audience, benefit, offer, cta, tone}
  add column if not exists script jsonb not null default '{}'::jsonb,  -- AI 생성·편집된 스크립트 {scenes[], narration[], shots[], ...}
  add column if not exists assets jsonb not null default '[]'::jsonb,  -- 사진형 템플릿의 이미지 경로 목록 ["assets/<job>/01.jpg", ...]
  add column if not exists options jsonb not null default '{}'::jsonb, -- {veo_model, resolution, voice}
  add column if not exists progress text,                              -- 워커 진행 상황 ("Veo 3/6 생성 중")
  add column if not exists cost_usd numeric not null default 0;        -- 종량제 API 사용액(추정)

-- 사진 업로드용 webp 허용
update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'shortform';
