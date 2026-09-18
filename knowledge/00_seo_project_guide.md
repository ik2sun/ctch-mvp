# SEO 기반 AEO·GEO 검증 및 제안 프로젝트

## 목적
대상 사이트의 SEO 기반 AEO(Answer Engine Optimization)·GEO(Generative Engine Optimization) 설계가 실제로 AI 검색(ChatGPT·Gemini·Claude·Perplexity·네이버)에서 작동하는지 검증하고, 결과를 바탕으로 진단 보고서·제안서를 만든다.

## 학습 자료 (knowledge/)
- `knowledge/01_aestura_geo_report_2026-08.md` — 에스트라 GEO 진단 보고서(BizSpring × Entrench, 17p) 정리. 방법론·KPI·엔진별 특성·기술 체크리스트·재해석 논리·보고서 톤
- `knowledge/02_aestura_qa_records_22xlsx.md` — 별첨 질문·응답 원천 기록(22.xlsx) 정리. 질문 설계, 40건 매트릭스, 232건 인용 분포, 경쟁사, 유의사항, 7단계 검증 프레임
- 원본 위치: `C:\Users\NMG\Desktop\업무 파일\SEO\` (미학습 자료: DYPNF 글로벌 GEO 제안서, HP AI검색 진단리포트, 아이디병원 인도네시아 리포트, 자생한방병원 GEOcare 제안서)

## 스킬 사용 지침 (필수)
이 프로젝트의 작업은 반드시 `.claude/skills/`에 설치된 스킬을 먼저 확인하고, 해당하는 스킬이 있으면 그 스킬의 절차를 따라 수행한다. 스킬을 쓰지 않고 자체 판단으로 진행하는 것은 해당 스킬이 없는 경우에만 허용한다. 작업 시작 시 어떤 스킬을 적용하는지 한 줄로 밝힌다.

진단·제안 작업은 다음 순서로 스킬을 쓴다.
1. `geo-audit-framework` — 전체 절차(질문 설계 → 다중 엔진 질의 → 매트릭스 → 인용 분류 → 기술 진단 → 재해석 → 한계)
2. `ai-engine-citation-logic` — 엔진별 원인·처방을 분리해서 쓸 때. `naver-aeo-geo` — 국내 대상일 때
3. 기술 감사 실행: `seo-technical`, `seo-schema`, `seo-sitemap`, `seo-hreflang`, `seo-geo`, `seo-geo-aeo`
4. 콘텐츠·외부 채널: `geo-content-optimization`, `geo-offsite-strategy`, `ai-seo`, `seo-content`
5. 개선 전후 재측정: `seo-drift`

claude-seo 계열 스킬(`seo-*`)의 번들 Python 스크립트는 반드시 런처로 실행한다:
`"C:/Users/NMG/Desktop/Claude-k2s/ctch/.claude/skills/seo/scripts/claude-seo" run <script.py> [args]` (Bash 도구). 준비 상태는 같은 런처의 `doctor`로 확인한다. 유료 API 확장(Ahrefs·Firecrawl·Profound·SE Ranking·DataForSEO·Banana)은 설치하지 않았다.

## 작업 규칙
- 판단은 응답 원문·인용 URL에서만 도출한다. 추측성 해석은 "가설"로 표기한다.
- 엔진별로 결과와 처방을 분리한다. 네이버는 글로벌 엔진과 합산하지 않는다.
- 브랜드명 매칭 집계의 누락(제품명 단독 등장)과 환각 제품명을 원문 대조로 보정한다.
- 보고서에는 한계 섹션(단일 회차·표본·측정 범위·도구 한계)을 반드시 넣는다.
- 엑셀은 Python openpyxl로 다루고, 콘솔 출력은 `PYTHONIOENCODING=utf-8`로 실행한다.
- 산출물(보고서·엑셀·노트)은 프로젝트 폴더 아래에 저장한다. 임시 파일은 스크래치패드에 둔다.
