// 서버 전용 — AI 진단(Claude) 실행 로직. route는 인증·입력 검증만 하고 여기로 위임한다.
// 전체 스키마가 API 문법 크기 제한에 걸리므로 core / content / geo 세 부분으로 나눠 병렬 호출해 합친다.

import Anthropic from "@anthropic-ai/sdk";
import { JOURNEY_STAGES, type AuditResult, type BusinessBrief, type SeoDiagnosis } from "./types";
import { PART_KEYS, schemaSubset, type PartName } from "./diagnosisSchema";

// 진단 프레임(geo-audit-framework) · 엔진별 인용 로직(ai-engine-citation-logic) · 네이버(naver-aeo-geo) 스킬의 요약과
// AEO 콘텐츠 구조화 · GEO Citable Snippet/Two Paths/엔티티 · SOV 실측 가이드 · 업종별 JSON-LD 생성 지시.
// 스킬 내용을 바꾸면 이 프롬프트도 같이 맞춘다.
const SYSTEM = `당신은 SEO 기반 AEO(Answer Engine Optimization)·GEO(Generative Engine Optimization) 진단 컨설턴트입니다.
입력은 (1) 대상 페이지를 AI 크롤러 시점(JS 미실행)으로 읽어 만든 기술 진단 데이터(JSON)와 (2) 사용자가 입력한 브랜드 정보(없을 수 있음)입니다.
진단 데이터에서 확인된 것만 근거로 판단하고, 확인 불가한 것은 추측하지 말고 caveats에 적으세요. 브랜드 정보가 비어 있으면 페이지의 title·h1·스키마·본문에서 추정하고 그 사실을 caveats에 적으세요.

## 판단 원칙
- "읽기 가능"과 "후보군 진입"은 다른 문제입니다. 크롤러가 읽을 수 있어도 비브랜드 질문의 후보군에 들지 못하면 소비자에게 존재하지 않습니다. 소비자는 두 번째 질문("○○ 브랜드 제품은?")을 하지 않습니다.
- 엔진마다 보는 데이터가 다르므로 원인과 처방을 엔진별로 분리합니다. 하나의 조치로 전 엔진이 개선되지 않습니다.
- 검색용 UA(OAI-SearchBot·Googlebot·Claude-SearchBot·PerplexityBot·bingbot·Yeti) 판정과 학습용 UA(GPTBot·ClaudeBot·Google-Extended·CCBot) 판정을 절대 합치지 않습니다. Google-Extended 차단은 AI Overviews에 영향이 없고, nosnippet/max-snippet:0 이 실제 제어 수단입니다.
- llms.txt는 Google이 공식적으로 무시한다고 밝혔습니다. 인용 순위 근거로 쓰지 않습니다.
- 수치·데이터를 만들어내지 않습니다. 진단 데이터나 브랜드 정보에 있는 수치만 쓰고, 없는 자리는 [확인 필요: …] 형태의 플레이스홀더로 남깁니다.

## 엔진별 인용 로직 (2026 기준)
- ChatGPT: 라이선스 SERP + OAI-SearchBot 자체 인덱스 + 강한 리랭킹. 인용 URL 중 Google 상위 10위 안은 약 10%에 그쳐 순위가 전제조건이 아님. Wikipedia·Reddit이 인용 상위, 88%는 롱테일. 쇼핑 질의는 제품명·별점·리뷰수·가격·판매처를 정형 카드로 제시하며 가격·재고·식별자(sku·gtin)가 정리된 커머스 데이터를 우선. 공식 채널은 OpenAI 상품 피드. 서술형만 있는 브랜드 사이트는 이 형식에서 밀림. 변동성 매우 높음.
- Gemini / Google AI Overviews / AI Mode: Google 인덱스 + Knowledge Graph. query fan-out으로 질문을 하위 질의로 분해해 하위 질의별 최적 단락을 조립. 2페이지 페이지도 하위 질의를 깔끔히 답하면 인용됨. 엔티티 인식(Organization·sameAs·Knowledge Panel), 첫 100~200자 직접 답변, 스키마 완결성, 날짜. 관찰: JSON-LD 전용 문구를 정확히 인용하되 순위는 2~3위에 머무는 경향.
- Claude: Brave Search 인덱스(인용 결과와 Brave 상위 일치율 약 87%). 전통 SEO 순위가 곧 인용. 검색 없이 답할 때 실재 불확실한 제품명이 섞일 수 있음.
- Perplexity: PerplexityBot 자체 인덱스 + 실시간 retrieval, 하위 질의 분해. 관련성·최신성·권위·명료성. 한국어 질의에서는 네이버 블로그·티스토리·유튜브·화해·글로우픽이 대부분을 차지하고 질문당 약 20개 출처. 관찰: 상세페이지 고유 문구를 정확히 옮겨 쓰되 출처는 그 문구를 옮겨 적은 블로그로 표기하고, 1순위 배치는 이 경로에서 가장 자주 발생. 즉 자사 문장을 "옮겨 적히게" 하는 것이 핵심.
- 네이버 AI 브리핑 / AI 탭: 네이버 색인 우선, 인용 단위는 단락. 3축 = C-Rank(채널 주제 일관성) · D.I.A.+(문서 의도 부합) · 스마트블록 대응. 출처의 최대 약 70%가 UGC(블로그·카페·지식iN). Yeti 허용·서치어드바이저 등록 필수. 첫 문단 정의문("X는 Y입니다"), 질문형 소제목 아래 2~3문장 답, FAQ 스키마, 출처·날짜 명시.

## 두 도달 경로
- Path A 직접 인용(주로 Gemini): 정보 정확, 순위 2~3위.
- Path B 외부 경유(주로 Perplexity·네이버): 블로그·리뷰 플랫폼·커뮤니티가 옮겨 적은 표현을 읽음. 1순위는 대부분 여기서 발생. 자사 도메인 인용 0건이어도 답변은 자사 문구.
→ 관건은 "어떤 문장을 심을 것인가, 그 문장이 옮겨 적히게 할 것인가".

## 두 사이트 역할 분리
브랜드 사이트(설명의 원천, 판매 안 함)와 커머스몰(구매 도착지)은 AI가 이미 다르게 씁니다. 판매하지 않는 사이트에 가격·재고 신호를 넣으면 커머스몰과 충돌합니다. 성과 기준도 분리: 브랜드 사이트 = "AI가 정확히 설명하는가", 커머스몰 = "추천 목록·구매 경로에 오르는가".

## 질문 설계 규칙 (questions — 비브랜드 질의 10선)
- 브랜드명·제품 고유명을 넣지 않습니다. 사용자가 Perplexity·ChatGPT·네이버에 실제로 입력할 법한 자연어 문장으로 씁니다.
- 여정 4단계(정보 탐색 / 대안 비교 / 솔루션 탐색 / 구매 결정)에 각 2~3개씩 분산합니다. 정보 탐색(지식·정의·원리) 질문을 반드시 2개 이상 포함합니다. 상품 페이지에서만 뽑으면 비교 의도로 편중되어 사이트가 가장 약한 영역만 측정하게 됩니다.
- 범용형(카테고리 일반 추천) 5개 + 검증형(페이지 고유 수치·성분·효능·인증 조건) 5개. basis에는 페이지의 어떤 문구·스키마·속성에서 뽑았는지 원문을 적습니다.

## 모듈 1. AEO 콘텐츠 구조화 (aeo)
- items: questions 10개와 1:1(no 동일). 각 항목에 (a) AI가 최상단 답변으로 추출하기 좋은 질문형 H2 제목, (b) 첫 100~200자 자기완결 직접 답변 단락(directAnswer)을 씁니다. directAnswer는 "X는 Y입니다/의미합니다" 정의문으로 시작하고, 확인된 수치·성분·근거를 넣되 없는 수치는 만들지 않습니다. 브랜드명은 필요할 때만 한 번 넣습니다. 180~700자 확장 단락의 첫 부분으로 그대로 쓸 수 있어야 합니다.
- faq: 페이지 하단에 즉시 삽입 가능한 Q&A 5~7개(질문은 자연어, 답변은 2~3문장, 각 답변이 독립적으로 완결).
- summaryTable: 비교/요약 표 1개(title, columns 3~5개, rows 3~6개). 페이지 데이터에서 확인 가능한 속성으로 구성하고, 경쟁 제품 값은 모르면 [확인 필요]로 둡니다.

## 모듈 2. GEO 전략 (geo)
- snippets: AI가 신뢰성 높은 수치·데이터로 인용할 만한 고유 문장(Unique Citable Snippet) 5개. 형식 예: "[브랜드]의 [제품]은 [기준] 대비 [N%] [효과]…(출처/임상 조건)". 진단 데이터·브랜드 정보에 있는 수치만 쓰고, 없으면 [확인 필요: 수치]로 표기해 채울 자리를 남깁니다. basis에 근거를, placement에 심을 위치(페이지 첫 단락·FAQ·스키마 description·보도자료 등)를, targetEngines에 어느 엔진 경로를 노리는지 적습니다.
- twoPaths.pathA: 자사 페이지·아티클에 직접 인용 단락을 심는 실행안 4~6개(어느 페이지의 어느 위치에 어떤 문장을, 어떤 스키마 속성과 함께).
- twoPaths.pathB: 그 문장이 외부 블로그·뉴스·커뮤니티·리뷰 채널·네이버 생태계로 확산되게 하는 우회 인용 실행안 4~6개(채널·형식·반복 발행 주기·브랜드명+제품명 결합 표기 유도).
- entityMap: 지식 그래프에서 브랜드가 핵심 키워드/카테고리와 강하게 연동되도록 하는 키워드 매핑 표 5~8행(entity, category, coreKeywords, supportKeywords, sameAs 후보, schemaHint). 경쟁사가 주어졌으면 경쟁사가 점유한 키워드와 겹치지 않는 차별 축을 포함합니다.

## 모듈 3. SOV 실측 가이드 (sov)
- prompts: questions 10개를 5대 엔진(ChatGPT·Gemini·Perplexity·Claude·네이버 AI 브리핑)에 동일 조건(세션 초기화·로그아웃·대화 이력 없음)으로 입력할 프롬프트 문장으로 정리합니다. prompt는 그대로 붙여 넣을 수 있는 한 문장, note에는 엔진별 주의(네이버는 통합검색창 입력·AI 브리핑 트리거 여부 기록, ChatGPT는 쇼핑 카드 여부, Perplexity는 출처 20개 전수 기록 등)를 씁니다.
- decisionTree: 노출 미흡 원인을 가르는 의사결정 트리 5~7단계. 순서: ① 검색용 크롤러·색인 차단 → ② SSR/본문 노출 → ③ 전통 SEO 기본(title·h1·h2·description) → ④ 구조화 데이터·정합성 → ⑤ 인용 적합도(정의문·질문형 헤딩·단락·수치·날짜) → ⑥ 엔티티·외부 채널(Path B) → ⑦ 브랜드명·제품명 결합 표기. 각 단계에 이 페이지의 현재 판정(verdictForThisPage)을 진단 데이터로 적고, 미충족 시 조치(ifFail)와 충족 시 다음 단계(ifPass)를 씁니다.

## 모듈 4. 업종별 JSON-LD (schemaProposal)
- industry를 페이지 내용으로 판정합니다: 커머스(Product) / B2B SaaS(SoftwareApplication) / 기업 사이트(Organization) / 아티클(Article) / 병원·로컬(MedicalBusiness·LocalBusiness) / 서비스(Service). reason에 근거를 씁니다.
- jsonLd: 페이지에 즉시 삽입할 수 있는 완전한 <script type="application/ld+json"> 블록 1개. @graph에 WebPage + 업종 핵심 타입 + Organization(sameAs 포함) + FAQPage(모듈 1의 faq 사용) + BreadcrumbList를 @id로 상호 참조하게 구성합니다. 기존 JSON-LD(원본)가 있으면 그것을 보존·보완하되 누락 필드(offers.availability·priceValidUntil·seller·sku·gtin13, aggregateRating, review.author·reviewRating, dateModified, author 등)를 채웁니다. 모르는 값은 "[확인 필요: 값]" 문자열로 둡니다. HowTo는 리치결과 지원이 종료되었으니 새로 추가하지 않습니다. 판매하지 않는 브랜드 사이트라면 가격·재고 필드를 넣지 말고 notes에 커머스몰로 위임할 것을 적습니다.
- notes: 채워야 할 플레이스홀더 목록, 화면에도 표시해야 하는 값, 검증 방법(Rich Results Test·Schema Validator).

## 재해석
측정 결과만 보면 "제품 경쟁력 부족"으로 오독될 수 있습니다. 이 페이지/사이트의 실제 자산(연구·전문가 콘텐츠·인증·데이터)이 무엇인지, 그 자산이 답할 수 있는 질문 영역이 무엇인지, 다음 실험 대상이 무엇인지 적습니다.

## 출력
지정된 JSON 스키마로만 출력합니다. 한국어로 작성합니다. engines 배열은 반드시 "ChatGPT", "Gemini · AI Overviews", "Claude", "Perplexity", "네이버 AI 브리핑" 5개를 이 순서로 포함합니다. priorities는 5~7개, 영향이 큰 순서. offsite는 3~5개. caveats에는 단일 페이지·단일 시점 진단의 한계, 실측(엔진 질의) 미수행, 사이트 단위 항목 미판정, 판매 채널 가격 대조 미수행, 브랜드 정보 추정 여부, 플레이스홀더로 남긴 수치가 있다는 점을 포함합니다.`;

// 프롬프트에 넣을 진단 데이터 — 화면용 원본에서 판단에 필요한 것만 추려 토큰을 아낀다
export function buildPayload(a: AuditResult, brief: BusinessBrief | null) {
  return {
    브랜드정보_사용자입력: brief && Object.values(brief).some((v) => v && v.trim()) ? brief : "없음 — 페이지에서 추정하고 caveats에 표기",
    url: a.finalUrl,
    페이지: {
      title: a.page.title,
      description: a.page.metaDescription,
      lang: a.page.lang,
      contentLanguage: a.page.contentLanguage,
      canonical: a.page.canonical,
      robots지시자: [a.page.metaRobots, a.page.xRobotsTag].filter(Boolean).join(" · ") || null,
      noindex: a.page.noindex,
      snippet차단: a.page.snippetBlocked,
      h1: a.page.h1,
      h2: a.page.h2,
      본문글자수_JS미실행: a.page.textChars,
      CSR추정: a.page.likelyCsr,
      리스트: a.page.listCount,
      표: a.page.tableCount,
      영상: a.page.videoCount,
      이미지alt누락: `${a.page.imgAltMissing}/${a.page.imgCount}`,
      hreflang: a.page.hreflangCount,
      네이버인증메타: a.page.hasNaverVerification,
    },
    인용적합도: a.citability,
    스키마: {
      블록: a.schema.blocks,
      파싱오류: a.schema.parseErrors,
      타입: a.schema.types,
      노드: a.schema.nodes,
      Product: a.schema.products,
      FAQ문항: a.schema.faqQuestions,
      지원종료타입: a.schema.deprecated,
      Organization_sameAs: a.schema.organizationSameAs,
      화면미표시값: a.schema.hiddenValues,
      원본JSONLD_앞부분: a.schema.rawJsonLd || null,
    },
    크롤러: a.robots.crawlers.map((c) => ({ ua: c.ua, 역할: c.role, 상태: c.status, 그룹: c.matchedGroup, 결정하는것: c.governs })),
    robots_txt존재: a.robots.found,
    AI파일: a.files,
    진단항목: a.findings.map((f) => ({ id: f.id, 상태: f.status, 우선순위: f.severity ?? null, 영역: f.area, 제목: f.title, 상세: f.detail, 엔진: f.engines })),
    요약: a.summary,
  };
}

// 정규화용 허용값 — 스키마 enum 대신 코드에서 맞춘다 (스키마 문법 크기 제한 회피)
const READINESS = ["양호", "보통", "미흡"] as const;
const SEVERITY = ["HIGH", "MID", "LOW"] as const;
function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(v ?? "").trim();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}
function pickStage(v: unknown): SeoDiagnosis["questions"][number]["intent"] {
  const s = String(v ?? "").trim();
  if ((JOURNEY_STAGES as readonly string[]).includes(s)) return s as SeoDiagnosis["questions"][number]["intent"];
  if (/정보|지식|탐색/.test(s)) return "정보 탐색";
  if (/비교|대안/.test(s)) return "대안 비교";
  if (/구매|결정|직전/.test(s)) return "구매 결정";
  return "솔루션 탐색";
}

const PART_INSTRUCTION: Record<PartName, string> = {
  core: "이번 호출에서는 summary · siteRole · engines · offsite · priorities · reinterpretation · caveats 만 작성합니다(핵심 진단). 다른 모듈은 별도 호출에서 만듭니다.",
  content: "이번 호출에서는 questions(비브랜드 질의 10선) · aeo(모듈 1) · sov(모듈 3) 만 작성합니다. aeo.items와 sov.prompts는 questions와 1:1(no 동일)로 맞춥니다.",
  geo: "이번 호출에서는 geo(모듈 2: snippets · twoPaths · entityMap) · schemaProposal(모듈 4) 만 작성합니다. FAQPage 문항은 페이지의 FAQ 원문을 기준으로 5~7개를 직접 구성합니다.",
};

function parseJson<T>(text: string): T {
  const t = text.trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1)) as T;
    throw new Error("AI 응답을 해석하지 못했어요.");
  }
}

// 부분 호출 — 스키마로 형식을 고정하고, 문법 크기 거절 시 스키마 없이 재시도
// API 오류를 담당자가 바로 조치할 수 있는 한국어 메시지로 바꾼다
export function describeApiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/credit balance/i.test(raw)) return "Anthropic API 크레딧이 부족해요. console.anthropic.com → Plans & Billing에서 충전한 뒤 다시 실행해 주세요.";
  if (/grammar/i.test(raw)) return "출력 스키마가 너무 커서 API가 거절했어요. 스키마 분할 설정(PART_KEYS)을 확인해 주세요.";
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 유효하지 않아요. 서버 환경변수를 확인해 주세요.";
  if (e instanceof Anthropic.RateLimitError) return "API 요청 한도에 걸렸어요. 1분 뒤 다시 시도해 주세요.";
  if (e instanceof Anthropic.APIConnectionError) return "Anthropic API에 연결하지 못했어요. 네트워크를 확인해 주세요.";
  if (e instanceof Anthropic.APIError) return `Anthropic API 오류(${e.status ?? "?"}): ${raw.replace(/^\d+\s*/, "").slice(0, 200)}`;
  return raw || "AI 진단 중 오류가 발생했어요.";
}

async function callPart(anthropic: Anthropic, part: PartName, userContent: string): Promise<Partial<SeoDiagnosis>> {
  const schema = schemaSubset(part);
  const request = (withSchema: boolean) =>
    anthropic.messages
      .stream({
        model: "claude-sonnet-5-5",
        max_tokens: part === "core" ? 16000 : 32000,
        thinking: { type: "adaptive" },
        output_config: withSchema ? { effort: "high", format: { type: "json_schema", schema } } : { effort: "high" },
        system: `${SYSTEM}\n\n## 이번 호출 범위\n${PART_INSTRUCTION[part]}${withSchema ? "" : `\n\n## JSON 형식\n반드시 아래 스키마를 만족하는 JSON 객체 하나만 출력합니다. 코드펜스·설명 문장 금지.\n${JSON.stringify(schema)}`}`,
        messages: [{ role: "user", content: userContent }],
      })
      .finalMessage();

  let msg: Awaited<ReturnType<typeof request>>;
  try {
    msg = await request(true);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(text)) msg = await request(false);
    else throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("모델이 이 요청에 대한 응답을 거절했어요. URL과 콘텐츠를 확인해 주세요.");
  if (msg.stop_reason === "max_tokens") throw new Error(`응답이 길어 잘렸어요(${part}). 다시 시도해 주세요.`);
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseJson<Partial<SeoDiagnosis>>(text);
}

export async function diagnose(payload: unknown): Promise<SeoDiagnosis> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const userContent = `다음은 대상 페이지의 기술 진단 데이터와 브랜드 정보입니다.\n\n${JSON.stringify(payload, null, 1)}`;
  // 세 부분을 병렬로 호출해 합친다 (전체 스키마는 API 문법 크기 제한에 걸림)
  const parts = Object.keys(PART_KEYS) as PartName[];
  const results = await Promise.all(parts.map((p) => callPart(anthropic, p, userContent)));
  const parsed: Partial<SeoDiagnosis> = Object.assign({}, ...results);

  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const strs = (v: unknown): string[] => arr<unknown>(v).map((x) => String(x));
  return {
    summary: parsed.summary ?? "",
    siteRole: parsed.siteRole ?? "",
    engines: arr<SeoDiagnosis["engines"][number]>(parsed.engines).map((e) => ({ engine: String(e.engine ?? ""), readiness: pick(e.readiness, READINESS, "보통"), evidence: String(e.evidence ?? ""), blockers: strs(e.blockers), actions: strs(e.actions) })),
    questions: arr<SeoDiagnosis["questions"][number]>(parsed.questions).map((q, i) => ({ no: Number(q.no ?? i + 1), question: String(q.question ?? ""), type: pick(q.type, ["범용형", "검증형"] as const, "범용형"), intent: pickStage(q.intent), basis: String(q.basis ?? "") })),
    offsite: strs(parsed.offsite),
    priorities: arr<SeoDiagnosis["priorities"][number]>(parsed.priorities).map((p, i) => ({ rank: Number(p.rank ?? i + 1), action: String(p.action ?? ""), why: String(p.why ?? ""), engines: strs(p.engines), severity: pick(p.severity, SEVERITY, "MID") })),
    reinterpretation: parsed.reinterpretation ?? "",
    caveats: strs(parsed.caveats),
    aeo: {
      items: arr<SeoDiagnosis["aeo"]["items"][number]>(parsed.aeo?.items).map((it, i) => ({ no: Number(it.no ?? i + 1), stage: pickStage(it.stage), question: String(it.question ?? ""), h2: String(it.h2 ?? ""), directAnswer: String(it.directAnswer ?? "") })),
      faq: arr<SeoDiagnosis["aeo"]["faq"][number]>(parsed.aeo?.faq).map((f) => ({ question: String(f.question ?? ""), answer: String(f.answer ?? "") })),
      summaryTable: parsed.aeo?.summaryTable && Array.isArray(parsed.aeo.summaryTable.columns) ? { title: String(parsed.aeo.summaryTable.title ?? ""), columns: strs(parsed.aeo.summaryTable.columns), rows: arr<unknown>(parsed.aeo.summaryTable.rows).map(strs) } : null,
    },
    geo: {
      snippets: arr<SeoDiagnosis["geo"]["snippets"][number]>(parsed.geo?.snippets).map((s, i) => ({ no: Number(s.no ?? i + 1), snippet: String(s.snippet ?? ""), basis: String(s.basis ?? ""), placement: String(s.placement ?? ""), targetEngines: strs(s.targetEngines) })),
      twoPaths: { pathA: strs(parsed.geo?.twoPaths?.pathA), pathB: strs(parsed.geo?.twoPaths?.pathB) },
      entityMap: arr<SeoDiagnosis["geo"]["entityMap"][number]>(parsed.geo?.entityMap).map((e) => ({ entity: String(e.entity ?? ""), category: String(e.category ?? ""), coreKeywords: strs(e.coreKeywords), supportKeywords: strs(e.supportKeywords), sameAs: strs(e.sameAs), schemaHint: String(e.schemaHint ?? "") })),
    },
    sov: {
      prompts: arr<SeoDiagnosis["sov"]["prompts"][number]>(parsed.sov?.prompts).map((p, i) => ({ no: Number(p.no ?? i + 1), stage: pickStage(p.stage), prompt: String(p.prompt ?? ""), note: String(p.note ?? "") })),
      decisionTree: arr<SeoDiagnosis["sov"]["decisionTree"][number]>(parsed.sov?.decisionTree).map((n, i) => ({ step: Number(n.step ?? i + 1), check: String(n.check ?? ""), verdictForThisPage: String(n.verdictForThisPage ?? ""), ifFail: String(n.ifFail ?? ""), ifPass: String(n.ifPass ?? "") })),
    },
    schemaProposal: parsed.schemaProposal && typeof parsed.schemaProposal.jsonLd === "string" ? { industry: String(parsed.schemaProposal.industry ?? ""), reason: String(parsed.schemaProposal.reason ?? ""), jsonLd: parsed.schemaProposal.jsonLd, notes: strs(parsed.schemaProposal.notes) } : null,
  };
}
