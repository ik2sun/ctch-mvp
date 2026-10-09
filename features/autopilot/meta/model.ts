// 캠페인 오토파일럿 · 메타 빠른 세팅 — 초안(캠페인 1 · 광고세트 n · 광고 m)과 메타 본문 변환·점검(순수 함수, 브라우저·서버 공용)
// 메타 광고 관리자·대량 편집(엑셀)보다 단순하게: 광고계정 기본값(페이지·인스타·픽셀)은 자동, 광고세트는 기존 세트 설정 복사 또는 핵심 4칸(성별·연령·예산·시작),
// 소재는 파일을 놓으면 파일명으로 피드(1:1·4:5)와 스토리·릴스(9:16)를 한 광고로 짝짓고(게재 위치 맞춤 asset_feed_spec — 르무통 실소재와 같은 구조),
// 광고세트 × 광고는 기본 전부 연결. 실행 전에는 메타에 아무것도 보내지 않는다.

// ── 캠페인 목표 ──────────────────────────────────────
export type MetaObjective = "OUTCOME_SALES" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_APP_PROMOTION";
// 새로 만들 수 있는 목표(웹사이트로 보내는 이미지·영상 광고) — 앱 홍보·참여(메시지·게시물)는 대상이 달라 제외
export const NEW_OBJECTIVES: { key: MetaObjective; label: string; desc: string }[] = [
  { key: "OUTCOME_SALES", label: "판매", desc: "픽셀 구매 전환 최대화" },
  { key: "OUTCOME_TRAFFIC", label: "트래픽", desc: "랜딩 페이지 조회·링크 클릭" },
  { key: "OUTCOME_AWARENESS", label: "인지도", desc: "도달 최대화" },
  { key: "OUTCOME_LEADS", label: "잠재 고객", desc: "웹사이트 리드(픽셀 LEAD)" },
];
export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: "판매",
  OUTCOME_TRAFFIC: "트래픽",
  OUTCOME_AWARENESS: "인지도",
  OUTCOME_ENGAGEMENT: "참여",
  OUTCOME_LEADS: "잠재 고객",
  OUTCOME_APP_PROMOTION: "앱 홍보",
};
// 이 도구로 광고세트·광고를 추가할 수 있는 기존 캠페인 목표
export const SUPPORTED_OBJECTIVES: string[] = ["OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_LEADS", "OUTCOME_ENGAGEMENT"];

// 목표별 새 광고세트 최적화 — 2026-10-09 르무통 계정 validate_only 실검증(판매·인지·리드 전부 통과, 판매+랜딩 조회·링크 클릭은 메타가 거절 2490408). 트래픽·참여는 기존 캠페인이 없어 미검증
export const OPTIMIZATION: Record<string, { goal: string; label: string; event?: string; needsPixel: boolean }[]> = {
  OUTCOME_SALES: [
    { goal: "OFFSITE_CONVERSIONS", label: "구매 전환", event: "PURCHASE", needsPixel: true },
    { goal: "OFFSITE_CONVERSIONS", label: "장바구니 담기", event: "ADD_TO_CART", needsPixel: true },
    { goal: "VALUE", label: "구매 전환 값(ROAS)", event: "PURCHASE", needsPixel: true },
  ],
  OUTCOME_TRAFFIC: [
    { goal: "LANDING_PAGE_VIEWS", label: "랜딩 페이지 조회", needsPixel: false },
    { goal: "LINK_CLICKS", label: "링크 클릭", needsPixel: false },
    { goal: "REACH", label: "도달", needsPixel: false },
  ],
  OUTCOME_AWARENESS: [
    { goal: "REACH", label: "도달", needsPixel: false },
    { goal: "IMPRESSIONS", label: "노출", needsPixel: false },
    { goal: "THRUPLAY", label: "ThruPlay(영상 15초 조회)", needsPixel: false },
  ],
  OUTCOME_LEADS: [
    { goal: "OFFSITE_CONVERSIONS", label: "리드(픽셀 LEAD)", event: "LEAD", needsPixel: true },
    { goal: "OFFSITE_CONVERSIONS", label: "회원가입 완료", event: "COMPLETE_REGISTRATION", needsPixel: true },
  ],
  OUTCOME_ENGAGEMENT: [
    { goal: "LINK_CLICKS", label: "링크 클릭", needsPixel: false },
    { goal: "THRUPLAY", label: "ThruPlay(영상 15초 조회)", needsPixel: false },
  ],
};

// ── 행동 유도(CTA) ───────────────────────────────────
export const CTAS: { key: string; label: string }[] = [
  { key: "LEARN_MORE", label: "더 알아보기" },
  { key: "SHOP_NOW", label: "지금 구매하기" },
  { key: "BUY_NOW", label: "구매하기" },
  { key: "ORDER_NOW", label: "지금 주문하기" },
  { key: "SIGN_UP", label: "가입하기" },
  { key: "APPLY_NOW", label: "지금 신청하기" },
  { key: "BOOK_TRAVEL", label: "예약하기" },
  { key: "GET_OFFER", label: "혜택 받기" },
  { key: "SUBSCRIBE", label: "구독하기" },
  { key: "CONTACT_US", label: "문의하기" },
  { key: "DOWNLOAD", label: "다운로드" },
  { key: "WATCH_MORE", label: "더 보기" },
  { key: "NO_BUTTON", label: "버튼 없음" },
];
export const CTA_LABEL: Record<string, string> = Object.fromEntries(CTAS.map((c) => [c.key, c.label]));

// ── 게재 위치 ────────────────────────────────────────
// auto = Advantage+ 게재 위치(위치 칸을 보내지 않음) / standard = 르무통 표준(2026-10-09 실세팅 64개 중 52개와 같은 FB 8곳 + IG 지면)
// v25는 IG 탐색 홈(explore_home)을 넣으면 탐색(explore)도 같이 넣어야 함(2490392 — validate_only 확인). v26에서 explore 폐지 예정
export type PlacementMode = "auto" | "standard" | "feed_only" | "vertical_only" | "ig_all" | "ig_reels";
export const PLACEMENT_MODES: { key: PlacementMode; label: string; desc: string }[] = [
  { key: "auto", label: "Advantage+ 게재 위치", desc: "메타가 자동 배분" },
  { key: "standard", label: "FB·IG 전체", desc: "피드·스토리·릴스·탐색·검색 등 — 메신저·오디언스 네트워크 제외(르무통 표준)" },
  { key: "feed_only", label: "피드만", desc: "FB 피드·IG 피드·탐색" },
  { key: "vertical_only", label: "스토리·릴스만", desc: "세로 9:16 지면" },
  { key: "ig_all", label: "인스타그램만", desc: "IG 피드·스토리·릴스·탐색·검색" },
  { key: "ig_reels", label: "인스타 릴스만", desc: "IG 릴스" },
];
const IG_ALL = ["stream", "story", "reels", "explore", "explore_home", "profile_feed", "ig_search"];
export function placementSpec(mode: PlacementMode): Record<string, unknown> {
  if (mode === "auto") return {};
  if (mode === "feed_only") return { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed", "profile_feed"], instagram_positions: ["stream", "explore", "explore_home", "profile_feed"] };
  if (mode === "vertical_only") return { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["story", "facebook_reels"], instagram_positions: ["story", "reels"] };
  if (mode === "ig_all") return { publisher_platforms: ["instagram"], instagram_positions: IG_ALL };
  if (mode === "ig_reels") return { publisher_platforms: ["instagram"], instagram_positions: ["reels"] };
  return {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed", "instream_video", "story", "search", "facebook_reels", "facebook_reels_overlay", "profile_feed", "notification"],
    instagram_positions: IG_ALL,
  };
}

// ── 기여 설정 ────────────────────────────────────────
// 르무통 실세팅: 판매·리드 = 7일 클릭·1일 조회·1일 참여 조회(43개), 트래픽·인지 = 1일 클릭(15개). 비우면 목표별 이 값
export type AttributionKey = "7c1v1e" | "7c1v" | "7c" | "1c1v" | "1c";
export const ATTRIBUTIONS: { key: AttributionKey; label: string; spec: { event_type: string; window_days: number }[] }[] = [
  { key: "7c1v1e", label: "7일 클릭·1일 조회·1일 참여 조회", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }, { event_type: "ENGAGED_VIDEO_VIEW", window_days: 1 }] },
  { key: "7c1v", label: "7일 클릭·1일 조회", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }] },
  { key: "7c", label: "7일 클릭", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }] },
  { key: "1c1v", label: "1일 클릭·1일 조회", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }, { event_type: "VIEW_THROUGH", window_days: 1 }] },
  { key: "1c", label: "1일 클릭", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }] },
];
export const defaultAttribution = (objective: string): AttributionKey => (objective === "OUTCOME_SALES" || objective === "OUTCOME_LEADS" ? "7c1v1e" : "1c");
export function attributionKeyOf(spec: unknown): AttributionKey | null {
  if (!Array.isArray(spec) || !spec.length) return null;
  const k = (spec as { event_type: string; window_days: number }[]).map((x) => `${x.event_type}${x.window_days}`).sort().join("+");
  return ATTRIBUTIONS.find((a) => a.spec.map((x) => `${x.event_type}${x.window_days}`).sort().join("+") === k)?.key ?? null;
}
// 브랜드 세이프티 — 르무통 실세팅 64개 중 58개 값(완화 인벤토리). 새 세트 기본
export const BRAND_SAFETY = ["FACEBOOK_RELAXED", "FEED_RELAXED"];

// 소재 게재 위치 맞춤 — 세로(9:16) 소재를 쓸 위치. 나머지 위치는 피드 소재
export const VERTICAL_POSITIONS = { facebook_positions: ["story", "facebook_reels"], instagram_positions: ["story", "reels", "ig_search"] };

// ── 광고계정 문맥(서버가 한 번에 읽어 줌) ─────────────
export type MetaPage = { id: string; name: string; igId: string | null; igUsername: string | null };
export type MetaPixel = { id: string; name: string; lastFired: string | null };
export type MetaCampaignLite = {
  id: string;
  name: string;
  objective: string;
  status: string; // effective_status
  dailyBudget: number | null; // 캠페인 예산(CBO)이면 값
  lifetimeBudget: number | null;
  bidStrategy: string | null;
  buyingType: string;
};
export type MetaAdSetLite = {
  id: string;
  name: string;
  status: string;
  optimizationGoal: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  ageMin: number | null;
  ageMax: number | null;
  genders: number[];
  advantageAudience: boolean;
  pixelEvent: string | null;
  placements: string; // 요약 문구
  startTime: string | null;
  endTime: string | null;
  attribution: AttributionKey | null;
  includeAudiences: { id: string; name: string }[];
  excludeAudiences: { id: string; name: string }[];
};
export type MetaAudience = { id: string; name: string; subtype: string; size: number | null; ok: boolean };
export type MetaAccountCtx = {
  act: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: number;
  minDailyBudget: number; // 통화 단위(원)
  offset: number; // 메타 금액 단위 배율(KRW = 1)
  pages: MetaPage[];
  pixels: MetaPixel[];
  campaigns: MetaCampaignLite[];
  appUsage: number | null;
};

// ── 소재 파일 ────────────────────────────────────────
export type Ratio = "9:16" | "4:5" | "1:1" | "1.91:1" | "기타";
export type MediaKind = "image" | "video";
export type MediaItem = { id: string; name: string; kind: MediaKind; width: number; height: number; size: number; duration?: number; url: string };

export function ratioOf(w: number, h: number): Ratio {
  const r = w / h;
  if (r <= 0.6) return "9:16";
  if (r >= 0.74 && r <= 0.84) return "4:5";
  if (r >= 0.95 && r <= 1.05) return "1:1";
  if (r >= 1.7 && r <= 2.05) return "1.91:1";
  return "기타";
}
export const isVertical = (m: { width: number; height: number }) => ratioOf(m.width, m.height) === "9:16";

// 파일명에서 비율·지면 표시를 지운 '짝 키' — fall_01_feed.jpg 와 fall_01_story.jpg, ev07_45.jpg 와 ev07_916.jpg 를 같은 광고로
const PAIR_TOKENS = /(^|[_\-\s.])(feed|fd|story|stories|st|reels?|rl|sq|square|vertical|vert|portrait|pt|ls|landscape|9x16|916|9-16|4x5|45|4-5|1x1|11|1-1|191|1\.91|1080x1920|1080x1350|1080x1080|1200x628|v|h|세로|가로|피드|스토리|릴스|정사각)(?=$|[_\-\s.])/gi;
export function pairKey(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  let k = stem;
  for (let i = 0; i < 3; i++) k = k.replace(PAIR_TOKENS, "$1");
  return k.replace(/[_\-\s.]+/g, "_").replace(/^_+|_+$/g, "") || stem;
}
// 광고 이름 기본값 — 짝지은 광고는 파일명에서 비율·지면 표시를 뺀 것, 단독 소재는 파일명 그대로(확장자만 제외)
const stemOf = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
export function pairedName(fileName: string) {
  let k = stemOf(fileName);
  for (let i = 0; i < 3; i++) k = k.replace(PAIR_TOKENS, "$1");
  return k.replace(/[_\-\s.]{2,}/g, "_").replace(/^[_\-\s.]+|[_\-\s.]+$/g, "") || stemOf(fileName);
}

// ── 초안 ─────────────────────────────────────────────
export type Copy = { message: string; headline: string; description: string; cta: string; url: string };
export const EMPTY_COPY: Copy = { message: "", headline: "", description: "", cta: "", url: "" };
export const COPY_FIELDS: { key: keyof Copy; label: string; max: number; hint: string }[] = [
  { key: "message", label: "기본 문구(본문)", max: 2200, hint: "피드 위 본문 — 125자 안쪽이 잘리지 않음" },
  { key: "headline", label: "제목", max: 255, hint: "40자 안쪽 권장" },
  { key: "description", label: "설명", max: 255, hint: "선택 — 일부 지면만 노출" },
  { key: "cta", label: "버튼", max: 40, hint: "" },
  { key: "url", label: "랜딩 URL", max: 1000, hint: "https://" },
];

// 광고 하나 = 피드 소재(+ 세로 소재) + 문구(비우면 공통 문구)
// productExt = 상품 확장(카탈로그 상품을 광고 아래 노출, 르무통 실소재 43%가 켬). 없으면 끔
export type AdDraft = { key: string; name: string; feed: string | null; vertical: string | null; copy: Copy; productExt?: boolean };

export type AdSetMode = "new" | "copy" | "existing";
export type AdSetDraft = {
  key: string;
  mode: AdSetMode;
  sourceId: string | null; // copy = 설정을 복사할 세트 / existing = 광고를 넣을 세트
  name: string;
  gender: "all" | "m" | "f";
  ageMin: number;
  ageMax: number;
  advantageAudience: boolean;
  budget: number | null; // 일 예산(원) — 캠페인 예산(CBO)이면 비움
  startDate: string; // YYYY-MM-DD(한국) — 비우면 바로
  endDate: string;
  optimization: number; // OPTIMIZATION[objective] 순번
  placement: PlacementMode;
  attribution: AttributionKey | null; // null = 목표 기본. 복사 세트는 바꿀 수 없음(원본 그대로)
  sourceEnd?: string | null; // 복사 원본의 종료 시각 — 이미 지났으면 새 종료일 필수
  includeAudiences: string[] | null; // 맞춤·유사 타겟 id. null = 없음(복사는 원본 유지)
  excludeAudiences: string[] | null;
  ads: string[]; // 연결할 광고 key
};

export type CampaignDraft = {
  mode: "existing" | "new";
  existingId: string | null;
  name: string;
  objective: MetaObjective;
  cbo: boolean;
  budget: number | null; // CBO 일 예산
};

export type Defaults = { pageId: string; igId: string; pixelId: string; copy: Copy; urlTags: string; useUtm: boolean; turnOn: boolean; aiEnhance: boolean };

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

const mmdd = (d = new Date(Date.now() + 9 * 3600_000)) => d.toISOString().slice(5, 10).replace("-", "");
export function adSetAutoName(a: Pick<AdSetDraft, "gender" | "ageMin" | "ageMax">, suffix = "") {
  const g = a.gender === "all" ? "a" : a.gender;
  const age = a.ageMin <= 18 && a.ageMax >= 65 ? "all" : `${a.ageMin}${a.ageMax >= 65 ? "65" : a.ageMax}`;
  return `${mmdd()}_${g}${age}${suffix}`;
}
export function newAdSet(over: Partial<AdSetDraft> = {}): AdSetDraft {
  const base: AdSetDraft = { key: uid("s"), mode: "new", sourceId: null, name: "", gender: "all", ageMin: 25, ageMax: 65, advantageAudience: false, budget: 50000, startDate: "", endDate: "", optimization: 0, placement: "auto", attribution: null, includeAudiences: null, excludeAudiences: null, ads: [], ...over };
  if (!base.name) base.name = adSetAutoName(base);
  return base;
}

// 파일 목록 → 광고 초안(짝 키가 같은 '세로 1 + 세로 아님 1'이고 종류가 같으면 한 광고, 나머지는 각각)
export function adsFromMedia(items: MediaItem[], existingKeys: Set<string> = new Set()): AdDraft[] {
  const groups = new Map<string, MediaItem[]>();
  for (const m of items) {
    const k = `${m.kind}:${pairKey(m.name)}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const out: AdDraft[] = [];
  for (const g of groups.values()) {
    const v = g.filter(isVertical);
    const f = g.filter((m) => !isVertical(m));
    if (v.length === 1 && f.length === 1) {
      out.push({ key: uid("a"), name: pairedName(f[0].name), feed: f[0].id, vertical: v[0].id, copy: { ...EMPTY_COPY } });
      continue;
    }
    for (const m of g) out.push({ key: uid("a"), name: stemOf(m.name), feed: isVertical(m) ? null : m.id, vertical: isVertical(m) ? m.id : null, copy: { ...EMPTY_COPY } });
  }
  // 같은 이름이 겹치면 뒤에 _2
  const used = new Set(existingKeys);
  for (const a of out) {
    let n = a.name;
    for (let i = 2; used.has(n); i++) n = `${a.name}_${i}`;
    a.name = n;
    used.add(n);
  }
  return out;
}

export const copyOf = (ad: AdDraft, common: Copy): Copy => ({
  message: ad.copy.message || common.message,
  headline: ad.copy.headline || common.headline,
  description: ad.copy.description || common.description,
  cta: ad.copy.cta || common.cta || "LEARN_MORE",
  url: ad.copy.url || common.url,
});

// UTM — url_tags(메타가 랜딩 URL 뒤에 붙임, 동적 매크로 사용). 랜딩에 utm_이 이미 있으면 붙이지 않는다
// {형식} = 영상이면 video, 이미지면 display(르무통 실소재 규칙 utm_medium=display|video) — 실행 때 광고마다 바꿔 넣는다
export const DEFAULT_URL_TAGS = "utm_source=meta&utm_medium={형식}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

// ── 메타 본문 ─────────────────────────────────────────
export function campaignBody(c: CampaignDraft, turnOn: boolean, offset: number): Record<string, unknown> {
  const b: Record<string, unknown> = { name: c.name.trim(), objective: c.objective, status: turnOn ? "ACTIVE" : "PAUSED", special_ad_categories: [], buying_type: "AUCTION" };
  if (c.cbo) {
    b.daily_budget = Math.round((c.budget ?? 0) * offset);
    b.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  } else {
    // 광고세트 예산(ABO) 캠페인은 세트 간 예산 공유 여부를 반드시 보내야 함(v24+). 공유 안 함 = 기존 ABO와 같은 동작
    b.is_adset_budget_sharing_enabled = false;
  }
  return b;
}

const kstIso = (date: string, end = false) => `${date}T${end ? "23:59:00" : "00:00:00"}+0900`;

export function targetingOf(a: AdSetDraft): Record<string, unknown> {
  const t: Record<string, unknown> = {
    geo_locations: { countries: ["KR"], location_types: ["home", "recent"] },
    age_min: a.ageMin,
    age_max: a.ageMax,
    ...placementSpec(a.placement),
    brand_safety_content_filter_levels: BRAND_SAFETY,
    targeting_automation: { advantage_audience: a.advantageAudience ? 1 : 0 },
  };
  if (a.gender !== "all") t.genders = [a.gender === "m" ? 1 : 2];
  if (a.includeAudiences?.length) t.custom_audiences = a.includeAudiences.map((id) => ({ id }));
  if (a.excludeAudiences?.length) t.excluded_custom_audiences = a.excludeAudiences.map((id) => ({ id }));
  return t;
}

export function adSetBody(a: AdSetDraft, ctx: { campaignId: string; objective: string; cbo: boolean; pixelId: string; offset: number; turnOn: boolean }): Record<string, unknown> {
  const opt = (OPTIMIZATION[ctx.objective] ?? OPTIMIZATION.OUTCOME_TRAFFIC)[a.optimization] ?? OPTIMIZATION.OUTCOME_TRAFFIC[0];
  const b: Record<string, unknown> = {
    name: a.name.trim(),
    campaign_id: ctx.campaignId,
    status: ctx.turnOn ? "ACTIVE" : "PAUSED",
    optimization_goal: opt.goal,
    billing_event: "IMPRESSIONS",
    targeting: targetingOf(a),
  };
  if (opt.event) b.promoted_object = { pixel_id: ctx.pixelId, custom_event_type: opt.event };
  if (opt.goal === "LANDING_PAGE_VIEWS" || opt.goal === "LINK_CLICKS") b.destination_type = "WEBSITE";
  b.attribution_spec = ATTRIBUTIONS.find((x) => x.key === (a.attribution ?? defaultAttribution(ctx.objective)))!.spec;
  if (!ctx.cbo) {
    b.daily_budget = Math.round((a.budget ?? 0) * ctx.offset);
    b.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  }
  b.start_time = a.startDate ? kstIso(a.startDate) : new Date(Date.now() + 5 * 60_000).toISOString();
  if (a.endDate) b.end_time = kstIso(a.endDate, true);
  return b;
}

// 복사(설정 복사) 뒤 덮어쓸 칸 — 이름·예산·기간·성별·연령은 화면 값, 기여·맞춤 타겟은 지정했을 때만
export function copyOverrides(a: AdSetDraft, src: { targeting?: Record<string, unknown>; attribution_spec?: unknown } | null, ctx: { cbo: boolean; offset: number }): Record<string, unknown> {
  const b: Record<string, unknown> = { name: a.name.trim() };
  if (!ctx.cbo && a.budget) b.daily_budget = Math.round(a.budget * ctx.offset);
  if (a.startDate) b.start_time = kstIso(a.startDate);
  if (a.endDate) b.end_time = kstIso(a.endDate, true);
  // 기여 설정은 세트를 만든 뒤 바꿀 수 없음(1504040, 2026-10-09 르무통 실검증) — 복사 세트는 원본 그대로. 다르게 하려면 새로 만들기
  // 타겟팅은 성별·연령·맞춤 타겟을 바꿨을 때만 다시 보낸다(원본 타겟팅을 통째로 되돌려 보내면 읽기 전용 칸 때문에 거절될 수 있음)
  if (src?.targeting) {
    const now = targetingBrief(src.targeting);
    const ids = (v: unknown) => (Array.isArray(v) ? (v as { id: string }[]).map((x) => x.id).sort().join(",") : "");
    const incChanged = a.includeAudiences !== null && ids(src.targeting.custom_audiences) !== [...a.includeAudiences].sort().join(",");
    const excChanged = a.excludeAudiences !== null && ids(src.targeting.excluded_custom_audiences) !== [...a.excludeAudiences].sort().join(",");
    if (now.gender !== a.gender || now.ageMin !== a.ageMin || now.ageMax !== a.ageMax || incChanged || excChanged) {
      const t: Record<string, unknown> = { ...src.targeting, age_min: a.ageMin, age_max: a.ageMax };
      // 조회에는 나오지만 다시 보내면 거절되는 칸(폐지·읽기 전용) — targeting_optimization은 1870197로 실제 거절 확인
      for (const k of TARGETING_READ_ONLY) delete t[k];
      // 옛 세트는 IG 탐색 홈만 있고 탐색이 없음 — v25는 둘을 같이 요구(2490392)
      const ig = t.instagram_positions;
      if (Array.isArray(ig) && ig.includes("explore_home") && !ig.includes("explore")) t.instagram_positions = [...ig, "explore"];
      if (a.gender === "all") delete t.genders;
      else t.genders = [a.gender === "m" ? 1 : 2];
      if (incChanged) {
        if (a.includeAudiences!.length) t.custom_audiences = a.includeAudiences!.map((id) => ({ id }));
        else delete t.custom_audiences;
      }
      if (excChanged) {
        if (a.excludeAudiences!.length) t.excluded_custom_audiences = a.excludeAudiences!.map((id) => ({ id }));
        else delete t.excluded_custom_audiences;
      }
      b.targeting = t;
    }
  }
  return b;
}

const TARGETING_READ_ONLY = ["targeting_optimization", "age_range"];

// 메타 타겟팅 → 화면 칸(성별·연령). genders 없음·[0]·[1,2] = 전체
export function targetingBrief(t: { age_min?: unknown; age_max?: unknown; genders?: unknown }): { gender: AdSetDraft["gender"]; ageMin: number; ageMax: number } {
  const g = Array.isArray(t.genders) ? (t.genders as number[]).filter((x) => x === 1 || x === 2) : [];
  return { gender: g.length === 1 ? (g[0] === 1 ? "m" : "f") : "all", ageMin: Number(t.age_min) || 18, ageMax: Number(t.age_max) || 65 };
}

// 소재 본문 — 피드만/세로만 = object_story_spec 하나, 둘 다 = asset_feed_spec 게재 위치 맞춤(세로 위치 → 세로 소재, 나머지 → 피드 소재)
export type UploadedMedia = { kind: MediaKind; hash?: string; videoId?: string; thumbHash?: string };
export function creativeBody(opts: {
  name: string;
  pageId: string;
  igId: string;
  copy: Copy;
  feed: UploadedMedia | null;
  vertical: UploadedMedia | null;
  urlTags: string;
  aiEnhance: boolean;
  productExt?: boolean;
}): Record<string, unknown> {
  const { copy } = opts;
  const link = copy.url.trim();
  const cta = copy.cta || "LEARN_MORE";
  const ctaSpec = cta === "NO_BUTTON" ? undefined : { type: cta, value: { link } };
  const story: Record<string, unknown> = { page_id: opts.pageId };
  if (opts.igId) story.instagram_user_id = opts.igId;
  const body: Record<string, unknown> = { name: opts.name.slice(0, 100) };
  if (opts.urlTags) body.url_tags = opts.urlTags;
  // AI 보정(밝기·템플릿·텍스트 바꾸기 등) — 끄면 메타 기본 켜짐 기능을 OPT_OUT. 르무통 실소재는 전부 OPT_OUT
  // 상품 확장(product_extensions)은 광고마다 따로 — 르무통 실소재 195개 중 84개가 켬
  if (!opts.aiEnhance) {
    body.degrees_of_freedom_spec = {
      creative_features_spec: Object.fromEntries(AI_FEATURES.map((f) => [f, { enroll_status: f === "product_extensions" && opts.productExt ? "OPT_IN" : "OPT_OUT" }])),
    };
  } else if (!opts.productExt) {
    body.degrees_of_freedom_spec = { creative_features_spec: { product_extensions: { enroll_status: "OPT_OUT" } } };
  }
  const single = opts.feed && opts.vertical ? null : opts.feed ?? opts.vertical;
  if (single) {
    if (single.kind === "image") {
      story.link_data = { image_hash: single.hash, link, message: copy.message, name: copy.headline || undefined, description: copy.description || undefined, call_to_action: ctaSpec };
    } else {
      story.video_data = { video_id: single.videoId, image_hash: single.thumbHash, message: copy.message, title: copy.headline || undefined, link_description: copy.description || undefined, call_to_action: ctaSpec ?? { type: "LEARN_MORE", value: { link } } };
    }
    body.object_story_spec = story;
    return body;
  }
  // 게재 위치 맞춤 — 르무통 실소재와 같은 모양: 규칙마다 소재·문구·제목·랜딩 URL 라벨을 모두 연결한다
  // (랜딩 URL 라벨이 빠지면 영상 소재에서 2446433 '행동 유도 링크의 공유 유형이 잘못됨'으로 거절 — 2026-10-09 실제 오류)
  const f = opts.feed!;
  const v = opts.vertical!;
  const isVideo = f.kind === "video";
  const L = (n: string) => [{ name: `ctch_${n}_v` }, { name: `ctch_${n}_f` }]; // 문구 하나를 두 규칙이 같이 씀 — 규칙마다 다른 라벨
  const asset = (m: UploadedMedia, label: string) => (isVideo ? { video_id: m.videoId, thumbnail_hash: m.thumbHash, adlabels: [{ name: label }] } : { hash: m.hash, adlabels: [{ name: label }] });
  const mediaLabel = isVideo ? "video_label" : "image_label";
  const rule = (side: "v" | "f", spec: Record<string, unknown>, priority: number) => ({
    customization_spec: spec,
    [mediaLabel]: { name: side === "v" ? "ctch_vertical" : "ctch_feed" },
    body_label: { name: `ctch_body_${side}` },
    title_label: { name: `ctch_title_${side}` },
    link_url_label: { name: `ctch_link_${side}` },
    priority,
  });
  body.object_story_spec = story;
  body.asset_feed_spec = {
    [isVideo ? "videos" : "images"]: [asset(f, "ctch_feed"), asset(v, "ctch_vertical")],
    bodies: [{ text: copy.message, adlabels: L("body") }],
    titles: [{ text: copy.headline, adlabels: L("title") }],
    ...(copy.description ? { descriptions: [{ text: copy.description }] } : {}),
    link_urls: [{ website_url: link, adlabels: L("link") }],
    call_to_action_types: [cta === "NO_BUTTON" ? "LEARN_MORE" : cta],
    ad_formats: [isVideo ? "SINGLE_VIDEO" : "SINGLE_IMAGE"],
    optimization_type: "PLACEMENT",
    asset_customization_rules: [
      rule("v", { age_min: 13, age_max: 65, publisher_platforms: ["facebook", "instagram"], ...VERTICAL_POSITIONS }, 1),
      // 나머지 전부 = 피드 소재(르무통 실소재의 마지막 규칙도 위치 없이 연령만 둔 형태)
      rule("f", { age_min: 13, age_max: 65 }, 2),
    ],
  };
  return body;
}
// AI 보정 기능 이름(degrees_of_freedom_spec.creative_features_spec) — 르무통 실소재에 보이는 키 중 이미지·영상 단일 소재에 해당하는 것
export const AI_FEATURES = ["image_brightness_and_contrast", "image_templates", "image_touchups", "image_animation", "text_optimizations", "enhance_cta", "inline_comment", "site_extensions", "cv_transformation", "show_destination_blurbs", "product_extensions"];

// ── 점검 ─────────────────────────────────────────────
export type Problem = { where: string; text: string; target?: string };
const isUrl = (u: string) => /^https?:\/\/[^\s]+\.[^\s]+/.test(u.trim());

export function problemsOf(opts: {
  campaign: CampaignDraft;
  campaignObjective: string | null; // 기존 캠페인 목표
  campaignCbo: boolean;
  adSets: AdSetDraft[];
  ads: AdDraft[];
  defaults: Defaults;
  media: Map<string, MediaItem>;
  minDailyBudget: number;
}): Problem[] {
  const p: Problem[] = [];
  const { campaign: c, defaults: d } = opts;
  if (c.mode === "existing" && !c.existingId) p.push({ where: "캠페인", text: "캠페인을 고르세요", target: "campaign" });
  if (c.mode === "new") {
    if (c.name.trim().length < 2) p.push({ where: "캠페인", text: "캠페인 이름을 2자 이상", target: "campaign" });
    if (c.cbo && (!c.budget || c.budget < opts.minDailyBudget)) p.push({ where: "캠페인", text: `캠페인 일 예산은 ${opts.minDailyBudget.toLocaleString("ko-KR")}원 이상`, target: "campaign" });
  }
  const objective = c.mode === "new" ? c.objective : opts.campaignObjective;
  if (!d.pageId) p.push({ where: "기본값", text: "페이지를 고르세요(광고계정에서 홍보 가능한 페이지가 없어요)", target: "defaults" });
  if (!opts.adSets.length) p.push({ where: "광고세트", text: "광고세트를 하나 이상 추가하세요", target: "adsets" });
  for (const a of opts.adSets) {
    const w = `광고세트 ${a.name || "(이름 없음)"}`;
    if (a.mode !== "new" && !a.sourceId) p.push({ where: w, text: a.mode === "copy" ? "설정을 복사할 세트를 고르세요" : "광고를 넣을 세트를 고르세요", target: a.key });
    if (a.mode !== "existing") {
      if (a.name.trim().length < 2) p.push({ where: w, text: "이름 2자 이상", target: a.key });
      if (a.ageMin < 13 || a.ageMax > 65 || a.ageMin > a.ageMax) p.push({ where: w, text: "연령은 13~65, 최소 ≤ 최대", target: a.key });
      if (a.advantageAudience && a.ageMin > 25) p.push({ where: w, text: "Advantage+ 타겟은 최소 연령을 25세 이하로(메타 제한)", target: a.key });
      if (!opts.campaignCbo && a.mode === "new" && (!a.budget || a.budget < opts.minDailyBudget)) p.push({ where: w, text: `일 예산 ${opts.minDailyBudget.toLocaleString("ko-KR")}원 이상`, target: a.key });
      if (a.endDate && a.startDate && a.endDate < a.startDate) p.push({ where: w, text: "종료일이 시작일보다 빨라요", target: a.key });
      if (a.mode === "copy" && a.sourceEnd && new Date(a.sourceEnd).getTime() < Date.now() && !a.endDate) p.push({ where: w, text: "원본 세트가 이미 종료됐어요 — 종료일(필요하면 시작일도)을 새로 정하세요", target: a.key });
      if (a.mode === "new" && objective) {
        const opt = OPTIMIZATION[objective]?.[a.optimization];
        if (opt?.needsPixel && !d.pixelId) p.push({ where: w, text: "전환 최적화에는 픽셀이 필요해요", target: "defaults" });
      }
    }
    if (!a.ads.length) p.push({ where: w, text: "연결된 광고가 없어요", target: a.key });
  }
  if (!opts.ads.length) p.push({ where: "광고", text: "소재 파일을 올리세요", target: "ads" });
  for (const ad of opts.ads) {
    const w = `광고 ${ad.name}`;
    const cp = copyOf(ad, d.copy);
    if (!ad.name.trim()) p.push({ where: w, text: "광고 이름이 비었어요", target: ad.key });
    if (!isUrl(cp.url)) p.push({ where: w, text: "랜딩 URL(https://…)이 필요해요", target: ad.key });
    if (!cp.message.trim()) p.push({ where: w, text: "기본 문구가 비었어요", target: ad.key });
    const f = ad.feed ? opts.media.get(ad.feed) : null;
    const v = ad.vertical ? opts.media.get(ad.vertical) : null;
    if (!f && !v) p.push({ where: w, text: "소재 파일이 없어요", target: ad.key });
    if (f && v && f.kind !== v.kind) p.push({ where: w, text: "피드·세로 소재는 둘 다 이미지거나 둘 다 영상이어야 해요", target: ad.key });
    if (!opts.adSets.some((a) => a.ads.includes(ad.key))) p.push({ where: w, text: "어느 광고세트에도 연결되지 않았어요", target: ad.key });
  }
  return p;
}
