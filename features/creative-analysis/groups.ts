// 소재명·UTM 기반 묶음 — 순수 함수(화면 계산, API 비용 없음).
// 규칙: 소재명 = 날짜_캠페인목표_콘텐츠명(상품명)_소재번호. 실제 이름은 번호가 따로 붙거나(…_walkingclub_02) 붙여 쓰이거나(…_yoona_ev01),
// 뒤에 변형 표시가 붙는다(…_hub04_b). → A/B 묶음 키 = 끝의 숫자·한 글자 조각을 떼고, 마지막 조각 끝 숫자를 뗀 앞부분.
// UTM(르무통 실측): utm_source=meta · utm_medium=display|video · utm_campaign=pm|ongoing · utm_content=infeed_<타겟>_<소재명>.
import type { Enriched } from "./analyze";
import type { NamingDict } from "./naming";

// ── 목표 코드(CV·TR…) ─────────────────────────────
export function objectiveCode(r: Enriched, dict: NamingDict): string | null {
  if (r.parsed.objectiveCode) return r.parsed.objectiveCode; // 해석기가 찾은 위치(순서 모드 포함)
  const tok = r.name.toLowerCase().split("_")[1];
  if (tok && dict.objectives[tok]) return tok;
  const label = r.parsed.objective;
  const hit = label ? Object.entries(dict.objectives).find(([, v]) => v === label)?.[0] : undefined;
  return hit ?? (tok && /^(cv|tr|eg|bd|ba)$/.test(tok) ? tok : null);
}

// ── A/B 묶음 ─────────────────────────────
export function abKey(name: string): { prefix: string; variant: string } | null {
  const toks = name.trim().split(/[_\-|]+/).filter(Boolean); // 구분자가 다른 광고주(-, |)도 묶는다
  if (toks.length < 3) return null;
  const tail: string[] = [];
  while (toks.length > 2 && /^(\d{1,3}|[a-z])$/i.test(toks[toks.length - 1])) tail.unshift(toks.pop()!);
  const last = toks[toks.length - 1];
  const m = last.match(/^(.*?[a-z])(\d{1,3})$/i);
  if (m) {
    toks[toks.length - 1] = m[1];
    tail.unshift(m[2]);
  }
  if (!tail.length) return null;
  return { prefix: toks.join("_"), variant: tail.join("_") };
}

export type AbGroup = { prefix: string; rows: Enriched[]; winnerId: string | null; metric: "roas" | "ctr"; lift: number | null };

export function abGroups(rows: Enriched[]): AbGroup[] {
  const by = new Map<string, Enriched[]>();
  for (const r of rows) {
    const k = abKey(r.name);
    if (!k) continue;
    by.set(k.prefix, [...(by.get(k.prefix) ?? []), r]);
  }
  const out: AbGroup[] = [];
  for (const [prefix, list] of by) {
    if (list.length < 2) continue;
    const metric = list.some((r) => r.group === "sales") ? "roas" : "ctr";
    const v = (r: Enriched) => (metric === "roas" ? r.roas : r.ctr);
    const judged = list.filter((r) => r.judged && v(r) != null).sort((a, b) => v(b)! - v(a)!);
    const winner = judged.length >= 2 && v(judged[0])! > 0 ? judged[0] : null;
    const runner = winner ? judged[1] : null;
    out.push({
      prefix,
      rows: [...list].sort((a, b) => (abKey(a.name)?.variant ?? "").localeCompare(abKey(b.name)?.variant ?? "", undefined, { numeric: true })),
      winnerId: winner?.id ?? null,
      metric,
      lift: winner && runner && v(runner)! > 0 ? v(winner)! / v(runner)! - 1 : null,
    });
  }
  return out.sort((a, b) => b.rows.reduce((s, r) => s + r.cost, 0) - a.rows.reduce((s, r) => s + r.cost, 0));
}

// ── 테마(콘텐츠·상품) ─────────────────────────────
export function themeOf(r: Enriched): { key: string; label: string } {
  const p = r.parsed;
  if (p.ruleSet) return p.mapValue ? { key: `m:${p.mapValue}`, label: p.mapValue } : { key: "m:", label: "기타" }; // 광고주 규칙 — 성과 맵 기준 항목
  if (p.tvc) return { key: `tvc:${p.tvc}`, label: p.tvc };
  // 의미(라벨) 기준으로 묶는다 — 규칙에서 코드 여러 개에 같은 의미(예: springsale·spring_sale → 봄세일)를 주면 한 테마로
  if (p.themeCode || p.theme) return { key: `t:${p.theme ?? p.themeCode}`, label: p.theme ?? p.themeCode! };
  if (p.influencer) return { key: `inf:${p.influencer}`, label: `@${p.influencer}` };
  if (p.products.length) return { key: `p:${p.products[0]}`, label: p.products[0] };
  return { key: `type:${p.type}`, label: p.type === "미분류" ? "기타" : p.type };
}

export type ThemeStat = { key: string; label: string; n: number; cost: number; revenue: number; clicks: number; impressions: number; roas: number | null; ctr: number | null; share: number };

export function themeStats(rows: Enriched[], top = 12): { list: ThemeStat[]; roas: number | null; ctr: number | null } {
  const by = new Map<string, ThemeStat>();
  const total = rows.reduce((s, r) => s + r.cost, 0);
  for (const r of rows) {
    const t = themeOf(r);
    const cur = by.get(t.key) ?? { key: t.key, label: t.label, n: 0, cost: 0, revenue: 0, clicks: 0, impressions: 0, roas: null, ctr: null, share: 0 };
    cur.n++;
    cur.cost += r.cost;
    cur.revenue += r.revenue;
    cur.clicks += r.linkClicks;
    cur.impressions += r.impressions;
    by.set(t.key, cur);
  }
  const all = [...by.values()].map((t) => ({ ...t, roas: t.cost > 0 ? t.revenue / t.cost : null, ctr: t.impressions > 0 ? t.clicks / t.impressions : null, share: total > 0 ? t.cost / total : 0 }));
  all.sort((a, b) => b.cost - a.cost);
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length) {
    const s = rest.reduce((a, t) => ({ n: a.n + t.n, cost: a.cost + t.cost, revenue: a.revenue + t.revenue, clicks: a.clicks + t.clicks, impressions: a.impressions + t.impressions }), { n: 0, cost: 0, revenue: 0, clicks: 0, impressions: 0 });
    head.push({ key: "rest", label: `기타 ${rest.length}개`, ...s, roas: s.cost > 0 ? s.revenue / s.cost : null, ctr: s.impressions > 0 ? s.clicks / s.impressions : null, share: total > 0 ? s.cost / total : 0 });
  }
  const rev = rows.reduce((s, r) => s + r.revenue, 0);
  const clk = rows.reduce((s, r) => s + r.linkClicks, 0);
  const imp = rows.reduce((s, r) => s + r.impressions, 0);
  return { list: head, roas: total > 0 ? rev / total : null, ctr: imp > 0 ? clk / imp : null };
}

// ── UTM 패싯 ─────────────────────────────
export const NONE = "(없음)";
export type FacetKey = "source" | "medium" | "campaign" | "placement";
export const FACETS: { key: FacetKey; label: string; hint: string }[] = [
  { key: "source", label: "매체", hint: "utm_source" },
  { key: "medium", label: "광고 형태", hint: "utm_medium" },
  { key: "campaign", label: "캠페인", hint: "utm_campaign — 값의 뜻·유형은 분석 규칙의 UTM 규칙 시트" },
  { key: "placement", label: "지면", hint: "utm_content 첫 조각(예: infeed)" },
];
const CAMPAIGN_LABEL = (v: string) => (/^ongoing|상시/i.test(v) ? "상시(ongoing)" : /^(pm|promo)/i.test(v) ? "프로모션(pm)" : v);

export function facetValue(r: Enriched, f: FacetKey): string {
  if (r.utmLabel !== undefined) return r.utmLabel?.[f] ?? NONE; // 광고주 UTM 규칙 적용분
  const u = r.utm;
  if (!u) return NONE;
  if (f === "source") return u.source ?? NONE;
  if (f === "medium") return u.medium ?? NONE;
  if (f === "campaign") return u.campaign ? CAMPAIGN_LABEL(u.campaign) : NONE;
  const first = u.content?.split(/[_|]/)[0];
  return first && /^[a-z]+$/i.test(first) ? first : NONE;
}

export type FacetSel = Partial<Record<FacetKey, string[]>>;
export const matches = (r: Enriched, sel: FacetSel, skip?: FacetKey) =>
  (Object.keys(sel) as FacetKey[]).every((k) => k === skip || !sel[k]?.length || sel[k]!.includes(facetValue(r, k)));
