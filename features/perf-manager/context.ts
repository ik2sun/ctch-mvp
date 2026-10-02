// 대화에 넣을 '현재 광고주 성과' 요약 텍스트 — 매체 요약 API(미디어믹스와 같은 useMediaHistory) 결과로 만든다. 순수 함수.
import type { MediaInput } from "@/features/media-mix/model";

const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);

function line(label: string, t: { cost: number; impressions: number; clicks: number; conversions: number; revenue: number }) {
  return `${label}: 광고비 ${won(t.cost)} · 노출 ${n(t.impressions)} · 클릭 ${n(t.clicks)} · CTR ${pct(t.impressions ? t.clicks / t.impressions : null)} · CPC ${t.clicks ? won(t.cost / t.clicks) : "—"} · 전환 ${n(t.conversions)} · CVR ${pct(t.clicks ? t.conversions / t.clicks : null)} · CPA ${t.conversions ? won(t.cost / t.conversions) : "—"} · 매출 ${won(t.revenue)} · ROAS ${pct(t.cost ? t.revenue / t.cost : null)}`;
}

export function buildContext(clientName: string, inputs: MediaInput[], since: string, until: string): string {
  if (!inputs.length) return "";
  const out = [`광고주: ${clientName} · 기간 ${since} ~ ${until} (매체별 전환 집계 기준이 달라 합계 매출은 중복될 수 있음)`];
  const sum = { cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
  for (const m of inputs) {
    out.push(line(m.label, m.totals));
    sum.cost += m.totals.cost;
    sum.impressions += m.totals.impressions;
    sum.clicks += m.totals.clicks;
    sum.conversions += m.totals.conversions;
    sum.revenue += m.totals.revenue;
  }
  if (inputs.length > 1) out.push(line("합계", sum));
  // 최근 7일 vs 그 전 7일(매체별)
  out.push("", "최근 7일 vs 직전 7일:");
  for (const m of inputs) {
    const d = [...m.daily].sort((a, b) => a.date.localeCompare(b.date));
    const last = d.slice(-7);
    const prev = d.slice(-14, -7);
    if (last.length < 7 || prev.length < 7) continue;
    const s = (arr: typeof d) => arr.reduce((a, x) => ({ cost: a.cost + x.cost, impressions: a.impressions + x.impressions, clicks: a.clicks + x.clicks, conversions: a.conversions + x.conversions, revenue: a.revenue + x.revenue }), { cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
    out.push(line(`${m.label} 최근 7일`, s(last)), line(`${m.label} 직전 7일`, s(prev)));
  }
  return out.join("\n");
}
