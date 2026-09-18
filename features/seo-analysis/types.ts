// SEO·AEO·GEO 진단 결과 스키마 — 서버 라우트(/api/seo-analysis/*)와 화면이 공유
// 진단 프레임은 .claude/skills/geo-audit-framework, 엔진별 인용 로직은 ai-engine-citation-logic / naver-aeo-geo 스킬을 따른다.

export type Severity = "HIGH" | "MID" | "LOW";

// 처방을 분리해서 쓰는 엔진 단위
export type Engine = "ChatGPT" | "Gemini·AIO" | "Claude" | "Perplexity" | "Copilot" | "네이버";
export const ENGINES: Engine[] = ["ChatGPT", "Gemini·AIO", "Claude", "Perplexity", "Copilot", "네이버"];

export type FindingArea =
  | "크롤러"
  | "렌더링"
  | "스키마"
  | "정합성"
  | "온페이지"
  | "국제화"
  | "AI 파일"
  | "인용 적합도"
  | "등록";

export type Finding = {
  id: string;
  area: FindingArea;
  status: "pass" | "fix" | "info";
  severity?: Severity; // fix 항목만
  title: string;
  detail: string;
  engines: Engine[]; // 이 항목이 직접 영향을 주는 엔진
};

export type CrawlerRole = "search" | "training" | "fetch";

export type CrawlerStatus = {
  ua: string;
  owner: string;
  role: CrawlerRole;
  governs: string; // 이 UA가 결정하는 것 (예: "ChatGPT 검색 인용")
  status: "allowed" | "blocked";
  matchedGroup: string; // robots.txt에서 적용된 그룹 ("*", UA명, "none")
  engines: Engine[];
};

export type SchemaNode = {
  type: string;
  name?: string;
  ok: string[];
  issues: string[];
};

export type ProductCheck = {
  name?: string;
  price?: string;
  priceCurrency?: string;
  ratingValue?: string;
  reviewCount?: string;
  present: string[];
  missing: string[];
};

export type AuditResult = {
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: string;
  ms: number;
  page: {
    title: string | null;
    titleLength: number;
    metaDescription: string | null;
    canonical: string | null;
    canonicalMatches: boolean | null;
    lang: string | null;
    contentLanguage: string | null;
    metaRobots: string | null;
    xRobotsTag: string | null;
    snippetBlocked: boolean;
    noindex: boolean;
    h1: string[];
    h2: string[];
    h3Count: number;
    hreflangCount: number;
    imgCount: number;
    imgAltMissing: number;
    htmlBytes: number;
    textChars: number;
    textWords: number;
    paragraphCount: number;
    listCount: number;
    tableCount: number;
    videoCount: number;
    hasNaverVerification: boolean;
    ogTitle: boolean;
    ogDescription: boolean;
    likelyCsr: boolean;
    csrHints: string[];
  };
  citability: {
    questionHeadings: string[];
    numericSentences: number;
    candidatePassages: number;
    firstParagraph: string | null;
    definitionPattern: boolean;
    dates: string[];
  };
  schema: {
    blocks: number;
    parseErrors: number;
    types: string[];
    nodes: SchemaNode[];
    products: ProductCheck[];
    faqQuestions: string[];
    deprecated: string[];
    organizationSameAs: number | null;
    hiddenValues: string[]; // JSON-LD에는 있으나 화면 텍스트에 없는 값
    rawJsonLd: string; // 원본 JSON-LD (앞 6,000자) — 개선안 생성의 근거
  };
  robots: {
    found: boolean;
    sitemaps: string[];
    crawlers: CrawlerStatus[];
  };
  files: {
    llmsTxt: boolean;
    llmsFullTxt: boolean;
    sitemapXml: boolean;
  };
  findings: Finding[];
  summary: {
    pass: number;
    high: number;
    mid: number;
    low: number;
    searchCrawlersAllowed: number;
    searchCrawlersTotal: number;
  };
};

// ---- AI 진단 (Claude) ----

export type Readiness = "양호" | "보통" | "미흡";

export type EngineReadiness = {
  engine: string;
  readiness: Readiness;
  evidence: string; // 진단 데이터에서 확인된 근거 1~2문장
  blockers: string[]; // 이 엔진에서 후보군 진입을 막는 요인
  actions: string[]; // 이 엔진에 맞는 처방
};

export type QuestionType = "범용형" | "검증형";

// 여정 단계 — 비브랜드 질의 10선을 이 4단계에 분산한다
export type JourneyStage = "정보 탐색" | "대안 비교" | "솔루션 탐색" | "구매 결정";
export const JOURNEY_STAGES: JourneyStage[] = ["정보 탐색", "대안 비교", "솔루션 탐색", "구매 결정"];
export type QuestionIntent = JourneyStage;

export type QuestionCandidate = {
  no: number;
  question: string; // 브랜드명이 들어가지 않은 비브랜드 질문
  type: QuestionType;
  intent: QuestionIntent;
  basis: string; // 페이지의 어떤 문구/스키마에서 뽑았는지
};

export type PriorityAction = {
  rank: number;
  action: string;
  why: string;
  engines: string[];
  severity: Severity;
};

// 사용자가 입력하는 브랜드 정보 — 없으면 페이지에서 추정한다
export type BusinessBrief = {
  brandName?: string;
  industry?: string; // 타깃 업종/카테고리
  products?: string; // 주요 제품/서비스 2~3개
  competitors?: string; // 경쟁사/비교 대상
  strengths?: string; // 핵심 강점/데이터 (수치·특허·수상·누적 실적)
};

// ---- 모듈 1. AEO 콘텐츠 구조화 ----
export type AeoContentItem = {
  no: number; // questions[no]와 1:1
  stage: JourneyStage;
  question: string;
  h2: string; // AI가 추출하기 좋은 질문형 H2 제목
  directAnswer: string; // 첫 100~200자 직접 정의문/답변 단락 (자기완결)
};
export type FaqSnippet = { question: string; answer: string };
export type SummaryTable = { title: string; columns: string[]; rows: string[][] };

// ---- 모듈 2. GEO 전략 ----
export type CitableSnippet = {
  no: number;
  snippet: string; // 고유 수치·데이터가 든 인용용 문장
  basis: string; // 어떤 데이터/문구에서 나왔는지, 확인 필요 여부
  placement: string; // 자사 어디에 심을지 (페이지·위치)
  targetEngines: string[];
};
export type TwoPathsPlan = { pathA: string[]; pathB: string[] };
export type EntityMappingRow = {
  entity: string; // 브랜드/제품/기술명
  category: string; // 연결할 카테고리·핵심 키워드
  coreKeywords: string[];
  supportKeywords: string[];
  sameAs: string[]; // 연결할 외부 엔티티 (Wikipedia·Wikidata·네이버·SNS 등)
  schemaHint: string; // 어떤 스키마 속성으로 표현할지
};

// ---- 모듈 3. SOV 실측 가이드 ----
export type SovPrompt = {
  no: number;
  stage: JourneyStage;
  prompt: string; // 엔진에 그대로 입력할 문장
  note: string; // 엔진별 주의(네이버는 통합검색 입력 등)
};
export type SovChecklistItem = { no: number; item: string; howToRecord: string; example: string };
export type DecisionNode = {
  step: number;
  check: string; // 점검 질문
  verdictForThisPage: string; // 이 페이지의 현재 판정
  ifFail: string; // 미충족 시 조치
  ifPass: string; // 충족 시 다음 단계
};

// ---- 모듈 4. 업종별 JSON-LD ----
export type SchemaProposal = {
  industry: string; // 커머스(Product) / B2B SaaS(SoftwareApplication) / 기업 사이트(Organization) / 아티클(Article) / 병원·로컬(MedicalBusiness·LocalBusiness) / 서비스(Service)
  reason: string;
  jsonLd: string; // <script type="application/ld+json"> … </script> 전체
  notes: string[]; // 채워야 할 플레이스홀더, 주의점
};

export type SeoDiagnosis = {
  summary: string;
  siteRole: string; // 이 페이지/사이트가 AI 답변에서 맡을 역할 (설명의 원천 vs 구매 도착지 등)
  engines: EngineReadiness[];
  questions: QuestionCandidate[];
  offsite: string[]; // 외부 채널(블로그·리뷰 플랫폼·커뮤니티·네이버 생태계) 액션
  priorities: PriorityAction[];
  reinterpretation: string; // 측정 영역이 사이트 자산과 맞는지, 다음 실험 대상
  caveats: string[]; // 이 진단의 한계
  aeo: { items: AeoContentItem[]; faq: FaqSnippet[]; summaryTable: SummaryTable | null };
  geo: { snippets: CitableSnippet[]; twoPaths: TwoPathsPlan; entityMap: EntityMappingRow[] };
  sov: { prompts: SovPrompt[]; decisionTree: DecisionNode[] };
  schemaProposal: SchemaProposal | null;
};

// 실측 기록 표준 체크리스트 — 고정 항목 (프레임 기준)
export const SOV_CHECKLIST: SovChecklistItem[] = [
  { no: 1, item: "언급 여부", howToRecord: "응답 본문에 브랜드명 또는 제품명이 등장하면 '언급', 아니면 '미언급'. 제품명만 등장하고 브랜드명이 없으면 '집계 외 실질 노출'로 별도 표기", example: "언급 / 미언급 / 제품명만" },
  { no: 2, item: "1순위 추천 여부", howToRecord: "추천 목록의 첫 번째 위치면 1, 아니면 순위 숫자. 목록형이 아니면 서술 순서 기준", example: "1 · 2 · 3 · —" },
  { no: 3, item: "자사 URL 직접 인용 비중", howToRecord: "응답에 표기된 인용 URL 중 자사 도메인 수 / 전체 인용 수. 인용을 산출하지 않는 엔진(ChatGPT·Claude)은 '미산출'", example: "1/20 (5%) · 미산출" },
  { no: 4, item: "외부 채널 인용 출처", howToRecord: "인용 URL을 유형별로 분류(블로그·영상·리뷰 플랫폼·커뮤니티·미디어·커머스·학술). 자사 문구가 외부 채널을 거쳐 등장했는지(Path B) 표기", example: "blog.naver.com 3 · youtube 2 · 화해 1" },
  { no: 5, item: "경쟁사 동시 호명 양상", howToRecord: "같은 응답에 등장한 경쟁 브랜드와 그 순위. 등록 경쟁사 외에 실제로 자리를 차지한 브랜드를 추가 기록", example: "A사 1위 · B사 2위 · 자사 4위" },
];
