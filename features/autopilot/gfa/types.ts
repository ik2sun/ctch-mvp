// 캠페인 오토파일럿 · GFA 자동 세팅 — 화면·서버 공용 타입과 규칙(순수 함수)
// 흐름: 담당자가 GFA에서 캠페인만 만든다 → 여기서 캠페인 선택 + 브리프·이미지 → AI 세팅안(광고그룹·타겟·예산·카피)
//       → [세팅 실행](승인) → 광고그룹 생성 → 템플릿별 이미지 업로드 → 소재 생성 → (선택) 켜기 → 기록
// GFA 형식은 2026-10-04 실계정 조회로 확인: 광고그룹 샘플(sampleByCampaignNo)·생성 가능 유형(typeInfoByCampaignNo)·
// 광고그룹 상세 includeCreativeTemplates(템플릿별 이미지 규격·파일 크기)·CTA 목록. 생성(쓰기) 호출은 이 기능의 첫 실행이 첫 검증이다.

export type GfaCampaignLite = {
  no: number;
  name: string;
  objective: string;
  activated: boolean;
  cbo: boolean;
  status: string;
};

export const OBJECTIVE_LABEL: Record<string, string> = {
  CONVERSION: "전환",
  WEB_SITE_TRAFFIC: "웹사이트 트래픽",
  INSTALL_APP: "앱 설치",
  WATCH_VIDEO: "동영상 조회",
  CATALOG: "카탈로그 판매",
  SHOPPING: "쇼핑 프로모션",
  LEAD: "참여 유도",
  PMAX: "ADVoost 쇼핑",
};

// 이미지 소재 자동 세팅이 되는 목적 — 동영상 조회·카탈로그·쇼핑·ADVoost는 소재 형식이 달라 제외
export const SUPPORTED_OBJECTIVES = ["CONVERSION", "WEB_SITE_TRAFFIC", "LEAD"];

// GFA 광고그룹 샘플(OpenAdSetCreationParam 중 쓰는 칸) — 캠페인 목적에 맞는 입찰·예산·시작 기본값이 들어 있다
export type GfaAdSetSample = {
  campaignNo: number;
  targetingType?: string | null;
  bidGoal?: string | null;
  bidStrategy?: string | null;
  bidStrategyValue?: number | null;
  bidType?: string | null;
  bidPrice?: number | null;
  budgetType?: string | null;
  budgetAmount?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  ongoing?: boolean | null;
  accelerated?: boolean | null;
  creativeChooserType?: string | null;
  frequencyAdUnit?: string | null;
  quota?: number | null;
  useAutoFrequency?: boolean | null;
  adidLibraries?: { no: number; included: boolean }[];
  [k: string]: unknown;
};

export type GfaTypeInfo = {
  deviceTypes?: string[];
  placementGroupCodes?: string[];
  bidGoals?: string[];
  bidStrategies?: string[];
  bidTypes?: string[];
  budgetTypes?: string[];
};

export type GfaContext = {
  campaign: GfaCampaignLite;
  sample: GfaAdSetSample;
  types: GfaTypeInfo;
  existingAdSets: { no: number; name: string; activated?: boolean; status?: string }[];
};

// ── 타겟 ─────────────────────────────────────────────
// 실계정 광고그룹의 ageRanges: {from,to} 5세 구간, 60세 이상은 {60,200}, 미상 {-1,-1}
export const AGE_BANDS = [
  { key: "19-24", from: 19, to: 24 },
  { key: "25-29", from: 25, to: 29 },
  { key: "30-34", from: 30, to: 34 },
  { key: "35-39", from: 35, to: 39 },
  { key: "40-44", from: 40, to: 44 },
  { key: "45-49", from: 45, to: 49 },
  { key: "50-54", from: 50, to: 54 },
  { key: "55-59", from: 55, to: 59 },
  { key: "60+", from: 60, to: 200 },
] as const;
export type AgeKey = (typeof AGE_BANDS)[number]["key"];
export const AGE_KEYS = AGE_BANDS.map((a) => a.key) as AgeKey[];

export type Gender = "M" | "F";
export type DeviceChoice = "ALL" | "MOBILE";

// ── 브리프·세팅안 ──────────────────────────────────────
export type SetupBrief = {
  product: string;      // 상품·서비스
  offer: string;        // 프로모션·혜택(없으면 빈 칸)
  audience: string;     // 타겟 메모
  landingUrl: string;
  dailyBudget: number;  // 광고그룹 일 예산 합계(원)
  adSetCount: number;   // 0 = AI가 정함(2~4)
  copyCount: number;    // 카피 변형 수 1~3
  startDate: string;    // yyyy-MM-dd, 빈 칸이면 GFA 샘플 시작일
  notes: string;        // 금지어·톤 등
};

export type PlanAdSet = {
  label: string;        // 타겟 이름(네이밍에 들어감, 짧게)
  rationale: string;    // 이 타겟을 고른 이유
  genders: Gender[];    // 빈 배열 = 전체
  ages: AgeKey[];       // 빈 배열 = 전체
  device: DeviceChoice;
  budget: number;       // 일 예산(원)
};

export type PlanCopy = {
  message: string;          // 광고 문구 (2~65자)
  linkTitle: string;        // 제목 = 설명 1 (2~25자로 제한 — GFA 화면 기준 보수적으로)
  linkDescription: string;  // 설명 2 (2~45자)
  cta: string;              // CTA 코드
};

export type SetupPlan = {
  summary: string;
  adSets: PlanAdSet[];
  copies: PlanCopy[];
};

// ── 이미지 템플릿(단일 이미지) ─────────────────────────
// 규격은 광고그룹 상세의 creativeTemplates 실응답(2026-10-04). 실행 때는 새 광고그룹이 돌려준 규격을 다시 쓴다
export type TemplateSpec = { code: string; label: string; short: string; width: number; height: number; minFileSize: number | null; maxFileSize: number };
export const SINGLE_IMAGE_TEMPLATES: TemplateSpec[] = [
  { code: "FEED_SINGLE_IMAGE", label: "피드 가로 1200×628", short: "ls", width: 1200, height: 628, minFileSize: 51200, maxFileSize: 512000 },
  { code: "FEED_SINGLE_IMAGE_SQUARE", label: "피드 정사각 1200×1200", short: "sq", width: 1200, height: 1200, minFileSize: 81920, maxFileSize: 819200 },
  { code: "FEED_SINGLE_IMAGE_2TO3", label: "피드 세로 1200×1800", short: "pt", width: 1200, height: 1800, minFileSize: 102400, maxFileSize: 1228800 },
  { code: "NATIVE_SINGLE_IMAGE_V2", label: "네이티브 342×228", short: "nt", width: 342, height: 228, minFileSize: 10240, maxFileSize: 133120 },
];
export const DEFAULT_TEMPLATES = ["FEED_SINGLE_IMAGE", "FEED_SINGLE_IMAGE_SQUARE"];

// 새 광고그룹이 돌려준 템플릿(creativeTemplates)에서 단일 이미지 규격만 뽑는다
export type RawTemplate = { code: string; creativeType?: string; sizeGroups?: { width: number; height: number; ratioBased?: boolean; maxFileSize?: number | null; minFileSize?: number | null }[] };
export function singleImageSpecs(raw: RawTemplate[] | undefined): TemplateSpec[] {
  const out: TemplateSpec[] = [];
  for (const t of raw ?? []) {
    if (t.creativeType !== "SINGLE_IMAGE") continue;
    const base = SINGLE_IMAGE_TEMPLATES.find((s) => s.code === t.code);
    const g = t.sizeGroups?.[0];
    if (!base) continue;
    if (!g || g.ratioBased) {
      out.push(base);
      continue;
    }
    out.push({ ...base, width: g.width, height: g.height, minFileSize: g.minFileSize ?? null, maxFileSize: g.maxFileSize ?? base.maxFileSize });
  }
  return out;
}

// GFA CTA(실계정 callToActions 응답, 2026-10-04) — 실행 때는 광고그룹별 목록으로 다시 확인
export const CTA_OPTIONS = [
  { value: "MORE", name: "더 알아보기" },
  { value: "BUY", name: "지금 구매하기" },
  { value: "N_LOOK", name: "지금 구경하기" },
  { value: "N_COUPON", name: "쿠폰 받기" },
  { value: "N_APPLY", name: "지금 신청하기" },
  { value: "JOIN", name: "가입하기" },
  { value: "RESERVE", name: "지금 예약하기" },
  { value: "ASK", name: "문의하기" },
];

// ── 네이밍·UTM ────────────────────────────────────────
function mmdd(date: string) {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}` : "";
}

export function slug(s: string, max = 24) {
  return s
    .trim()
    .replace(/[\s/\\|]+/g, "_")
    .replace(/[^\p{L}\p{N}_+-]/gu, "")
    .slice(0, max);
}

// 성별·연령 코드 — 소재 분석 naming.ts가 읽는 형식(f3549, m_all)과 맞춘다
export function demoCode(a: Pick<PlanAdSet, "genders" | "ages">) {
  const g = a.genders.length === 1 ? a.genders[0].toLowerCase() : "a";
  if (!a.ages.length || a.ages.length === AGE_KEYS.length) return `${g}all`;
  const bands = AGE_BANDS.filter((b) => a.ages.includes(b.key));
  const from = bands[0].from;
  const to = bands[bands.length - 1].to;
  return `${g}${from}${to === 200 ? "99" : to}`;
}

export function adSetName(a: PlanAdSet, startDate: string) {
  return [mmdd(startDate), slug(a.label), demoCode(a)].filter(Boolean).join("_");
}

export function creativeName(adSet: string, imageIdx: number, template: TemplateSpec, copyIdx: number) {
  return `${adSet}_img${String(imageIdx + 1).padStart(2, "0")}_${template.short}_c${copyIdx + 1}`.slice(0, 128);
}

// 랜딩 URL에 UTM이 없을 때만 붙인다(있으면 그대로 — 광고주 규칙 우선)
export function withUtm(url: string, campaignName: string, content: string) {
  try {
    const u = new URL(url);
    if ([...u.searchParams.keys()].some((k) => k.startsWith("utm_"))) return url;
    u.searchParams.set("utm_source", "naver");
    u.searchParams.set("utm_medium", "gfa");
    u.searchParams.set("utm_campaign", slug(campaignName, 60));
    u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return url;
  }
}

// GFA 시작 일시 "yyyy-MM-ddTHH:mm"(샘플 형식). 브리프 날짜가 샘플보다 늦을 때만 그 날 00:00로
export function startTimeFor(briefDate: string, sampleStart: string | null | undefined) {
  if (!briefDate) return sampleStart ?? null;
  if (sampleStart && sampleStart.slice(0, 10) >= briefDate) return sampleStart;
  return `${briefDate}T00:00`;
}

// 일 예산 정리 — 1,000원 단위, 광고그룹당 최소 10,000원(GFA 최소 일 예산은 문서에 없어 보수적으로)
export const MIN_ADSET_BUDGET = 10000;
export function roundBudget(n: number) {
  return Math.max(MIN_ADSET_BUDGET, Math.round(n / 1000) * 1000);
}

export function clampCopy(c: PlanCopy): PlanCopy {
  const cut = (s: string, n: number) => (s ?? "").trim().slice(0, n);
  return { message: cut(c.message, 65), linkTitle: cut(c.linkTitle, 25), linkDescription: cut(c.linkDescription, 45), cta: c.cta || "MORE" };
}

export function copyProblems(c: PlanCopy): string[] {
  const p: string[] = [];
  if (c.message.trim().length < 2) p.push("광고 문구는 2자 이상");
  if (c.linkTitle.trim().length < 2) p.push("제목은 2자 이상");
  if (c.linkDescription.trim().length < 2) p.push("설명은 2자 이상");
  return p;
}
