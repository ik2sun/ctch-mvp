# CTCH (캐치) 프로젝트

## 프로젝트 개요
NMG(넥스트미디어그룹) 내부용 AI 기반 퍼포먼스 마케팅 대시보드

## 기술 스택
- Next.js 15, TypeScript, Tailwind CSS
- Supabase (DB)
- Vercel (배포)
- Claude API (AI 분석)

## 완성된 기능
- UTM 빌더 (일반/bulk/Excel 모드)
- AI 리포트 모듈 (멀티시트 Excel, 광고주별 템플릿 저장/불러오기)
- 클라이언트 관리 사이드바

## 현재 작업 중
1. 대시보드 + 실시간 리포트에 지난주 대비 / 전월 대비 비교군 추가
2. 실시간 리포트 개편 — 리드 기능 삭제, 상단 박스를 캠페인/광고세트/광고소재/AI 분석 메뉴로 교체
3. 대시보드 + 실시간 리포트에 그래프 영역 추가 (컬러풀하게)
4. 전체 메뉴 컬러 개선 (과하지 않게)

## 다음 예정
- 네이버 검색광고 API 연동 (읽기 전용 우선)
- clients 테이블에 KPI 목표 ROAS, 주요 매체 채널 필드 추가

## 소재 생성 (AI 마케팅 에이전트 > 소재 생성)
- 페이지 `app/(dashboard)/ai-agent/creative/page.tsx`: 세그먼트 탭 2개 — 숏폼 제작(기본) / 이미지 생성(Higgsfield API, `creatives` 테이블)
- 이미지 생성 탭(2026-09-18 개편) `features/creative/ImagePanel.tsx`: 방법 4종(`imageMethods.ts`) — Higgsfield Soul(`higgsfield-ai/soul/standard`) / Google Nano Banana 2(`gemini-3.1-flash-image`, `GEMINI_API_KEY`) / OpenAI GPT Image 2(`gpt-image-2`, `OPENAI_API_KEY`) / 외부 도구 결과 업로드(Midjourney·Firefly 등, 비용 0). API 방식은 `/api/creative/generate-image`(GET=키 설정 여부, POST=생성) → `imageGenerate.ts`(서버 전용). Gemini·OpenAI의 base64 결과와 업로드 이미지는 `shortform` 버킷 `images/`에 저장, Higgsfield는 자체 CDN URL. `creatives.model`에 `<method>:<model>`(업로드는 `upload:<도구>`)로 출처 기록. 비율은 방법별(`ratios`, Higgsfield는 4:5 미확인이라 제외). 기존 `/api/higgsfield/generate-image`는 슬라이드 프롬프트 변환용으로 유지
- 이미지 후처리(2026-09-18): 보관함 카드 "광고 소재" → `AdComposer.tsx` + `adRender.ts`(브라우저 canvas, 워커·API 불필요). 규격 `AD_FORMATS` 1:1 1080² / 4:5 1080×1350 / 9:16 1080×1920(상14%·하20% 안전영역) / 1.91:1 1200×628, 초점 클릭 + 확대(1~2×)로 크롭하고 카피가 있으면 피사체를 글자 없는 쪽으로 비킴. 카피(헤드라인 여러 줄=A/B, 보조·뱃지·CTA)·테마(어두운 그라데이션/흰 패널/브랜드 패널)·로고·강조색. ZIP 다운로드(jszip) 또는 보관함 저장(`model=edit:<규격>`, `source_image_url`=원본). 원본은 `/api/proxy-image`로 받아 canvas 오염 방지. 업로드 도구에 "Higgsfield (웹)" 포함
- 이미지 수정(2026-09-18): 업로드 방법은 "이미지 업로드 · 수정". 보관함 카드 "수정" 또는 업로드 시 수정 요청 입력 → `ImageEditor.tsx` → `/api/creative/edit-image`(creativeId로 원본 조회, 임의 URL 불가). action=prompt: `editPrompt.ts`(claude-opus-5 비전 + json_schema, adaptive, 서버측 폴백 `claude-opus-4-8`)가 도구별 형식(`editTools.ts` EDIT_TOOLS: Nano Banana 2·GPT Image 2·Higgsfield 웹·Midjourney·Firefly·ChatGPT·범용)으로 analysis/keep/changes/prompt/negative/params/howTo 생성(실호출 약 25초 확인). action=apply(옵션, 종량제): Nano Banana 2(generateContent + inlineData)·GPT Image 2(`/v1/images/edits` multipart)로 바로 수정 → `images/` 저장 → creatives(`source_image_url`=원본)
- 사진형 숏폼 재료: `LibraryPicker.tsx`로 이미지 보관함에서 골라 사진 목록에 추가(프록시로 File 변환)
- 숏폼 제작 UI는 `features/creative/`: `ShortFormPanel`(작업 그리드 + 레퍼런스), `MediaCard`(9:16 카드), `VideoModal`(다크 플레이어 + 사이드 패널), `NewShortFormForm`(플랫폼 선택 → 카피 → 샷별 클립 업로드), `PlatformSelector`(라디오 카드 4종), `SegmentedControl`
- 데이터: `shortFormJobs.ts`(shortform_jobs + storage 버킷 `shortform`), `shortFormTemplates.ts`(템플릿·샷 프롬프트, veo_gen.py SHOTS와 동일 유지), `platforms.ts`, `shortFormPipelines.ts`(레퍼런스 4종)
- 템플릿 3종(`shortFormTemplates.ts`, 워커 `TEMPLATES`와 id 동일): `veo_promo`(브리프→AI 스크립트→클립, 클립은 Veo API 자동 생성 또는 업로드) / `photo_promo`(사진 4~12장→모션그래픽, API 비용 $0) / `lemouton_veo`(고정 8샷, 카피 2필드). 2026-09-17에 범용 2종·AI 스크립트·Veo API 추가
- 사진 자동 수집: `/api/shortform/collect-images` → `features/creative/collectImages.ts`(서버 전용). 페이지 HTML을 JS 실행 없이 받아 og:image·JSON-LD·img/srcset·CSS 배경에서 후보를 뽑고, 후보가 8장 미만이면 문서 전체에서 이미지 URL 패턴을 긁는다(`\/`·`/` 복원 — Next.js 커머스는 이미지를 JSON으로 넘긴다). 후보를 실제로 내려받아 헤더에서 크기를 읽고(`imageSize`: PNG/GIF/WebP/JPEG/AVIF) 짧은 변 400px·30만 화소 미만은 제외, 해상도·비율(세로>정방형>가로)·출처·문서 순서·브리프 키워드로 점수화해 상위 8장을 자동 선택. 로고·아이콘·배너는 `BAD_URL` 패턴으로 사전 제외. SSRF 방지(사설 IP 차단)와 JS 리다이렉트 1회 추적 포함. 화면은 `ImageCollector.tsx`이며 썸네일·다운로드는 `/api/proxy-image` 경유로 File 을 만들어 기존 업로드 경로에 넣는다
- AI 스크립트: `/api/shortform/script` → `features/creative/generateScript.ts`(claude-opus-5, adaptive thinking, `output_config.format` JSON 스키마 `SCRIPT_SCHEMA`, 문법 거절 시 스키마 없이 재시도). 방향성(2026-09-18): 장점 나열 대신 타깃 페인포인트→공감→해결 스토리. 브리프(`ShortFormBrief`)→기획 의도 `concept`(3줄) + 4구간 장면(`ScriptScene`: Hook[0~3초] hook / Agitation&Solution[3~10초] benefit / Proof[10~15초] proof / Offer&CTA[15~20초] offer(프로모션 없으면 cta), 필드 visual(화면 묘사)/kicker/headline/sub/narration/seconds/prompt)+cta 엔드카드. 렌더러는 role 값 5종만 알므로 role 이름은 유지하고 UI 라벨만 바꿈. 길이 옵션(2026-09-18): 폼 라디오 15초 임팩트형(4장면+엔드3초)/30초 스토리형(추천, 5장면+4초)/45초 상세형(7장면+4초) = `DURATION_PRESETS`(장면별 role·seconds·구간 가이드). route에 `durationSec`로 넘기면 장면 계획과 장면별 내레이션 글자 수 상한(`narrationBudget`, 초당 6.5자)을 프롬프트에 넣고, 생성 후 seconds를 계획값으로 고정, `script.targetSeconds/endSeconds` 저장. 워커 `build_timeline`은 clips도 seconds(최소 내레이션+0.9초) 사용, 엔드카드는 `endSeconds`. Veo 클립은 720p면 장면 길이에 맞춰 4/6/8초, 1080p는 8초(`veoClipSeconds`↔`veo_clip_seconds` 동일 유지). 수치는 브리프 값만 쓰도록 프롬프트에서 금지. 사용자가 폼에서 편집 후 `script` 컬럼에 저장
- 비용 정책(2026-09-17 변경): 사진형은 API 비용 없음. 영상형은 `gen_mode=generate`면 워커가 Gemini API(Veo 3.1)로 클립 생성(단가 `platforms.ts VEO_MODELS`, Lite 720p $0.05/s·Fast 720p $0.10/s·1080p $0.15/s·Standard $0.40/s, 폼에 예상 비용 표시), `upload`면 각 플랫폼 구독 크레딧으로 만든 클립을 올린다. `GEMINI_API_KEY`는 워커 PC에만 필요
- 완성본 업로드(2026-09-18): 숏폼 탭 헤더 "완성본 업로드" → `FinalUploadForm.tsx`. Higgsfield 등 외부 편집기에서 끝낸 최종 mp4/mov를 `renders/<id>.<ext>`에 올리고 브라우저에서 뜬 썸네일(`renders/<id>.jpg`)과 함께 `gen_mode=final`, `template=final_upload`, `status=done`으로 바로 등록(워커는 queued만 가져가므로 건드리지 않음). platform은 제작 도구(업로드형 플랫폼 id 또는 other)
- 합성은 Vercel에서 불가(ffmpeg/PIL). `short-form/worker/render_worker.py`(설치·점검은 `setup.bat`·`check_env.py`, 상시 실행은 `start_worker.bat`)를 사내 PC에서 실행하면 queued 작업을 가져가 [Veo 생성→storage] → 정규화 → edge-tts 내레이션 → 합성 → `renders/<id>.mp4`·`.jpg` 업로드 → done. `progress` 컬럼으로 진행 표시. 워커는 `.env.local`의 service_role 키 사용. 범용 렌더러는 `short-form/templates/{sf_common.py,photo_promo,veo_promo}`
- 마이그레이션 `0012_shortform_jobs.sql`(테이블 + 버킷 + 정책), `0014_shortform_generate.sql`(gen_mode·brief·script·assets·options·progress·cost_usd + webp 허용) — SQL Editor에서 실행 필요. 컬럼명 `mode`는 PostgREST가 집계함수로 해석해 `gen_mode`로 씀
- 템플릿 스크립트는 `SF_WORK/SF_CLIPS/SF_FRAMES/SF_OUT/SF_JOB` 환경변수로 입출력을 바꿀 수 있음. Flow 다운로드 클립은 `flow_import.py`로 clips/에 정규화
- `short-form/`은 tsconfig exclude 대상. Tailwind content에 `features/**` 포함됨

## SEO 분석 (AI 마케팅 에이전트 > SEO 분석) — 2026-09-16 추가
- 페이지 `app/(dashboard)/ai-agent/seo-analysis/page.tsx`: URL 입력 → `/api/seo-analysis/audit`(기술 진단) → `/api/seo-analysis/ai-diagnosis`(Claude 진단)
- 로직 `features/seo-analysis/`: `audit.ts`(JS 미실행 fetch, robots.txt UA별 판정, JSON-LD 검증, 정합성·온페이지·인용 적합도 휴리스틱 → PASS/FIX/INFO findings), `crawlers.ts`(검색용/학습용 UA 표), `types.ts`(AuditResult·SeoDiagnosis)
- 판정 원칙: 확인된 것만 기재. 검색용 UA(OAI-SearchBot·Googlebot·Claude-SearchBot·PerplexityBot·bingbot·Yeti)와 학습용 UA(GPTBot·ClaudeBot·Google-Extended·CCBot)를 합쳐 판정하지 않는다. 사이트 단위 항목(전 페이지 title 중복·스키마 적용률·IP 차단)은 단일 페이지 진단으로 판정하지 않고 한계로 표기
- AI 진단 로직은 `features/seo-analysis/diagnose.ts`(route는 인증·검증만). 모델 `claude-opus-5` + adaptive thinking + `output_config.format`(JSON schema). **전체 스키마는 API가 "compiled grammar is too large"로 거절하므로** `diagnosisSchema.ts`의 `PART_KEYS`대로 core(요약·엔진·우선순위) / content(질문·AEO·SOV) / geo(GEO·JSON-LD) 세 부분으로 나눠 `Promise.all` 병렬 호출 후 합친다. 각 부분 스키마는 수락 확인됨. 스키마에는 enum을 넣지 않고(문법 크기) 값은 코드에서 정규화. 문법 거절 시 스키마 없이 재시도하는 폴백 있음. maxDuration 300. 시스템 프롬프트는 `.claude/skills/{geo-audit-framework,ai-engine-citation-logic,naver-aeo-geo}` 요약을 담고 있으므로 스킬 내용을 바꾸면 프롬프트도 맞춘다
- AI 진단 출력(`SeoDiagnosis`)의 실행 모듈 4종(2026-09-16 추가): ① `aeo`(여정 4단계 질의 10선 × 질문형 H2 + 첫 100~200자 Direct Answer, FAQ 스니펫, 요약 표) ② `geo`(Citable Snippet 5선, Two Paths pathA/pathB, 엔티티 키워드 매핑) ③ `sov`(5대 엔진 테스트 프롬프트, 의사결정 트리; 기록 체크리스트 5항목은 `SOV_CHECKLIST` 상수로 고정) ④ `schemaProposal`(업종 판정 + 삽입용 JSON-LD 전문). 화면 표시는 `features/seo-analysis/DiagnosisModules.tsx`. 여정 단계 enum은 `JOURNEY_STAGES`(정보 탐색·대안 비교·솔루션 탐색·구매 결정). 사용자 입력 `BusinessBrief`(브랜드명·업종·주요 제품·경쟁사·핵심 강점)를 route에 `brief`로 전달하며 비어 있으면 페이지에서 추정
- 수치 원칙: 모델이 수치를 만들지 않도록 프롬프트에서 금지하고, 없는 값은 `[확인 필요: …]` 플레이스홀더로 남긴다. 문서에도 그대로 표기
- 산출물 내려받기 `/api/seo-analysis/export` (type=pptx|xlsx): `features/seo-analysis/reportModel.ts`(공유 모델·헤드라인·파일명) → `exportPptx.ts`(pptxgenjs, 16:9 와이드, 16슬라이드: 표지·요약·방법·결론·엔진별·크롤러·스키마·온페이지/인용적합도·FIX(8건/슬라이드)·PASS·두 경로·질문 설계·우선 액션·재해석/한계·다음 단계) / `exportXlsx.ts`(exceljs, 14시트: 00_요약·01_질문설계·02_응답매트릭스 템플릿·03_진단항목·04_크롤러·05_스키마·06_온페이지_인용적합도·07_엔진별처방·08_인용출처 템플릿·09_유의사항·10_AEO콘텐츠설계·11_GEO전략·12_SOV실측가이드·13_JSON-LD). PPT는 AI 진단이 있으면 실행 모듈 슬라이드 9장(AEO 2·FAQ/요약표·Citable Snippet·엔티티·SOV 프롬프트·체크리스트·의사결정 트리·JSON-LD)이 추가되어 25장, 없으면 안내 슬라이드 1장으로 대체되어 17장. 폰트 Malgun Gothic. AI 진단 없이도 생성되며 해당 칸은 플레이스홀더로 채움
- PPT 레이아웃 시각 검증은 PowerShell COM으로 PNG 렌더 후 확인: `$app=New-Object -ComObject PowerPoint.Application; $p=$app.Presentations.Open($pptx,$true,$false,$false); $p.SaveAs($outDir,18); $p.Close(); $app.Quit()`
- 저장 없음(DB 미사용). 이력 저장이 필요하면 `seo_audits` 테이블 마이그레이션 추가 예정

## AI 인용 추적 (AI 마케팅 에이전트 > AI 인용 추적) — 2026-09-29 추가
- 페이지 `app/(dashboard)/ai-agent/geo-citation/page.tsx`(탭: 대시보드 / 질문 세트 / 설정), 로직 `features/geo-citation/`. 마이그레이션 `0016_geo_citations.sql`(geo_settings·geo_prompts·geo_runs·geo_answers, RLS 본인 행) — SQL Editor 실행 필요
- 방식: 비브랜드 질문 × 엔진을 **웹 검색 켠 API**로 새 세션마다 질의(시스템 프롬프트 없음, 위치 KR) → 답변 원문·인용 URL 저장 → 자사 언급(브랜드 표기 문자열 매칭, `mention_override`로 사람 보정)·자사 도메인 인용·경쟁사 동시 호명 집계. `engines.ts`: Claude `claude-opus-5` + `web_search_20250305`(기본형 — 20260209 동적 필터링은 citations가 비고 2분 넘게 걸려 제외, 실측 약 30초·$0.16/건), ChatGPT Responses API `web_search`(`OPENAI_API_KEY`, 모델 `GEO_OPENAI_MODEL` 기본 gpt-5, url_citation), Gemini `google_search` grounding(`GEMINI_API_KEY`, 모델 `GEO_GEMINI_MODEL` 기본 gemini-3.8-flash — 2.5-flash는 신규 사용자 404, groundingSupports에 연결된 청크만 인용·리다이렉트 URL은 Location으로 해소). 키 없는 엔진은 회차 생성 시 건너뜀. ChatGPT·Gemini는 키 인식·모델 접근까지 확인했으나 두 계정 모두 크레딧 소진으로 응답 파싱은 미검증(2026-09-29)
- 실행: `/api/geo-citation/runs`(회차+응답 행 생성) → 화면이 `/runs/[id]/execute`를 finished까지 반복 호출(한 호출 280초 안에서 동시 6건, pending 선점으로 크론과 중복 방지). 측정 방식(0017 `geo_settings.measure_mode`): off = API 호출 전면 차단(`createRun` 거절, 진행 중 회차도 `executeRun`이 남은 pending을 오류로 닫음) / manual = 버튼만 / auto = `interval_days`(1·3·7·14·30)마다, `auto_start~auto_end`(한국 날짜, 양끝 포함, null=제한 없음) 안에서만. 자동은 크론 `/api/cron/geo-citation-check`(매시 30분, `sweepGeoAuto`, 주기에서 1시간 여유) + 로컬 `instrumentation.ts` 1시간 타이머. `auto_weekly`는 0016 호환용으로만 남김
- 네이버 AI 브리핑은 API 없음 → 매트릭스 네이버 칸에서 원문·출처 URL 수동 입력(`/api/geo-citation/manual`), engine='naver'로 저장하고 글로벌 합계에 넣지 않음
- 질문 초안 `/api/geo-citation/suggest` → `suggest.ts`(seo-analysis `runAudit`로 title·h1·h2·FAQ·JSON-LD를 읽고 원문 근거와 함께 비브랜드 질문·여정 4단계 생성, 브랜드 표기 포함 질문은 제거)
- 집계 `analyze.ts`(엔진별 분리, 출처 유형 도메인 규칙 분류, 상위 도메인, 전 엔진 미언급 질문), 별첨 엑셀 `/api/geo-citation/export?runId=`(`exportXlsx.ts`, geo-audit-framework 8시트). 그래프 색은 `ENGINE_COLOR`(글로벌 3종 CVD 검증 통과, 네이버는 같은 그래프에 안 그림)
- `instrumentation.ts`에서 Anthropic SDK를 쓰는 모듈은 `if (process.env.NEXT_RUNTIME === "nodejs") { await import(...) }` 블록 안에서만 import(early return 뒤 import는 edge 번들에 들어가 node:fs 오류)

## SEO·AEO·GEO 검증 프로젝트 자산 (SEO 폴더에서 이전, 2026-09-16)
- 학습 노트 `knowledge/`: 에스트라 GEO 진단 보고서 정리(`01_*`), 별첨 질문·응답 기록 정리(`02_*`), 이전 프로젝트 가이드(`00_*`). 원본은 `C:\Users\NMG\Desktop\업무 파일\SEO\`
- 스킬 `.claude/skills/` 34개 + 에이전트 `.claude/agents/` 16개. **SEO·GEO·스키마·콘텐츠 작업은 해당 스킬을 먼저 로드하고 그 절차를 따른다.** 작업 시작 시 적용 스킬을 한 줄로 밝힌다
  - 진단 절차: `geo-audit-framework` → 엔진별 원인: `ai-engine-citation-logic`, 국내: `naver-aeo-geo` → 기술 감사: `seo-technical`·`seo-schema`·`seo-sitemap`·`seo-hreflang`·`seo-geo`·`seo-geo-aeo` → 콘텐츠·외부 채널: `geo-content-optimization`·`geo-offsite-strategy`·`ai-seo`·`seo-content` → 전후 비교: `seo-drift`
  - claude-seo 계열(`seo-*`) 번들 스크립트는 런처로만 실행: `"C:/Users/NMG/Desktop/Claude-k2s/ctch/.claude/skills/seo/scripts/claude-seo" run <script.py>` (Bash 도구), 점검 `… doctor`. venv·Chromium(`.claude/skills/seo/.venv`, `ms-playwright`, 약 1.4GB)은 gitignore
- 보고서·집계 원칙: 응답 원문·인용 URL에서만 판단, 엔진별 분리, 네이버는 글로벌과 합산 금지, 브랜드명 매칭 누락·환각 제품명 보정, 한계 섹션 필수. 엑셀은 openpyxl(`PYTHONIOENCODING=utf-8`)

## 광고주 관리 구조 (2026-09-28 개편)
- 사이드바 "현재 광고주" 카드는 표시 전용 → 클릭 시 `features/clients/CurrentClientDialog.tsx`(연동 상태 점검 / 기본 정보 수정만). 전환은 우측 상단 `components/layout/ClientSwitcher.tsx`(검색·전환 + 광고주 관리·신규 등록 링크). "선택 안 함" 없음 — `ClientContext`가 저장된 선택이 없으면 첫 광고주를 자동 선택
- `/clients`: 상단 리스트 박스(고르면 곧바로 현재 광고주로 전환 — 관리 대상 = 현재 광고주) + 신규 등록 버튼(`?new=1`), 선택 시 기본 정보(`ClientInfoForm`) / 매체 연동(`MediaConnections`, 매체별 개별 저장) / 삭제(광고주명 입력 확인). 정리 필요 목록(이름 중복·메타 ID 형식 오류·메타 계정 중복) 표시
- 메타 광고계정 ID는 `clients` 직접 update가 아니라 `/api/clients/[id]/media-keys`(channel=meta)로 저장하며 `metaAccount.ts normalizeMetaAccountId`로 숫자 검증(URL 붙여넣기 시 act= 추출). 토큰은 50자 미만 거절, `clear`로 컬럼 null 처리(전용 토큰 삭제 → 공용 `META_ACCESS_TOKEN` 사용). 입력칸은 `autoComplete=new-password`/`off` + `data-lpignore`/`data-1p-ignore`(브라우저 로그인 자동완성으로 이메일·비밀번호가 들어간 사고 있었음)
- **API 공용 키 관리**(2026-09-28, `/admin/api-keys`, 관리자·최고관리자, `features/admin/ApiKeysPanel.tsx`·`sharedKeyDefs.ts`, API `/api/admin/api-keys` GET 상태(마스킹)/POST test·save/DELETE): 대행사 계정 키를 매체별로 한 번 등록 → 광고주에는 **광고계정 ID(고객 ID)만**. 저장소 `lib/sharedKeys.ts`(`shared_media_keys` channel+config jsonb, RLS on·정책 없음=service_role만, 60초 캐시, 마이그레이션 `0015_shared_media_keys.sql`). 우선순위: 광고주 개별 키 → 공용 키(DB) → `.env.local`(메타 `META_ACCESS_TOKEN`, 네이버 `NAVER_AD_*`만). 메타 `lib/meta/token.ts resolveMetaToken`, 네이버 `resolveNaverAdCredentials`(async, 고객 ID는 폴백 없음 — 예전 공용 고객 ID 323391=자생한방병원이 전 광고주에 보이던 문제), 카카오 `ensureKakaoAccessToken`이 개별 연결 없으면 공용 카카오 계정 토큰(`/api/kakao-moment/oauth/start?shared=1` → callback이 shared에 저장). 저장 전 테스트: 메타 /me + 광고주별 계정 조회, 네이버 발급 계정 probe + 광고주별 probe, 카카오 광고계정 목록 대조, GFA 관리 계정 하위 광고계정 대조. 구글 Ads·GA4는 보관만(조회 미지원). 광고주 매체 연동 패널은 ID 입력 + "개별 키(예외)" 접힘, 네이버는 "조회되는지 확인"(`/api/naver-ad/verify-customer`), 카카오는 접근 가능 광고계정 목록 선택
- `/api/media-status` 메타 항목: 계정명·ID·토큰 출처(전용/공용), `ownToken`, 최근 30일 지출 0이면 `warning`

## 카카오모먼트 연동 (2026-09-16 추가)
- 인증은 API 키가 아니라 **카카오 비즈니스 인증**(`kauth.kakao.com/oauth/business/authorize`·`/oauth/business/token`, scope `moment_management`) 토큰 + `adAccountId` 헤더. 일반 카카오 로그인 토큰은 모먼트 API가 401 "target biz token is not supplied."로 거절(2026-09-28 확인). 비즈니스 토큰은 리프레시 없음·장기 미사용 시 만료 → 401이면 재연결. 시크릿은 `KAKAO_BUSINESS_CLIENT_SECRET`(REST 키 설정의 비즈니스 인증 코드, 없으면 `KAKAO_CLIENT_SECRET` 폴백), 리다이렉트 URI는 "비즈니스 인증 리다이렉트 URI"에 등록. 앱 설정(`KAKAO_REST_API_KEY`·`KAKAO_CLIENT_SECRET`·Redirect URI `{SITE_URL}/api/kakao-moment/oauth/callback`)은 env, 광고주별 토큰·광고계정은 clients 행(`0013_kakao_moment.sql`: kakao_ad_account_id / kakao_access_token / kakao_token_expires_at / kakao_refresh_token / kakao_refresh_expires_at / kakao_linked_at). 구 `kakao_ad_api_key`·`kakao_ad_secret`는 미사용
- 흐름: 광고주 관리 > 카카오모먼트 탭(`features/clients/KakaoConnectPanel.tsx`) → `/api/kakao-moment/oauth/start?clientId=`(state 쿠키) → 카카오 인가 → `/oauth/callback`(토큰 저장, 광고계정 1개면 자동 선택) → `/clients?kakao=linked&clientId=`로 복귀 → 광고계정 선택 저장(`/api/kakao-moment/ad-accounts` POST)
- 데이터: `lib/kakao-moment/{auth,client,types,aggregate}.ts`. 보고서 metricsGroup BASIC·ADDITION·PIXEL_SDK_CONVERSION, 31일 제한 자동 분할, 전환=`conv_purchase_7d`, 매출=`conv_purchase_p_7d`(가정, types.ts에서 교체). 요청 제한(계정/캠페인/소재 보고서 5초, 광고그룹 1초)은 `client.ts`의 광고계정×버킷 대기열이 처리
- 라우트: `summary`(대시보드, 네이버 요약과 동일 모양) / `insights`(실시간 리포트, MetaHierarchy 모양; 광고그룹은 지출 상위 5캠페인, 소재는 상위 40그룹만) / `ad-accounts` / `media-status`는 캠페인 목록 조회로 실검증
- 화면: 대시보드 `MEDIA_LIST`·`loadKakao`·mediaRows, 실시간 리포트 `CHANNELS`에 kakao. 운영 가이드는 `knowledge/kakao-moment-연동가이드.md`

## GFA(네이버 성과형 디스플레이) 연동 (2026-09-30 추가)
- 공식 문서 https://naver-ad-api.github.io/developers/ (Beta, **공식 파트너사만** 사용 신청 가능). 원본 OpenAPI 스펙은 github.com/NAVER-ad-api/developers 의 `redocusaurus/plugin-redoc-{0:계정,1:광고,2:성과}.yaml`
- 인증은 API 키가 아니라 **네이버 로그인 OAuth 액세스 토큰**(1시간) + 관리 계정 멤버면 `AccessManagerAccountNo` 헤더. 공용 연결 1개로 NMG 관리 계정 하위 전 광고계정 조회 → 광고주에는 **광고계정 번호만**(`clients.gfa_customer_id` 컬럼 재사용, 구 `gfa_api_key`·`gfa_secret` 미사용)
- 공용 키 `shared_media_keys.gfa` config: `client_id`·`client_secret`(네이버 개발자센터 앱, 사용 API '네이버 로그인'·제공 정보 선택 X) / `manager_account_no` / `access_token`·`refresh_token`·`expires_at`·`linked_at`. 흐름: 관리자 `/admin/api-keys` > GFA에서 앱 정보 저장 → "네이버 계정 연결" `/api/gfa/oauth/start` → `/oauth/callback`(토큰 저장, 관리 계정 1개면 번호 자동 입력). Callback URL `{SITE_URL}/api/gfa/oauth/callback`(`GFA_REDIRECT_URI`로 변경 가능)을 개발자센터 앱에 등록. env 폴백 `GFA_CLIENT_ID`/`GFA_CLIENT_SECRET`. 저장 시 Client ID가 같으면 토큰 유지(`gfaTokensOf`)
- 토큰 갱신: `lib/gfa/auth.ts getGfaCredentials`가 만료 2분 전이면 refresh_token으로 재발급 → `patchShared`로 저장. 승인 전 동의한 토큰은 "024 인증 실패" → 네이버 연결된 서비스에서 동의 철회 후 재연결
- 데이터 `lib/gfa/{auth,client,aggregate}.ts`: base `https://openapi.naver.com/v1/ad-api/1.0`. 성과는 `performance/past/{campaigns|adSets|creatives|assetGroups}`(startDate/endDate yyyy-MM-dd, timeUnit daily, limit 1000 + `next` 토큰) 한 번에 ID·일자·지표가 옴. 지표 매핑 impCount→노출, clickCount→클릭, **sales→광고비(가정 — 첫 실데이터에서 관리자 화면 총 비용과 대조)**, convCount/convSales→전환/매출(전 전환 유형 합계). 도달 없음. 기간은 31일 단위로 분할(문서에 상한 없음, 방어용). 요청 제한 미공개 → 429·5xx면 2초 뒤 1회 재시도
- 라우트: `/api/gfa/summary`(대시보드, 캠페인 집계 3회) / `/api/gfa/insights`(실시간 리포트 MetaHierarchy, 캠페인 집계+소재 집계+목록 이름 매핑, ADV쇼핑 애셋 그룹 성과는 캠페인 행에만) / `/api/gfa/ad-accounts`(관리 계정 하위+직접 멤버, 이름은 최대 150개 개별 조회) / `media-status`는 계정·캠페인 조회로 실검증
- 화면: 대시보드 `loadGfa`·mediaRows, 실시간 리포트 `CHANNELS`에 gfa, 광고주 매체 연동 GFA는 광고계정 번호 + `GfaAccountPicker`
- 실연동 확인(2026-09-30): 관리 계정 1602(GnM 퍼포먼스 2본부, OWNER), 우주텍 8790 과거 성과 조회 성공. 8790처럼 **연결 아이디가 직접 멤버인 계정에 관리 계정 헤더를 붙이면 403** → `client.ts gfaRequest`가 광고계정별로 헤더 유무를 403 시 바꿔 재시도하고 기억함. `sales`는 소수점 금액(예 226395.6563)이며 9/23~29 CPC 534원·CPM 3,432원으로 광고비로 판단(관리자 화면 총 비용과 최종 대조 필요, VAT 포함 여부 미확인)
- 네이버 개발자센터 앱(NMG_PM_자동화)에 PC 웹 Callback URL이 없으면 로그인 화면이 "서비스 설정에 오류"(disp_stat=207)

## GA4 연동 (2026-10-01 추가)
- 기본 인증은 **공용 구글 계정 연결(OAuth, scope `analytics.readonly`)** — 그 구글 계정이 GA4 속성에 뷰어 이상이면 광고주에는 **속성 ID만**(`clients.ga4_property_id`). 서비스 계정 방식은 GA4 관리자가 서비스 계정 이메일을 따로 추가해야 해서 예외로만 둠
- 공용 키 `shared_media_keys.ga4` config: `client_id`·`client_secret`(GCP OAuth 클라이언트, 웹 애플리케이션) / `access_token`·`refresh_token`·`expires_at`·`linked_at`·`linked_email` / 선택 `service_account_json`. 흐름: `/admin/api-keys` > GA4에서 Client ID·Secret 저장 → "구글 계정 연결" `/api/ga4/oauth/start` → `/oauth/callback`(access_type=offline·prompt=consent, 토큰 저장). 리디렉션 URI `{SITE_URL}/api/ga4/oauth/callback`(`GA4_REDIRECT_URI`로 변경 가능), env 폴백 `GA4_CLIENT_ID`/`GA4_CLIENT_SECRET`. 저장 시 빈 칸은 기존 값 유지(`ga4Merge`), Client ID가 바뀌면 연결 토큰 폐기
- `lib/ga4/auth.ts getGa4Credentials`: 광고주 개별 서비스 계정 → 공용 구글 연결(만료 2분 전 refresh) → 공용 서비스 계정(JWT RS256 직접 서명). `lib/ga4/client.ts`: Data API `runReport`·`probeProperty`(최근 7일 세션), Admin API `accountSummaries`(접근 가능 속성 목록). GCP 프로젝트에서 Data API·Admin API 사용 설정 필요
- OAuth 동의 화면이 '외부 + 테스트'면 리프레시 토큰 7일 만료 → '내부'(워크스페이스) 또는 게시
- `media-status`·API 공용 키 "광고주별 접근 점검"은 실제 runReport로 검증. 대시보드·실시간 리포트 GA4 지표 표시는 미구현(`live: false`)

## 대시보드 개편 (2026-10-01)
- `app/(dashboard)/page.tsx`: 필터 한 줄(기간·매체 칩·비교 기준 직전 기간/전월 동기간) → KPI 5종(광고비·매출·ROAS·전환·CPA, 증감+스파크라인) → 매체별 효율 표(정렬, 예산 비중 막대, ROAS·CPA 증감) → 예산 비중 vs 매출 기여 + 규칙 기반 인사이트 → 일별 추이(광고비 매체별 누적 / ROAS 매체별 선, 이중 축 없음) → AI 액션 플랜(매체별 직전·전월 수치 전달) → 연동 상태 접힘
- 로직·컴포넌트는 `features/dashboard/`(`analysis.ts`가 계산·인사이트 규칙, API 비용 없음). 연동된 매체는 기본 켜짐, 구글 Ads는 `NOT_READY`(준비 중 행)
- 인사이트 규칙: 광고비 0인데 클릭 있음 / 전환·매출 0 / 광고비↑·매출↓ / 매체 ROAS ±20% / CPA +25%(전환 5건 이상) / 예산 비중 vs 매출 기여 ±10%p / 최고 효율 매체. 매체당 최대 2개, 총 6개. 원인 추정 문장 금지
- 차트·색 작업은 프로젝트 스킬 `ctch-dataviz`(`.claude/skills/ctch-dataviz`)를 먼저 로드. 매체 색은 검증된 고정값(`MEDIA_COLORS`)
- 기존 `PeriodComparison`·`KeyMetricsBarChart`·`TrendChart`(이중 축)·`MetricTrendGrid`·`DeltaBadge`는 이제 어느 화면에서도 쓰지 않음(파일만 남김)
- AI 리포트 두 화면도 같은 형태(2026-10-01): **실시간 리포트** `/ai-report` = 헤더(기간·프리셋·조회) → 필터 줄(매체 칩·비교 기준) → KPI 5종+보조 줄(노출·클릭·CTR·CVR·CPC) → 캠페인 예산 비중 vs 매출 기여(상위 8 + 기타, `rowsToSeries`) + 인사이트(매체 단위 변화 규칙 + 캠페인 단위 비중 규칙 병합) → 일별 광고비/ROAS → 탭(캠페인·세트·소재·AI) → 저장. **파일 분석** `/report-analysis` = KPI(비교 없음) → 매체별 효율 표(그룹 이름 → `guessMediaKey`/`colorsForNames`로 매체 색, 중복·미상은 6~8번 슬롯) → 예산 비중 vs 매출 기여 + 인사이트
- 공용 UI `features/dashboard/ui.tsx`(`Card`·`Segmented`·`MediaChip`). `KpiStrip`은 `compareLabel` 없으면 증감·비교 줄 숨김, `secondary`로 보조 줄. 표·차트는 `noun`(매체/캠페인)으로 문구 전환

## 소재 분석 (AI 리포트 > 소재 분석) — 2026-10-01 1단계(메타)
- 페이지 `app/(dashboard)/creative-analysis/page.tsx` → 본문 `features/creative-analysis/CreativeAnalysisView.tsx`(광고주를 props로 받음, `dataUrl`·`assetUrl` 교체 가능). 네비 `components/layout/nav.ts` AI 리포트 하위
- 데이터 `/api/creative-analysis/meta`(POST clientId·since·until) → `fetchMeta.ts fetchMetaCreatives`: 광고 단위 인사이트를 **페이지 끝까지**(`lib/meta/graph.ts graphAll`, 기존 meta-insights는 limit 500에서 잘림) + 광고·광고세트·캠페인을 `?ids=` 50개씩(`graphByIds`) + 광고비 상위 40개 일별(피로도). 지표: 링크 클릭(inline_link_clicks)·구매(PURCHASE_TYPES)·3초 재생(actions video_view)·ThruPlay. 르무통 14일 약 25초
- **썸네일**: 광고의 `creative{thumbnail_url}`은 64px이라 creative id로 다시 조회. 메타는 `thumbnail_width×height` **상자로 잘라서** 주므로(600×600이면 9:16 원본의 위아래 카피가 잘림) 원본 크기를 먼저 읽어(이미지 해시 → `act/adimages` width·height, 영상은 `/{video_id}` thumbnails를 **하나씩** — 파트너십 영상은 권한 오류(#10·#283)라 묶음 조회 전체가 실패함) 가장 가까운 비율(1.91:1·1:1·4:5·9:16)별로 600×(600×비율) 요청, 모르면 영상 9:16·이미지 1:1. 카드는 4:5 틀에 `object-contain`, 등급·포맷 배지는 이미지 밖(정보 영역)에 둔다. 원본은 소재를 열 때만 `/api/creative-analysis/meta/asset`(`fetchAsset.ts`: asset_feed_spec·object_story_spec 이미지 해시 → `act/adimages` 원본 1080×1920, 영상은 `/{video_id}` thumbnails·length; 다른 광고계정 광고 id는 거절). fbcdn URL은 수일 뒤 만료 → 세션 캐시 30분
- 소재명 해석 `naming.ts`: 광고주별 사전(르무통 = 구글 시트 1DLTe7ago__srs9BKJUa7GR3UIo7qskdeXKN5uJK5oKE 규칙, `dictFor`가 이름으로 선택). 날짜_목표 다음을 앞에서부터 소비: TVC 사전(여러 조각, 가장 긴 것) → `tvc`+모델 → `ps`(파트너십, 뒤 조각=인플루언서 핸들) → 여러 조각 콘텐츠 → 테마+연도(chuseok_2026) → 영상 길이(15s) → 모델 → 콘텐츠 → 랜딩·상품+번호(ev01·hub11, e/v+숫자는 번호만) → 상품 코드. 사전에 없는 단어는 테마/세부 콘텐츠로, 숫자·기호 조각은 화면에 "해석 못한 코드"로 노출(사전 보강용). 광고세트 이름의 성별·연령은 붙여 쓴 `f3549` 또는 연속 조각 `f_2060`만 인정(`fall`=f+all 오인 방지)
- 실제 르무통 이름은 시트 규칙보다 자유롭고, **광고세트명은 성별_연령대_타겟 규칙을 거의 안 따름** → 타겟 분석은 API 실제 타겟팅(연령·성별·맞춤/제외 타겟·유사·관심사·Advantage+ 타겟·지면·최적화·학습 상태) 기준, 이름과 다르면 세팅 점검에 표시
- 분석 `analyze.ts`: 캠페인 목표로 그룹(OUTCOME_SALES=전환, 나머지=인지·트래픽) 안에서만 비교·등급(상위10%/25%/하위25%, 판단 기준 노출 미만=판단 보류). 요소별 성과(`CREATIVE_DIMENSIONS`·`TARGET_DIMENSIONS`), 세팅 점검(이름≠실제 타겟, 같은 타겟 세트 3개+ 경쟁, 구매자 제외 일부만, 학습 제한, 소재 8개+ 중 1개가 70%+), 피로도(7일+·빈도 2+·CTR 초반 3일 대비 −30%), 인사이트(매출 집중도, 요소 평균 대비 1.3배↑/0.7배↓, 클릭↑구매↓, 신규 vs 30일+). 화면: KPI → 인사이트·세팅 점검 → 갤러리(4:5 썸네일·등급·이름 칩) → 요소별 → 타겟·세팅별 → CTR×CVR 사분면 → 피로도, 상세 드로어(원본 에셋·이름 해석·평균 대비·실제 타겟·문구·같은 테마 소재)
- 한계·다음: 파트너십(인스타 게시물) 소재는 광고 문구가 비어 있음(인스타 캡션 조회 필요), 사전은 코드 상수(편집 UI·DB 미구현), AI 비전 진단·제작 브리프는 미구현, 카카오·GFA·네이버 확장 예정

## 미디어믹스 최적화 (Budget Allocator) — 2026-10-01
- 페이지 `app/(dashboard)/media-mix/page.tsx`(데이터) → 본문 `features/media-mix/MediaMixView.tsx`(models를 props로 받음 — 샘플로 렌더 확인 가능). 좌측 조건 설정(총예산·집행 기간·목표 3종·목표 ROAS/CPA·매체 잠금·학습 기간 30/60/90일) / 우측 Uplift(40px 고정폭, 롤링) + 예상 매출·ROAS·전환·CPA + AS-IS vs TO-BE 100% 막대 + 반응 곡선 / 하단 상세 믹스안(슬라이더, 증액 초록·감액 회색 뱃지, 한계 ROAS/CPA, 효율 한계점) + 예산 동기화
- 학습 데이터 `useMediaHistory.ts`: 대시보드와 같은 요약 API(메타·네이버 SA·GFA·카카오)를 학습 기간으로 호출, **세션 캐시 키도 대시보드와 동일**. 연동 안 된 매체·학습 기간 광고비 0 매체는 제외. 구글 Ads 미포함
- 모델 `model.ts`(순수 함수, API 비용 없음): 매체별 일별 (광고비→매출/전환)에 y=a·x^b 로그-로그 회귀, 데이터 적음·설명력 낮음·광고비 변동 작음이면 사전값 b=0.65로 당김(b 0.3~0.95), a는 기간 평균점을 지나게 맞춤. 배분은 잠금 제외 예산을 600조각으로 한계 성과 최대 매체에 배정(평균의 0.3~2.5배 안 우선, 넘으면 '관측 범위 밖'). AS-IS = 같은 총예산을 학습 기간 광고비 비율대로 쓴다고 보고 같은 곡선으로 예측 → Uplift는 배분만의 효과. CPA 최소화는 한계 CPA가 목표(없으면 평균 CPA×1.2)를 넘으면 남은 예산을 '쓰지 않기 권장'. 효율 한계점: 매출 목표=한계 ROAS 100%, 전환 목표=목표 CPA → CPA 기준 → 평균 CPA×1.5. 목표 ROAS/CPA를 지키는 최대 예산은 이분 탐색
- 슬라이더: 한 매체를 움직이면 잠기지 않은 나머지가 비율대로 흡수해 합계 유지(`evaluate`로 예측만 갱신), 조건을 바꾸면 AI 제안으로 초기화
- **예산 동기화** `/api/media-mix/sync`(action=plan 읽기 전용 / apply 실행, 뷰어 불가) → `sync.ts`: 매체 일 예산 목표를 매체 안 예산 단위에 **현재 일 예산 비율대로** 배분. 메타 = 활성 CBO 캠페인 daily_budget + ABO 광고세트 daily_budget(총 예산형 제외, 통화 소수점 offset 처리, 100원 단위·최소 1,000원), 네이버 SA = `useDailyBudget` 캠페인 `PUT /ncc/campaigns/{id}?fields=budget`(10원 단위, 제한 없음 캠페인 제외; `naverAdRequest`에 body 인자 추가). GFA·카카오는 '수동 반영' 안내만. apply는 서버가 계획을 다시 만들어 화면이 확인한 계획과 다르면 409로 멈춤. 실행 기록 `media_mix_syncs`(마이그레이션 `0018_media_mix_syncs.sql`, SQL Editor 실행 필요 — 없으면 기록만 건너뜀)
- **실계정 쓰기는 미검증(2026-10-01)**: 메타 토큰에 `ads_management` 권한 필요, 네이버 PUT 본문 형식은 문서 기준. 첫 실행은 소액 테스트 계정으로 확인할 것

## 가독성 개편 (2026-10-01)
- 대시보드·실시간 리포트·파일 분석·소재 분석 컨테이너는 `mx-auto w-full max-w-[1600px]`(레이아웃 `main p-6 2xl:px-8`), 타이포·색 규격은 `.claude/skills/ctch-dataviz` "가독성 규격" 참고. Tailwind 토큰 변경: `ink-muted #6B7079`, `good #15803D`, `warn #C2410C`, `bad #DC2626`(작은 글자 4.5:1 이상)
- 대시보드 비교 기준에 **전년 동기** 추가: 요약 API 4종(meta-summary POST `withYear`, naver·kakao·gfa summary GET `year=1`)이 요청 시에만 `lastYear`·`yearPeriod`를 함께 반환(실패해도 요약 전체는 정상). 대시보드는 전년 동기를 고를 때만 다시 조회하고 캐시 키에 `_y`
- 매체별 효율 표(`MediaEfficiencyTable`)는 퍼널 11열(노출·클릭·CTR·CPC·장바구니 추가). 장바구니(`Totals.addToCart`, 선택 필드)는 현재 메타만(meta-summary `add_to_cart`·`omni_add_to_cart`·`offsite_conversion.fb_pixel_add_to_cart`), 다른 매체는 undefined → "—"(0과 구분). 카카오는 `conv_add_to_cart` 키 실응답 확인 후 연결 예정. 대시보드 메타 요약 캐시 키 `ctch_dash2_`
- 서체는 Pretendard로 통일(tailwind `display`도 Pretendard, globals.css에서 Space Grotesk 제거). AI 액션 플랜은 `features/dashboard/AiPlanView.tsx`(본문 15px·행간 1.6, 즉시 조치가 없으면 상태 줄 + 2단)
- **메타 앱 호출 한도**(2026-10-01 #4 "Application request limit reached" 발생 — 소재 분석 실데이터 검증으로 x-app-usage call_count 497%): `lib/meta/graph.ts`가 응답 헤더 `x-app-usage`를 기억해 90% 이상이면 새 호출을 막고 안내(같은 서버 프로세스 기준), 한도 코드(4·17·32·613·80000·80004)는 한국어 안내로. 소재 분석은 영상 크기를 1건씩이 아니라 50개 묶음(`graphByIdsTolerant`: 권한 없는 영상이 섞여 실패하면 반으로 나눠 재시도)으로, 원본 크기·썸네일은 서버 메모리 캐시(`SIZE_CACHE`·`THUMB_CACHE` 12시간). 실데이터 검증 스크립트는 반복 실행 전에 사용량을 먼저 확인할 것
- 전 기능 화면 통일(2026-10-01): 페이지 컨테이너 `mx-auto w-full max-w-[1600px] space-y-6`(UTM 단일 생성 폼 안쪽 max-w 제거, 모달은 유지), 카드 `p-6`, text-[9·10px]→11px·text-[11px]→12px, 작은 배지(rounded+py-0.5)에 `whitespace-nowrap`, SEO 분석 크롤러 표 UA·회사·상태 한 줄 고정 + 설명 열 `min-w-[260px]`
- 가독성 2차(2026-10-01): 앱 전체 글자 한 단계 상향(9~11→12, 12→13, 13·14→15, 15→16, 16→17, text-xs→13px, 차트 fontSize→13), body 15px·행간 1.55, 서체 Pretendard Variable(동적 서브셋), 표 숫자 칸 font-mono→tabular-nums. tailwind 설정을 바꾸면 dev 서버를 재시작해야 반영됨

## 상관관계 분석 (Cross-funnel) — 2026-10-01
- 페이지 `app/(dashboard)/correlation/page.tsx`(기간 60/90/120일, 세션 캐시 30분) → 본문 `features/correlation/CorrelationView.tsx`(CorrDataRes를 props로 받음 — 샘플로 렌더 확인 가능). 질문: 영상·도달·트래픽·참여(원인) 캠페인이 전환·검색 캠페인 성과·검색 수요(결과)를 움직였나
- 데이터 `/api/correlation/data`(POST clientId·since·until, 최대 180일) → `fetchData.ts`: 매체별 캠페인 목록(목표) + 캠페인 단위 일별, 매체 독립·병렬. 메타 `graphAll` insights level=campaign time_increment=1(페이지 끝까지, video_view 포함) / 네이버 SA는 일별이 캠페인 단건 조회뿐이라 브랜드검색 전부 + 광고비 상위 15개 / GFA `performance/past/campaigns` 일별 / 카카오 계정 보고서 level=CAMPAIGN·DAY(dimensions의 campaign_id·start 키 — 실데이터 미확인)
- 역할 분류 `types.ts guessRole`: 메타 objective·GFA objective·카카오 `campaignType/goal`·네이버 campaignTp(BRAND_SEARCH=브랜드검색, 나머지=검색). 인지·참여·트래픽 목표라도 이름에 영상 키워드(video·영상·tvc·vvc·유튜브·릴스 등)가 있으면 영상. 사용자가 표에서 바꾼 값은 localStorage `ctch_corr_roles_<clientId>`. 원인 4색 `ROLE_META`(#4a3aa7·#e87ba4·#1baf7a·#eda100, 검증 통과·CVD 6.1 경계라 범례·간격·표 필수), 결과 역할은 색 없이 글자
- 계산 `analysis.ts`(순수 함수): 결과 = 전환·검색·브랜드검색 캠페인의 전환·매출·ROAS·CPA + 검색광고 클릭·브랜드검색 클릭(원인 캠페인 자체 전환은 제외). 요일 더미+선형 추세 잔차 → adstock θ{0,.3,.5,.7} × 시차 0~14일 중 |r| 최대, 유효 표본(lag-1 자기상관 보정) t검정 × 6(다중 비교) → 뚜렷함/있음/약함/확인 안 됨. 기여도는 원인 전부 + 요일·추세 릿지 회귀(원인 열 표준화 λ=1, 샌드위치 SE에 잔차 자기상관 팽창), 90% 구간 하한>0만 '확인됨', '1만 원당'은 잔존 포함(1/(1-θ)). 집행일(중앙값 20%↑) vs 미집행일(0) 요일 보정 평균 비교. 원인↔성과 캠페인 광고비 잔차 상관 ≥0.7이면 '분리 어려움' 표시
- 합성 데이터 검증(2026-10-01): 심어 둔 영상 효과(시차 3일·θ 0.5·1만 원당 0.80건)를 시차 3·θ 0.5·0.81건으로 복원, 무효과 트래픽(우연 r 0.44)은 '확인 안 됨'. 작은 효과(도달→브랜드 클릭)는 영상과 겹치면 못 잡음 — 한계로 안내
- 외부 지표 CSV(GRP·SOV·검색량): 첫 열 날짜, 빈 날 직전 값 채움, 원인/결과 지정. 비가산이라 회귀 기여도에는 넣지 않고 상관만
- 매트릭스는 유의한 칸만 |r|만큼 진하게(인디고 +, 갈색 −), 나머지 옅게. 문구는 '함께 움직였다'(인과 단정 금지)
- 디자인 스타일 Cake 레퍼런스로 전환(2026-10-01): 흰 페이지(레이아웃 `bg-surface`, body #fff), 토큰 ink #101828·soft #344054·muted #475467(7.6:1, 처음 #667085에서 진하게)·faint #98A2B3(비활성·장식 전용 — 읽어야 하는 글자엔 쓰지 않음)·canvas #F9FAFB·line #EAECF0·signal-soft #F4F3FF·card radius 10px, 공용 Card 머리 띠, KPI 아이콘 사각형, 사이드바 회색 아이콘·활성 왼쪽 막대·›, 상단바 제목 굵게. 세부는 `.claude/skills/ctch-dataviz` "디자인 스타일"
- 서체 Noto Sans KR로 교체(2026-10-01, Windows 실측 비교 — Pretendard Variable은 힌팅이 없어 흐릿). globals.css 구글 폰트 import + tailwind sans/display. 폴백 Pretendard(정적)·맑은 고딕

## 퍼포먼스 매니저 → 광고주별 캠페인 매니저 (AI 마케팅 에이전트 > 퍼포먼스 매니저) — 2026-10-01 구축, 10-02 캠페인 매니저로 개편
- 페이지 `app/(dashboard)/ai-agent/page.tsx`: 제목 '{광고주} 캠페인 매니저'. 왼쪽 `features/perf-manager/CampaignManagerBoard.tsx`(상태 4칸 → 메일 연결·수집(MCP 대안 접힘) → 메일 AI 정리 → 메일 규칙·캠페인 담당자·시장 설정) + 접힘 '업계 최신 정보'(`KnowledgeBoard.tsx`) / 오른쪽 대화창(`ChatPanel.tsx`, clientId 기준, 광고주 바꾸면 대화 초기화). **대화는 저장하지 않음**
- **메일 수집 구조(2026-10-02 최종, 사용자 요청 '최소화')**: 화면 '메일 수집' 카드 왼쪽 = **내 Gmail 연동 동의**(로그인한 본인 계정 1회, `/api/perf-manager/gmail/start`→`/callback`, scope gmail.readonly, 로그인 계정과 같은 구글 계정만 저장, `pm_mail_accounts`, 철회 DELETE `/api/perf-manager/gmail`) — **연동 = 모든 프로젝트 조건에 따른 수집 동의**(프로젝트별 허용 단계 없음, `pm_mail_shares`·0023은 미사용으로 남김). 오른쪽 = **이 프로젝트 수집 조건**(특정인 주소/@도메인 · 키워드 · 하나라도/둘 다). '메일 동기화'(action=sync, `mailSync.ts`)는 동의한 메일함 전부의 **전체 메일함**(스팸·휴지통·임시보관 제외)을 검색(메일함당 150건/회, 처음 90일·이후 그 메일함 마지막 메일-2일부터). action=removeMine(내 메일함에서 온 메일 삭제). OAuth 앱은 GCP **ctch 프로젝트(ctch-503703)의 'CTCH Gmail 연결' 웹 클라이언트**(env `GMAIL_CLIENT_ID`·`GMAIL_CLIENT_SECRET` — .env.local·Vercel 등록). 캠페인 담당자 지정·시장 정보·MCP 안내는 접힌 '추가 설정'
- **수집 조건(2026-10-02 개편, 사용자 요청 '심플하게')**: 허용한 담당자의 **받은편지함·보낸편지함**(`{in:inbox in:sent}`)에서 '특정인'(주소 — 사내 nmg 주소도 가능, 회사 전체는 @도메인 단 nmg.co.kr·gmail.com 등 `BROAD_DOMAINS`는 불가)·'키워드' 조건으로 수집, 사내 메일 포함. 조건 `mail_match`: any(하나라도) / all(특정인 AND 키워드 교집합) — 마이그레이션 `0024_pm_mail_rules_block.sql`. `mailText.ts buildQuery`·`matchesRules`(저장 직전 재확인)
- **민감 메일 차단(원칙)**: 기본 목록은 코드(`SENSITIVE_KEYWORDS` 급여·연봉·성과급·원천징수·연말정산·인사평가·징계·주민등록번호 등, `SENSITIVE_SENDER_WORDS` 경영지원·인사팀·총무·재무·회계·노무 등 — 끌 수 없음) + 관리자 추가 목록(`pm_mail_block` kind keyword|sender, 화면 '민감 메일 차단' 카드, SUPERADMIN만 편집, 추가 시 이미 모은 메일 중 걸리는 것 전 광고주에서 삭제 `store.addBlock`). 적용 3단: ① 수집 조건에 못 씀(`ruleProblems`) ② Gmail 검색에서 `-단어 -from:주소`로 제외 ③ 저장 직전 `isSensitiveMail`(보낸·받는·참조 이름/주소 + 제목·**인용부 포함 원문**) — MCP 가져오기 파일에도 적용
- 저장·중복 합치기는 `mailStore.ts saveMails` 하나(같은 메일 = `mailText.ts dedupKey`: Message-ID, 없으면 보낸 사람|시각(분)|제목 → 1건만 두고 `mailboxes`에 메일함 추가, 답장 인용부는 `stripQuoted`로 잘라 6,000자)
- **대안: Claude Code Gmail MCP 가져오기** — claude.ai Gmail 커넥터는 CTCH 서버(API 키)에서 호출할 수 없어 서버 연동 불가. 대신 담당자 Claude Code에서 "{광고주} 메일 가져와" → 스킬 `.claude/skills/ctch-mail-import` → `npx --yes tsx scripts/pm-mail.ts rules|import`(service_role, 로컬 전용, saveMails 공용). 화면에서는 'MCP로 가져옴' 메일함으로 표시
- 수집 조건 칸(2026-10-02 최종): **광고주**(외부 주소·@도메인·파트너) · **NMG**(내부 주소) — 둘 다 이메일만 쉼표로 입력, 저장은 `mail_addresses`(주소)·`mail_domains`(@도메인)에 함께, 화면은 `@nmg.co.kr` 여부로 나눠 보여줌 · 키워드 · 하나라도/둘 다. 캠페인 담당 지정 칸은 없앰 — 저장 때 `pm_campaign_owners`를 비우고, 대화·메일 정리 프롬프트에는 `store.peopleAsMembers`(수집 조건의 사람 → 광고주/NMG 구분 목록)를 넣어 담당자는 AI가 메일 맥락으로 판단
- 메일 AI 정리 action=analyze → `memory.ts buildMemory`(최근 120건×1,500자, claude-opus-5-5 + json_schema `MEMORY_SCHEMA`: 요약·KPI·합의·요청(미해결/완료/확인 필요)·일정·이슈·연락처, 출처 'MM-DD 제목') → `pm_memory`. 대화 시스템 프롬프트 두 번째 블록에 들어감(`memoryToText`)
- 대화 `/api/perf-manager/chat`(body clientId·turns·webSearch, NDJSON text/skill/tool/search/sources) → `chat.ts runChat`: `claude-opus-5-5` + adaptive + effort medium + `fallbacks: "default"`, 수동 루프 최대 10회, 도구 병렬 실행. 도구: load_skill / get_campaign_performance·get_campaign_daily(`campaigns.ts` — 상관관계 분석과 공용 `features/correlation/fetchClient.ts fetchClientCampaigns`, 서버 메모리 10분 캐시, 최근 7일 vs 직전 7일·담당자) / search_emails·read_email(pm_emails ilike) / get_market_signals(`market.ts` — 경쟁사 키워드 순위·브랜드 키워드 침해·경쟁사·시장 메모) / web_search(기본형 20250305)
- 권한: pm_* 테이블은 RLS on·정책 없음(service_role만, **user_id 칸 없음** — 0021 DO 블록 재실행해도 소유자 전용 정책이 안 붙게). 라우트는 `store.ts requireClientAccess`(로그인·@nmg.co.kr·광고주 읽기 가능). 메일 규칙·담당자 저장·Gmail 연결·동기화는 **구성원 누구나**(다른 메뉴의 소유자 전용 쓰기와 다름 — 담당자가 직접 관리)
- 준비: ① 마이그레이션 `0022_campaign_manager.sql`(실행됨 2026-10-02) + `0023_pm_mail_shares.sql`(실행됨) + `0024_pm_mail_rules_block.sql` SQL Editor 실행 ② GCP ctch 프로젝트 Gmail API 사용 설정(완료) ③ 'CTCH Gmail 연결' 클라이언트 리디렉션 URI `https://ctch-mvp.vercel.app/api/perf-manager/gmail/callback`·`http://localhost:3001/...`(완료) ④ 동의 화면 내부 + `gmail.readonly` 범위(완료)

- **스킬** `skills.ts` 8종(funnel-diagnosis·meta-ads·google-ads·naver-kakao·measurement·budget-allocation·creative-strategy·cro-landing): 시스템 프롬프트에는 이름·설명만, 모델이 `load_skill`(strict, enum) 도구로 본문을 읽음. 플랫폼 스킬 끝에 '현재 상황(2026-10 조사, 출처 확인분)' — 최신 사실을 바꾸면 여기와 briefSeed를 함께 갱신
- 웹 검색은 기본형 `web_search_20250305`(max_uses 4, KR) — 이 프로젝트 실측상 20260209는 인용이 비고 느림. 실호출 확인(2026-10-01): 스킬만 약 21초, 웹 검색 포함 약 36초
- **최신 정보** `briefs.ts`: 코드 시드 `briefSeed.ts`(2026-10-01 웹 조사 36건, 출처 URL 확인 — 일부는 업계 매체 출처라 요약에 표시) + DB `perf_briefs`(마이그레이션 `0019_perf_briefs.sql`, RLS on·정책 없음=service_role만). 화면 "최신 정보 업데이트"(뷰어 불가, `/api/perf-manager/briefs` POST, 1~3분·API 비용) 와 주간 크론 `/api/cron/perf-briefs`(월 00:00 UTC = 09:00 KST, vercel.json)가 Claude+웹 검색으로 새 항목을 JSON으로 받아 URL 중복 제외 후 저장. 최신 정보 목록 상위 40건은 대화 시스템 프롬프트에도 들어감
- 광고주 브랜드 색(2026-10-01): `clients.brand_color`(#RRGGBB, **마이그레이션 `0020_client_brand_color.sql` — SQL Editor 실행 필요**). 광고주 관리 기본 정보의 "브랜드 색"(견본 12색·색 선택·hex)에서 저장 → 사이드바 현재 광고주·우측 상단 광고주 전환의 이니셜 박스 색. 비우면 이름 해시로 범주 팔레트 자동 색(`brandColorOf`), 밝은 색이면 글자 자동 어둡게(`onColor`). 마이그레이션 전에도 목록 조회·저장이 깨지지 않게 brand_color 없이 재시도
- 대시보드 속도(2026-10-01): 요약 API 4종에 전월 동기 생략 옵션(meta-summary POST `withMonth:false`, naver·kakao·gfa GET `month=0`; 기본은 포함 — 미디어믹스 등 기존 호출 그대로). 대시보드는 비교 기준이 "전월 동기"일 때만 전월을 받고 캐시 키에 `_nm`(미디어믹스와 같은 캐시 이름이라 섞이지 않게). 요약 API 서버 메모리 캐시 10분(소유 확인 뒤 조회). 네이버 일별 근사 상위 20→8 캠페인(네이버 요청 대기열 1초 간격이라 12건≈12초 절약). dashboard-smart는 lastMonth 없을 때도 동작. 카카오는 보고서 5초/1회 제한이 근본 원인이라 최소 ~10초

## 로그인·권한 (2026-10-01 개편)
- 로그인은 **구글 계정(@nmg.co.kr)만**(`app/(auth)/login`, hd 힌트 + `/auth/callback`·미들웨어에서 도메인 외 계정 로그아웃). 비밀번호 가입 없음(`/signup`은 /login으로)
- 워크스페이스 = 소유자(`SUPERADMIN_EMAIL` = k2s@nmg.co.kr) 데이터 하나. nmg 계정은 자동 승인 뷰어로 **읽기만**, 저장·수정·삭제·실제 예산 변경·공용 키·회원 관리는 소유자만. 회원 관리에서 거절한 계정은 거절 유지
- DB: `0021_workspace_sharing.sql` — user_id 칸이 있는 테이블 전부 `ws_read`(user_id=`workspace_owner_id()` + `is_workspace_member()`) / `ws_insert·update·delete`(소유자 본인). 소유자 이메일은 함수 안에 하드코딩 → 바꿀 땐 env와 함께. 새 user_id 테이블을 만들면 0021의 DO 블록을 다시 실행
- 서버: `lib/workspace.ts` — 읽기 라우트는 `.eq("user_id", await dataOwnerId(user))`, 쓰기 라우트는 첫 줄 `ownerOnly(user)`(403). 미들웨어용 순수 판정은 `lib/workspaceEmail.ts`(edge에서 admin 클라이언트 import 금지)
- 화면: `features/workspace/WorkspaceContext.tsx` `useCanEdit()`·`EditGate`(fieldset disabled). 헤더에 "보기 전용" 표시. 그 외 화면의 저장 버튼은 RLS가 막는다(오류 문구로 표시)
- 미들웨어는 `/api/cron/*`을 로그인 없이 통과시킨다(라우트가 `CRON_SECRET` 검증)
- **Vercel Hobby 요금제는 크론을 하루 1회까지만 허용**(시간 단위 스케줄이 있으면 Git 배포가 'Deployment failed'로 거절됨). `vercel.json`은 매일 09:00·09:10·09:30 KST(경쟁사·브랜드 키워드·AI 인용) + 월 10:00 KST(최신 정보). 1·3·6·12시간 점검 주기는 Pro 전환 전까지 사실상 하루 1회. Vercel 프로젝트는 GitHub `ik2sun/ctch-mvp` main에 연결(2026-10-01), push = 운영 배포
