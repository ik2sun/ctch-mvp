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
  // 네이티브 템플릿 전용(엑셀 벌크) — 실제로 보내는 칸은 템플릿별 COPY_RULES가 정한다
  linkText3rd?: string;     // 설명 문구3 (모바일 네이티브)
  linkText4th?: string;     // PC 긴 설명1
  linkText5th?: string;     // PC 긴 설명2
  adviceMessage?: string;   // 고지 문구
};

export type SetupPlan = {
  summary: string;
  adSets: PlanAdSet[];
  copies: PlanCopy[];
};

// ── 이미지 템플릿 ─────────────────────────────────────
// 규격은 광고그룹 상세의 creativeTemplates 실응답(2026-10-04·10-08). 실행 때는 광고그룹이 돌려준 규격을 다시 쓴다
// 소재 유형 3가지(GFA 화면 기준) — 공식 소재 가이드 https://naver-ad-api.github.io/developers/docs/ad-management/creative (2026-10-08 확인)
//  · 네이티브 이미지(SINGLE_IMAGE) = 피드 3종 + 네이티브 모바일·PC. 템플릿마다 받는 문구 칸이 다르다(COPY_RULES). GFA가 잘라 쓸 수 있음
//  · 이미지 배너(IMAGE_BANNER) = 스마트채널·배너. 글자가 이미지 안 — 랜딩 URL + 광고 안내 문구(대체 텍스트, 2~100자)만, 잘라 쓰지 않음
//  · 컬렉션(MULTIPLE_IMAGE) = 600×600 카드 4~10장(카드마다 설명 문구 2~28자·랜딩 URL) + 광고 문구·CTA·CTA URL
// 프로필(이미지·이름)은 광고계정 단위(GFA 광고 계정 관리 > 프로필 관리)라 생성 API에 칸이 없고 계정 프로필이 붙는다 — 네이티브·컬렉션은 프로필 선등록 필요
// 르무통 실소재(2026-10-08): 스마트채널 광고그룹 = BANNER_750(750×160)·BANNER_750X280, 메인 배너 = BANNER_1250X560, 피드 1:1은 광고 문구·CTA·URL만
export type CreativeKind = "SINGLE_IMAGE" | "IMAGE_BANNER" | "MULTIPLE_IMAGE";
export type TemplateSpec = { code: string; kind: CreativeKind; label: string; short: string; width: number; height: number; minFileSize: number | null; maxFileSize: number };
export const SINGLE_IMAGE_TEMPLATES: TemplateSpec[] = [
  { code: "FEED_SINGLE_IMAGE", kind: "SINGLE_IMAGE", label: "피드 가로 1200×628", short: "ls", width: 1200, height: 628, minFileSize: 51200, maxFileSize: 512000 },
  { code: "FEED_SINGLE_IMAGE_SQUARE", kind: "SINGLE_IMAGE", label: "피드 정사각 1200×1200", short: "sq", width: 1200, height: 1200, minFileSize: 81920, maxFileSize: 819200 },
  { code: "FEED_SINGLE_IMAGE_2TO3", kind: "SINGLE_IMAGE", label: "피드 세로 1200×1800", short: "pt", width: 1200, height: 1800, minFileSize: 102400, maxFileSize: 1228800 },
  { code: "NATIVE_SINGLE_IMAGE_V2", kind: "SINGLE_IMAGE", label: "배너형(모바일) 342×228", short: "nt", width: 342, height: 228, minFileSize: 10240, maxFileSize: 133120 },
  { code: "NATIVE_SINGLE_IMAGE_PC", kind: "SINGLE_IMAGE", label: "배너형(PC) 342×228", short: "npc", width: 342, height: 228, minFileSize: 10240, maxFileSize: 133120 },
];
export const isFeedTemplate = (code: string) => code.startsWith("FEED_SINGLE_IMAGE");
// 컬렉션 카드 이미지(sizeGroupNo 3, 실응답 600×600·20~500KB). 동영상 컬렉션(FEED_MULTIPLE_IMAGE_WITH_VIDEO)은 동영상 업로드가 필요해 미지원
export const COLLECTION_TEMPLATE: TemplateSpec = { code: "FEED_MULTIPLE_IMAGE", kind: "MULTIPLE_IMAGE", label: "컬렉션 600×600", short: "col", width: 600, height: 600, minFileSize: 20480, maxFileSize: 512000 };
export const COLLECTION_CARDS = { min: 4, max: 10, titleMax: 28, messageMax: 65 };

// ── 네이티브 이미지 템플릿별 문구 칸(공식 소재 가이드 표) ── 없는 칸은 보내지 않는다
export type CopyField = "message" | "linkTitle" | "linkDescription" | "linkText3rd" | "linkText4th" | "linkText5th" | "adviceMessage";
export const COPY_LABEL: Record<CopyField, string> = {
  message: "광고 문구",
  linkTitle: "설명 문구1",
  linkDescription: "설명 문구2",
  linkText3rd: "설명 문구3",
  linkText4th: "PC 긴 설명1",
  linkText5th: "PC 긴 설명2",
  adviceMessage: "고지 문구",
};
type FieldRule = { required: boolean; max: number };
const FEED_RULE: Partial<Record<CopyField, FieldRule>> = { message: { required: true, max: 65 } };
export const COPY_RULES: Record<string, Partial<Record<CopyField, FieldRule>>> = {
  FEED_SINGLE_IMAGE: FEED_RULE,
  FEED_SINGLE_IMAGE_SQUARE: FEED_RULE,
  FEED_SINGLE_IMAGE_2TO3: FEED_RULE,
  NATIVE_SINGLE_IMAGE_V2: {
    message: { required: true, max: 20 },
    linkTitle: { required: true, max: 12 },
    linkDescription: { required: true, max: 12 },
    linkText3rd: { required: true, max: 12 },
    adviceMessage: { required: false, max: 45 },
  },
  NATIVE_SINGLE_IMAGE_PC: {
    message: { required: true, max: 20 },
    linkText4th: { required: true, max: 28 },
    linkText5th: { required: true, max: 28 },
    adviceMessage: { required: false, max: 45 },
  },
};
const COPY_FIELDS = Object.keys(COPY_LABEL) as CopyField[];

// 템플릿이 받는 칸만, 빈 칸은 빼고
export function copyForTemplate(copy: Partial<Record<CopyField, string | undefined>>, code: string): Partial<Record<CopyField, string>> {
  const rules = COPY_RULES[code] ?? {};
  const out: Partial<Record<CopyField, string>> = {};
  for (const f of COPY_FIELDS) {
    const v = (copy[f] ?? "").trim();
    if (rules[f] && v) out[f] = v;
  }
  return out;
}

// 템플릿 기준 필수·글자 수 점검(최소 2자는 GFA 공통)
export function templateCopyProblems(copy: Partial<Record<CopyField, string | undefined>>, code: string): string[] {
  const rules = COPY_RULES[code];
  if (!rules) return [];
  const p: string[] = [];
  for (const f of COPY_FIELDS) {
    const r = rules[f];
    if (!r) continue;
    const n = (copy[f] ?? "").trim().length;
    if (r.required && n < 2) p.push(`${COPY_LABEL[f]} 필수(2~${r.max}자)`);
    else if (n === 1) p.push(`${COPY_LABEL[f]}는 비우거나 2자 이상`);
    else if (n > r.max) p.push(`${COPY_LABEL[f]} ${n}자(최대 ${r.max})`);
  }
  return p;
}
export const BANNER_TEMPLATES: TemplateSpec[] = [
  { code: "BANNER_750", kind: "IMAGE_BANNER", label: "스마트채널 750×160", short: "sc160", width: 750, height: 160, minFileSize: null, maxFileSize: 153600 },
  { code: "BANNER_750X280", kind: "IMAGE_BANNER", label: "스마트채널 750×280", short: "sc280", width: 750, height: 280, minFileSize: null, maxFileSize: 256000 },
  { code: "BANNER_750X200", kind: "IMAGE_BANNER", label: "배너 750×200", short: "bn200", width: 750, height: 200, minFileSize: null, maxFileSize: 184320 },
  { code: "BANNER_1250X560", kind: "IMAGE_BANNER", label: "배너 1250×560", short: "bn560", width: 1250, height: 560, minFileSize: 51200, maxFileSize: 256000 },
  { code: "BANNER_1200X1200", kind: "IMAGE_BANNER", label: "배너 1200×1200", short: "bnsq", width: 1200, height: 1200, minFileSize: 81920, maxFileSize: 819200 },
];
export const ALL_TEMPLATES: TemplateSpec[] = [...SINGLE_IMAGE_TEMPLATES, ...BANNER_TEMPLATES];
export const DEFAULT_TEMPLATES = ["FEED_SINGLE_IMAGE", "FEED_SINGLE_IMAGE_SQUARE"];
// 이미지 업로드가 되는 템플릿 전부(컬렉션 카드 포함)
export const UPLOAD_TEMPLATES: TemplateSpec[] = [...ALL_TEMPLATES, COLLECTION_TEMPLATE];
export const templateByCode = (code: string) => UPLOAD_TEMPLATES.find((t) => t.code === code);

// 이미지 크기로 규격 고르기 — 비율이 ±2% 안에 드는 규격(정확히 같은 크기가 먼저). 1:1처럼 피드·배너가 둘 다 맞으면 prefer 쪽
// only를 주면 그 유형 안에서만(네이티브 시트 = SINGLE_IMAGE, 배너 시트 = IMAGE_BANNER). 342×228은 모바일 네이티브(PC는 문구로 판단)
const RATIO_TOL = 0.02;
export function ratioMatches(img: { width: number; height: number }, t: TemplateSpec) {
  return Math.abs(img.width / img.height / (t.width / t.height) - 1) <= RATIO_TOL;
}
export function autoTemplates(img: { width: number; height: number }, prefer: CreativeKind, only?: CreativeKind): TemplateSpec[] {
  const hits = ALL_TEMPLATES.filter((t) => (only ? t.kind === only : t.code !== "BANNER_1200X1200" || prefer === "IMAGE_BANNER"))
    .filter((t) => t.code !== "NATIVE_SINGLE_IMAGE_PC")
    .filter((t) => ratioMatches(img, t));
  if (!hits.length) return [];
  const exact = hits.filter((t) => t.width === img.width && t.height === img.height);
  const pool = exact.length ? exact : hits;
  const preferred = pool.filter((t) => t.kind === prefer);
  return [(preferred.length ? preferred : pool)[0]];
}

// 새 광고그룹이 돌려준 템플릿(creativeTemplates)에서 이미지 규격(네이티브 이미지·이미지 배너·이미지 컬렉션)만 뽑는다
export type RawTemplate = { code: string; creativeType?: string; sizeGroups?: { width: number; height: number; ratioBased?: boolean; maxFileSize?: number | null; minFileSize?: number | null }[] };
export function imageSpecs(raw: RawTemplate[] | undefined): TemplateSpec[] {
  const out: TemplateSpec[] = [];
  for (const t of raw ?? []) {
    if (!["SINGLE_IMAGE", "IMAGE_BANNER", "MULTIPLE_IMAGE"].includes(t.creativeType ?? "")) continue;
    const base = templateByCode(t.code);
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
