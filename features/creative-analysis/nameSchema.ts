// 광고주가 직접 정하는 소재명 규칙(순수 함수) — 2026-10-06 재설계.
// 왜: 광고주·캠페인마다 소재명 구성이 전부 다르다(한글 항목, 날짜만 있는 이름, '시즌·카피톤·촬영 방식' 같은 고유 항목).
//     그래서 분류(목표·콘텐츠·상품…)를 코드에 고정하지 않고, 항목 이름·위치·종류를 규칙 파일에서 받는다.
// 구조: 규칙 세트(캠페인 이름에 들어간 말로 고름, 비우면 기본) → 항목(위치 1·2·3… / 자동 = 이름 어디서든 사전 코드 찾기 / 나머지)
//       → 종류(텍스트·날짜·번호·무시) → 값 사전(코드 → 의미, 비우면 조각 원문 그대로)
// 분석 축(성과 맵·조합 매트릭스·요소별 성과·태그)은 텍스트 항목 이름 그대로 만들어진다. 저장된 규칙이 없으면 내장 해석(르무통)을 쓴다.
import type { Enriched } from "./analyze";
import { dateOf, parseAdName, type DateFormat, type NamingDict, type ParsedAdName, type ParsedField } from "./naming";

export type FieldKind = "text" | "date" | "number" | "ignore";
export type FieldPos = number | "auto" | "rest";
export type SchemaField = { name: string; pos: FieldPos; kind: FieldKind; dateFormat?: DateFormat | "auto"; map?: boolean; dict: Record<string, string> };
export type RuleSet = { name: string; campaigns: string[]; separator: string; fields: SchemaField[] };
export type NameSchema = { sets: RuleSet[] };

export const KIND_LABEL: Record<FieldKind, string> = { text: "텍스트", date: "날짜", number: "번호", ignore: "무시" };

const esc = (s: string) => s.replace(/[\\\]^-]/g, "\\$&");
export const sepRegex = (sep: string) => new RegExp(`[${esc(sep || "_")}\\s]+`);
const lc = (s: string) => s.trim().toLowerCase();

// 캠페인 이름에 적용 캠페인 말이 들어간 첫 세트 → 없으면 적용 캠페인이 빈 세트(기본) → 없으면 첫 세트
export function pickSet(schema: NameSchema, campaignName: string | null | undefined): RuleSet | null {
  const c = lc(campaignName ?? "");
  return schema.sets.find((s) => s.campaigns.length && s.campaigns.some((w) => w && c.includes(lc(w)))) ?? schema.sets.find((s) => !s.campaigns.length) ?? schema.sets[0] ?? null;
}

// tokens[i..]에 가장 길게 맞는 사전 코드(코드 안에 구분자가 있으면 여러 조각)
function longestCode(tokens: string[], i: number, dict: Record<string, string>, re: RegExp): { code: string; len: number } | null {
  let best: { code: string; len: number } | null = null;
  for (const code of Object.keys(dict)) {
    const parts = code.split(re).filter(Boolean);
    if (!parts.length || i + parts.length > tokens.length) continue;
    if (parts.every((p, k) => tokens[i + k] === p) && (!best || parts.length > best.len)) best = { code, len: parts.length };
  }
  return best;
}

function dateAuto(tok: string, fmt: DateFormat | "auto" | undefined): string | null {
  if (fmt && fmt !== "auto") return dateOf(tok, fmt);
  return dateOf(tok, tok.length === 8 ? "yyyymmdd" : tok.length === 4 ? "mmdd" : "yymmdd");
}

export function parseBySet(name: string, set: RuleSet): ParsedAdName {
  const re = sepRegex(set.separator);
  const orig = name.trim().split(re).filter(Boolean);
  const tokens = orig.map(lc);
  const out: ParsedAdName = { launchDate: null, objective: null, type: "미분류", theme: null, themeCode: null, model: null, tvc: null, products: [], influencer: null, videoLength: null, serial: null, detail: null, unknown: [], fields: [], mapValue: null, ruleSet: set.name, outOfRule: false };
  const positional = set.fields.filter((f) => typeof f.pos === "number" && f.kind !== "ignore");
  const maxPos = Math.max(0, ...set.fields.map((f) => (typeof f.pos === "number" ? f.pos : 0)));
  // '못 읽음'(unknown) = 날짜 항목인데 날짜가 아닌 조각, 규칙 밖 이름(조각이 위치 항목 수의 60% 미만 — 예: '브랜드광고')
  out.outOfRule = positional.length > 0 && tokens.length < Math.ceil(positional.length * 0.6);
  for (const f of set.fields) {
    if (f.kind === "ignore") continue;
    let values: string[] = [];
    let raw: string | null = null;
    const hasDict = Object.keys(f.dict).length > 0;
    if (typeof f.pos === "number") {
      const i = f.pos - 1;
      const t = tokens[i];
      if (t != null) {
        raw = orig[i];
        if (f.kind === "date") {
          const d = dateAuto(t, f.dateFormat);
          if (d) values = [d];
          else out.unknown.push(raw);
        } else if (f.kind === "number") values = [raw];
        else {
          // 사전에 뜻이 있으면 뜻, 없으면 조각 원문이 값(뜻을 일부만 적어도 정상 — '못 읽음'이 아님)
          const hit = hasDict ? longestCode(tokens, i, f.dict, re) : null;
          values = [hit ? f.dict[hit.code] : raw];
        }
      }
    } else if (f.pos === "rest") {
      const rest = orig.slice(maxPos);
      if (rest.length) {
        raw = rest.join(set.separator || "_");
        values = [f.dict[lc(raw)] ?? raw];
      }
    } else {
      // 자동 — 이름 어디서든 사전 코드를 찾는다(가장 긴 것 하나). 사전이 없으면 찾을 게 없음
      for (let i = 0; i < tokens.length && !values.length; i++) {
        const hit = longestCode(tokens, i, f.dict, re);
        if (hit) {
          values = [f.dict[hit.code]];
          raw = orig.slice(i, i + hit.len).join(set.separator || "_");
        }
      }
    }
    out.fields!.push({ name: f.name, kind: f.kind, values, raw });
    if (f.kind === "date" && values[0] && !out.launchDate) out.launchDate = values[0];
    if (f.kind === "number" && values[0] && !out.serial) out.serial = values[0];
  }
  // 마지막 위치 뒤에 남는 조각(나머지 항목이 없을 때) — 못 읽음은 아니고 미리보기에 따로 보여 준다
  if (!set.fields.some((f) => f.pos === "rest") && orig.length > maxPos && maxPos > 0) out.detail = orig.slice(maxPos).join(set.separator || "_");
  if (out.outOfRule) out.unknown.push("(규칙 밖 이름)");
  const mapField = set.fields.find((f) => f.map && f.kind === "text") ?? set.fields.find((f) => f.kind === "text");
  out.mapValue = mapField ? out.fields!.find((x) => x.name === mapField.name)?.values[0] ?? null : null;
  out.theme = out.mapValue; // 성과 맵·'같은 테마' 등 기존 코드가 theme을 보므로 대표 값을 넣어 둔다
  return out;
}

// 내장 해석(르무통 사전) 결과를 같은 '항목' 모양으로 — 분석 축을 하나의 방식으로 만들기 위해
const LEGACY_FIELDS: [string, (p: ParsedAdName) => string[]][] = [
  ["목표", (p) => (p.objective ? [p.objective] : [])],
  ["콘텐츠", (p) => (p.theme ? [p.theme] : [])],
  ["상품", (p) => p.products],
  ["모델", (p) => (p.model ? [p.model] : [])],
  ["TVC", (p) => (p.tvc ? [p.tvc] : [])],
  ["인플루언서", (p) => (p.influencer ? [`@${p.influencer}`] : [])],
  ["영상 길이", (p) => (p.videoLength ? [p.videoLength] : [])],
];
function withLegacyFields(p: ParsedAdName): ParsedAdName {
  p.fields = LEGACY_FIELDS.map(([name, get]) => ({ name, kind: "text" as const, values: get(p), raw: null }));
  return p;
}

// 소재명 해석 입구 — 저장된 규칙(schema)이 있으면 캠페인으로 세트를 골라 그 규칙대로, 없으면 내장 해석
export function parseName(name: string, campaignName: string | null | undefined, dict: NamingDict): ParsedAdName {
  const set = dict.schema ? pickSet(dict.schema, campaignName) : null;
  return set ? parseBySet(name, set) : withLegacyFields(parseAdName(name, dict));
}

// 분석 축 — 텍스트 항목을 이름 그대로(행에 나온 순서), 값이 없으면 '<항목> 없음'
export type FieldDim = { key: string; label: string; basis: "소재명"; get: (r: Enriched) => string[] | string | null };
export function fieldDims(rows: Enriched[]): FieldDim[] {
  const names: string[] = [];
  for (const r of rows) for (const f of r.parsed.fields ?? []) if (f.kind === "text" && !names.includes(f.name)) names.push(f.name);
  return names.map((n) => ({
    key: `nf:${n}`,
    label: n,
    basis: "소재명" as const,
    get: (r: Enriched) => {
      const f = r.parsed.fields?.find((x) => x.name === n);
      return f?.values.length ? f.values : `${n} 없음`;
    },
  }));
}
export const fieldValue = (p: ParsedAdName, name: string) => p.fields?.find((x) => x.name === name)?.values.join(", ") || null;
export type { ParsedField };
