---
name: ai-engine-citation-logic
description: AI 검색 엔진별 검색·인용(citation) 로직 레퍼런스. ChatGPT(OpenAI search), Gemini·Google AI Overviews·AI Mode, Claude(Brave 기반), Perplexity, Microsoft Copilot(Bing)이 어떤 인덱스로 검색하고, 어떤 크롤러 UA를 쓰며, 어떤 출처 유형을 선호하고, 어떤 형식으로 인용하는지를 정리. "왜 이 엔진에서 우리가 안 나오나", "ChatGPT/Gemini/Claude/Perplexity 인용 기준", "AI 크롤러 robots.txt", "엔진별 GEO 전략", "인용 출처 분석" 요청 시 사용. 네이버는 naver-aeo-geo 스킬 참조.
---

# AI 엔진별 검색·인용 로직

이 스킬은 "엔진마다 보는 데이터가 다르다"는 전제에서 시작한다. 하나의 조치로 전 엔진이 개선되지 않는다. 진단·제안 시 반드시 **엔진별로 분리**해 원인과 처방을 쓴다.

## 0. 공통 작업 순서

1. 대상 사이트의 robots.txt·WAF/CDN(Cloudflare 등)에서 아래 UA 표의 **검색용 UA**가 허용되는지 확인한다. 학습용 UA 차단은 인용과 무관하다.
2. 페이지가 JS 없이 HTML만으로 본문·JSON-LD를 노출하는지(SSR) 확인한다. 검색용 크롤러 대부분은 JS를 실행하지 않는다고 가정한다.
3. 엔진별 질의 결과에서 **인용 URL의 도메인 유형**(자사/커머스/리뷰 플랫폼/블로그/영상/커뮤니티/미디어/학술)을 분류한다. 이것이 엔진이 "무엇을 근거로 보는가"의 실측이다.
4. 엔진별로 "우리 페이지가 후보군에 들지 못한 이유"를 아래 3층으로 나눠 판정한다.
   - **접근층**: 크롤러 차단, SSR 미적용, 인덱스 미등재
   - **후보층**: 해당 엔진의 검색 백엔드(Bing/Google/Brave/자체 인덱스)에서 상위에 없음, 외부 채널에 언급 없음
   - **추출층**: 페이지에 인용 가능한 단락(정의문·수치·FAQ)이 없음, 브랜드명과 제품명이 결합되어 있지 않음

## 1. 크롤러 User-Agent 표 (허용/차단 판단용)

| 회사 | UA | 용도 | 인용 영향 |
|---|---|---|---|
| OpenAI | **OAI-SearchBot** | ChatGPT 검색 인덱싱 | **핵심**. 차단 시 인용 불가 |
| OpenAI | ChatGPT-User | 사용자 질의 시 실시간 페이지 fetch | 높음 |
| OpenAI | GPTBot | 모델 학습 수집 | 인용과 무관(정책 선택) |
| Anthropic | **Claude-SearchBot** | Claude 검색 품질 인덱싱 | 높음 |
| Anthropic | Claude-User | 사용자 요청 시 실시간 fetch | 높음 |
| Anthropic | ClaudeBot | 학습 수집 | 인용과 무관 |
| Google | **Googlebot** | 검색 인덱스 = AI Overviews·AI Mode·Gemini grounding의 원천 | **핵심** |
| Google | Google-Extended | Gemini 학습·grounding 옵트아웃 토큰 | AI Overviews에는 영향 없음. 차단해도 AIO에서 빠지지 않음 |
| Perplexity | **PerplexityBot** | 자체 인덱스 구축 | **핵심** |
| Perplexity | Perplexity-User | 실시간 fetch | 높음 |
| Microsoft | bingbot | Bing 인덱스 = Copilot 원천 (ChatGPT에는 과거 대비 영향 축소) | 높음(Copilot) |
| Brave | Brave 인덱스(자체 크롤러) | Claude 검색 백엔드 | 높음(Claude) |
| Common Crawl | CCBot | 다수 모델 학습 데이터 | 인용과 무관 |

AI Overviews에서 **실제로 빠지는 방법**은 Google-Extended가 아니라 `nosnippet`, `data-nosnippet`, `max-snippet:0`이다. 반대로 인용되길 원하면 이 지시자가 없는지 확인한다.

## 2. 엔진별 로직

### 2-1. ChatGPT (OpenAI search)
- **검색 원천**: 하이브리드. 라이선스 SERP 데이터 + OAI-SearchBot 자체 인덱스 + 강한 자체 리랭킹. 2026년 기준 Bing 상위 결과와의 일치율은 크게 낮아졌고(약 26%→8%), Google 상위와의 일치율은 올랐다(약 12%→33%). 다만 인용 URL 중 Google 상위 10위 안에 있는 비율은 약 10%에 그친다. **검색 순위가 인용의 전제조건이 아니다.**
- **선호 출처**: Wikipedia(약 13%), Reddit(약 12%)이 상위. 상위 10개 도메인이 전체 인용의 약 12%만 차지하고 88%는 롱테일. 구매 관련 질문에서는 리뷰 사이트·에디토리얼·커머스 데이터가 강함.
- **쇼핑 질의 처리**: 제품명·별점·리뷰수·가격·판매처를 **정형 카드**로 제시한다. 가격·재고·식별자(sku·gtin)가 정리된 커머스 DB 성격 소스를 우선한다. 공식 채널은 **OpenAI 상품 피드 제출**(Product feed spec). 서술형 콘텐츠만 있는 브랜드 사이트는 이 형식의 후보에서 밀린다.
- **인용 형식**: 인라인 링크. 대화 첫 턴에서 인용이 후속 턴보다 약 2.5배 많다. 대화당 고유 출처 약 6개.
- **변동성**: 매우 높음(Reddit 비중이 2주 만에 60%→10%로 변한 사례). 월 단위 재측정 필수.
- **자동 측정 주의**: API 기반 자동 측정에서 유효 응답이 안 나오는 경우가 있다. 수동 세션 초기화 질의로 대조한다.
- **처방 우선순위**: OAI-SearchBot 허용·CDN 차단 해제 → SSR → 통계·인용구 등 추출 가능한 사실 단락(통계 +31%, 인용구 +41% 가시성 보고) → 커머스 데이터 정합성(가격·리뷰·재고·식별자) → 상품 피드 → Reddit·Wikipedia·리뷰 플랫폼 존재감. llms.txt·스키마는 OpenAI가 공식 약속한 바 없음(보조 수단으로만).

### 2-2. Gemini · Google AI Overviews · AI Mode
- **검색 원천**: Google 검색 인덱스 + Knowledge Graph. RAG 구조. **Query fan-out**: 질문을 여러 하위 질의로 분해해 각각 검색하고, 하위 질의별로 가장 잘 답하는 **단락(passage)**을 골라 조립한다. 따라서 원 질의에서 2페이지에 있어도 하위 질의를 깔끔히 답하는 페이지는 인용될 수 있다.
- **Gemini vs AIO 차이**: Gemini는 거의 모든 질의에 답하고 인용 밀도가 높고 최신성 가중이 조금 더 크다. AIO는 선택적으로 트리거되고 요약이 짧다. 두 표면을 **분리 측정**하면 병목이 검색측(순위·후보)인지 추출측(콘텐츠 적합도)인지 진단할 수 있다.
- **선호 신호**: 엔티티 인식(Knowledge Panel, Wikipedia/Wikidata, Organization·sameAs), E-E-A-T(저자·자격·About·원본 데이터), 첫 100~200자 직접 답변, Article·FAQ·HowTo·Product 스키마, Core Web Vitals, 날짜 표기.
- **관찰된 행동(실측 사례)**: 상세페이지의 JSON-LD 전용 문구(화면 미표시)를 그대로 인용하고 출처 목록에 자사 도메인을 표기한다. 정보는 정확하나 순위는 2~3위에 머무는 경향. 유튜브·뷰티 리뷰 플랫폼·커머스 상세를 함께 인용.
- **인용 형식**: Gemini 앱은 출처 목록(6~10개), AIO는 링크 카드·인라인. API에서는 groundingChunks·groundingSupports로 단락↔출처 매핑 제공.
- **처방 우선순위**: Googlebot 접근·nosnippet 점검 → 하위 질의 단위로 답하는 단락 구조(질문형 H2 + 2~3문장 답) → 엔티티 정합(Organization·sameAs·Knowledge Panel) → 스키마 완결성(Product는 offers·aggregateRating·sku·gtin) → 저자·날짜·근거 표기. 단일 페이지 인용은 수주, 포트폴리오 수준은 3~6개월.

### 2-3. Claude (Anthropic)
- **검색 원천**: **Brave Search** 인덱스. Claude 인용 결과와 Brave 상위 비광고 결과 간 일치율 약 87%. 즉 Claude 인용은 Brave 순위를 거의 그대로 반영한다. ChatGPT 인용과의 겹침은 약 20%에 불과.
- **검색 트리거**: 최신 정보가 필요하다고 판단할 때만 검색. 검색 없이 학습 지식으로 답하는 경우 **실재 여부가 불확실한 제품명**이 섞일 수 있다(실측에서 확인됨). 이 경우 인용 URL을 산출하지 않는다.
- **선호 출처**: Brave 인덱스 상위의 정통 SEO 강한 페이지. 해외 인지도 있는 브랜드 편향 관찰됨.
- **UA**: Claude-SearchBot·Claude-User 허용이 핵심. ClaudeBot 차단은 인용과 무관.
- **처방 우선순위**: Brave에서의 순위(전통 SEO) → 직접 답변 구조 → FAQ·Article·HowTo 스키마 → llms.txt → 크롤러 허용. 자동 측정 시 "검색을 실제로 수행했는지"를 응답에서 확인하고 분리 집계한다.

### 2-4. Perplexity
- **검색 원천**: PerplexityBot 기반 **자체 인덱스** + 실시간 retrieval. 질문을 하위 질의로 재작성·분해(Pro Search). 매 질의마다 소스 선택이 새로 일어나 가시성이 정적이지 않다.
- **랭킹 신호**: 관련성(의도 일치) · 최신성(날짜) · 권위(뉴스·공식 문서·Wikipedia·의견형은 Reddit) · 명료성(헤딩·초반 답변).
- **선호 출처**: Reddit 단일 도메인이 전체 인용의 20~24%(엔진 중 최고 집중). 소셜 계열이 약 31%. 한국어 질의에서는 **네이버 블로그·티스토리·유튜브·화해·글로우픽** 등이 대부분을 차지하고 질문당 약 20개 출처를 산출한다.
- **관찰된 행동(실측 사례)**: 상세페이지 고유 문구(독자 성분명 등)를 정확히 옮겨 쓰지만 출처는 그 문구를 옮겨 적은 블로그로 표기한다. **1순위 배치는 이 경로에서 가장 자주 발생**한다. 즉 자사 문장을 "옮겨 적히게" 하는 것이 Perplexity 전략의 핵심이다. 브랜드명 없이 제품명만 쓰는 경우가 있어 브랜드 매칭 집계에서 누락된다.
- **처방 우선순위**: PerplexityBot 허용 → 외부 채널(블로그·유튜브·리뷰 플랫폼·Reddit/커뮤니티)이 인용할 만한 **고유 문장·수치** 심기 → 날짜 갱신 → 좁은 주제의 전문성 누적 → 제품명에 브랜드명 결합.

### 2-5. Microsoft Copilot (참고)
- Bing 인덱스 기반. Bing Webmaster Tools 등록·IndexNow 제출이 직접 영향. ChatGPT에 대한 Bing의 영향은 축소되었으나 Copilot에는 여전히 원천.

## 3. 엔진 × 자산 매트릭스 (제안서용 요약)

| 엔진 | 후보군 결정 요인 | 자사 사이트가 준비할 것 | 외부에서 준비할 것 |
|---|---|---|---|
| ChatGPT | 커머스 데이터 정합성, Reddit·Wikipedia·리뷰 | 가격·재고·식별자·리뷰 스키마 정합, 상품 피드 | 리뷰 플랫폼·커뮤니티 언급 |
| Gemini/AIO | Google 순위 + 단락 적합도 + 엔티티 | 하위 질의별 답변 단락, 스키마 완결, sameAs | Knowledge Panel, Wikipedia/Wikidata |
| Claude | Brave 순위 | 전통 SEO, 직접 답변 구조 | 해외 인지도·백링크 |
| Perplexity | 외부 채널의 최신 언급 | 옮겨 적히기 좋은 고유 문장·수치 | 블로그·유튜브·리뷰 플랫폼·커뮤니티 |

## 4. 집계 시 반드시 표기할 한계

- 인용 URL을 산출하는 엔진은 Perplexity·Gemini(및 검색 수행 시 Claude)이고, ChatGPT·Claude는 미산출인 경우가 많다. 인용 지표는 산출 엔진 기준으로만 해석한다.
- 언급 집계는 브랜드명 매칭 기준일 때 제품명 단독 등장을 놓친다. 원문 대조로 보정한다.
- 단일 회차 수치는 성과 지표로 쓰지 않는다(2시간 간격 재측정에서 7.5%p 변동 사례). 추세로 판정한다.
- 자동 측정은 특정 엔진 미수집·URL 병합 수집을 오류 없이 정상 수치로 기록할 수 있다. 원문·원본 대조 검증을 거친다.

## 5. 관련 스킬
- 네이버: `naver-aeo-geo`
- 진단 절차 전체: `geo-audit-framework`
- 콘텐츠 인용 적합도: `geo-content-optimization`, `seo-geo`, `ai-seo`
- 외부 채널 전략: `geo-offsite-strategy`
- 스키마: `seo-schema`, `schema`, `seo-ecommerce`
