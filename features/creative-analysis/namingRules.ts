// 광고주별 분석 규칙(순수 함수) — 규칙 파일(엑셀) 해석·내보내기와 UTM 값 라벨링.
// 기준 원칙(2026-10-06 확정): 축마다 기준을 하나로 고정한다.
//   소재명 → 광고주가 정한 항목(이름·위치·종류 자유 — nameSchema.ts) → 성과 맵·조합 분석·요소별 성과·태그
//   UTM   → source·medium·campaign·content 고정 → 고급 필터·캠페인 유형(목표 ROAS)
//   타겟  → 메타 API 실제 타겟팅 / 성별·연령대는 실제 성과 리포트(규칙 파일 대상 아님)
// 저장은 clients.naming_rules(jsonb, 0032) = { schema, utm, fileName, sourceUrl, updatedAt }. 규칙이 없으면 내장 해석(르무통 사전)과 DEFAULT_UTM.
import { dictFor, type DateFormat, type NamingDict } from "./naming";
import { KIND_LABEL as FIELD_KIND_LABEL, parseName, sepRegex, type FieldKind, type FieldPos, type NameSchema, type RuleSet, type SchemaField } from "./nameSchema";

export type UtmParam = "source" | "medium" | "campaign" | "placement";
export type UtmKind = "promo" | "ongoing" | "brand";
export type UtmRule = { label: string; kind?: UtmKind };
export type UtmRules = Record<UtmParam, Record<string, UtmRule>>;
export type NamingRules = { schema: NameSchema | null; utm: UtmRules; sourceUrl?: string | null; fileName?: string | null; updatedAt?: string | null };
// 소재 한 건의 UTM을 규칙으로 읽은 결과(필터 값 = 화면 표시 문자열)
export type UtmLabel = Record<UtmParam, string> & { kind: UtmKind | null };

export const UTM_NONE = "(없음)"; // groups.ts NONE과 같은 값
const UTM_PARAMS: UtmParam[] = ["source", "medium", "campaign", "placement"];
const UTM_LABEL: Record<UtmParam, string> = { source: "utm_source", medium: "utm_medium", campaign: "utm_campaign", placement: "utm_content" };
const UTM_ALIAS: Record<string, UtmParam> = {
  utm_source: "source", source: "source", 매체: "source", 소스: "source", 유입매체: "source",
  utm_medium: "medium", medium: "medium", 광고형태: "medium", 형태: "medium", 미디엄: "medium", 광고유형: "medium",
  utm_campaign: "campaign", campaign: "campaign", 캠페인: "campaign", 캠페인명: "campaign",
  utm_content: "placement", content: "placement", contents: "placement", 지면: "placement", 콘텐츠: "placement", 게재위치: "placement",
};
const KIND_ALIAS: Record<string, UtmKind> = { 프로모션: "promo", 행사: "promo", 세일: "promo", 기획전: "promo", promo: "promo", promotion: "promo", pm: "promo", 상시: "ongoing", 상시운영: "ongoing", 올웨이즈온: "ongoing", ongoing: "ongoing", always: "ongoing", 브랜딩: "brand", "브랜딩/tvc": "brand", 브랜드: "brand", 인지: "brand", tvc: "brand", brand: "brand", branding: "brand" };
export const KIND_NAME: Record<UtmKind, string> = { promo: "프로모션", ongoing: "상시", brand: "브랜딩" };

// 지금까지 코드에 있던 UTM 캠페인 해석(pm·ongoing·tvc·branding)을 기본 규칙으로
export const DEFAULT_UTM: UtmRules = {
  source: {},
  medium: {},
  campaign: {
    pm: { label: "프로모션", kind: "promo" },
    promo: { label: "프로모션", kind: "promo" },
    ongoing: { label: "상시", kind: "ongoing" },
    tvc: { label: "브랜딩/TVC", kind: "brand" },
    branding: { label: "브랜딩", kind: "brand" },
  },
  placement: {},
};

const EMPTY_DICT: NamingDict = { objectives: {}, contents: {}, products: {}, models: {}, tvc: {}, targets: {} };
const emptyUtm = (): UtmRules => ({ source: {}, medium: {}, campaign: {}, placement: {} });
const key = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
const str = (s: unknown) => String(s ?? "").trim();

// ── 적용 ─────────────────────────────
// dict = 해석기에 넘기는 값. 규칙이 있으면 schema를 실어 보내고(nameSchema.parseName이 그걸로 읽음), 없으면 내장 사전
export function resolveRules(saved: NamingRules | null, clientName: string | null | undefined): { dict: NamingDict; utm: UtmRules; source: string | null; saved: boolean; schema: NameSchema | null } {
  if (saved?.schema?.sets.length) return { dict: { ...EMPTY_DICT, schema: saved.schema }, utm: saved.utm, source: saved.fileName ? `업로드한 규칙(${saved.fileName})` : "업로드한 규칙", saved: true, schema: saved.schema };
  const b = dictFor(clientName);
  return { dict: b.dict, utm: saved?.utm ?? DEFAULT_UTM, source: b.source ? `${b.source} — 내장` : null, saved: !!saved, schema: null };
}

// ── UTM ─────────────────────────────
// 실제 값과 규칙 값을 같은 방식으로 맞춘다(소문자, 공백·+ → _). URL에서 온 값은 이미 디코딩됨(한글 그대로)
export const utmCode = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[\s+]+/g, "_");
// 공백·제어문자만 아니면 허용(/ | . % 등 실제 UTM에 쓰이는 기호 포함), 100자까지
const UTM_OK = /^[^\s\u0000-\u001f]{1,100}$/;

function matchUtm(raw: string, rules: Record<string, UtmRule>): { code: string; rule: UtmRule } | null {
  const v = utmCode(raw);
  if (rules[v]) return { code: v, rule: rules[v] };
  // 앞부분 일치(pm_chuseok → pm) — 뒤에 _ - . | / 가 이어질 때만, 가장 긴 코드 우선
  let best: { code: string; rule: UtmRule } | null = null;
  for (const [c, r] of Object.entries(rules)) if (v.length > c.length && v.startsWith(c) && "_-.|/".includes(v[c.length]) && (!best || c.length > best.code.length)) best = { code: c, rule: r };
  return best;
}

export type UtmValues = Record<UtmParam, [string, number][]>;
type RawUtm = { source: string | null; medium: string | null; campaign: string | null; content: string | null } | null | undefined;
const placementOf = (content: string | null | undefined) => {
  const first = content?.split(/[_|]/)[0];
  return first && /^[a-z]+$/i.test(first) ? first : null;
};
// 지금 소재들의 실제 UTM 값(파라미터별 값·소재 수) — 템플릿 참고 시트와 업로드 미리보기용
export function rawUtmValues(utms: RawUtm[]): UtmValues {
  const m: Record<UtmParam, Map<string, number>> = { source: new Map(), medium: new Map(), campaign: new Map(), placement: new Map() };
  for (const u of utms) {
    if (!u) continue;
    const vals: Record<UtmParam, string | null> = { source: u.source, medium: u.medium, campaign: u.campaign, placement: placementOf(u.content) };
    for (const p of UTM_PARAMS) {
      const v = vals[p] && utmCode(vals[p]);
      if (v) m[p].set(v, (m[p].get(v) ?? 0) + 1);
    }
  }
  return Object.fromEntries(UTM_PARAMS.map((p) => [p, [...m[p]].sort((a, b) => b[1] - a[1])])) as UtmValues;
}

// 규칙 값이 실제 값과 맞는지 — 규칙 쪽(맞은/안 맞은 규칙), 데이터 쪽(규칙이 없는 실제 값)
export function utmMatchReport(rules: UtmRules, values: UtmValues) {
  const unusedRules: string[] = [];
  const uncovered: [string, string, number][] = [];
  let used = 0;
  let total = 0;
  for (const p of UTM_PARAMS) {
    const hit = new Set<string>();
    for (const [v, n] of values[p] ?? []) {
      const m = matchUtm(v, rules[p] ?? {});
      if (m) hit.add(m.code);
      else uncovered.push([UTM_LABEL[p], v, n]);
    }
    for (const c of Object.keys(rules[p] ?? {})) {
      total++;
      if (hit.has(c)) used++;
      else unusedRules.push(`${UTM_LABEL[p]}=${c}`);
    }
  }
  return { used, total, unusedRules, uncovered: uncovered.sort((a, b) => b[2] - a[2]) };
}

export function labelUtm(utm: RawUtm, rules: UtmRules): UtmLabel | null {
  if (!utm) return null;
  const raw: Record<UtmParam, string | null> = { source: utm.source, medium: utm.medium, campaign: utm.campaign, placement: placementOf(utm.content) };
  const out = { kind: null } as UtmLabel;
  for (const p of UTM_PARAMS) {
    const v = raw[p];
    if (!v) {
      out[p] = UTM_NONE;
      continue;
    }
    const m = matchUtm(v, rules[p] ?? {});
    out[p] = m ? (m.rule.label && m.rule.label !== m.code ? `${m.rule.label}(${m.code})` : m.code) : v;
    if (p === "campaign") out.kind = m?.rule.kind ?? (m ? null : matchUtm(v, DEFAULT_UTM.campaign)?.rule.kind ?? null); // 규칙에 없는 값은 유형만 기본 해석으로
  }
  return out;
}

// ── 소재명 해석 범위 ─────────────────────────────
// 사전에 없는 조각·규칙 밖 이름이 남은 소재 수와 그 조각들. items = {이름, 캠페인}(캠페인으로 규칙 세트를 고르므로)
export type NameItem = { name: string; campaign?: string | null };
export function coverage(items: NameItem[], dict: NamingDict): { total: number; unresolved: number; codes: [string, number, string][]; bySet: Record<string, number> } {
  const m = new Map<string, { n: number; ex: string }>();
  const bySet: Record<string, number> = {};
  let unresolved = 0;
  for (const it of items) {
    const p = parseName(it.name, it.campaign, dict);
    if (p.ruleSet) bySet[p.ruleSet] = (bySet[p.ruleSet] ?? 0) + 1;
    const u = p.unknown;
    if (u.length) unresolved++;
    for (const t of new Set(u)) {
      const c = m.get(t);
      m.set(t, { n: (c?.n ?? 0) + 1, ex: c?.ex ?? it.name });
    }
  }
  return { total: items.length, unresolved, codes: [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([c, v]) => [c, v.n, v.ex]), bySet };
}

export const ruleCounts = (r: { schema: NameSchema | null; utm: UtmRules }) => ({
  sets: r.schema?.sets.length ?? 0,
  fields: r.schema?.sets.reduce((n, s) => n + s.fields.length, 0) ?? 0,
  values: r.schema?.sets.reduce((n, s) => n + s.fields.reduce((k, f) => k + Object.keys(f.dict).length, 0), 0) ?? 0,
  utm: UTM_PARAMS.reduce((n, k) => n + Object.keys(r.utm[k] ?? {}).length, 0),
});

// ── 저장 전 검증(route에서도 씀) ─────────────────────────────
const KINDS: FieldKind[] = ["text", "date", "number", "ignore"];
const DATE_FORMATS = ["yymmdd", "yyyymmdd", "mmdd", "auto"];
export function cleanRules(v: unknown): NamingRules | null {
  if (!v || typeof v !== "object") return null;
  const src = v as Partial<NamingRules>;
  let n = 0;
  const utm = emptyUtm();
  for (const p of UTM_PARAMS) {
    const m = (src.utm as Record<string, unknown> | undefined)?.[p];
    if (m && typeof m === "object")
      for (const [c, r] of Object.entries(m as Record<string, unknown>)) {
        const code = utmCode(c);
        const rule = r as Partial<UtmRule> | null;
        if (!UTM_OK.test(code) || !rule || typeof rule.label !== "string" || n++ >= 5000) continue;
        utm[p][code] = { label: rule.label.slice(0, 80), ...(rule.kind && KIND_NAME[rule.kind] ? { kind: rule.kind } : {}) };
      }
  }
  let schema: NameSchema | null = null;
  const sets = (src.schema as NameSchema | null | undefined)?.sets;
  if (Array.isArray(sets)) {
    const out: RuleSet[] = [];
    for (const s of sets.slice(0, 20)) {
      if (!s || typeof s !== "object") continue;
      const fields: SchemaField[] = [];
      for (const f of (Array.isArray(s.fields) ? s.fields : []).slice(0, 20)) {
        if (!f || typeof f.name !== "string" || !f.name.trim()) continue;
        const pos: FieldPos = f.pos === "auto" || f.pos === "rest" ? f.pos : Number.isInteger(f.pos) && (f.pos as number) >= 1 && (f.pos as number) <= 30 ? (f.pos as number) : "auto";
        const dict: Record<string, string> = {};
        for (const [c, l] of Object.entries(f.dict && typeof f.dict === "object" ? f.dict : {})) {
          const code = str(c).toLowerCase();
          if (code && code.length <= 80 && typeof l === "string" && n++ < 8000) dict[code] = l.slice(0, 80);
        }
        fields.push({
          name: f.name.trim().slice(0, 30),
          pos,
          kind: KINDS.includes(f.kind) ? f.kind : "text",
          ...(f.kind === "date" ? { dateFormat: DATE_FORMATS.includes(f.dateFormat as string) ? f.dateFormat : "auto" } : {}),
          ...(f.map ? { map: true } : {}),
          dict,
        });
      }
      if (fields.length) out.push({ name: str(s.name).slice(0, 30) || "기본", campaigns: (Array.isArray(s.campaigns) ? s.campaigns : []).map(str).filter(Boolean).slice(0, 30), separator: str(s.separator).replace(/\s/g, "").slice(0, 4) || "_", fields });
    }
    if (out.length) schema = { sets: out };
  }
  const s2 = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  return { schema, utm, sourceUrl: s2(src.sourceUrl, 500), fileName: s2(src.fileName, 120), updatedAt: s2(src.updatedAt, 40) };
}

// ── 규칙 파일(엑셀) ─────────────────────────────
export const SHEET_SETS = "규칙 세트";
export const SHEET_FIELDS = "항목";
export const SHEET_VALUES = "값 사전";
export const SHEET_UTM = "UTM 규칙";
export const SHEET_GUIDE = "작성 안내";
export const SHEET_SAMPLE = "참고_소재명 샘플";
export const SHEET_UTM_VALUES = "참고_UTM 값";
const SETS_HEAD = ["세트 이름", "적용 캠페인", "구분자", "메모"];
const FIELDS_HEAD = ["세트", "위치", "항목 이름", "종류", "날짜 형식", "성과 맵 기준", "설명"];
const VALUES_HEAD = ["세트", "위치", "항목 이름", "코드", "의미", "소재 수(참고)"];
const UTM_HEADERS = ["파라미터", "값", "의미", "캠페인 유형", "메모"];

export const GUIDE_ROWS: string[][] = [
  ["CTCH 소재 분석 규칙 파일"],
  ["한 줄 요약", "소재명을 구분자로 나눈 조각이 각각 무엇인지(항목) 적고, 필요하면 코드에 뜻(값 사전)을 붙입니다. 항목 이름은 광고주가 쓰는 말 그대로(한글 가능) — 그 이름이 분석 화면의 축이 됩니다"],
  [""],
  ["분석 기준", "어디에 쓰이나"],
  ["소재명 → 규칙 세트·항목·값 사전", "소재 유형별 성과 맵(성과 맵 기준 항목), 조합 분석 항목, 소재명으로 본 요소별 성과, 갤러리 태그"],
  ["UTM → UTM 규칙", "고급 필터(utm_source·utm_medium·utm_campaign·utm_content 첫 조각) — 파라미터는 고정, 값의 뜻·캠페인 유형만 적음"],
  ["타겟·성별·연령대", "메타 실제 타겟팅과 실제 성과 리포트를 씁니다 — 규칙 파일에 적지 않아도 됩니다"],
  [""],
  ["규칙 세트 (선택)", "캠페인마다 이름 규칙이 다르면 세트를 여러 개 만듭니다. '적용 캠페인'에 캠페인 이름에 들어간 말을 쉼표로(예: 봄세일, SS). 비운 세트 = 기본(나머지 캠페인 전부). 시트를 지우면 '기본' 세트 하나 · 구분자 _"],
  ["구분자", "조각을 나누는 기호 _ · - · | (여러 개면 붙여서 _|). 공백은 항상 구분자"],
  [""],
  ["항목", "세트(비우면 기본) · 위치 · 항목 이름 · 종류 · 날짜 형식 · 성과 맵 기준"],
  ["위치", "1, 2, 3… = 몇 번째 조각 / 자동 = 이름 어디서든 값 사전의 코드를 찾음(순서가 들쭉날쭉할 때) / 나머지 = 마지막 위치 뒤 조각 전부"],
  ["종류", "텍스트(분석 축이 됨) · 날짜(집행 일수·신규 소재 판단에 씀) · 번호(소재 번호) · 무시(그 자리 건너뜀)"],
  ["날짜 형식", "날짜 항목만: yymmdd(260920) · yyyymmdd(20260920) · mmdd(0920) · 비우면 자동(자릿수로)"],
  ["성과 맵 기준", "O 표시한 텍스트 항목이 '소재 유형별 성과 맵'의 버블이 됩니다(하나만, 비우면 첫 텍스트 항목)"],
  ["날짜만 있는 이름", "위치 1 · 날짜 한 줄만 적어도 됩니다(텍스트 항목이 없으면 성과 맵·조합은 소재명 축 없이 동작)"],
  [""],
  ["값 사전 (선택)", "항목은 '항목 이름'으로 찾고, 이름이 안 맞으면 '위치'로 찾아요(항목 시트에서 이름만 바꿔도 됨). 코드에 뜻을 붙일 때만. 의미를 비운 줄은 무시되고 조각 원문이 그대로 값이 됩니다. 코드 여러 개에 같은 의미를 주면 하나로 합쳐 분석해요(springsale·spring_sale → 봄세일)"],
  ["코드", "소재명에 실제로 쓰인 조각(대소문자 무시). '자동' 항목은 값 사전이 있어야 찾을 수 있어요. 구분자를 포함한 코드는 여러 조각으로 맞춤(summer_2026)"],
  [""],
  ["UTM 규칙 (선택)", "파라미터 · 값 · 의미 · 캠페인 유형(프로모션·상시·브랜딩 — utm_campaign만). 값은 실제 UTM 값이어야 맞음('참고_UTM 값' 시트에서 복사). 대소문자 무시, 공백·+는 _로 같게 봄, 앞부분만 같아도 맞춤(pm → pm_chuseok)"],
  [""],
  ["참고 시트", "'참고_소재명 샘플'(지금 소재명을 구분자로 나눈 조각 표)·'참고_UTM 값'은 올릴 때 읽지 않습니다. 처음 내려받으면 항목·값 사전이 실제 소재명으로 미리 채워져 있어요 — 항목 이름만 바꾸고 의미를 적으면 됩니다"],
  ["확인", "올리면 저장 전에 실제 소재명 몇 개를 그 규칙으로 읽은 결과와 '못 읽음'을 보여 줍니다"],
];

// 실제 소재명으로 규칙 초안 만들기 — 가장 흔한 조각 수만큼 위치 항목, 자리마다 날짜·번호·텍스트 추정, 텍스트 자리는 값 목록
export function suggestSchema(items: NameItem[], separator = "_", knownDict?: NamingDict): { schema: NameSchema; counts: Map<string, Map<string, number>> } {
  const re = sepRegex(separator);
  const toks = items.map((it) => it.name.trim().split(re).filter(Boolean));
  const lenCount = new Map<number, number>();
  for (const t of toks) lenCount.set(t.length, (lenCount.get(t.length) ?? 0) + 1);
  const k = Math.min(12, [...lenCount].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 1);
  const known: Record<string, string> = knownDict ? { ...knownDict.objectives, ...knownDict.contents, ...knownDict.products, ...knownDict.models, ...knownDict.tvc } : {};
  const fields: SchemaField[] = [];
  const counts = new Map<string, Map<string, number>>();
  let textN = 0;
  for (let p = 0; p < k; p++) {
    const col = toks.map((t) => t[p]).filter((x): x is string => !!x);
    const share = (re2: RegExp) => (col.length ? col.filter((x) => re2.test(x)).length / col.length : 0);
    let kind: FieldKind = "text";
    let name: string;
    if (share(/^(\d{6}|\d{8})$/) >= 0.7) {
      kind = "date";
      name = "날짜";
    } else if (share(/^[a-z]{0,2}\d{1,3}[a-z]?$/i) >= 0.7) {
      kind = "number";
      name = "번호";
    } else name = `항목${++textN}`;
    const dict: Record<string, string> = {};
    if (kind === "text") {
      const m = new Map<string, number>();
      for (const x of col) m.set(x.toLowerCase(), (m.get(x.toLowerCase()) ?? 0) + 1);
      counts.set(name, m);
      for (const [code] of m) if (known[code]) dict[code] = known[code];
    }
    fields.push({ name, pos: p + 1, kind, ...(kind === "date" ? { dateFormat: "auto" as const } : {}), dict });
  }
  // 성과 맵 기준 = 값 종류가 2~40개인 텍스트 항목 중 첫 번째
  const mapF = fields.find((f) => f.kind === "text" && (counts.get(f.name)?.size ?? 0) >= 2 && (counts.get(f.name)?.size ?? 0) <= 40);
  if (mapF) mapF.map = true;
  return { schema: { sets: [{ name: "기본", campaigns: [], separator, fields }] }, counts };
}

const posLabel = (p: FieldPos) => (p === "auto" ? "자동" : p === "rest" ? "나머지" : p);
const DATE_LABEL: Record<string, string> = { yymmdd: "yymmdd", yyyymmdd: "yyyymmdd", mmdd: "mmdd", auto: "" };

export function rulesToSheets(r: { schema: NameSchema | null; utm: UtmRules; dict?: NamingDict }, items?: NameItem[], utmValues?: UtmValues): Record<string, unknown[][]> {
  // 저장된 규칙이 없으면 실제 소재명으로 초안을 만든다(내장 사전이 있으면 뜻도 채움)
  const draft = !r.schema && items?.length ? suggestSchema(items, "_", r.dict) : null;
  const schema = r.schema ?? draft?.schema ?? { sets: [{ name: "기본", campaigns: [], separator: "_", fields: [{ name: "날짜", pos: 1, kind: "date" as const, dateFormat: "auto" as const, dict: {} }] }] };
  // 값 목록의 '소재 수' — 그 세트에 해당하는 소재의 그 자리 조각
  const usage = new Map<string, Map<string, number>>(); // `${set}|${field}` → code → n
  for (const it of items ?? []) {
    const set = schema.sets.find((s) => s.campaigns.length && s.campaigns.some((w) => (it.campaign ?? "").toLowerCase().includes(w.toLowerCase()))) ?? schema.sets.find((s) => !s.campaigns.length) ?? schema.sets[0];
    const toks = it.name.trim().split(sepRegex(set.separator)).filter(Boolean);
    for (const f of set.fields)
      if (typeof f.pos === "number" && f.kind === "text" && toks[f.pos - 1]) {
        const k2 = `${set.name}|${f.name}`;
        const m = usage.get(k2) ?? new Map<string, number>();
        const c = toks[f.pos - 1].toLowerCase();
        m.set(c, (m.get(c) ?? 0) + 1);
        usage.set(k2, m);
      }
  }
  const sets: unknown[][] = [SETS_HEAD, ...schema.sets.map((s) => [s.name, s.campaigns.join(", "), s.separator, s.campaigns.length ? "" : "기본 — 다른 세트에 안 걸린 캠페인 전부"])];
  const fields: unknown[][] = [FIELDS_HEAD];
  const values: unknown[][] = [VALUES_HEAD];
  for (const s of schema.sets)
    for (const f of s.fields) {
      fields.push([s.name, posLabel(f.pos), f.name, FIELD_KIND_LABEL[f.kind], f.kind === "date" ? DATE_LABEL[f.dateFormat ?? "auto"] : "", f.map ? "O" : "", draft && f.name.startsWith("항목") ? "← 광고주가 쓰는 이름으로 바꾸세요(예: 시즌, 카피 유형)" : ""]);
      if (f.kind !== "text") continue;
      const used = usage.get(`${s.name}|${f.name}`) ?? new Map<string, number>();
      const codes = new Set([...Object.keys(f.dict), ...[...used].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([c]) => c)]);
      for (const c of codes) values.push([s.name, posLabel(f.pos), f.name, c, f.dict[c] ?? "", used.get(c) ?? ""]);
    }
  const utm: unknown[][] = [UTM_HEADERS];
  for (const p of UTM_PARAMS) for (const [c, rule] of Object.entries(r.utm[p] ?? {})) utm.push([UTM_LABEL[p], c, rule.label, rule.kind ? KIND_NAME[rule.kind] : "", ""]);
  const out: Record<string, unknown[][]> = { [SHEET_SETS]: sets, [SHEET_FIELDS]: fields, [SHEET_VALUES]: values, [SHEET_UTM]: utm, [SHEET_GUIDE]: GUIDE_ROWS };
  if (items?.length) {
    const sep = schema.sets.find((s) => !s.campaigns.length)?.separator ?? "_";
    const sample = [...new Map(items.map((it) => [it.name, it])).values()].slice(0, 80).map((it) => [it.campaign ?? "", it.name, ...it.name.trim().split(sepRegex(sep)).filter(Boolean)]);
    const w = Math.max(1, ...sample.map((x) => x.length - 2));
    out[SHEET_SAMPLE] = [["캠페인", "소재명", ...Array.from({ length: w }, (_, i) => `조각 ${i + 1}`)], ...sample];
  }
  if (utmValues) {
    const rows: unknown[][] = [["파라미터", "실제 값", "소재 수", "지금 해석"]];
    for (const p of UTM_PARAMS)
      for (const [v, n] of utmValues[p] ?? []) {
        const m = matchUtm(v, r.utm[p] ?? {});
        rows.push([UTM_LABEL[p], v, n, m ? `${m.rule.label}${m.rule.kind ? ` · ${KIND_NAME[m.rule.kind]}` : ""} (규칙 '${m.code}')` : "규칙 없음 — 값 그대로 보여요"]);
      }
    if (rows.length > 1) out[SHEET_UTM_VALUES] = rows;
  }
  return out;
}

export type ParseResult = { rules: { schema: NameSchema | null; utm: UtmRules }; errors: string[]; warnings: string[]; counts: Record<string, number>; found: { fields: boolean; utm: boolean } };

// 머리글 행(앞 10행 안)과 열 위치 찾기 — 머리글은 비슷한 말이면 받는다
function headerOf(rows: unknown[][], want: Record<string, string[]>, need: string[]): { at: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = (rows[i] ?? []).map(key);
    const col: Record<string, number> = {};
    for (const [k, names] of Object.entries(want)) {
      const j = cells.findIndex((c) => names.includes(c));
      if (j >= 0) col[k] = j;
    }
    if (need.every((k) => col[k] != null)) return { at: i, col };
  }
  return null;
}
const H_SET = ["세트", "세트이름", "규칙세트", "규칙"];
const H_NAME = ["항목이름", "항목", "이름", "항목명", "필드", "구분"];
const H_POS = ["위치", "순서", "자리", "조각", "번째"];
const H_KIND = ["종류", "유형", "타입", "type"];
const H_DATE = ["날짜형식", "형식", "날짜"];
const H_MAP = ["성과맵기준", "성과맵", "대표", "대표항목", "맵"];
const H_CODE = ["코드", "값", "약어", "표기", "소재명표기", "code"];
const H_LABEL = ["의미", "설명", "뜻", "명칭", "한글명", "풀네임", "label", "name"];
const KIND_OF: Record<string, FieldKind> = { 텍스트: "text", 문자: "text", 글자: "text", text: "text", "": "text", 날짜: "date", 일자: "date", date: "date", 번호: "number", 숫자: "number", 순번: "number", number: "number", 무시: "ignore", 건너뜀: "ignore", 사용안함: "ignore", ignore: "ignore" };
const DATE_OF: Record<string, DateFormat | "auto"> = { "": "auto", 자동: "auto", auto: "auto", yymmdd: "yymmdd", "6자리": "yymmdd", yyyymmdd: "yyyymmdd", "8자리": "yyyymmdd", mmdd: "mmdd", "4자리": "mmdd" };
const YES = new Set(["o", "○", "●", "v", "✓", "✔", "y", "yes", "예", "1", "true", "대표"]);

export function parseRulesWorkbook(sheets: Record<string, unknown[][]>): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const names = Object.keys(sheets);
  const ref = (n: string) => /참고|안내/.test(n);
  const cell = (row: unknown[], j: number | undefined) => (j == null ? "" : str(row[j]));

  // ① 규칙 세트(선택)
  const setSheet = names.find((n) => !ref(n) && key(n).includes("세트"));
  const sets: RuleSet[] = [];
  if (setSheet) {
    const h = headerOf(sheets[setSheet], { name: H_SET.concat(["세트이름"]), camp: ["적용캠페인", "캠페인", "적용", "대상캠페인"], sep: ["구분자", "구분기호", "separator"] }, ["name"]);
    if (!h) warnings.push(`'${setSheet}' 시트에서 '세트 이름' 머리글을 찾지 못해 기본 세트 하나로 읽어요.`);
    else
      for (const row of sheets[setSheet].slice(h.at + 1)) {
        const nm = cell(row, h.col.name);
        if (!nm) continue;
        if (sets.some((s) => s.name === nm)) {
          errors.push(`${setSheet}: 세트 이름 '${nm}'이(가) 두 번 있어요.`);
          continue;
        }
        sets.push({ name: nm.slice(0, 30), campaigns: cell(row, h.col.camp).split(/[,\n、/]/).map((x) => x.trim()).filter(Boolean), separator: cell(row, h.col.sep).replace(/\s/g, "").slice(0, 4) || "_", fields: [] });
      }
  }
  if (!sets.length) sets.push({ name: "기본", campaigns: [], separator: "_", fields: [] });
  if (sets.filter((s) => !s.campaigns.length).length > 1) warnings.push("적용 캠페인이 빈 세트가 여러 개예요 — 첫 번째만 기본으로 쓰여요.");
  const setOf = (nm: string, where: string) => {
    if (!nm) return sets.find((s) => !s.campaigns.length) ?? sets[0];
    const s = sets.find((x) => x.name === nm);
    if (!s) errors.push(`${where}: 세트 '${nm}'이(가) '규칙 세트' 시트에 없어요.`);
    return s ?? null;
  };

  // ② 항목(필수)
  const fieldSheet = names.find((n) => !ref(n) && key(n) === "항목") ?? names.find((n) => !ref(n) && !key(n).includes("세트") && !/utm|사전/i.test(n) && headerOf(sheets[n], { name: H_NAME, pos: H_POS }, ["name", "pos"]));
  if (!fieldSheet) errors.push(`'${SHEET_FIELDS}' 시트가 없어요(위치 · 항목 이름 · 종류). 템플릿을 내려받아 채워 주세요.`);
  else {
    const h = headerOf(sheets[fieldSheet], { set: H_SET, pos: H_POS, name: H_NAME.filter((x) => x !== "구분"), kind: H_KIND, date: H_DATE, map: H_MAP }, ["pos", "name"]);
    if (!h) errors.push(`'${fieldSheet}' 시트에서 '위치'·'항목 이름' 머리글을 찾지 못했어요.`);
    else
      sheets[fieldSheet].slice(h.at + 1).forEach((row, i) => {
        const line = h.at + i + 2;
        const rawPos = cell(row, h.col.pos);
        const nm = cell(row, h.col.name);
        const rawKind = key(cell(row, h.col.kind));
        if (!rawPos && !nm) return;
        const set = setOf(cell(row, h.col.set), `${fieldSheet} ${line}행`);
        if (!set) return;
        const kind = KIND_OF[rawKind];
        if (!kind) return void errors.push(`${fieldSheet} ${line}행: 종류 '${cell(row, h.col.kind)}'은(는) 텍스트·날짜·번호·무시 중 하나여야 해요.`);
        const k = key(rawPos);
        const pos: FieldPos | null = /^\d+$/.test(k) && Number(k) >= 1 && Number(k) <= 30 ? Number(k) : ["자동", "auto", "어디서든"].includes(k) ? "auto" : ["나머지", "rest", "끝까지"].includes(k) ? "rest" : null;
        if (pos == null) return void errors.push(`${fieldSheet} ${line}행: 위치 '${rawPos}'은(는) 1~30 숫자·자동·나머지 중 하나여야 해요.`);
        if (!nm && kind !== "ignore") return void errors.push(`${fieldSheet} ${line}행: 항목 이름이 비었어요.`);
        const name = (nm || `무시${line}`).slice(0, 30);
        if (set.fields.some((f) => f.name === name)) return void errors.push(`${fieldSheet} ${line}행: '${set.name}' 세트에 '${name}' 항목이 이미 있어요.`);
        if (typeof pos === "number" && set.fields.some((f) => f.pos === pos)) return void errors.push(`${fieldSheet} ${line}행: '${set.name}' 세트의 위치 ${pos}에 항목이 이미 있어요.`);
        if (pos === "auto" && kind !== "text") return void errors.push(`${fieldSheet} ${line}행: 위치 '자동'은 텍스트 항목만 쓸 수 있어요(값 사전으로 찾기 때문).`);
        const df = DATE_OF[key(cell(row, h.col.date))];
        if (kind === "date" && !df) warnings.push(`${fieldSheet} ${line}행: 날짜 형식 '${cell(row, h.col.date)}'을(를) 몰라 자동으로 읽어요.`);
        const map = YES.has(key(cell(row, h.col.map)));
        if (map && kind !== "text") warnings.push(`${fieldSheet} ${line}행: 성과 맵 기준은 텍스트 항목만 돼요 — 무시했어요.`);
        set.fields.push({ name, pos, kind, ...(kind === "date" ? { dateFormat: df ?? "auto" } : {}), ...(map && kind === "text" ? { map: true } : {}), dict: {} });
      });
    for (const s of sets) {
      if (s.fields.filter((f) => f.map).length > 1) {
        warnings.push(`'${s.name}' 세트에 성과 맵 기준이 여러 개예요 — 첫 번째만 써요.`);
        let seen = false;
        for (const f of s.fields) if (f.map) (seen ? delete f.map : (seen = true));
      }
      s.fields.sort((a, b) => (typeof a.pos === "number" ? a.pos : a.pos === "rest" ? 99 : 100) - (typeof b.pos === "number" ? b.pos : b.pos === "rest" ? 99 : 100));
    }
  }

  // ③ 값 사전(선택) — 의미를 비운 줄은 참고용이라 건너뜀
  const valueSheet = names.find((n) => !ref(n) && key(n).includes("사전")) ?? names.find((n) => !ref(n) && n !== fieldSheet && !key(n).includes("세트") && !/utm/i.test(n) && headerOf(sheets[n], { name: H_NAME, code: H_CODE }, ["name", "code"]));
  const renamed = new Set<string>();
  if (valueSheet) {
    const h = headerOf(sheets[valueSheet], { set: H_SET, pos: H_POS, name: H_NAME, code: H_CODE.filter((x) => x !== "값"), label: H_LABEL }, ["name", "code"]) ?? headerOf(sheets[valueSheet], { set: H_SET, pos: H_POS, name: H_NAME, code: H_CODE, label: H_LABEL }, ["name", "code"]);
    if (!h) warnings.push(`'${valueSheet}' 시트에서 '항목 이름'·'코드' 머리글을 찾지 못해 값 사전은 건너뛰었어요.`);
    else
      sheets[valueSheet].slice(h.at + 1).forEach((row, i) => {
        const line = h.at + i + 2;
        const nm = cell(row, h.col.name);
        const code = cell(row, h.col.code).toLowerCase();
        const label = cell(row, h.col.label);
        if (!nm && !code) return;
        if (!label) return; // 뜻을 안 적은 줄 = 원문 그대로
        const setName = cell(row, h.col.set);
        const pk = key(cell(row, h.col.pos));
        const pos: FieldPos | null = /^\d+$/.test(pk) ? Number(pk) : pk === "자동" || pk === "auto" ? "auto" : pk === "나머지" || pk === "rest" ? "rest" : null;
        // 항목은 이름으로 찾고, 없으면 위치로(템플릿의 '항목1'을 항목 시트에서만 '시즌'으로 바꿔도 이어지게)
        const findIn = (s: RuleSet) => s.fields.find((x) => x.name === nm) ?? (pos != null ? s.fields.find((x) => x.pos === pos) : undefined);
        // 세트를 비웠으면 그 항목이 있는 첫 세트(기본 우선)
        const set = setName ? setOf(setName, `${valueSheet} ${line}행`) : sets.find((s) => !s.campaigns.length && findIn(s)) ?? sets.find((s) => findIn(s)) ?? null;
        if (!set) return void (setName ? null : errors.push(`${valueSheet} ${line}행: 항목 '${nm}'이(가) '항목' 시트에 없어요.`));
        const f = findIn(set);
        if (!f) return void errors.push(`${valueSheet} ${line}행: '${set.name}' 세트에 '${nm}' 항목이 없어요.`);
        if (f.name !== nm && nm && !renamed.has(`${set.name}|${nm}`)) {
          renamed.add(`${set.name}|${nm}`);
          warnings.push(`값 사전의 '${nm}'은(는) 같은 위치(${posLabel(f.pos)})의 '${f.name}' 항목으로 읽었어요.`);
        }
        if (f.kind !== "text") return void warnings.push(`${valueSheet} ${line}행: '${nm}'은(는) ${FIELD_KIND_LABEL[f.kind]} 항목이라 값 사전을 쓰지 않아요.`);
        if (!code) return void errors.push(`${valueSheet} ${line}행: 코드가 비었어요.`);
        if (code.length > 80) return void errors.push(`${valueSheet} ${line}행: 코드가 너무 길어요(80자까지).`);
        if (f.dict[code] && f.dict[code] !== label) warnings.push(`${valueSheet} ${line}행: '${nm}' 코드 '${code}'가 두 번 나와 아래 값으로 덮었어요.`);
        f.dict[code] = label.slice(0, 80);
      });
  }
  for (const s of sets)
    for (const f of s.fields) if (f.pos === "auto" && !Object.keys(f.dict).length) warnings.push(`'${s.name}' 세트 '${f.name}'은(는) 위치가 '자동'인데 값 사전이 없어 찾을 게 없어요.`);
  const live = sets.filter((s) => s.fields.length);
  for (const s of sets) if (!s.fields.length && fieldSheet) warnings.push(`'${s.name}' 세트에 항목이 없어 빼고 저장해요.`);
  counts["규칙 세트"] = live.length;
  counts["항목"] = live.reduce((n, s) => n + s.fields.length, 0);
  counts["값 사전"] = live.reduce((n, s) => n + s.fields.reduce((k2, f) => k2 + Object.keys(f.dict).length, 0), 0);

  // ④ UTM(파라미터 고정, 값의 뜻·유형)
  const utm = emptyUtm();
  const utmSheet = names.find((n) => /utm/i.test(n) && !ref(n));
  if (utmSheet) {
    const h = headerOf(sheets[utmSheet], { param: ["파라미터", "utm", "utm파라미터", "구분", "항목"], code: ["값", "코드", "utm값", "value"], label: ["의미", "설명", "이름", "명칭", "label"], kind: ["캠페인유형", "유형", "목표유형"] }, ["param", "code"]);
    if (!h) warnings.push(`'${utmSheet}' 시트에서 파라미터·값 머리글을 찾지 못해 UTM 규칙은 건너뛰었어요.`);
    else
      sheets[utmSheet].slice(h.at + 1).forEach((row, i) => {
        const line = h.at + i + 2;
        const rawP = cell(row, h.col.param);
        const code = utmCode(cell(row, h.col.code));
        if (!rawP && !code) return;
        const p = UTM_ALIAS[key(rawP)];
        if (!p) return void errors.push(`${utmSheet} ${line}행: 파라미터 '${rawP}'은(는) utm_source·utm_medium·utm_campaign·utm_content 중 하나여야 해요.`);
        if (!code) return void errors.push(`${utmSheet} ${line}행: 값이 비었어요.`);
        if (!UTM_OK.test(code)) return void errors.push(`${utmSheet} ${line}행: 값 '${cell(row, h.col.code)}'이(가) 너무 길거나 쓸 수 없는 문자가 있어요(100자까지).`);
        const rawK = key(cell(row, h.col.kind));
        const kind = rawK ? KIND_ALIAS[rawK] : undefined;
        if (rawK && !kind) warnings.push(`${utmSheet} ${line}행: 캠페인 유형 '${cell(row, h.col.kind)}'은(는) 프로모션·상시·브랜딩 중 하나여야 해서 비웠어요.`);
        if (kind && p !== "campaign") warnings.push(`${utmSheet} ${line}행: 캠페인 유형은 utm_campaign에만 적용돼요.`);
        utm[p][code] = { label: (cell(row, h.col.label) || code).slice(0, 80), ...(kind && p === "campaign" ? { kind } : {}) };
      });
    for (const p of UTM_PARAMS) counts[UTM_LABEL[p]] = Object.keys(utm[p]).length;
  }
  return { rules: { schema: live.length ? { sets: live } : null, utm: utmSheet ? utm : structuredClone(DEFAULT_UTM) }, errors, warnings, counts, found: { fields: !!fieldSheet, utm: !!utmSheet } };
}
