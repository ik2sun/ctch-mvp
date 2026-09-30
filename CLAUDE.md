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
