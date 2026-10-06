// 캠페인 매니저 도구 — 연동 매체 캠페인 성과를 대화용 텍스트로. 서버 전용.
// 데이터는 상관관계 분석과 같은 fetchClientCampaigns(캠페인 단위 일별, 구글 Ads 포함). 같은 광고주·기간은 서버 메모리 10분 캐시.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_MEDIA_COLUMNS, fetchClientCampaigns } from "@/features/correlation/fetchClient";
import { guessRole, MEDIA_LABEL, ROLE_META, type CorrCampaign, type CorrDataRes } from "@/features/correlation/types";
import { ownerFor } from "./store";
import type { CampaignOwner } from "./types";

const CACHE = new Map<string, { at: number; data: CorrDataRes }>();
const TTL = 10 * 60 * 1000;

const LABEL: Record<string, string> = MEDIA_LABEL;
const kst = (offsetDays: number) => new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);

export async function loadCampaigns(supabase: SupabaseClient, clientId: string, ownerId: string, days: number): Promise<CorrDataRes> {
  const since = kst(days);
  const until = kst(1);
  const key = `${clientId}:${since}:${until}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const { data: client } = await supabase.from("clients").select(CLIENT_MEDIA_COLUMNS).eq("id", clientId).eq("user_id", ownerId).maybeSingle();
  if (!client) throw new Error("광고주를 찾을 수 없어요.");
  const data = await fetchClientCampaigns(supabase, clientId, client as Record<string, unknown>, since, until);
  CACHE.set(key, { at: Date.now(), data });
  return data;
}

// 직전 같은 기간 — 지금 기간(days일, 어제까지) 바로 앞의 days일
export async function loadPreviousCampaigns(supabase: SupabaseClient, clientId: string, ownerId: string, days: number): Promise<CorrDataRes> {
  const since = kst(days * 2);
  const until = kst(days + 1);
  const key = `${clientId}:${since}:${until}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const { data: client } = await supabase.from("clients").select(CLIENT_MEDIA_COLUMNS).eq("id", clientId).eq("user_id", ownerId).maybeSingle();
  if (!client) throw new Error("광고주를 찾을 수 없어요.");
  const data = await fetchClientCampaigns(supabase, clientId, client as Record<string, unknown>, since, until);
  CACHE.set(key, { at: Date.now(), data });
  return data;
}

type Sum = { cost: number; impressions: number; clicks: number; conversions: number; revenue: number };
const zero = (): Sum => ({ cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
const add = (a: Sum, d: Sum) => {
  a.cost += d.cost;
  a.impressions += d.impressions;
  a.clicks += d.clicks;
  a.conversions += d.conversions;
  a.revenue += d.revenue;
};
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

function line(s: Sum): string {
  return `광고비 ${won(s.cost)} · 노출 ${n(s.impressions)} · 클릭 ${n(s.clicks)} · CTR ${pct(s.clicks, s.impressions)} · CPC ${s.clicks ? won(s.cost / s.clicks) : "—"} · 전환 ${n(s.conversions)} · CPA ${s.conversions ? won(s.cost / s.conversions) : "—"} · 매출 ${won(s.revenue)} · ROAS ${pct(s.revenue, s.cost)}`;
}

function change(cur: number, prev: number): string {
  if (!prev) return cur ? "신규" : "—";
  const r = (cur - prev) / prev;
  return `${r >= 0 ? "+" : ""}${(r * 100).toFixed(0)}%`;
}

// 캠페인별 기간 합계 + 최근 7일 vs 직전 7일 + 담당자. 광고비 상위 limit개
export function campaignReport(data: CorrDataRes, owners: CampaignOwner[], limit = 40, filter?: { media?: string; nameContains?: string; owner?: string }, prev?: CorrDataRes | null): string {
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => kst(i + 1)));
  const prev7 = new Set(Array.from({ length: 7 }, (_, i) => kst(i + 8)));
  const rows = data.campaigns
    .filter((c) => !filter?.media || c.media === filter.media)
    .filter((c) => !filter?.nameContains || c.name.toLowerCase().includes(filter.nameContains.toLowerCase()))
    .map((c: CorrCampaign) => {
      const total = zero();
      const a = zero();
      const b = zero();
      for (const d of c.daily) {
        add(total, d);
        if (last7.has(d.date)) add(a, d);
        if (prev7.has(d.date)) add(b, d);
      }
      const owner = ownerFor(owners, c.media, c.name);
      return { c, total, a, b, owner: owner ? owner.ownerName || owner.ownerEmail : "미지정", ownerEmail: owner?.ownerEmail ?? "" };
    })
    .filter((r) => !filter?.owner || r.ownerEmail === filter.owner.toLowerCase() || r.owner === filter.owner);
  rows.sort((x, y) => y.total.cost - x.total.cost);

  const out: string[] = [`기간 ${data.since} ~ ${data.until} (어제까지, 한국 시간) · 매체별 전환 기준이 달라 합계 매출은 중복될 수 있음`];
  out.push(
    "매체 연동: " +
      data.media.map((m) => `${m.label} ${m.ok ? `정상(캠페인 ${m.campaigns}개${m.note ? `, ${m.note}` : ""})` : m.error ? `오류: ${m.error}` : m.note ?? "미연동"}`).join(" / "),
  );
  const byMedia = new Map<string, Sum>();
  for (const r of rows) {
    const s = byMedia.get(r.c.media) ?? zero();
    add(s, r.total);
    byMedia.set(r.c.media, s);
  }
  out.push("", "## 매체 합계");
  // 직전 같은 기간(있으면) — 같은 필터로 매체별 합계를 비교
  const prevBy = new Map<string, Sum>();
  if (prev)
    for (const c of prev.campaigns) {
      if (filter?.media && c.media !== filter.media) continue;
      if (filter?.nameContains && !c.name.toLowerCase().includes(filter.nameContains.toLowerCase())) continue;
      const s = prevBy.get(c.media) ?? zero();
      for (const d of c.daily) add(s, d);
      prevBy.set(c.media, s);
    }
  for (const [k, s] of byMedia) {
    const p = prevBy.get(k);
    out.push(`- ${LABEL[k] ?? k}: ${line(s)}${p ? `\n  직전 같은 기간(${prev!.since}~${prev!.until}) 대비: 광고비 ${change(s.cost, p.cost)} · 전환 ${change(s.conversions, p.conversions)} · 매출 ${change(s.revenue, p.revenue)} · ROAS ${s.cost && p.cost && p.revenue ? change(s.revenue / s.cost, p.revenue / p.cost) : "—"} · CPA ${s.conversions && p.conversions ? change(s.cost / s.conversions, p.cost / p.conversions) : "—"}` : ""}`);
  }
  out.push("", `## 캠페인(광고비 상위 ${Math.min(limit, rows.length)}개 / 전체 ${rows.length}개)`);
  for (const r of rows.slice(0, limit)) {
    const role = ROLE_META[guessRole(r.c.media, r.c.objective, r.c.name)].label;
    const days = r.c.daily.filter((d) => d.cost > 0).length;
    out.push(
      `- [${LABEL[r.c.media] ?? r.c.media}] ${r.c.name} · 목표 ${r.c.objective ?? "—"}(${role}) · 담당 ${r.owner} · 집행 ${days}일\n  기간: ${line(r.total)}\n  최근7일 vs 직전7일: 광고비 ${change(r.a.cost, r.b.cost)} · 전환 ${change(r.a.conversions, r.b.conversions)} · 매출 ${change(r.a.revenue, r.b.revenue)} · CPA ${r.a.conversions && r.b.conversions ? change(r.a.cost / r.a.conversions, r.b.cost / r.b.conversions) : "—"} · ROAS ${r.a.cost && r.b.cost && r.b.revenue ? change(r.a.revenue / r.a.cost, r.b.revenue / r.b.cost) : "—"}`,
    );
  }
  if (!rows.length) out.push("(조건에 맞는 집행 캠페인이 없어요)");
  return out.join("\n");
}

// 한 캠페인의 일별 표(최근 순)
export function campaignDaily(data: CorrDataRes, nameContains: string): string {
  const hits = data.campaigns.filter((c) => c.name.toLowerCase().includes(nameContains.toLowerCase())).slice(0, 3);
  if (!hits.length) return `이름에 '${nameContains}'가 들어간 집행 캠페인이 없어요.`;
  return hits
    .map((c) => {
      const rows = [...c.daily].sort((a, b) => b.date.localeCompare(a.date)).map((d) => `${d.date} | ${won(d.cost)} | ${n(d.impressions)} | ${n(d.clicks)} | ${n(d.conversions)} | ${won(d.revenue)}`);
      return `## [${LABEL[c.media] ?? c.media}] ${c.name}\n날짜 | 광고비 | 노출 | 클릭 | 전환 | 매출\n${rows.join("\n")}`;
    })
    .join("\n\n");
}
