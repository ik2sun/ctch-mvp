// 캠페인 오토파일럿 · GFA 수동 세팅 — 캠페인 → 광고그룹 → 소재 초안 트리와 GFA 본문 변환(순수 함수)
// 항목은 GFA 생성 API(공식 스펙 CONVERSION·WEB_SITE_TRAFFIC / OpenAdSetCreationParam / 소재 3종)를 그대로 따른다.
// 새 캠페인의 광고그룹 선택지는 캠페인이 아직 없어 GFA에 물어볼 수 없으므로 목적별 표(OBJECTIVE_TYPES, 2026-10-09 르무통 typeInfo 실조회)를 쓰고,
// 기존 캠페인은 그 캠페인의 typeInfoByCampaignNo·sampleByCampaignNo를 쓴다.
import type { SourceImage } from "../imageFit";
import type { GfaContext, PlanCopy } from "../types";
import { ALL_TEMPLATES, COLLECTION_CARDS, COPY_LABEL, COPY_RULES, type CopyField } from "../types";

export type Objective = "CONVERSION" | "WEB_SITE_TRAFFIC";
// 생성 API가 받는 목적 중 이미지 소재로 세팅하는 2종(참여 유도 LEAD는 생성 본문 스키마에 없음)
export const MANUAL_OBJECTIVES: { key: Objective; label: string; desc: string }[] = [
  { key: "CONVERSION", label: "웹사이트 전환", desc: "구매·장바구니 같은 전환을 최대화" },
  { key: "WEB_SITE_TRAFFIC", label: "웹사이트 트래픽", desc: "랜딩 페이지 방문(클릭)을 최대화" },
];

export type AdSetTypes = { bidGoals: string[]; bidStrategies: string[]; bidTypes: string[]; budgetTypes: string[]; deviceTypes: string[]; placementGroupCodes: string[] };
const PLACEMENTS = ["M_FEED", "F_SMARTCHANNEL", "NW_FEED", "N_COMMUNICATION", "NW_SMARTCHANNEL", "M_MAIN", "NW_BANNER", "BAND", "M_BANNER", "M_SMARTCHANNEL", "F_BANNER"];
export const OBJECTIVE_TYPES: Record<Objective, AdSetTypes & { defaults: { bidGoal: string; bidStrategy: string; bidType: string } }> = {
  CONVERSION: {
    bidGoals: ["MAX_CONV", "MAX_CONV_VALUE"],
    bidStrategies: ["NO_CAP", "BID_CAP"],
    bidTypes: ["CPC", "CPM"],
    budgetTypes: ["DAILY", "TOTAL"],
    deviceTypes: ["DESKTOP", "MOBILE"],
    placementGroupCodes: PLACEMENTS,
    defaults: { bidGoal: "MAX_CONV", bidStrategy: "NO_CAP", bidType: "CPC" },
  },
  WEB_SITE_TRAFFIC: {
    bidGoals: ["MAX_CLICK", "NONE"],
    bidStrategies: ["NO_CAP", "BID_CAP", "COST_CAP", "FIXED_BID"],
    bidTypes: ["CPC", "CPM"],
    budgetTypes: ["DAILY", "TOTAL"],
    deviceTypes: ["DESKTOP", "MOBILE"],
    placementGroupCodes: PLACEMENTS,
    defaults: { bidGoal: "MAX_CLICK", bidStrategy: "NO_CAP", bidType: "CPC" },
  },
};

export const LABEL = {
  bidGoal: { MAX_CONV: "전환수 최대화", MAX_CONV_VALUE: "전환가치 최대화", MAX_CLICK: "클릭수 최대화", NONE: "없음(수동 입찰)" } as Record<string, string>,
  bidStrategy: { NO_CAP: "한도 없음", BID_CAP: "입찰가 한도", COST_CAP: "비용 한도", FIXED_BID: "고정 입찰", TARGET_COST: "목표 비용", TARGET_ROAS: "목표 ROAS" } as Record<string, string>,
  bidType: { CPC: "클릭당(CPC)", CPM: "노출 1,000회당(CPM)", CPV: "조회당(CPV)" } as Record<string, string>,
  budgetType: { DAILY: "일 예산", TOTAL: "총 예산" } as Record<string, string>,
  targetingType: { AUDIENCE: "오디언스 타겟팅", CONTEXT: "콘텍스트 타겟팅", ADVOOST_AUDIENCE: "ADVoost 오디언스", ADVOOST_EXPAND: "ADVoost 확장" } as Record<string, string>,
  creativeChooser: { VALUE_WEIGHTED_RANDOM: "성과 가중 랜덤(기본)", SIMPLE_RANDOM: "균등 랜덤", OPTIMIZATION: "자동 최적화" } as Record<string, string>,
  conversionType: { "": "전체 전환", PURCHASE: "구매", CART: "장바구니 담기" } as Record<string, string>,
};

// 연령 — GFA 5세 구간(14세부터), 60세 이상은 {60,200}, 알 수 없음 {-1,-1}
export const AGE_OPTIONS = [
  { key: "14-18", from: 14, to: 18 },
  { key: "19-24", from: 19, to: 24 },
  { key: "25-29", from: 25, to: 29 },
  { key: "30-34", from: 30, to: 34 },
  { key: "35-39", from: 35, to: 39 },
  { key: "40-44", from: 40, to: 44 },
  { key: "45-49", from: 45, to: 49 },
  { key: "50-54", from: 50, to: 54 },
  { key: "55-59", from: 55, to: 59 },
  { key: "60+", from: 60, to: 200 },
  { key: "알 수 없음", from: -1, to: -1 },
] as const;
export type AgeOption = (typeof AGE_OPTIONS)[number]["key"];

export type Schedule = boolean[][] | null; // [요일 0=월…6=일][시 0~23], null = 항상

export type CreativeKind = "SINGLE_IMAGE" | "IMAGE_BANNER" | "MULTIPLE_IMAGE";
export const CREATIVE_KINDS: { key: CreativeKind; label: string; desc: string }[] = [
  { key: "SINGLE_IMAGE", label: "네이티브 이미지", desc: "피드·네이티브 지면, 이미지 + 문구" },
  { key: "IMAGE_BANNER", label: "이미지 배너", desc: "스마트채널·배너, 글자는 이미지 안에" },
  { key: "MULTIPLE_IMAGE", label: "컬렉션", desc: "카드 4~10장을 넘겨 보는 피드 소재" },
];

export type CardDraft = { key: string; image: SourceImage | null; title: string; url: string };
export type CreativeDraft = {
  key: string;
  kind: CreativeKind;
  name: string;
  image: SourceImage | null;
  templates: string[]; // 네이티브·배너 규격(템플릿 코드)
  copy: PlanCopy;
  landingUrl: string;
  altMessage: string; // 배너 광고 안내 문구(대체 텍스트)
  cards: CardDraft[]; // 컬렉션
  ctaUrl: string; // 컬렉션 CTA URL(비면 첫 카드 URL)
};

export type AdSetDraft = {
  key: string;
  existingNo?: number; // 있으면 기존 광고그룹에 소재만 추가
  name: string;
  targetingType: string;
  genders: ("M" | "F" | "U")[]; // 빈 배열 = 전체
  ages: AgeOption[]; // 빈 배열 = 전체
  locations: string[]; // rcode, 빈 배열 = 전체
  extDemos: string[];
  interests: string[]; // "단계-코드"
  purchase: string[];
  customFiles: { no: number; included: boolean }[];
  device: "ALL" | "MOBILE" | "DESKTOP";
  os: "ALL" | "IOS" | "ANDROID";
  placements: string[]; // 빈 배열 = 전체(자동)
  bidGoal: string;
  bidStrategy: string;
  bidStrategyValue: number | null;
  bidType: string;
  bidPrice: number | null;
  budgetType: string;
  budgetAmount: number;
  start: string; // "yyyy-MM-ddTHH:mm", 빈 칸 = GFA 기본(다음날 09:00)
  end: string; // 빈 칸 = 계속 게재
  schedule: Schedule;
  accelerated: boolean;
  creativeChooserType: string;
  frequencyAdUnit: "" | "AD_SET" | "CREATIVE";
  quota: number | null;
  creatives: CreativeDraft[];
};

export type CampaignDraft = {
  key: string;
  existing?: { no: number; name: string; objective: string; cbo: boolean }; // 있으면 기존 캠페인에 광고그룹·소재만 추가
  name: string;
  objective: Objective;
  brandNo: number | null;
  urlNo: number | null;
  conversionUrlNo: number | null;
  conversionType: "" | "PURCHASE" | "CART";
  s2sApiOn: boolean;
  spendLimit: number | null;
  cbo: boolean;
  cboBidGoal: string;
  cboBidStrategy: string;
  cboBidStrategyValue: number | null;
  cboBudget: number | null;
  adSets: AdSetDraft[];
};

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const mmdd = () => kstToday().slice(5).replace("-", "");

export function newCampaign(objective: Objective = "CONVERSION"): CampaignDraft {
  return {
    key: uid("c"),
    name: "",
    objective,
    brandNo: null,
    urlNo: null,
    conversionUrlNo: null,
    conversionType: objective === "CONVERSION" ? "PURCHASE" : "",
    s2sApiOn: false,
    spendLimit: null,
    cbo: false,
    cboBidGoal: objective === "CONVERSION" ? "MAX_CONV" : "MAX_CLICK",
    cboBidStrategy: "NO_CAP",
    cboBidStrategyValue: null,
    cboBudget: null,
    adSets: [],
  };
}

export function existingCampaign(c: { no: number; name: string; objective: string; cbo: boolean }): CampaignDraft {
  return { ...newCampaign(c.objective === "WEB_SITE_TRAFFIC" ? "WEB_SITE_TRAFFIC" : "CONVERSION"), existing: c, name: c.name };
}

// 광고그룹 기본값 — 기존 캠페인은 GFA 샘플, 새 캠페인은 목적별 표
export function newAdSet(campaign: CampaignDraft, ctx: GfaContext | null, index: number): AdSetDraft {
  const t = OBJECTIVE_TYPES[campaign.objective];
  const s = ctx?.sample;
  return {
    key: uid("a"),
    name: `${mmdd()}_광고그룹${index + 1}`,
    targetingType: s?.targetingType ?? "AUDIENCE",
    genders: [],
    ages: [],
    locations: [],
    extDemos: [],
    interests: [],
    purchase: [],
    customFiles: [],
    device: "ALL",
    os: "ALL",
    placements: [],
    bidGoal: s?.bidGoal ?? t.defaults.bidGoal,
    bidStrategy: s?.bidStrategy ?? t.defaults.bidStrategy,
    bidStrategyValue: null,
    bidType: s?.bidType ?? t.defaults.bidType,
    bidPrice: null,
    budgetType: "DAILY",
    budgetAmount: 30000,
    start: "",
    end: "",
    schedule: null,
    accelerated: false,
    creativeChooserType: s?.creativeChooserType ?? "VALUE_WEIGHTED_RANDOM",
    frequencyAdUnit: "",
    quota: null,
    creatives: [],
  };
}

export function existingAdSet(no: number, name: string): AdSetDraft {
  return { ...newAdSet(newCampaign(), null, 0), existingNo: no, name };
}

export function newCreative(kind: CreativeKind, adSetName: string, index: number): CreativeDraft {
  const short = kind === "IMAGE_BANNER" ? "bn" : kind === "MULTIPLE_IMAGE" ? "col" : "img";
  return {
    key: uid("k"),
    kind,
    name: `${adSetName}_${short}${String(index + 1).padStart(2, "0")}`.slice(0, 128),
    image: null,
    templates: kind === "SINGLE_IMAGE" ? ["FEED_SINGLE_IMAGE_SQUARE"] : [],
    copy: { message: "", linkTitle: "", linkDescription: "", cta: "MORE", linkText3rd: "", linkText4th: "", linkText5th: "", adviceMessage: "" },
    landingUrl: "",
    altMessage: "",
    cards: kind === "MULTIPLE_IMAGE" ? Array.from({ length: 4 }, () => ({ key: uid("d"), image: null, title: "", url: "" })) : [],
    ctaUrl: "",
  };
}

// 복제 — 키를 새로 붙이고 이름 뒤에 _복사
export function cloneAdSet(a: AdSetDraft): AdSetDraft {
  return {
    ...structuredCloneSafe(a),
    key: uid("a"),
    existingNo: undefined,
    name: `${a.name}_복사`.slice(0, 128),
    creatives: a.creatives.map((c) => ({ ...cloneCreative(c), name: c.name })),
  };
}
export function cloneCreative(c: CreativeDraft): CreativeDraft {
  return { ...c, key: uid("k"), name: `${c.name}_복사`.slice(0, 128), copy: { ...c.copy }, templates: [...c.templates], cards: c.cards.map((x) => ({ ...x, key: uid("d") })) };
}
// SourceImage(File·URL)는 그대로 공유하고 나머지 배열만 새로
function structuredCloneSafe(a: AdSetDraft): AdSetDraft {
  return {
    ...a,
    genders: [...a.genders],
    ages: [...a.ages],
    locations: [...a.locations],
    extDemos: [...a.extDemos],
    interests: [...a.interests],
    purchase: [...a.purchase],
    customFiles: a.customFiles.map((x) => ({ ...x })),
    placements: [...a.placements],
    schedule: a.schedule ? a.schedule.map((d) => [...d]) : null,
  };
}

// 이 광고그룹에서 고를 수 있는 값 — 기존 캠페인은 GFA typeInfo, 새 캠페인은 목적별 표
export function typesFor(campaign: CampaignDraft, ctx: GfaContext | null): AdSetTypes {
  const t = OBJECTIVE_TYPES[campaign.objective];
  const g = ctx?.types;
  const pick = (a: string[] | undefined, b: string[]) => (a?.length ? a : b);
  return {
    bidGoals: pick(g?.bidGoals, t.bidGoals),
    bidStrategies: pick(g?.bidStrategies, t.bidStrategies),
    bidTypes: pick(g?.bidTypes, t.bidTypes),
    budgetTypes: pick(g?.budgetTypes, t.budgetTypes),
    deviceTypes: pick(g?.deviceTypes, t.deviceTypes),
    placementGroupCodes: pick(g?.placementGroupCodes, t.placementGroupCodes),
  };
}

export const cboOn = (c: CampaignDraft) => (c.existing ? c.existing.cbo : c.cbo);

// ── 요일·시간 ────────────────────────────────────────
export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const fullGrid = (v = true) => DAYS.map(() => Array.from({ length: 24 }, () => v));
// GFA scheduleTimeSlots — dayOfWeek 1=월 … 7=일, 연속된 시간을 한 칸으로
export function slotsFromGrid(grid: Schedule) {
  if (!grid || grid.every((d) => d.every(Boolean))) return [];
  const out: { dayOfWeek: number; startHour: number; endHour: number }[] = [];
  grid.forEach((hours, d) => {
    let h = 0;
    while (h < 24) {
      if (!hours[h]) {
        h++;
        continue;
      }
      const s = h;
      while (h < 24 && hours[h]) h++;
      out.push({ dayOfWeek: d + 1, startHour: s, endHour: h });
    }
  });
  return out;
}
export const scheduleHours = (grid: Schedule) => (grid ? grid.reduce((s, d) => s + d.filter(Boolean).length, 0) : 168);

// ── GFA 본문 ─────────────────────────────────────────
export function campaignBody(c: CampaignDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: c.name.trim().slice(0, 128),
    objective: c.objective,
    brandNo: c.brandNo,
    urlNo: c.urlNo,
    s2sApiOn: c.s2sApiOn,
  };
  if (c.conversionUrlNo) body.conversionUrlNo = c.conversionUrlNo;
  if (c.objective === "CONVERSION" && c.conversionType) body.conversionType = c.conversionType;
  if (c.spendLimit) body.spendLimit = c.spendLimit;
  if (c.cbo) {
    body.optimization = {
      activated: true,
      bidGoal: c.cboBidGoal,
      bidStrategy: c.cboBidStrategy,
      ...(c.cboBidStrategy !== "NO_CAP" && c.cboBidStrategyValue ? { bidStrategyValue: c.cboBidStrategyValue } : {}),
      ...(c.cboBudget ? { budget: c.cboBudget } : {}),
    };
  }
  return body;
}

// 광고그룹 설정 → GFA 생성 본문 칸(서버가 adSetSheet OVERRIDE_KEYS만 받아 샘플 위에 덮는다)
// CBO 캠페인이면 입찰 목표·비용 관리·예산은 캠페인을 따르므로 보내지 않는다(샘플 값 유지)
export function adSetSettings(a: AdSetDraft, cbo: boolean): Record<string, unknown> {
  const devices = a.device === "MOBILE" ? ["MOBILE"] : a.device === "DESKTOP" ? ["DESKTOP"] : ["DESKTOP", "MOBILE"];
  const o: Record<string, unknown> = {
    targetingType: a.targetingType,
    genders: a.genders,
    ageRanges: AGE_OPTIONS.filter((x) => a.ages.includes(x.key)).map((x) => ({ from: x.from, to: x.to })),
    locations: a.locations,
    extensionDemos: a.extDemos.map(Number),
    interestCodes: a.interests.map((k) => {
      const [depth, code] = k.split("-").map(Number);
      return { code, depth };
    }),
    purchaseIntentCodes: a.purchase.map(Number),
    adidLibraries: a.customFiles,
    allDevice: a.device === "ALL",
    devices,
    platforms: a.os === "ALL" ? ["IOS", "ANDROID"] : [a.os],
    allPlacementGroup: a.placements.length === 0,
    placementGroupCodes: a.placements,
    bidType: a.bidType,
    accelerated: a.accelerated,
    creativeChooserType: a.creativeChooserType,
    scheduleTimeSlots: slotsFromGrid(a.schedule),
    ongoing: !a.end,
    endTime: a.end || null,
  };
  if (a.start) o.startTime = a.start;
  if (a.frequencyAdUnit && a.quota) {
    o.frequencyAdUnit = a.frequencyAdUnit;
    o.quota = a.quota;
  }
  if (!cbo) {
    o.bidGoal = a.bidGoal;
    o.bidStrategy = a.bidStrategy;
    o.budgetType = a.budgetType;
    o.budgetAmount = a.budgetAmount;
    if (needsCap(a.bidStrategy) && a.bidStrategyValue) o.bidStrategyValue = a.bidStrategyValue;
    if (a.bidStrategy === "FIXED_BID" && a.bidPrice) o.bidPrice = a.bidPrice;
  }
  return o;
}
export const needsCap = (s: string) => s === "BID_CAP" || s === "COST_CAP" || s === "TARGET_COST" || s === "TARGET_ROAS";

// 네이티브 이미지 — 고른 규격이 모두 받는 문구 칸(규격별 최대 글자 중 가장 작은 값)
export function copyFieldsFor(templates: string[]): { field: CopyField; label: string; max: number; required: boolean }[] {
  const out = new Map<CopyField, { field: CopyField; label: string; max: number; required: boolean }>();
  for (const code of templates) {
    for (const [f, r] of Object.entries(COPY_RULES[code] ?? {}) as [CopyField, { required: boolean; max: number }][]) {
      const prev = out.get(f);
      out.set(f, { field: f, label: COPY_LABEL[f], max: Math.min(prev?.max ?? r.max, r.max), required: (prev?.required ?? false) || r.required });
    }
  }
  const order: CopyField[] = ["message", "linkTitle", "linkDescription", "linkText3rd", "linkText4th", "linkText5th", "adviceMessage"];
  return order.filter((f) => out.has(f)).map((f) => out.get(f)!);
}

// ── 점검 ────────────────────────────────────────────
export type Problem = { key: string; text: string };
const isUrl = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim());

export function creativeProblems(c: CreativeDraft): string[] {
  const p: string[] = [];
  if (c.name.trim().length < 2) p.push("소재 이름 2자 이상");
  if (c.kind === "MULTIPLE_IMAGE") {
    const msg = c.copy.message.trim();
    if (msg.length < 2 || msg.length > COLLECTION_CARDS.messageMax) p.push(`광고 문구 2~${COLLECTION_CARDS.messageMax}자`);
    if (c.cards.length < COLLECTION_CARDS.min || c.cards.length > COLLECTION_CARDS.max) p.push(`카드 ${COLLECTION_CARDS.min}~${COLLECTION_CARDS.max}장`);
    c.cards.forEach((x, i) => {
      if (!x.image) p.push(`카드 ${i + 1} 이미지`);
      const t = x.title.trim().length;
      if (t < 2 || t > COLLECTION_CARDS.titleMax) p.push(`카드 ${i + 1} 설명 문구 2~${COLLECTION_CARDS.titleMax}자`);
      if (!isUrl(x.url)) p.push(`카드 ${i + 1} 랜딩 URL`);
    });
    if (c.ctaUrl.trim() && !isUrl(c.ctaUrl)) p.push("CTA URL 형식");
    return p;
  }
  if (!c.image) p.push("이미지");
  if (!c.templates.length) p.push("소재 규격을 하나 이상");
  if (!isUrl(c.landingUrl)) p.push("랜딩 URL(http로 시작)");
  if (c.kind === "IMAGE_BANNER") {
    const n = c.altMessage.trim().length;
    if (n < 2 || n > 100) p.push("광고 안내 문구 2~100자");
    return p;
  }
  // 고른 규격들의 칸을 합친 규칙(가장 엄격한 글자 수)으로 점검 — 서버도 규격마다 templateCopyProblems로 다시 본다
  for (const f of copyFieldsFor(c.templates)) {
    const n = ((c.copy[f.field] as string | undefined) ?? "").trim().length;
    if (f.required && n < 2) p.push(`${f.label} 필수(2~${f.max}자)`);
    else if (n === 1) p.push(`${f.label}는 비우거나 2자 이상`);
    else if (n > f.max) p.push(`${f.label} ${n}자(최대 ${f.max})`);
  }
  return p;
}

export function adSetProblems(a: AdSetDraft, cbo: boolean, now: string): string[] {
  if (a.existingNo) return [];
  const p: string[] = [];
  if (a.name.trim().length < 2) p.push("광고그룹 이름 2자 이상");
  if (!cbo) {
    if (!(a.budgetAmount > 0)) p.push("예산");
    if (needsCap(a.bidStrategy) && !a.bidStrategyValue) p.push(`${LABEL.bidStrategy[a.bidStrategy]} 금액`);
    if (a.bidStrategy === "FIXED_BID" && !a.bidPrice) p.push("입찰가");
  }
  if (a.start && a.start < now) p.push("시작 일시가 지났어요");
  if (a.end && a.end <= (a.start || now)) p.push("종료 일시는 시작보다 뒤로");
  if (a.budgetType === "TOTAL" && !a.end) p.push("총 예산은 종료 일시가 필요해요");
  if (a.schedule && scheduleHours(a.schedule) === 0) p.push("요일·시간을 하나 이상");
  if (a.frequencyAdUnit && !(a.quota && a.quota >= 1 && a.quota <= 5)) p.push("노출 빈도 1~5회");
  return p;
}

export function campaignProblems(c: CampaignDraft): string[] {
  if (c.existing) return [];
  const p: string[] = [];
  if (c.name.trim().length < 2) p.push("캠페인 이름 2자 이상");
  if (!c.brandNo) p.push("브랜드");
  if (!c.urlNo) p.push("대표 URL");
  if (c.cbo && !c.cboBudget) p.push("캠페인 예산(예산 최적화)");
  if (c.cbo && needsCap(c.cboBidStrategy) && !c.cboBidStrategyValue) p.push("예산 최적화 비용 관리 금액");
  return p;
}

// 항목(캠페인·광고그룹·소재)마다 한 줄로 묶는다 — 누르면 그 항목으로 이동
export function allProblems(campaigns: CampaignDraft[], now: string): Problem[] {
  const out: Problem[] = [];
  const add = (key: string, label: string, list: string[]) => list.length && out.push({ key, text: `${label}: ${list.join(" · ")}` });
  for (const c of campaigns) {
    add(c.key, c.existing?.name ?? (c.name.trim() || "새 캠페인"), [...campaignProblems(c), ...(c.adSets.length ? [] : ["광고그룹을 하나 이상 추가"])]);
    const names = new Set<string>();
    for (const a of c.adSets) {
      const dup = !a.existingNo && names.has(a.name.trim());
      names.add(a.name.trim());
      add(a.key, a.name, [...adSetProblems(a, cboOn(c), now), ...(dup ? ["같은 캠페인에 같은 이름의 광고그룹"] : []), ...(a.existingNo && !a.creatives.length ? ["소재를 하나 이상 추가"] : [])]);
      for (const k of a.creatives) add(k.key, k.name, creativeProblems(k));
    }
  }
  return out;
}

// 한 소재 초안이 실제로 만드는 GFA 소재 수(네이티브·배너는 규격마다 1개)
export const creativeUnits = (c: CreativeDraft) => (c.kind === "MULTIPLE_IMAGE" ? 1 : c.templates.length);
export const templateLabel = (code: string) => ALL_TEMPLATES.find((t) => t.code === code)?.label ?? code;
