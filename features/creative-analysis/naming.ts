import type { NameSchema } from "./nameSchema";

// 소재명·광고세트명 해석 — 광고주별 명명 사전(구글 시트 규칙)을 기준으로, 사전에 없는 조각은 따로 모은다.
// 르무통 규칙(시트): 소재명 = 날짜_캠페인목표_콘텐츠명(또는 상품명)_소재번호 / 광고세트(타겟) = 성별_연령대_타겟
// 실제 이름은 규칙보다 자유롭다(예: chuseok_2026_ev17, ps_hyunddy_l, tvc_yoona_ev02) → 앞에서부터 사전·패턴으로 하나씩 소비한다.

export type NamingDict = {
  objectives: Record<string, string>;
  contents: Record<string, string>; // 콘텐츠·테마(여러 조각 코드 가능: summer_2026)
  products: Record<string, string>; // 상품·랜딩
  models: Record<string, string>;
  tvc: Record<string, string>; // 여러 조각 코드: tvc_yoona_15s_a
  targets: Record<string, string>; // 광고세트 타겟 코드
  schema?: NameSchema; // 광고주가 올린 소재명 규칙(nameSchema.ts) — 있으면 위 사전 대신 이 규칙으로 읽는다
};
export type DateFormat = "yymmdd" | "yyyymmdd" | "mmdd";

// 르무통 — https://docs.google.com/spreadsheets/d/1DLTe7ago__srs9BKJUa7GR3UIo7qskdeXKN5uJK5oKE (2026-10-01 반영)
const LEMOUTON: NamingDict = {
  objectives: { cv: "전환", tr: "트래픽", eg: "참여", bd: "브랜딩", ba: "인지도" },
  contents: {
    walk: "지금 걸어보세요",
    interview: "꼭 한 번 신어보세요",
    sansa: "산사의 길",
    brandfilm: "브랜드필름",
    feed: "인스타그램 피드",
    opop: "오늘의 팝업",
    brandday: "브랜드데이",
    walkingclub: "산책회",
    elevator: "엘레베이터",
    launch: "신제품 런칭",
    teasing: "신제품 티징",
    lemoutonweek: "르무통위크",
    walkmate: "산책메이트(댕댕이)",
    ny: "새해",
    newyear: "설 프로모션",
    familymonth: "가정의 달 프로모션",
    muse: "뮤즈 페이지",
    "10th_anniv": "10주년",
    summer_2026: "여름기획전",
    women_office: "여성오피스룩",
    men_office: "남성오피스룩",
    fall_leaves: "단풍 기획전",
  },
  products: {
    m: "메이트",
    u: "업",
    b: "버디",
    f: "포레스트",
    l: "레츠",
    s: "스위트",
    w: "왈라비",
    mu: "무 양말",
    a: "전체보기",
    c: "커플세트",
    "21c": "21일 챌린지",
    st: "스타일",
    cl: "클래식",
    wk: "워크",
    e: "이지",
    evr: "에브리데이",
    llive: "쇼핑라이브",
    ev: "이벤트",
    travel: "여행이벤트",
    h: "메인 홈페이지",
    mj: "메리제인",
    wo: "우먼",
    hub: "허브페이지",
  },
  models: { wb: "채원빈", yoona: "윤아", jg: "정재광", pjm: "박정민" },
  tvc: {
    tvc_yoona_fit: "윤아_편한데 다 잘어울려",
    tvc_yoona_lke: "윤아_편한데 다 좋아해",
    tvc_yoona_60s: "윤아 60초",
    tvc_yoona_15s_a: "윤아 15초 A",
    tvc_yoona_15s_b: "윤아 15초 B",
    tvc_pjm_60s: "박정민 60초",
    tvc_pjm_15s_a: "박정민 15초 A",
    tvc_pjm_15s_b: "박정민 15초 B",
    tvc_pjm_teasing: "박정민 티징",
  },
  targets: { non: "논타겟", dtg: "디타겟", rt: "리타겟", interest: "관심사" },
};

const EMPTY: NamingDict = { objectives: {}, contents: {}, products: {}, models: {}, tvc: {}, targets: {} };

// 광고주 이름으로 사전 선택(사전이 없으면 날짜·목표·번호 같은 공통 패턴만 해석)
export function dictFor(clientName: string | null | undefined): { dict: NamingDict; source: string | null } {
  if (clientName && /르무통|lemouton/i.test(clientName)) return { dict: LEMOUTON, source: "르무통 소재명 규칙(구글 시트)" };
  return { dict: EMPTY, source: null };
}

// 사전에 없지만 업계 공통으로 해석 가능한 목표 코드
const COMMON_OBJECTIVES: Record<string, string> = { vvc: "동영상 조회", lead: "잠재고객", cat: "카탈로그" };

export type CreativeType = "TVC" | "파트너십" | "이벤트" | "콘텐츠" | "상품" | "미분류";

export type ParsedAdName = {
  launchDate: string | null; // yyyy-mm-dd
  objective: string | null;
  type: CreativeType;
  theme: string | null; // 콘텐츠·테마(라벨)
  themeCode: string | null;
  model: string | null;
  tvc: string | null;
  products: string[]; // 상품·랜딩 라벨
  influencer: string | null;
  videoLength: string | null; // 6s·15s·60s
  serial: string | null; // 소재 번호
  detail: string | null; // 테마 뒤 세부 콘텐츠(사전에 없는 단어: foursisters moment)
  unknown: string[]; // 사전·패턴에 안 맞은 조각
  objectiveCode?: string | null; // 목표 코드(cv·tr…)
  fields?: ParsedField[]; // 항목별 값 — 분석 축은 이것으로 만든다(규칙 파일 항목 이름 그대로, 내장 해석은 목표·콘텐츠·상품… 7개)
  mapValue?: string | null; // 성과 맵 기준 항목 값(규칙 파일에서 정함)
  ruleSet?: string | null; // 적용된 규칙 세트 이름
  outOfRule?: boolean; // 규칙의 조각 수에 크게 못 미치는 이름
};
export type ParsedField = { name: string; kind: "text" | "date" | "number"; values: string[]; raw: string | null };

const YEAR = /^20\d{2}$/;

export function dateOf(tok: string, fmt: DateFormat = "yymmdd"): string | null {
  const len = fmt === "yyyymmdd" ? 8 : fmt === "mmdd" ? 4 : 6;
  if (!len || !new RegExp(`^\\d{${len}}$`).test(tok)) return null;
  const now = new Date();
  let yyyy = fmt === "yyyymmdd" ? Number(tok.slice(0, 4)) : fmt === "yymmdd" ? 2000 + Number(tok.slice(0, 2)) : now.getFullYear();
  const md = tok.slice(-4);
  const mm = Number(md.slice(0, 2));
  const dd = Number(md.slice(2, 4));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // mmdd는 연도가 없어 오늘보다 뒤면 작년으로 본다
  if (fmt === "mmdd" && new Date(yyyy, mm - 1, dd) > now) yyyy -= 1;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// 여러 조각 코드(키에 _ 포함) 중 tokens[i..]와 가장 길게 맞는 것
function longest(tokens: string[], i: number, dict: Record<string, string>): { code: string; len: number } | null {
  let best: { code: string; len: number } | null = null;
  for (const code of Object.keys(dict)) {
    const parts = code.split("_");
    if (parts.length < 1 || i + parts.length > tokens.length) continue;
    if (parts.every((p, k) => tokens[i + k] === p) && (!best || parts.length > best.len)) best = { code, len: parts.length };
  }
  return best;
}

// 내장 해석(르무통 사전) — 앞에서부터 날짜 → 목표 → TVC·파트너십·콘텐츠·모델·상품+번호를 사전·패턴으로 소비.
// 광고주가 규칙 파일을 올리면 nameSchema.parseName이 이것 대신 그 규칙으로 읽는다.
export function parseAdName(name: string, dict: NamingDict): ParsedAdName {
  const out: ParsedAdName = {
    launchDate: null,
    objective: null,
    type: "미분류",
    theme: null,
    themeCode: null,
    model: null,
    tvc: null,
    products: [],
    influencer: null,
    videoLength: null,
    serial: null,
    detail: null,
    unknown: [],
  };
  const tokens = name.toLowerCase().trim().split(/[_\s]+/);
  let i = 0;
  const d = tokens[0] ? dateOf(tokens[0]) : null;
  if (d) {
    out.launchDate = d;
    i = 1;
  }
  const obj = tokens[i];
  if (obj && (dict.objectives[obj] || COMMON_OBJECTIVES[obj])) {
    out.objective = dict.objectives[obj] ?? COMMON_OBJECTIVES[obj];
    out.objectiveCode = obj;
    i++;
  }

  let inPartnership = false;
  const handle: string[] = [];
  const setTheme = (code: string, label: string) => {
    if (!out.themeCode) {
      out.themeCode = code;
      out.theme = label;
    }
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "") {
      i++;
      continue;
    }
    // TVC 사전(가장 긴 코드)
    const tv = longest(tokens, i, dict.tvc);
    if (tv) {
      out.type = "TVC";
      out.tvc = dict.tvc[tv.code];
      const m = tv.code.split("_")[1];
      if (dict.models[m]) out.model = dict.models[m];
      const len = tv.code.match(/_(\d+s)(?:_|$)/);
      if (len) out.videoLength = len[1];
      i += tv.len;
      continue;
    }
    if (t === "tvc") {
      out.type = "TVC";
      if (dict.models[tokens[i + 1]]) {
        out.model = dict.models[tokens[i + 1]];
        out.tvc = `${out.model} TVC`;
        i += 2;
      } else i++;
      continue;
    }
    if (t === "ps") {
      out.type = "파트너십";
      inPartnership = true;
      i++;
      continue;
    }
    // 여러 조각 콘텐츠 코드(summer_2026, 10th_anniv …)
    const ct = longest(tokens, i, dict.contents);
    if (ct && ct.len > 1) {
      setTheme(ct.code, dict.contents[ct.code]);
      if (out.type === "미분류") out.type = "콘텐츠";
      i += ct.len;
      continue;
    }
    // 테마 + 연도(chuseok_2026, autumn_2026)
    if (/^[a-z][a-z0-9]+$/.test(t) && YEAR.test(tokens[i + 1] ?? "") && !dict.products[t]) {
      setTheme(`${t}_${tokens[i + 1]}`, dict.contents[`${t}_${tokens[i + 1]}`] ?? `${t} ${tokens[i + 1]}`);
      if (out.type === "미분류") out.type = "콘텐츠";
      i += 2;
      continue;
    }
    if (/^\d+s$/.test(t)) {
      out.videoLength = t;
      i++;
      continue;
    }
    if (dict.models[t] && !dict.contents[t]) {
      out.model = dict.models[t];
      i++;
      continue;
    }
    if (dict.contents[t]) {
      setTheme(t, dict.contents[t]);
      if (out.type === "미분류") out.type = "콘텐츠";
      i++;
      continue;
    }
    // 랜딩·상품 코드 + 번호(ev01, e05, hub11)
    const lp = t.match(/^([a-z]+?)(\d{1,3})$/);
    if (lp && (dict.products[lp[1]] || ["ev", "e", "v"].includes(lp[1]))) {
      // e05·v2는 번호 표기로만 본다(e=이지와 겹쳐 상품으로 단정하지 않음)
      const label = ["e", "v"].includes(lp[1]) ? undefined : dict.products[lp[1]];
      if (label && !out.products.includes(label)) out.products.push(label);
      if (lp[1] === "ev" && out.type === "미분류") out.type = "이벤트";
      out.serial = lp[2];
      i++;
      continue;
    }
    if (/^\d{1,3}$/.test(t)) {
      out.serial = t;
      i++;
      continue;
    }
    // 상품 코드 — 파트너십에선 핸들 뒤(끝부분)에서만 상품으로 본다
    if (dict.products[t] && (!inPartnership || handle.length > 0 || i === tokens.length - 1)) {
      if (!out.products.includes(dict.products[t])) out.products.push(dict.products[t]);
      if (out.type === "미분류") out.type = "상품";
      i++;
      continue;
    }
    if (inPartnership && !out.influencer) {
      handle.push(t);
      // 다음 조각이 상품·번호·테마면 핸들 끝
      const nx = tokens[i + 1];
      const stop = nx == null || nx === "" || dict.products[nx] || /^\d/.test(nx) || dict.contents[nx] || YEAR.test(tokens[i + 2] ?? "");
      if (stop) out.influencer = handle.join("_").replace(/^[._]+|[._]+$/g, "") || null;
      i++;
      continue;
    }
    if (/^[^a-z0-9가-힣]+$/.test(t)) {
      i++;
      continue;
    }
    out.unknown.push(t);
    i++;
  }
  if (inPartnership && !out.influencer && handle.length) out.influencer = handle.join("_");
  // 사전에 없는 단어 — 테마가 없으면 테마로, 있으면 세부 콘텐츠로(숫자·시간 표기는 제외)
  const words = out.unknown.filter((u) => /^[a-z][a-z0-9.]*$/.test(u));
  if (words.length) {
    if (!out.theme) {
      out.themeCode = words.join("_");
      out.theme = words.join(" ");
      if (out.type === "미분류") out.type = "콘텐츠";
    } else out.detail = words.join(" ");
  }
  return out;
}

export type ParsedAdsetName = {
  kind: string | null; // branding / promotion
  objective: string | null;
  gender: "남" | "여" | "전체" | null; // 이름에 적힌 성별
  ageMin: number | null;
  ageMax: number | null;
  audience: string[]; // 이름에 적힌 타겟 표현(리타겟·유사·뮤즈 등)
};

const AUDIENCE_WORDS: Record<string, string> = { lookalike: "유사 타겟", lal: "유사 타겟", muse: "뮤즈(모델 영상 조회자)", rt: "리타겟", dtg: "디타겟", non: "논타겟", interest: "관심사", broad: "광범위" };

export function parseAdsetName(name: string, dict: NamingDict): ParsedAdsetName {
  const tokens = name.toLowerCase().split("_").filter(Boolean);
  const out: ParsedAdsetName = { kind: null, objective: null, gender: null, ageMin: null, ageMax: null, audience: [] };
  const setAge = (g: string, a: string) => {
    out.gender = g === "m" ? "남" : g === "f" ? "여" : "전체";
    if (a === "all") {
      out.ageMin = 18;
      out.ageMax = 65;
    } else if (a.length === 4) {
      out.ageMin = Number(a.slice(0, 2));
      out.ageMax = Number(a.slice(2, 4));
    } else out.ageMin = Number(a);
  };
  tokens.forEach((t, i) => {
    if (!out.kind && (t === "branding" || t === "promotion")) out.kind = t === "branding" ? "브랜딩" : "프로모션";
    else if (!out.objective && (dict.objectives[t] || COMMON_OBJECTIVES[t])) out.objective = dict.objectives[t] ?? COMMON_OBJECTIVES[t];
    // 성별+연령은 붙여 쓴 f3549 또는 연속 조각 f_2060 만 인정("fall"=f+all, 끝의 _m 같은 오인 방지)
    const compact = t.match(/^(mf|m|f)(\d{4}|\d{2})$/);
    if (compact) setAge(compact[1], compact[2]);
    else if (["m", "f", "mf"].includes(t) && /^(\d{4}|\d{2}|all)$/.test(tokens[i + 1] ?? "")) setAge(t, tokens[i + 1]);
    const a = AUDIENCE_WORDS[t] ?? dict.targets[t];
    if (a && !out.audience.includes(a)) out.audience.push(a);
  });
  return out;
}
