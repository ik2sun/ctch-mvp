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

## SEO·AEO·GEO 검증 프로젝트 자산 (SEO 폴더에서 이전, 2026-09-16)
- 학습 노트 `knowledge/`: 에스트라 GEO 진단 보고서 정리(`01_*`), 별첨 질문·응답 기록 정리(`02_*`), 이전 프로젝트 가이드(`00_*`). 원본은 `C:\Users\NMG\Desktop\업무 파일\SEO\`
- 스킬 `.claude/skills/` 34개 + 에이전트 `.claude/agents/` 16개. **SEO·GEO·스키마·콘텐츠 작업은 해당 스킬을 먼저 로드하고 그 절차를 따른다.** 작업 시작 시 적용 스킬을 한 줄로 밝힌다
  - 진단 절차: `geo-audit-framework` → 엔진별 원인: `ai-engine-citation-logic`, 국내: `naver-aeo-geo` → 기술 감사: `seo-technical`·`seo-schema`·`seo-sitemap`·`seo-hreflang`·`seo-geo`·`seo-geo-aeo` → 콘텐츠·외부 채널: `geo-content-optimization`·`geo-offsite-strategy`·`ai-seo`·`seo-content` → 전후 비교: `seo-drift`
  - claude-seo 계열(`seo-*`) 번들 스크립트는 런처로만 실행: `"C:/Users/NMG/Desktop/Claude-k2s/ctch/.claude/skills/seo/scripts/claude-seo" run <script.py>` (Bash 도구), 점검 `… doctor`. venv·Chromium(`.claude/skills/seo/.venv`, `ms-playwright`, 약 1.4GB)은 gitignore
- 보고서·집계 원칙: 응답 원문·인용 URL에서만 판단, 엔진별 분리, 네이버는 글로벌과 합산 금지, 브랜드명 매칭 누락·환각 제품명 보정, 한계 섹션 필수. 엑셀은 openpyxl(`PYTHONIOENCODING=utf-8`)

## 카카오모먼트 연동 (2026-09-16 추가)
- 인증은 API 키가 아니라 **카카오 로그인 OAuth 비즈니스 토큰** + `adAccountId` 헤더. 앱 설정(`KAKAO_REST_API_KEY`·`KAKAO_CLIENT_SECRET`·Redirect URI `{SITE_URL}/api/kakao-moment/oauth/callback`)은 env, 광고주별 토큰·광고계정은 clients 행(`0013_kakao_moment.sql`: kakao_ad_account_id / kakao_access_token / kakao_token_expires_at / kakao_refresh_token / kakao_refresh_expires_at / kakao_linked_at). 구 `kakao_ad_api_key`·`kakao_ad_secret`는 미사용
- 흐름: 광고주 관리 > 카카오모먼트 탭(`features/clients/KakaoConnectPanel.tsx`) → `/api/kakao-moment/oauth/start?clientId=`(state 쿠키) → 카카오 인가 → `/oauth/callback`(토큰 저장, 광고계정 1개면 자동 선택) → `/clients?kakao=linked&clientId=`로 복귀 → 광고계정 선택 저장(`/api/kakao-moment/ad-accounts` POST)
- 데이터: `lib/kakao-moment/{auth,client,types,aggregate}.ts`. 보고서 metricsGroup BASIC·ADDITION·PIXEL_SDK_CONVERSION, 31일 제한 자동 분할, 전환=`conv_purchase_7d`, 매출=`conv_purchase_p_7d`(가정, types.ts에서 교체). 요청 제한(계정/캠페인/소재 보고서 5초, 광고그룹 1초)은 `client.ts`의 광고계정×버킷 대기열이 처리
- 라우트: `summary`(대시보드, 네이버 요약과 동일 모양) / `insights`(실시간 리포트, MetaHierarchy 모양; 광고그룹은 지출 상위 5캠페인, 소재는 상위 40그룹만) / `ad-accounts` / `media-status`는 캠페인 목록 조회로 실검증
- 화면: 대시보드 `MEDIA_LIST`·`loadKakao`·mediaRows, 실시간 리포트 `CHANNELS`에 kakao. 운영 가이드는 `knowledge/kakao-moment-연동가이드.md`
