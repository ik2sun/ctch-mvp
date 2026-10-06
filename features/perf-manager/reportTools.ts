// 캠페인 매니저 '리포트 분석' 도구 — 실제 매체 API로 소재·성별·연령 단위까지 본다. 서버 전용.
//  - 소재 리포트: 소재 분석 메뉴와 같은 경로(fetchMetaCreatives → enrich → decide) — 화면과 같은 판정(키우기·끄기…)·유형별 성과·피로도
//  - 성별·연령 리포트: 메타 인사이트 breakdowns=age,gender(계정 단위 1회, 소재 이름 필터가 있으면 광고 단위)
// 메타만 지원(소재 분석이 메타 1단계). 같은 광고주·기간은 서버 메모리 10분 캐시 — 메타 앱 호출 한도 보호.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMetaToken } from "@/lib/meta/token";
import { actOf, graphAll, num, pickAction, PURCHASE_TYPES } from "@/lib/meta/graph";
import { fetchMetaCreatives } from "@/features/creative-analysis/fetchMeta";
import { enrich, fatigue, type Enriched } from "@/features/creative-analysis/analyze";
import { decide, STATUS_META, type Decision } from "@/features/creative-analysis/decision";
import { themeStats } from "@/features/creative-analysis/groups";
import { cleanRules, labelUtm, resolveRules } from "@/features/creative-analysis/namingRules";
import { fetchMetaDemographics } from "@/features/creative-analysis/fetchDemographics";

// 지금 켜진 광고 — 소재 분석 DecisionQueue.isActive와 같은 기준(그 파일은 화면 전용이라 여기 둔다)
const isActive = (s: string) => s === "ACTIVE" || s === "IN_PROCESS" || s === "WITH_ISSUES" || s === "PENDING_REVIEW";
const kst = (offsetDays: number) => new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const pct = (v: number | null, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const TTL = 10 * 60 * 1000;
const CACHE = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  return v;
}

type MetaClient = { name: string; meta_account_id: string | null; meta_access_token: string | null; naming_rules?: unknown; target_roas?: number | null; target_roas_rules?: unknown };
async function metaClient(supabase: SupabaseClient, clientId: string, ownerId: string): Promise<{ c: MetaClient; token: string }> {
  // 0029·0032 컬럼이 없어도 동작하게 단계적으로 읽는다
  const full = await supabase.from("clients").select("name, meta_account_id, meta_access_token, naming_rules, target_roas, target_roas_rules").eq("id", clientId).eq("user_id", ownerId).maybeSingle();
  const res = full.error ? await supabase.from("clients").select("name, meta_account_id, meta_access_token").eq("id", clientId).eq("user_id", ownerId).maybeSingle() : full;
  const c = res.data as MetaClient | null;
  if (!c) throw new Error("광고주를 찾을 수 없어요.");
  if (!c.meta_account_id) throw new Error(`${c.name}에 메타 광고계정 ID가 없어 소재·성별·연령 리포트를 볼 수 없어요(광고주 관리에서 등록).`);
  const { token } = await resolveMetaToken(c.meta_access_token);
  if (!token) throw new Error("메타 액세스 토큰이 없어요.");
  return { c, token };
}

// 소재 단위 — 화면(소재 분석)과 같은 해석·판정
async function creativeRows(supabase: SupabaseClient, clientId: string, ownerId: string, days: number) {
  const since = kst(days);
  const until = kst(1);
  const { c, token } = await metaClient(supabase, clientId, ownerId);
  const res = await cached(`cr:${clientId}:${since}:${until}`, () => fetchMetaCreatives({ name: c.name, meta_account_id: c.meta_account_id! }, token, since, until));
  const saved = c.naming_rules ? cleanRules(c.naming_rules) : null;
  const rules = resolveRules(saved, c.name);
  const rows: Enriched[] = enrich(res.creatives, res.adsets, res.campaigns, rules.dict, res.period.until, 3000).map((r) => ({ ...r, utmLabel: labelUtm(r.utm, rules.utm) }));
  const target = c.target_roas ? Number(c.target_roas) : 500;
  const trules = (c.target_roas_rules && typeof c.target_roas_rules === "object" ? c.target_roas_rules : {}) as Record<string, number>;
  const fat = fatigue(rows);
  const decisions = decide(rows, target, trules, new Set(fat.map((f) => f.row.id)));
  return { rows, decisions, fat, target, since: res.period.since, until: res.period.until, rulesSource: rules.source, adIds: res.creatives.map((x) => x.id) };
}

function creativeLine(r: Enriched, d: Decision | undefined): string {
  const tags = (r.parsed.fields ?? []).filter((f) => f.kind === "text" && f.values.length).map((f) => `${f.name}=${f.values.join(",")}`).join(" ");
  return `- ${r.name} [${r.group === "sales" ? "전환" : "트래픽·인지"} · ${isActive(r.status) ? "켜짐" : "꺼짐"}]${tags ? ` (${tags})` : ""}\n  광고비 ${won(r.cost)} · ROAS ${pct(r.roas)} · 전환 ${r.conversions.toFixed(0)} · CPA ${r.cpa ? won(r.cpa) : "—"} · CTR ${pct(r.ctr, 2)} · CVR ${pct(r.cvr, 2)} · 집행 ${r.ageDays ?? "?"}일${d ? ` · 판정 ${STATUS_META[d.status].label}(${d.reason}, 신뢰도 ${d.confidence})` : ""}`;
}

export async function creativeReport(supabase: SupabaseClient, clientId: string, ownerId: string, opt: { days: number; sort: string; nameContains: string; limit: number }): Promise<string> {
  const { rows, decisions, fat, target, since, until, rulesSource } = await creativeRows(supabase, clientId, ownerId, opt.days);
  const q = opt.nameContains.toLowerCase();
  const pool = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q));
  const total = pool.reduce((a, r) => a + r.cost, 0);
  const rev = pool.reduce((a, r) => a + r.revenue, 0);
  const out: string[] = [`메타 소재 ${pool.length}개 · 기간 ${since} ~ ${until} · 광고비 ${won(total)} · ROAS ${total ? pct(rev / total) : "—"} · 판정 기준 목표 ROAS ${target}% · 소재명 해석: ${rulesSource ?? "공통 패턴만"}`];
  // 판정 요약(켜진 소재 기준 — 화면 '이번 주 결정'과 같음)
  const cnt = new Map<string, { n: number; cost: number }>();
  for (const r of pool) {
    const d = decisions.get(r.id);
    if (!d || ((d.status === "kill" || d.status === "starved") && !isActive(r.status))) continue;
    const c = cnt.get(d.status) ?? { n: 0, cost: 0 };
    cnt.set(d.status, { n: c.n + 1, cost: c.cost + r.cost });
  }
  out.push("판정(켜진 소재): " + [...cnt].map(([s, v]) => `${STATUS_META[s as keyof typeof STATUS_META].label} ${v.n}개(${won(v.cost)})`).join(" · "));
  // 유형별(성과 맵 기준)
  const th = themeStats(pool, 10);
  out.push("", "## 소재 유형별(성과 맵 기준 — 광고비 상위)");
  for (const t of th.list) out.push(`- ${t.label}: 소재 ${t.n} · 광고비 ${won(t.cost)}(${pct(t.share)}) · ROAS ${pct(t.roas)} · CTR ${pct(t.ctr, 2)}`);
  // 소재 목록
  const sorted = [...pool].sort((a, b) =>
    opt.sort === "worst" ? (a.judged && b.judged ? (a.roas ?? 0) - (b.roas ?? 0) : Number(b.judged) - Number(a.judged)) : opt.sort === "best" ? (b.judged ? b.roas ?? 0 : -1) - (a.judged ? a.roas ?? 0 : -1) : b.cost - a.cost,
  );
  const lim = Math.min(40, Math.max(5, opt.limit || 15));
  out.push("", `## 소재(${opt.sort === "best" ? "ROAS 높은 순" : opt.sort === "worst" ? "ROAS 낮은 순(판단 가능 소재)" : "광고비 순"} 상위 ${Math.min(lim, sorted.length)}개)`);
  for (const r of sorted.slice(0, lim)) out.push(creativeLine(r, decisions.get(r.id)));
  // 피로
  const f = fat.filter((x) => pool.includes(x.row)).slice(0, 8);
  out.push("", `## 피로 의심(7일+·빈도 2+·처음 3일 대비 CTR −30%↓, 광고비 상위 40개 중) ${f.length}개`);
  for (const x of f) out.push(`- ${x.row.name}: CTR ${pct(x.ctrFirst, 2)} → ${pct(x.ctrLast, 2)}(${Math.round(x.drop * 100)}%) · 빈도 ${x.row.frequency.toFixed(1)}`);
  out.push("", "주의: ROAS 판정 구간은 전환 수 기준 근사(주문 금액 편차 미반영). 메타 리포트 기여 매출이라 증분 효과는 아님.");
  return out.join("\n");
}

const GENDER: Record<string, string> = { male: "남성", female: "여성", unknown: "성별 미상" };
export async function audienceReport(supabase: SupabaseClient, clientId: string, ownerId: string, opt: { days: number; by: string; creativeContains: string }): Promise<string> {
  const since = kst(opt.days);
  const until = kst(1);
  type Seg = { age: string; gender: string; cost: number; impressions: number; clicks: number; conversions: number; revenue: number };
  let segs: Seg[];
  let scope = "계정 전체";
  if (opt.creativeContains.trim()) {
    // 소재 이름 필터 — 광고 단위 breakdowns(소재 분석과 같은 분할 조회)
    const { rows, adIds } = await creativeRows(supabase, clientId, ownerId, opt.days);
    const q = opt.creativeContains.toLowerCase();
    const ids = rows.filter((r) => r.name.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q)).map((r) => r.id);
    if (!ids.length) return `이름에 '${opt.creativeContains}'가 들어간 소재·캠페인이 이 기간에 없어요.`;
    const { c, token } = await metaClient(supabase, clientId, ownerId);
    const demo = await cached(`demo:${clientId}:${since}:${until}`, () => fetchMetaDemographics(c.meta_account_id!, token, since, until, adIds));
    const want = new Set(ids);
    segs = demo.rows.filter((d) => want.has(d.adId)).map((d) => ({ age: d.age, gender: d.gender, cost: d.cost, impressions: d.impressions, clicks: d.linkClicks, conversions: d.conversions, revenue: d.revenue }));
    scope = `'${opt.creativeContains}' 소재 ${ids.length}개`;
  } else {
    const { c, token } = await metaClient(supabase, clientId, ownerId);
    const raw = await cached(`acct-demo:${clientId}:${since}:${until}`, () =>
      graphAll<Record<string, unknown>>(`${actOf(c.meta_account_id!)}/insights`, { level: "account", time_range: JSON.stringify({ since, until }), breakdowns: "age,gender", fields: "impressions,inline_link_clicks,spend,actions,action_values" }, token, 5),
    );
    segs = raw.map((r) => ({ age: String(r.age ?? "미상"), gender: GENDER[String(r.gender ?? "unknown")] ?? "성별 미상", cost: num(r.spend), impressions: num(r.impressions), clicks: num(r.inline_link_clicks), conversions: pickAction(r.actions, PURCHASE_TYPES), revenue: pickAction(r.action_values, PURCHASE_TYPES) }));
  }
  const keyOf = (s: Seg) => (opt.by === "gender" ? s.gender : opt.by === "age" ? s.age : `${s.gender} ${s.age}`);
  const m = new Map<string, Seg>();
  for (const s of segs) {
    const k = keyOf(s);
    const a = m.get(k) ?? { age: s.age, gender: s.gender, cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    a.cost += s.cost;
    a.impressions += s.impressions;
    a.clicks += s.clicks;
    a.conversions += s.conversions;
    a.revenue += s.revenue;
    m.set(k, a);
  }
  const total = [...m.values()].reduce((a, s) => a + s.cost, 0);
  const rev = [...m.values()].reduce((a, s) => a + s.revenue, 0);
  const base = total ? rev / total : null;
  const out = [`메타 성별·연령 실제 성과(광고 관리자 '분석 기준 > 연령 및 성별') · ${scope} · 기간 ${since} ~ ${until} · 광고비 ${won(total)} · ROAS ${pct(base)}`];
  for (const [k, s] of [...m].sort((a, b) => b[1].cost - a[1].cost)) {
    const roas = s.cost ? s.revenue / s.cost : null;
    const conv = s.conversions;
    // 전환 수 기준 90% 구간 — 평균과 확실히 다른지(소재 분석 조합 매트릭스와 같은 기준, 전환 5건↑)
    const rel = conv >= 5 ? 1.645 / Math.sqrt(conv) : null;
    const tag = roas != null && base != null && rel != null ? (roas * (1 - rel) > base ? " ▲평균보다 확실히 높음" : roas * (1 + rel) < base ? " ▼평균보다 확실히 낮음" : "") : conv < 5 ? " (전환 5건 미만 — 판단 보류)" : "";
    out.push(`- ${k}: 광고비 ${won(s.cost)}(${total ? pct(s.cost / total) : "—"}) · ROAS ${pct(roas)}${tag} · 전환 ${conv.toFixed(0)} · CPA ${conv ? won(s.cost / conv) : "—"} · CTR ${s.impressions ? pct(s.clicks / s.impressions, 2) : "—"}`);
  }
  out.push("", "주의: 타겟을 열어 둔 광고는 메타가 잘 사는 층에 노출을 몰아주므로 구간 ROAS = 그 층의 반응 + 메타의 선별. 원인 확정은 성별·연령을 좁힌 테스트로.");
  return out.join("\n");
}
