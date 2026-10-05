// 캠페인 오토파일럿 · GFA 엑셀 '광고그룹' 시트 — 기존 광고그룹 설정 전 항목 내보내기 + 새 광고그룹 설정 해석(순수 함수)
// 셀 형식: 코드가 있는 값은 "이름 [코드]"(여러 개는 줄바꿈), 빈 칸 = GFA 캠페인 기본값, "전체" = 제한 없음.
// 기존 광고그룹 행은 참고용(설정을 바꾸지 않음). 이름이 캠페인에 없는 행만 새 광고그룹으로 만들고, 적힌 칸만 기본값 위에 덮는다.
// 필드는 GFA OpenAdSetView / OpenAdSetCreationParam(공식 스펙) 기준. 맞춤 타겟은 생성 API가 고객 파일(adidLibraries)만 받는다.

export type GfaAgeRange = { from: number; to: number };
export type GfaCustomTarget = { no: number; name?: string; included?: boolean };
export type GfaAdSetDetail = {
  no: number;
  campaignNo: number;
  name: string;
  adidLibraryParams?: GfaCustomTarget[];
  matTargetParams?: GfaCustomTarget[];
  lookalikeAudienceParams?: GfaCustomTarget[];
  aiplTargetParams?: GfaCustomTarget[];
  shoppingNewsTargetParams?: GfaCustomTarget[];
  searchKeywordTargetParams?: GfaCustomTarget[];
  websiteTargetParams?: GfaCustomTarget[];
  genders?: string[];
  ageRanges?: GfaAgeRange[];
  locations?: string[];
  extensionDemos?: number[];
  interestCodes?: { code: number; depth: number }[];
  purchaseIntentCodes?: number[];
  targetingType?: string | null;
  devices?: string[];
  platforms?: string[];
  allDevice?: boolean;
  placementGroupCodes?: string[];
  allPlacementGroup?: boolean;
  bidGoal?: string | null;
  bidStrategy?: string | null;
  bidStrategyValue?: number | null;
  bidType?: string | null;
  bidPrice?: number | null;
  budgetType?: string | null;
  budgetAmount?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  ongoing?: boolean;
  scheduleTimeSlots?: { dayOfWeek: number; startHour: number; endHour: number }[];
  accelerated?: boolean;
  creativeChooserType?: string | null;
  frequencyAdUnit?: string | null;
  quota?: number | null;
  status?: string | null;
  activated?: boolean; // 목록 응답에서 붙임
};

// 코드 → 이름(서버가 GFA /targetings/* 를 평평하게 만들어 내려준다)
export type GfaCodeBook = {
  interests: Record<string, string>; // "단계-코드" → "가정/생활 > 가구/인테리어"
  purchase: Record<string, string>; // 코드 → 경로
  locations: Record<string, string>; // rcode → "서울특별시 강남구"
  extDemo: Record<string, string>; // 코드 → 이름
  placements: Record<string, string>; // 코드 → 이름
  adidLibraries: Record<string, string>; // 고객 파일 번호 → 이름
};

// ── 열 정의 ─────────────────────────────────────────
// ro = 읽기 전용(새 광고그룹을 만들 때 쓰지 않음)
export const ADSET_COLUMNS = [
  { h: "캠페인", w: 28 },
  { h: "광고그룹", w: 34 },
  { h: "광고그룹 번호", w: 12, ro: true },
  { h: "ON/OFF", w: 8, ro: true },
  { h: "상태", w: 12, ro: true },
  { h: "타겟팅 유형", w: 18 },
  { h: "성별", w: 12 },
  { h: "연령", w: 18 },
  { h: "지역", w: 28 },
  { h: "확장 데모", w: 24 },
  { h: "관심사", w: 30 },
  { h: "구매 의도", w: 30 },
  { h: "고객 파일 타겟", w: 26 },
  { h: "기타 맞춤 타겟", w: 30, ro: true },
  { h: "기기", w: 10 },
  { h: "OS", w: 10 },
  { h: "게재 위치", w: 36 },
  { h: "입찰 목표", w: 22 },
  { h: "비용 관리", w: 20 },
  { h: "입찰 한도", w: 10 },
  { h: "과금 방식", w: 10 },
  { h: "입찰가", w: 10 },
  { h: "예산 유형", w: 16 },
  { h: "예산", w: 12 },
  { h: "시작", w: 17 },
  { h: "종료", w: 17 },
  { h: "계속 게재", w: 10 },
  { h: "요일·시간", w: 24 },
  { h: "빠른 게재", w: 10 },
  { h: "소재 노출 방식", w: 22 },
  { h: "빈도 단위", w: 14 },
  { h: "빈도 한도", w: 10 },
] as const;
export const ADSET_FULL_HEADERS = ADSET_COLUMNS.map((c) => c.h);

const ENUMS: Record<string, Record<string, string>> = {
  targetingType: { AUDIENCE: "오디언스 타겟팅", CONTEXT: "콘텍스트 타겟팅", ADVOOST_AUDIENCE: "ADVoost 오디언스", ADVOOST_EXPAND: "ADVoost 확장" },
  bidGoal: { MAX_CONV: "전환수 최대화", MAX_CLICK: "클릭수 최대화", MAX_CONV_VALUE: "전환가치 최대화", NONE: "없음" },
  bidStrategy: { NO_CAP: "한도 없음", BID_CAP: "입찰 한도", COST_CAP: "비용 한도", FIXED_BID: "고정 입찰", TARGET_COST: "목표 비용", TARGET_ROAS: "목표 ROAS" },
  bidType: { CPC: "CPC", CPM: "CPM", CPV: "CPV" },
  budgetType: { DAILY: "일 예산", TOTAL: "총 예산" },
  creativeChooserType: { VALUE_WEIGHTED_RANDOM: "성과 가중 랜덤", SIMPLE_RANDOM: "균등 랜덤", OPTIMIZATION: "자동 최적화" },
  frequencyAdUnit: { AD_SET: "광고그룹", CREATIVE: "소재" },
};
const STATUS: Record<string, string> = {
  RUNNABLE: "운영 가능",
  BEFORE_STARTING: "시작 전",
  TERMINATED: "종료",
  DELETED: "삭제",
  BUDGET_EXHAUSTED: "예산 소진",
  LOW_TARGETED: "타겟 부족",
  TARGET_DISABLED: "타겟 사용 불가",
  LEARNING: "학습 중",
  LEARNING_LIMITED: "학습 제한",
  SEGMENT_NOT_SET: "세그먼트 미설정",
  AUTO_TARGET_DISABLED: "자동 타겟 사용 불가",
};
const GENDER: Record<string, string> = { F: "여성", M: "남성", U: "알 수 없음" };
const DEVICE: Record<string, string> = { DESKTOP: "PC", MOBILE: "모바일" };
const OS: Record<string, string> = { IOS: "iOS", ANDROID: "Android" };
const DAYS = ["", "월", "화", "수", "목", "금", "토", "일"]; // GFA dayOfWeek 1=월 … 7=일(실데이터 날짜로 확인)
const BANDS: GfaAgeRange[] = [
  { from: 14, to: 18 },
  { from: 19, to: 24 },
  { from: 25, to: 29 },
  { from: 30, to: 34 },
  { from: 35, to: 39 },
  { from: 40, to: 44 },
  { from: 45, to: 49 },
  { from: 50, to: 54 },
  { from: 55, to: 59 },
  { from: 60, to: 200 },
];

// ── 내보내기(설정 → 셀) ──────────────────────────────
const tag = (name: string | undefined, code: string | number) => `${name ?? "(이름 미상)"} [${code}]`;
const lines = (xs: string[]) => xs.join("\n");
const yn = (b: boolean | undefined) => (b == null ? "" : b ? "예" : "아니오");
const enumCell = (kind: string, v: string | null | undefined) => (v ? tag(ENUMS[kind]?.[v] ?? v, v) : "");
const time = (v: string | null | undefined) => (v ? v.replace("T", " ").slice(0, 16) : "");

export function formatAges(list: GfaAgeRange[] | undefined): string {
  if (!list?.length) return "전체";
  const unknown = list.some((a) => a.from < 0);
  const bands = list.filter((a) => a.from >= 0).sort((a, b) => a.from - b.from);
  const merged: GfaAgeRange[] = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b.from === last.to + 1) last.to = b.to;
    else merged.push({ ...b });
  }
  const parts = merged.map((m) => (m.to >= 200 ? `${m.from}+` : `${m.from}-${m.to}`));
  if (unknown) parts.push("알 수 없음");
  // 14세부터 끝까지 + 알 수 없음 = 사실상 전체
  return parts.length ? parts.join(", ") : "전체";
}

function formatSchedule(slots: GfaAdSetDetail["scheduleTimeSlots"]): string {
  if (!slots?.length) return "전체";
  const byDay = new Map<number, string[]>();
  for (const s of [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startHour - b.startHour)) {
    byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), `${s.startHour}-${s.endHour}`]);
  }
  return lines([...byDay].map(([d, hs]) => `${DAYS[d] ?? d} ${hs.join(", ")}`));
}

function customLines(list: GfaCustomTarget[] | undefined, kind: string, names?: Record<string, string>) {
  return (list ?? []).map((t) => `${kind}${t.included === false ? " 제외" : " 포함"}: ${tag(t.name ?? names?.[String(t.no)], t.no)}`);
}

export function adSetToRow(campaignLabel: string, d: GfaAdSetDetail, book: GfaCodeBook): (string | number)[] {
  const others = [
    ...customLines(d.lookalikeAudienceParams, "유사"),
    ...customLines(d.websiteTargetParams, "웹사이트"),
    ...customLines(d.matTargetParams, "앱"),
    ...customLines(d.shoppingNewsTargetParams, "쇼핑소식"),
    ...customLines(d.searchKeywordTargetParams, "검색 키워드"),
    ...customLines(d.aiplTargetParams, "AI 추천"),
  ];
  const row: Record<string, string | number> = {
    캠페인: campaignLabel,
    광고그룹: d.name,
    "광고그룹 번호": d.no,
    "ON/OFF": d.activated == null ? "" : d.activated ? "ON" : "OFF",
    상태: d.status ? STATUS[d.status] ?? d.status : "",
    "타겟팅 유형": enumCell("targetingType", d.targetingType),
    성별: !d.genders?.length || (d.genders.includes("F") && d.genders.includes("M") && d.genders.length === 2) ? "전체" : d.genders.map((g) => GENDER[g] ?? g).join(", "),
    연령: formatAges(d.ageRanges),
    지역: d.locations?.length ? lines(d.locations.map((r) => tag(book.locations[r], r))) : "전체",
    "확장 데모": lines((d.extensionDemos ?? []).map((c) => tag(book.extDemo[String(c)], c))),
    관심사: lines((d.interestCodes ?? []).map((x) => tag(book.interests[`${x.depth}-${x.code}`], `${x.depth}-${x.code}`))),
    "구매 의도": lines((d.purchaseIntentCodes ?? []).map((c) => tag(book.purchase[String(c)], c))),
    "고객 파일 타겟": lines(customLines(d.adidLibraryParams, "고객 파일", book.adidLibraries).map((l) => l.replace(/^고객 파일 /, ""))),
    "기타 맞춤 타겟": lines(others),
    기기: d.allDevice || !d.devices?.length ? "전체" : d.devices.map((x) => DEVICE[x] ?? x).join(", "),
    OS: !d.platforms?.length || d.platforms.length >= 2 ? "전체" : d.platforms.map((x) => OS[x] ?? x).join(", "),
    "게재 위치": d.allPlacementGroup || !d.placementGroupCodes?.length ? "전체" : lines(d.placementGroupCodes.map((x) => tag(book.placements[x], x))),
    "입찰 목표": enumCell("bidGoal", d.bidGoal),
    "비용 관리": enumCell("bidStrategy", d.bidStrategy),
    "입찰 한도": d.bidStrategyValue ?? "",
    "과금 방식": d.bidType ?? "",
    입찰가: d.bidPrice ?? "",
    "예산 유형": enumCell("budgetType", d.budgetType),
    예산: d.budgetAmount ?? "",
    시작: time(d.startTime),
    종료: time(d.endTime),
    "계속 게재": yn(d.ongoing),
    "요일·시간": formatSchedule(d.scheduleTimeSlots),
    "빠른 게재": yn(d.accelerated),
    "소재 노출 방식": enumCell("creativeChooserType", d.creativeChooserType),
    "빈도 단위": enumCell("frequencyAdUnit", d.frequencyAdUnit),
    "빈도 한도": d.quota ?? "",
  };
  return ADSET_FULL_HEADERS.map((h) => row[h] ?? "");
}

// ── 해석(셀 → 생성 본문) ─────────────────────────────
export type AdSetSpec = {
  row: number;
  campaign: string; // 비면 선택한 캠페인 전부
  name: string;
  overrides: Record<string, unknown>; // GFA 생성 본문에 덮을 칸(적힌 칸만)
  budget: number | null; // 화면 표시·합계용
  errors: string[];
  warnings: string[];
  readOnlyIgnored: string[]; // 새 광고그룹인데 읽기 전용 칸에 값이 있어 빠지는 것
};

const cell = (v: unknown) => (v == null ? "" : String(v).trim());
const items = (v: string) =>
  v
    .split(/\r?\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);
const codeOf = (item: string) => item.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim() ?? null;
const isAll = (v: string) => /^(전체|모두|all|제한 ?없음)$/i.test(v.trim());

function byName(map: Record<string, string>, name: string): string | null {
  const n = name.replace(/\s/g, "");
  const hit = Object.entries(map).find(([, v]) => v.replace(/\s/g, "") === n || v.split(">").pop()!.replace(/\s/g, "") === n);
  return hit?.[0] ?? null;
}

function enumParse(kind: string, v: string): string | null {
  const code = codeOf(v) ?? v.trim();
  const m = ENUMS[kind];
  if (m[code.toUpperCase()]) return code.toUpperCase();
  const hit = Object.entries(m).find(([, label]) => label.replace(/\s/g, "") === v.replace(/\s/g, ""));
  return hit?.[0] ?? null;
}

export function parseAgesFull(v: string): GfaAgeRange[] | null {
  if (isAll(v)) return [];
  const out = new Map<number, GfaAgeRange>();
  for (const part of v.split(/[,/\n]+/).map((x) => x.trim()).filter(Boolean)) {
    if (/^(알 ?수 ?없음|미상|unknown)$/i.test(part)) {
      out.set(-1, { from: -1, to: -1 });
      continue;
    }
    const plus = part.match(/^(\d{2})\s*\+$/);
    const range = part.match(/^(\d{2})\s*[-~]\s*(\d{2,3})$/);
    if (!plus && !range) return null;
    const from = Number((plus ?? range)![1]);
    const to = plus ? 200 : Number(range![2]);
    const hit = BANDS.filter((b) => b.from >= from && (b.to <= to || (b.to === 200 && to >= 60)));
    if (!hit.length) return null;
    hit.forEach((b) => out.set(b.from, b));
  }
  return [...out.values()].sort((a, b) => a.from - b.from);
}

function parseSchedule(v: string): GfaAdSetDetail["scheduleTimeSlots"] | null {
  if (isAll(v)) return [];
  const slots: NonNullable<GfaAdSetDetail["scheduleTimeSlots"]> = [];
  for (const line of items(v)) {
    const m = line.match(/^([월화수목금토일])\s+(.+)$/);
    if (!m) return null;
    const day = DAYS.indexOf(m[1]);
    for (const h of m[2].split(/[,\s]+/).filter(Boolean)) {
      const r = h.match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/);
      if (!r) return null;
      const s = Number(r[1]);
      const e = Number(r[2]);
      if (s < 0 || e > 24 || s >= e) return null;
      slots.push({ dayOfWeek: day, startHour: s, endHour: e });
    }
  }
  return slots;
}

// 엑셀 날짜 칸(숫자 일련번호)도 받는다
function parseTime(v: unknown): string | null {
  if (typeof v === "number" && v > 30000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 16);
  }
  const s = cell(v);
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const p = (x: string) => x.padStart(2, "0");
  return `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4] ?? "0")}:${m[5] ?? "00"}`;
}

function num(v: unknown): number | null {
  const s = String(v ?? "").replace(/[,원\s]/g, "");
  const man = s.match(/^(\d+(?:\.\d+)?)만$/);
  const n = man ? Number(man[1]) * 10000 : Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function bool(v: string): boolean | null {
  if (/^(예|y|yes|true|o|켜기|사용)$/i.test(v)) return true;
  if (/^(아니오|아니요|n|no|false|x|끄기|미사용)$/i.test(v)) return false;
  return null;
}

// 코드 목록 칸 — "이름 [코드]" 줄들. 코드가 없으면 이름으로 찾는다
function codeList(v: string, map: Record<string, string>, label: string, errors: string[]): string[] {
  const out: string[] = [];
  for (const it of items(v)) {
    const code = codeOf(it) ?? byName(map, it);
    if (!code || !(code in map)) errors.push(`${label} '${it}'를 찾지 못함`);
    else if (!out.includes(code)) out.push(code);
  }
  return out;
}

// now = 한국 시각 "YYYY-MM-DDTHH:mm"(지난 시작·종료 점검용)
export function parseAdSetSheetFull(matrix: unknown[][], book: GfaCodeBook | null, now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16)): AdSetSpec[] {
  const headerIdx = matrix.findIndex((r) => r.some((x) => cell(x) === "광고그룹"));
  if (headerIdx < 0) return [];
  const header = matrix[headerIdx].map((x) => cell(x).replace(/\s/g, ""));
  const col = (h: string) => header.indexOf(h.replace(/\s/g, ""));
  const out: AdSetSpec[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((x) => !cell(x))) continue;
    const raw = (h: string) => (col(h) >= 0 ? r[col(h)] : "");
    const get = (h: string) => cell(raw(h));
    const errors: string[] = [];
    const warnings: string[] = [];
    const o: Record<string, unknown> = {};
    const name = get("광고그룹");
    if (!name) continue;

    const tt = get("타겟팅 유형");
    if (tt) {
      const code = enumParse("targetingType", tt);
      if (code) o.targetingType = code;
      else errors.push(`타겟팅 유형 '${tt}'`);
    }

    const g = get("성별");
    if (g) {
      if (isAll(g)) o.genders = [];
      else {
        const list = g.split(/[,/\s]+/).filter(Boolean).map((x) => Object.entries(GENDER).find(([k, l]) => l === x || k === x.toUpperCase() || (x === "여" && k === "F") || (x === "남" && k === "M"))?.[0]);
        if (list.some((x) => !x)) errors.push(`성별 '${g}'(전체·여성·남성)`);
        else o.genders = [...new Set(list)];
      }
    }

    const age = get("연령") || get("연령대");
    if (age) {
      const a = parseAgesFull(age);
      if (!a) errors.push(`연령 '${age}'(예 30-44, 60+, 알 수 없음)`);
      else o.ageRanges = a;
    }

    if (book) {
      const loc = get("지역");
      if (loc) o.locations = isAll(loc) ? [] : codeList(loc, book.locations, "지역", errors);
      const ed = get("확장 데모");
      if (ed) o.extensionDemos = codeList(ed, book.extDemo, "확장 데모", errors).map(Number);
      const it = get("관심사");
      if (it)
        o.interestCodes = codeList(it, book.interests, "관심사", errors).map((k) => {
          const [depth, code] = k.split("-").map(Number);
          return { code, depth };
        });
      const pi = get("구매 의도");
      if (pi) o.purchaseIntentCodes = codeList(pi, book.purchase, "구매 의도", errors).map(Number);
      const pl = get("게재 위치");
      if (pl) {
        if (isAll(pl)) o.allPlacementGroup = true;
        else {
          o.allPlacementGroup = false;
          o.placementGroupCodes = codeList(pl, book.placements, "게재 위치", errors);
        }
      }
    } else if (["지역", "확장 데모", "관심사", "구매 의도", "게재 위치"].some((h) => get(h) && !isAll(get(h)))) {
      errors.push("코드표를 못 불러와 지역·관심사·게재 위치 등을 해석하지 못함 — 다시 올려 주세요");
    }

    const cf = get("고객 파일 타겟");
    if (cf) {
      const list: { no: number; included: boolean }[] = [];
      for (const it of items(cf)) {
        const no = Number(codeOf(it));
        if (!Number.isFinite(no) || no <= 0) errors.push(`고객 파일 타겟 '${it}'(예: 포함: 구매자 [123])`);
        else list.push({ no, included: !/^제외/.test(it) });
      }
      o.adidLibraries = list;
    }

    const dv = get("기기");
    if (dv) {
      if (isAll(dv) || /PC.*모바일|모바일.*PC/i.test(dv)) {
        o.allDevice = isAll(dv);
        o.devices = ["DESKTOP", "MOBILE"];
      } else if (/모바일|mobile/i.test(dv)) Object.assign(o, { allDevice: false, devices: ["MOBILE"] });
      else if (/^(pc|데스크톱|desktop)$/i.test(dv)) Object.assign(o, { allDevice: false, devices: ["DESKTOP"] });
      else errors.push(`기기 '${dv}'(전체·모바일·PC)`);
    }
    const os = get("OS");
    if (os) {
      if (isAll(os)) o.platforms = ["IOS", "ANDROID"];
      else if (/^ios$/i.test(os)) o.platforms = ["IOS"];
      else if (/^(android|안드로이드)$/i.test(os)) o.platforms = ["ANDROID"];
      else errors.push(`OS '${os}'(전체·iOS·Android)`);
    }

    for (const [h, k] of [
      ["입찰 목표", "bidGoal"],
      ["비용 관리", "bidStrategy"],
      ["예산 유형", "budgetType"],
      ["소재 노출 방식", "creativeChooserType"],
      ["빈도 단위", "frequencyAdUnit"],
    ] as const) {
      const v = get(h);
      if (!v) continue;
      const code = enumParse(k, v);
      if (!code) errors.push(`${h} '${v}'`);
      else o[k] = code;
    }
    const bt = get("과금 방식");
    if (bt) {
      const code = enumParse("bidType", bt);
      if (code) o.bidType = code;
      else errors.push(`과금 방식 '${bt}'(CPC·CPM·CPV)`);
    }

    for (const [h, k] of [
      ["입찰 한도", "bidStrategyValue"],
      ["입찰가", "bidPrice"],
      ["빈도 한도", "quota"],
    ] as const) {
      if (!get(h)) continue;
      const n = num(raw(h));
      if (n == null) errors.push(`${h} '${get(h)}'`);
      else o[k] = n;
    }
    // 예전 템플릿의 '일 예산' 열도 받는다
    const budgetRaw = get("예산") ? raw("예산") : get("일 예산") ? raw("일 예산") : "";
    let budget: number | null = null;
    if (cell(budgetRaw)) {
      budget = num(budgetRaw);
      if (!budget) errors.push(`예산 '${cell(budgetRaw)}'`);
      else {
        o.budgetAmount = budget;
        if (!get("예산") && get("일 예산")) o.budgetType = "DAILY";
      }
    }

    for (const [h, k] of [
      ["시작", "startTime"],
      ["종료", "endTime"],
    ] as const) {
      if (!get(h)) continue;
      const t = parseTime(raw(h));
      if (!t) errors.push(`${h} '${get(h)}'(예 2026-10-10 09:00)`);
      else o[k] = t;
    }
    for (const [h, k] of [
      ["계속 게재", "ongoing"],
      ["빠른 게재", "accelerated"],
    ] as const) {
      const v = get(h);
      if (!v) continue;
      const b = bool(v);
      if (b == null) errors.push(`${h} '${v}'(예·아니오)`);
      else o[k] = b;
    }
    if (o.endTime && o.ongoing === undefined) o.ongoing = false;
    // 기존 행을 복사하면 지난 일정이 따라온다 — 지난 시작은 빼고(화면 시작일·GFA 기본값 사용), 지난 종료는 막는다
    if (typeof o.startTime === "string" && o.startTime < now) {
      warnings.push(`시작 ${o.startTime.replace("T", " ")}이 지나 화면의 시작일(비우면 GFA 기본)로 만듦`);
      delete o.startTime;
    }
    if (typeof o.endTime === "string" && o.endTime <= now) errors.push(`종료 ${o.endTime.replace("T", " ")}이 이미 지남 — 비우거나 새 날짜로`);
    const sc = get("요일·시간");
    if (sc) {
      const s = parseSchedule(sc);
      if (!s) errors.push(`요일·시간 '${sc.replace(/\n/g, " / ")}'(예: 월 9-18, 20-24)`);
      else o.scheduleTimeSlots = s;
    }
    if (o.bidStrategy === "FIXED_BID" && o.bidPrice == null) warnings.push("고정 입찰인데 입찰가가 비어 있음");
    if ((o.bidStrategy === "BID_CAP" || o.bidStrategy === "COST_CAP") && o.bidStrategyValue == null) warnings.push(`${ENUMS.bidStrategy[o.bidStrategy as string]}인데 입찰 한도가 비어 있음`);

    const readOnlyIgnored = get("기타 맞춤 타겟") ? ["기타 맞춤 타겟(유사·웹사이트 등은 API로 지정 불가 — GFA에서 직접)"] : [];
    out.push({ row: i + 1, campaign: get("캠페인"), name, overrides: o, budget, errors, warnings, readOnlyIgnored });
  }
  return out;
}

// 생성 본문에 덮어도 되는 칸(GFA OpenAdSetCreationParam) — 서버가 이 목록만 받아들인다
export const OVERRIDE_KEYS = [
  "adidLibraries",
  "genders",
  "ageRanges",
  "locations",
  "extensionDemos",
  "interestCodes",
  "purchaseIntentCodes",
  "targetingType",
  "devices",
  "platforms",
  "allDevice",
  "placementGroupCodes",
  "allPlacementGroup",
  "bidGoal",
  "bidStrategy",
  "bidStrategyValue",
  "bidType",
  "bidPrice",
  "budgetType",
  "budgetAmount",
  "startTime",
  "endTime",
  "ongoing",
  "scheduleTimeSlots",
  "accelerated",
  "creativeChooserType",
  "frequencyAdUnit",
  "quota",
] as const;

export const ADSET_GUIDE = [
  ["광고그룹 시트", "캠페인을 고르고 내려받으면 기존 광고그룹의 설정이 전 항목 채워져 있다. 기존 광고그룹 행은 참고용 — 여기서 고쳐도 GFA 설정은 바뀌지 않는다"],
  ["새 광고그룹 만들기", "기존 행을 복사해 '광고그룹' 이름만 바꾸면 같은 설정으로 새로 만든다(광고그룹 번호·ON/OFF·상태 칸은 무시). 빈 칸은 GFA 캠페인 기본값, '전체'는 제한 없음"],
  ["코드 칸", "지역·확장 데모·관심사·구매 의도·게재 위치·고객 파일 타겟·입찰 목표 등은 '이름 [코드]' 형식, 여러 개는 셀 안 줄바꿈(Alt+Enter). 이름만 적어도 찾지만 [코드]가 정확하다"],
  ["연령", "전체 또는 25-29, 30-44, 60+, 알 수 없음(5세 구간으로 맞춤)"],
  ["요일·시간", "전체 또는 줄마다 '요일 시작-끝' 예) 월 9-18, 20-24 (24시간제, GFA 요일 1=월 … 7=일)"],
  ["고객 파일 타겟", "줄마다 '포함: 이름 [번호]' 또는 '제외: 이름 [번호]'"],
  ["기타 맞춤 타겟", "유사·웹사이트·앱·쇼핑소식·검색 키워드·AI 추천 타겟은 GFA API가 생성 때 받지 않는다 — 내려받기에만 보이고, 새 광고그룹에는 GFA에서 직접 추가"],
  ["입찰·예산", "입찰 목표 / 비용 관리(한도 없음·입찰 한도·비용 한도·고정 입찰) / 입찰 한도 / 과금 방식 / 입찰가 / 예산 유형(일·총) / 예산. 예산은 50000 또는 5만"],
];

// 캠페인을 고르지 않았을 때 템플릿 예시(소재 시트 예시와 같은 광고그룹 이름)
const rowFrom = (o: Record<string, string | number>) => ADSET_FULL_HEADERS.map((h) => o[h] ?? "");
export const ADSET_SAMPLE_FULL = [
  rowFrom({ 광고그룹: "1005_핵심3040_aall", 성별: "전체", 연령: "30-44", 기기: "전체", "예산 유형": "일 예산 [DAILY]", 예산: 50000 }),
  rowFrom({ 광고그룹: "1005_운동2539_m2539", 성별: "남성", 연령: "25-39", 기기: "모바일", 관심사: "스포츠/레저 [1-20014]", "예산 유형": "일 예산 [DAILY]", 예산: 30000 }),
];
