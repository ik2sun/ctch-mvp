// 캠페인 오토파일럿 · 카카오모먼트 — 순수 모델(브라우저·서버 공용): 유형·규격·초안·본문·점검
// 공식 문서(2026-10-15 확인): developers.kakao.com/docs/ko/kakaomoment/{ad-group,creatives-display,type-info}
//  · 캠페인 유형 = 소재 형식: 카카오 비즈보드 → IMAGE_BANNER / 디스플레이 → IMAGE_NATIVE / 동영상 → VIDEO_NATIVE(2026-09-28 추가)
//  · 광고그룹 생성 5초/1회, 소재 생성 1초/1회. 검증 전용(validate_only) 호출은 없다 → 화면 점검이 유일한 사전 확인
//  · 소재 이미지·영상은 공개 URL(imageFileUrl·videoFileUrl)로 넘긴다 — 브라우저 → 스토리지(shortform 버킷) → 카카오가 받아 감
// 르무통 실데이터(486767, 2026-10-15): 켜진 캠페인 = 비즈보드 전환 5 · 디스플레이 전환 5(+맵브랜딩 정산형). 광고그룹은 AUTOBID·CPC·bidAmount 0
// (전환수 최대화), 기기 ANDROID·IOS, 지면 DAUM·KAKAO_SERVICE·KAKAO_TALK, 연령 25~70, 소재는 게재빈도 하루 3회(DAY_IMP 3/24)

export type KakaoType = "TALK_BIZ_BOARD" | "DISPLAY" | "VIDEO";
export type KakaoFormat = "IMAGE_BANNER" | "IMAGE_NATIVE" | "VIDEO_NATIVE";
export const FORMAT_OF: Record<KakaoType, KakaoFormat> = { TALK_BIZ_BOARD: "IMAGE_BANNER", DISPLAY: "IMAGE_NATIVE", VIDEO: "VIDEO_NATIVE" };
export const TYPE_LABEL: Record<string, string> = {
  TALK_BIZ_BOARD: "비즈보드",
  DISPLAY: "디스플레이",
  VIDEO: "동영상",
  PRODUCT_CATALOG: "상품 카탈로그",
  TALK_BIZ_BOARD_RESERVED: "비즈보드 CPT",
  TALK_CHANNEL: "카카오톡 채널",
  PERSONAL_MESSAGE: "개인화 메시지",
  FOCUS_FULL_VIEW: "포커스 풀뷰",
  PROFILE_FULL_VIEW: "프로필 풀뷰",
  PC_TALK_BOTTOM: "포커스 보드",
  PC_TALK_RICH_POP: "리치팝",
  DAUM_SHOPPING: "다음쇼핑",
  SETTLEMENT_ONLY: "정산형",
};
export const GOAL_LABEL: Record<string, string> = { CONVERSION: "전환", VISITING: "방문", REACH: "도달", VIEW: "조회" };
export const FORMAT_LABEL: Record<KakaoFormat, string> = { IMAGE_BANNER: "비즈보드 배너", IMAGE_NATIVE: "네이티브 이미지", VIDEO_NATIVE: "동영상 네이티브" };
// 자동 세팅 지원(공식 '생성·수정 가능' 유형 중 웹 소재로 만드는 것)
export const SUPPORTED_KINDS = ["TALK_BIZ_BOARD_CONVERSION", "TALK_BIZ_BOARD_VISITING", "DISPLAY_CONVERSION", "DISPLAY_VISITING", "VIDEO_VIEW"];

export type KakaoCampaignLite = {
  id: string;
  name: string;
  on: boolean; // config ON
  statusText: string;
  type: string; // CampaignType(상세를 못 읽었으면 "")
  goal: string;
  objectiveDetail: string | null; // 전환 목표 대상(PURCHASE 등)
  dailyBudget: number | null; // 캠페인 일 예산(없으면 한도 없음)
};
export const kindOf = (c: { type: string; goal: string }) => `${c.type}_${c.goal}`;
export const formatOfCampaign = (c: { type: string }): KakaoFormat | null => FORMAT_OF[c.type as KakaoType] ?? null;
export function lockReason(c: KakaoCampaignLite): string | null {
  if (!c.type) return "캠페인 유형을 읽지 못했어요";
  if (SUPPORTED_KINDS.includes(kindOf(c))) return null;
  if (c.type === "TALK_BIZ_BOARD" || c.type === "DISPLAY" || c.type === "VIDEO") return `${TYPE_LABEL[c.type]} × ${GOAL_LABEL[c.goal] ?? c.goal} 캠페인은 카카오 API가 생성을 지원하지 않아요`;
  return `${TYPE_LABEL[c.type] ?? c.type} 캠페인은 자동 세팅을 지원하지 않아요(비즈보드·디스플레이·동영상만)`;
}
export const OBJECTIVE_DETAIL_LABEL: Record<string, string> = { PURCHASE: "구매", COMPLETE_REGISTRATION: "회원가입", SIGN_UP: "서비스신청", CART: "장바구니", PARTICIPATION: "잠재고객", APP_INSTALL: "앱설치", ADD_FRIEND: "채널 친구 추가" };

// ── 광고그룹 ─────────────────────────────────────────
export const AGE_BUCKETS = ["15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70"];
export const ageBucketLabel = (b: string) => (b === "70" ? "70+" : `${b}-${Number(b) + 4}`);
// 국내 전체(locationType ALL)일 때 보내는 시/도 코드 — 르무통 실데이터(2026-10-15, 해외 Z 제외·알수없음 U 포함)
export const ALL_LOCATIONS: { value: string; description: string }[] = [
  ["A", "강원특별자치도"], ["B", "경기도"], ["C", "경상남도"], ["D", "경상북도"], ["E", "광주광역시"], ["F", "대구광역시"], ["G", "대전광역시"], ["H", "부산광역시"], ["I", "서울특별시"], ["J", "울산광역시"],
  ["K", "인천광역시"], ["L", "전라남도"], ["M", "전북특별자치도"], ["N", "제주특별자치도"], ["O", "충청남도"], ["P", "충청북도"], ["Q", "세종특별자치시"], ["R", "전남광주통합특별시"], ["U", "알수없음"],
].map(([value, description]) => ({ value, description }));

export type KakaoAdGroupLite = {
  id: string;
  name: string;
  on: boolean;
  statusText: string;
  dailyBudget: number | null;
  bidStrategy: string; // MANUAL | AUTOBID | OPTIMIZATION
  pricingType: string;
  bidAmount: number;
  bidTarget: { type: string; value: number } | null;
  genders: string[]; // [] = 전체
  ages: string[]; // [] = 전체
  adult: boolean;
  beginDate: string | null;
  endDate: string | null;
  deviceTypes: string[];
  placements: string[];
  audience: string[]; // 맞춤타겟 요약(고객데이터·픽셀·광고반응·채널 등 n개)
  locations: string; // "국내 전체" / "지역 n곳"
  creativeCount: number;
};

export type Gender = "all" | "m" | "f";
export type BidSpec = { strategy: "AUTOBID" | "MANUAL"; amount: number; target: { type: string; value: number } | null };

export type AdGroupDraft = {
  key: string;
  mode: "existing" | "copy" | "new";
  sourceId: string | null; // existing = 그 광고그룹 / copy = 설정 원본
  name: string;
  gender: Gender | null; // null = 원본 그대로(복사) / 전체(새로)
  ages: string[] | null; // null = 원본 그대로 / [] = 전체
  budget: number | null; // null = 원본 그대로(복사)
  beginDate: string; // "" = 원본(지났으면 오늘) / 오늘
  endDate: string; // "" = 원본 그대로 / "none" = 종료일 없음
  bid: BidSpec | null; // null = 원본 그대로 / 유형 기본
  creatives: string[]; // 넣을 소재 key
};

export const BUDGET_MIN = 10_000;
export const BUDGET_MAX = 500_000_000;
// 수동 입찰 최소·기본(공식 표) — 유형 × 과금
export const MANUAL_BID: Record<string, Record<string, { def: number; min: number }>> = {
  DISPLAY: { CPC: { def: 200, min: 10 }, CPM: { def: 1000, min: 100 }, CPA: { def: 1500, min: 100 } },
  TALK_BIZ_BOARD: { CPC: { def: 200, min: 10 }, CPM: { def: 3000, min: 1000 } },
  VIDEO: { CPV: { def: 20, min: 10 } },
};
export const BID_TARGET_LABEL: Record<string, string> = { TARGET_CPC: "CPC 비용 목표", TARGET_CPA: "CPA 비용 목표", TARGET_ROAS: "ROAS 목표", MAXIMIZE_CONVERSION_VALUE: "전환 가치 최대화" };

export function bidLabel(g: Pick<KakaoAdGroupLite, "bidStrategy" | "pricingType" | "bidAmount" | "bidTarget">, goal = ""): string {
  if (g.bidStrategy === "AUTOBID") {
    if (g.bidTarget) return g.bidTarget.type === "MAXIMIZE_CONVERSION_VALUE" ? "전환 가치 최대화" : `${BID_TARGET_LABEL[g.bidTarget.type] ?? g.bidTarget.type} ${g.bidTarget.value.toLocaleString("ko-KR")}${g.bidTarget.type === "TARGET_ROAS" ? "%" : "원"}`;
    return goal === "CONVERSION" ? "전환수 최대화" : "클릭수 최대화";
  }
  if (g.bidStrategy === "OPTIMIZATION") return "목적 최적화";
  return `수동 ${g.pricingType} ${g.bidAmount.toLocaleString("ko-KR")}원`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const todayKst = () => {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const addMonths = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

// 원본 광고그룹 GET 응답 → 생성 본문(요청에 쓰는 칸만). 응답 전용(id·status·creativeCount…)과 null은 뺀다
const COPY_KEYS = ["placements", "adServingCategories", "sectionCategories", "allAvailableDeviceType", "allAvailablePlacement", "deviceTypes", "targeting", "adult", "dailyBudgetAmount", "bidStrategy", "pricingType", "bidAmount", "bidStrategyTarget", "pacing", "schedule"] as const;
const TARGET_DROP = new Set(["adAccountId"]);
const SCHEDULE_KEYS = ["beginDate", "endDate", "lateNight", "detailTime", "mondayTime", "tuesdayTime", "wednesdayTime", "thursdayTime", "fridayTime", "saturdayTime", "sundayTime"];
function clean(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));
}

export type AdGroupBodyCtx = { campaignId: string; campaignType: string; campaignGoal: string; campaignBudget: number | null; today: string };

// 설정 복사 — 원본 본문 위에 화면·시트 값만 덮는다. 원본의 지난 시작일은 오늘로(카카오: 시작일은 오늘부터 6개월 이내)
export type GroupSettings = Omit<AdGroupDraft, "key" | "creatives">;
export function copyAdGroupBody(src: Record<string, unknown>, d: GroupSettings, ctx: AdGroupBodyCtx): { body: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  const b: Record<string, unknown> = {};
  for (const k of COPY_KEYS) if (src[k] !== undefined && src[k] !== null) b[k] = src[k];
  const t = clean(Object.fromEntries(Object.entries((src.targeting as Record<string, unknown>) ?? {}).filter(([k]) => !TARGET_DROP.has(k))));
  if (t.type === "DISPLAY") {
    // 오디언스(저장된 타겟)를 쓰는 원본 — 나머지 타겟 칸은 비워서 보내야 하므로 성별·연령 덮기 불가
    if (d.gender !== null || d.ages !== null) problems.push("원본이 저장된 오디언스를 써서 성별·연령은 바꿀 수 없어요(칸을 비우세요)");
    b.targeting = { type: "DISPLAY", id: t.id };
  } else {
    applyDemo(t, d, !!src.adult, problems);
    b.targeting = t;
  }
  if (src.bidStrategy === "OPTIMIZATION") problems.push("원본 입찰이 '목적 최적화'라 API로 복사할 수 없어요 — 다른 원본을 고르거나 비워서 새로 만드세요");
  if (d.budget !== null) b.dailyBudgetAmount = d.budget;
  if (d.bid) applyBid(b, d.bid, ctx);
  const s = Object.fromEntries(Object.entries((src.schedule as Record<string, unknown>) ?? {}).filter(([k]) => SCHEDULE_KEYS.includes(k)));
  const srcBegin = String(s.beginDate ?? "");
  s.beginDate = d.beginDate || (srcBegin && srcBegin >= ctx.today ? srcBegin : ctx.today);
  if (d.endDate === "none") delete s.endDate;
  else if (d.endDate) s.endDate = d.endDate;
  if (s.endDate && String(s.endDate) < String(s.beginDate)) problems.push(d.endDate ? "종료일이 시작일보다 빨라요" : `원본 종료일(${s.endDate})이 지났어요 — 종료일을 새로 적거나 '없음'`);
  b.schedule = s;
  b.campaign = { id: Number(ctx.campaignId) };
  b.name = d.name.trim();
  problems.push(...budgetBidProblems(b, ctx));
  return { body: b, problems };
}

// 새로 만들기(원본 없음) — 유형별 기본(르무통 실세팅 기준): 자동입찰(전환=전환수 최대화, 방문=클릭수 최대화) · 동영상은 수동 CPV 20원
// 지면 = 가능한 모든 지면(allAvailablePlacement) · 기기 = 안드로이드·iOS · 국내 전체 · 매일 24시간
export function newAdGroupBody(d: GroupSettings, ctx: AdGroupBodyCtx): { body: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];
  const t: Record<string, unknown> = { type: "NORMAL", locationType: "ALL", locations: ALL_LOCATIONS };
  applyDemo(t, { ...d, gender: d.gender ?? "all", ages: d.ages ?? [] }, false, problems);
  const allDay = Array(24).fill("1");
  const b: Record<string, unknown> = {
    campaign: { id: Number(ctx.campaignId) },
    name: d.name.trim(),
    placements: ["KAKAO_TALK", "DAUM", "KAKAO_SERVICE"],
    allAvailablePlacement: true,
    allAvailableDeviceType: false,
    deviceTypes: ["ANDROID", "IOS"],
    targeting: t,
    adult: false,
    dailyBudgetAmount: d.budget ?? 0,
    schedule: { beginDate: d.beginDate || ctx.today, ...(d.endDate && d.endDate !== "none" ? { endDate: d.endDate } : {}), lateNight: false, detailTime: false, mondayTime: allDay, tuesdayTime: allDay, wednesdayTime: allDay, thursdayTime: allDay, fridayTime: allDay, saturdayTime: allDay, sundayTime: allDay },
  };
  applyBid(b, d.bid ?? defaultBid(ctx.campaignType), ctx);
  const s = b.schedule as Record<string, string>;
  if (s.endDate && s.endDate < s.beginDate) problems.push("종료일이 시작일보다 빨라요");
  problems.push(...budgetBidProblems(b, ctx));
  return { body: b, problems };
}

export const defaultBid = (type: string): BidSpec => (type === "VIDEO" ? { strategy: "MANUAL", amount: MANUAL_BID.VIDEO.CPV.def, target: null } : { strategy: "AUTOBID", amount: 0, target: null });

function applyDemo(t: Record<string, unknown>, d: Pick<AdGroupDraft, "gender" | "ages">, adult: boolean, problems: string[]) {
  if (d.gender !== null) {
    if (d.gender === "all") {
      t.genderType = "ALL";
      delete t.genders;
    } else {
      t.genderType = "NOT_ALL";
      t.genders = [d.gender === "m" ? "M" : "F"];
    }
  }
  if (d.ages !== null) {
    if (!d.ages.length && !adult) {
      t.ageType = "ALL";
      delete t.ages;
    } else {
      const ages = (d.ages.length ? d.ages : AGE_BUCKETS).filter((a) => !adult || Number(a) >= 20);
      if (adult && d.ages.some((a) => Number(a) < 20)) problems.push("원본이 성인 타겟이라 20세 미만은 뺐어요");
      t.ageType = "NOT_ALL";
      t.ages = ages;
    }
  }
  t.genderType ??= "ALL";
  t.ageType ??= "ALL";
}

function applyBid(b: Record<string, unknown>, bid: BidSpec, ctx: AdGroupBodyCtx) {
  if (bid.strategy === "AUTOBID") {
    if (ctx.campaignType === "VIDEO") return; // 동영상은 자동입찰 미제공 — 점검에서 막는다
    b.bidStrategy = "AUTOBID";
    b.bidAmount = 0;
    b.pacing = "NONE";
    b.pricingType = bid.target?.type === "TARGET_CPA" ? "CPA" : "CPC";
    if (bid.target) b.bidStrategyTarget = bid.target;
    else delete b.bidStrategyTarget;
  } else {
    b.bidStrategy = "MANUAL";
    b.bidAmount = bid.amount;
    b.pacing = b.pacing === "QUICK" ? "QUICK" : "NORMAL";
    if (ctx.campaignType === "VIDEO") b.pricingType = "CPV";
    else if (!b.pricingType || b.pricingType === "CPV") b.pricingType = "CPC";
    delete b.bidStrategyTarget;
  }
}

function budgetBidProblems(b: Record<string, unknown>, ctx: AdGroupBodyCtx): string[] {
  const out: string[] = [];
  const budget = Number(b.dailyBudgetAmount) || 0;
  if (budget < BUDGET_MIN) out.push(`일 예산 ${BUDGET_MIN.toLocaleString("ko-KR")}원 이상`);
  else if (budget > BUDGET_MAX) out.push("일 예산 5억 원 이하");
  else if (budget % 10) out.push("일 예산은 10원 단위");
  if (ctx.campaignBudget && budget > ctx.campaignBudget) out.push(`캠페인 일 예산(${ctx.campaignBudget.toLocaleString("ko-KR")}원) 이하`);
  if (ctx.campaignType === "VIDEO" && b.bidStrategy === "AUTOBID") out.push("동영상 캠페인은 자동입찰이 없어요 — 수동 CPV 금액을 적으세요");
  if (b.bidStrategy === "MANUAL") {
    const amt = Number(b.bidAmount) || 0;
    const rule = MANUAL_BID[ctx.campaignType]?.[String(b.pricingType)];
    const max = Math.min(100_000, Math.floor(budget * 0.5));
    if (rule && amt < rule.min) out.push(`${b.pricingType} 입찰가 ${rule.min.toLocaleString("ko-KR")}원 이상`);
    if (amt > max) out.push(`입찰가는 일 예산의 50%·10만 원 이하(${max.toLocaleString("ko-KR")}원)`);
  }
  const target = b.bidStrategyTarget as { type: string; value: number } | undefined;
  if (b.bidStrategy === "AUTOBID" && target) {
    if (target.type === "TARGET_CPC" && (target.value < 10 || target.value > Math.min(10_000, budget * 0.5))) out.push("CPC 비용 목표는 10원~1만 원(일 예산 50% 이하)");
    if (target.type === "TARGET_CPA" && (target.value < 100 || target.value > Math.min(1_000_000, budget * 0.5))) out.push("CPA 비용 목표는 100원~100만 원(일 예산 50% 이하)");
    if (target.type === "TARGET_ROAS" && (target.value < 10 || target.value > 100_000)) out.push("ROAS 목표는 10%~100,000%");
    if (ctx.campaignGoal !== "CONVERSION" && target.type !== "TARGET_CPC") out.push(`${BID_TARGET_LABEL[target.type] ?? target.type}은 전환 캠페인에서만`);
  }
  const begin = String((b.schedule as Record<string, unknown>)?.beginDate ?? "");
  if (begin && begin > addMonths(ctx.today, 6)) out.push("시작일은 오늘부터 6개월 이내");
  return out;
}

// ── 소재 ─────────────────────────────────────────────
export const LIMITS = { title: 25, description: 45, profileName: 20, altText: 30, name: 50, opinion: 1000 };
// 행동유도버튼(웹 랜딩에 쓰는 것만 — 설치·실행·게임 등 앱 전용 제외)
export const ACTION_BUTTONS: { key: string; label: string; video?: boolean }[] = [
  { key: "LINK", label: "바로가기" },
  { key: "MORE", label: "알아보기" },
  { key: "PURCHASE", label: "구매하기" },
  { key: "RESERVATION", label: "예약하기" },
  { key: "REQUEST", label: "신청하기" },
  { key: "JOIN", label: "가입하기" },
  { key: "INQUIRE", label: "문의하기" },
  { key: "COUPON", label: "쿠폰 받기" },
  { key: "SUBSCRIBE", label: "소식 받기" },
  { key: "MORE_VIDEO", label: "동영상 더보기", video: true },
];
export const ACTION_LABEL = Object.fromEntries(ACTION_BUTTONS.map((a) => [a.key, a.label]));

export type Freq = { type: "AUTO" } | { type: "DAY_IMP"; cap: number; hours: number };
export const freqLabel = (f: Freq) => (f.type === "AUTO" ? "자동" : f.hours === 24 ? `하루 ${f.cap}회` : `${f.hours}시간 ${f.cap}회`);

export type Copy = { title: string; description: string; profileName: string; actionButton: string; url: string; altText: string };
export const EMPTY_COPY: Copy = { title: "", description: "", profileName: "", actionButton: "LINK", url: "", altText: "" };

export type CreativeDraft = {
  key: string;
  name: string;
  file: string | null; // 홍보 이미지·동영상(로컬 파일 id)
  thumb: string | null; // 동영상 맞춤 썸네일(로컬 파일 id, 없으면 영상 첫 장면)
  copy: Partial<Copy>; // 빈 칸 = 공통
  freq: Freq | null; // null = 공통
  opinion: string; // 심사 의견(선택)
  aiLabel: boolean; // 비즈보드: 생성형 AI 활용 표기
};
export type Defaults = { copy: Copy; freq: Freq; profile: Profile | null; turnOn: boolean };
export type Profile = { name: string; imageUrl: string | null; fileId?: string | null }; // imageUrl = 카카오에 이미 올라간 프로필(재사용) / fileId = 새로 올릴 파일

export const copyOf = (c: CreativeDraft, d: Defaults): Copy => {
  const v = (k: keyof Copy) => (c.copy[k]?.trim() ? c.copy[k]!.trim() : d.copy[k]);
  const title = v("title");
  return { title, description: v("description"), profileName: c.copy.profileName?.trim() || d.copy.profileName || d.profile?.name || "", actionButton: v("actionButton") || "LINK", url: v("url"), altText: c.copy.altText?.trim() || d.copy.altText || altFrom(title) };
};
// 소재 설명(대체 텍스트)은 특수문자 불가 — 비우면 타이틀에서 글자·숫자·공백만 남겨 만든다
export const altFrom = (s: string) => s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.altText);
export const altProblem = (s: string) => (/[^\p{L}\p{N}\s]/u.test(s) ? "소재 설명에 특수문자 불가(카카오) — 글자·숫자·띄어쓰기만" : null);

// 랜딩 URL — 인스타·페이스북 게시물 주소 등 SNS 주소는 심사에서 막히니 미리 거른다(메타 2446433 교훈과 같은 원칙)
export function urlProblem(url: string): string | null {
  if (!url) return "랜딩 URL 없음(행 또는 공통)";
  if (!/^https?:\/\/\S+\.\S+/.test(url)) return "랜딩 URL은 http(s)://로 시작";
  if (/^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.com|threads\.net)\//i.test(url)) return "SNS 게시물 주소는 랜딩으로 못 써요 — 자사몰·상세 페이지 주소를 넣으세요";
  return null;
}

export function copyProblems(format: KakaoFormat, c: Copy, profile: Profile | null): string[] {
  const out: string[] = [];
  const len = (s: string) => [...s].length;
  const u = urlProblem(c.url);
  if (u) out.push(u);
  if (format !== "VIDEO_NATIVE") {
    if (!c.altText) out.push("소재 설명(대체 텍스트) 없음");
    else if (len(c.altText) > LIMITS.altText) out.push(`소재 설명 ${LIMITS.altText}자 이하(지금 ${len(c.altText)}자)`);
    else if (altProblem(c.altText)) out.push(altProblem(c.altText)!);
  }
  if (format === "IMAGE_BANNER") return out;
  if (!c.title) out.push("타이틀 없음");
  else if (len(c.title) > LIMITS.title) out.push(`타이틀 ${LIMITS.title}자 이하(지금 ${len(c.title)}자)`);
  if (!c.description) out.push("홍보문구 없음");
  else if (len(c.description) > LIMITS.description) out.push(`홍보문구 ${LIMITS.description}자 이하(지금 ${len(c.description)}자)`);
  if (!c.profileName) out.push("프로필 이름 없음(위 프로필 또는 행)");
  else if (len(c.profileName) > LIMITS.profileName) out.push(`프로필 이름 ${LIMITS.profileName}자 이하`);
  if (!profile?.imageUrl && !profile?.fileId) out.push("프로필 이미지 없음(위 프로필에서 기존 이미지를 쓰거나 파일 올리기)");
  if (!ACTION_LABEL[c.actionButton]) out.push(`행동유도버튼 '${c.actionButton}' 모름`);
  if (c.actionButton === "MORE_VIDEO" && format !== "VIDEO_NATIVE") out.push("'동영상 더보기'는 동영상 소재만");
  return out;
}

// 소재 생성 본문 — 파일은 이미 스토리지에 올린 공개 URL
export function creativeBody(o: { format: KakaoFormat; adGroupId: string; name: string; copy: Copy; freq: Freq; opinion: string; aiLabel: boolean; mediaUrl: string; thumbUrl: string | null; profileUrl: string | null }): Record<string, unknown> {
  const c = o.copy;
  const b: Record<string, unknown> = { adGroupId: Number(o.adGroupId), format: o.format, name: o.name.slice(0, LIMITS.name) };
  if (o.format === "IMAGE_BANNER") {
    // 비즈보드는 PC·반응형 URL 불가 — 모바일 랜딩만
    Object.assign(b, { imageFileUrl: o.mediaUrl, altText: c.altText, mobileLandingUrl: c.url, isAiLabeled: o.aiLabel });
  } else {
    Object.assign(b, { profileImageFileUrl: o.profileUrl, title: c.title, profileName: c.profileName, description: c.description, actionButton: c.actionButton, pcLandingUrl: c.url, mobileLandingUrl: c.url });
    if (o.format === "IMAGE_NATIVE") Object.assign(b, { imageFileUrl: o.mediaUrl, altText: c.altText });
    else Object.assign(b, { videoFileUrl: o.mediaUrl, ...(o.thumbUrl ? { uploadThumbnailImageFileUrl: o.thumbUrl } : {}) });
  }
  if (o.freq.type === "DAY_IMP") Object.assign(b, { frequencyCapType: "DAY_IMP", frequencyCap: o.freq.cap, frequencyCapTime: o.freq.hours });
  else b.frequencyCapType = "AUTO";
  if (o.opinion.trim()) b.opinion = o.opinion.trim().slice(0, LIMITS.opinion);
  return b;
}

// ── 파일 규격 ─────────────────────────────────────────
export type Spec = { label: string; ratio: number; minW: number; minH: number; maxBytes: number };
export const BANNER_SPEC: Spec = { label: "1029×258", ratio: 1029 / 258, minW: 1029, minH: 258, maxBytes: 300 * 1024 };
export const NATIVE_SPECS: Spec[] = [
  { label: "1:1", ratio: 1, minW: 500, minH: 500, maxBytes: 500 * 1024 },
  { label: "2:1", ratio: 2, minW: 1200, minH: 600, maxBytes: 500 * 1024 },
  { label: "9:16", ratio: 9 / 16, minW: 720, minH: 1280, maxBytes: 500 * 1024 },
  { label: "4:5", ratio: 4 / 5, minW: 800, minH: 1000, maxBytes: 500 * 1024 },
];
export const VIDEO_SPECS: Spec[] = [
  { label: "9:16", ratio: 9 / 16, minW: 720, minH: 1280, maxBytes: 1024 ** 3 },
  { label: "16:9", ratio: 16 / 9, minW: 1280, minH: 720, maxBytes: 1024 ** 3 },
  { label: "1:1", ratio: 1, minW: 1080, minH: 1080, maxBytes: 1024 ** 3 },
];
export const THUMB_MAX = 500 * 1024;
export const PROFILE_SPEC: Spec = { label: "1:1", ratio: 1, minW: 300, minH: 300, maxBytes: 500 * 1024 };
export const nearestSpec = (w: number, h: number, specs: Spec[]) => specs.reduce((a, b) => (Math.abs(Math.log(w / h / b.ratio)) < Math.abs(Math.log(w / h / a.ratio)) ? b : a));
export const ratioOff = (w: number, h: number, s: Spec) => Math.abs(w / h / s.ratio - 1);

export type MediaItem = { id: string; name: string; kind: "image" | "video"; width: number; height: number; size: number; duration?: number; url: string };

// 이 파일을 이 형식 소재로 쓸 수 있는지 — 문제(막음)와 안내(자르기·늘리기)
export function mediaFit(m: MediaItem, format: KakaoFormat): { spec: Spec | null; problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  if (format === "VIDEO_NATIVE") {
    if (m.kind !== "video") return { spec: null, problems: ["동영상 캠페인에는 영상 파일(MP4)이 필요해요"], notes };
    if (!/\.(mp4)$/i.test(m.name)) problems.push("카카오 동영상은 MP4(AVI·FLV)만 — MOV는 MP4로 바꿔 올리세요");
    const s = nearestSpec(m.width, m.height, VIDEO_SPECS);
    if (ratioOff(m.width, m.height, s) > 0.03) problems.push(`영상 비율 ${m.width}×${m.height}는 9:16·16:9·1:1이 아니에요`);
    else if (m.width < s.minW || m.height < s.minH) problems.push(`${s.label} 영상은 ${s.minW}×${s.minH} 이상(지금 ${m.width}×${m.height})`);
    return { spec: s, problems, notes };
  }
  if (m.kind !== "image") return { spec: null, problems: [`${FORMAT_LABEL[format]}에는 이미지가 필요해요`], notes };
  if (format === "IMAGE_BANNER") {
    const s = BANNER_SPEC;
    if (ratioOff(m.width, m.height, s) > 0.02) problems.push(`비즈보드 배너는 1029×258 비율이어야 해요(지금 ${m.width}×${m.height}) — 잘라 쓰면 글자가 잘려 자동으로 맞추지 않아요`);
    else if (m.width !== 1029 || m.height !== 258) notes.push(`${m.width}×${m.height} → 1029×258로 맞춤`);
    if (!problems.length && m.width < 1029 * 0.9) notes.push("원본이 작아 흐릴 수 있어요");
    return { spec: s, problems, notes };
  }
  const s = nearestSpec(m.width, m.height, NATIVE_SPECS);
  const off = ratioOff(m.width, m.height, s);
  if (off > 0.02) notes.push(`${s.label}로 가운데 잘림(원본 ${m.width}×${m.height})`);
  const scale = Math.max(s.minW / m.width, s.minH / m.height);
  if (scale > 1.5) notes.push(`원본이 작아 ${s.minW}×${s.minH}로 늘림(흐릴 수 있음)`);
  return { spec: s, problems, notes };
}

export type Problem = { where: string; text: string; target?: string };

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 9)}`;
