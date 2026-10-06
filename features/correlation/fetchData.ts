// 상관관계 분석 데이터 — 서버 전용. 매체별 캠페인 목록(목표) + 캠페인 단위 일별 지표.
// 매체 하나가 실패해도 나머지는 그대로 돌려준다(상태는 media[]에).
import { actOf, graphAll, num, pickAction, PURCHASE_TYPES } from "@/lib/meta/graph";
import { fetchAllCampaigns, fetchBulkStats, fetchDailyStatById } from "@/lib/naver-ad/aggregate";
import type { NaverAdCredentials } from "@/lib/naver-ad/auth";
import { fetchCampaigns as fetchGfaCampaigns, fetchPastPerformance, gfaMetricsOf } from "@/lib/gfa/aggregate";
import type { GfaCredentials } from "@/lib/gfa/auth";
import { fetchAccountReport, fetchCampaigns as fetchKakaoCampaigns, fromYmd } from "@/lib/kakao-moment/aggregate";
import type { KakaoCredentials } from "@/lib/kakao-moment/auth";
import { kakaoMetricsOf } from "@/lib/kakao-moment/types";
import { getGoogleAdsCredentials } from "@/lib/google-ads/auth";
import { fetchCampaignDaily } from "@/lib/google-ads/aggregate";
import { gadsSearch } from "@/lib/google-ads/client";
import type { CorrCampaign, CorrDaily } from "./types";

function add(map: Map<string, Map<string, CorrDaily>>, cid: string, date: string, m: Omit<CorrDaily, "date">) {
  if (!cid || !date) return;
  const byDate = map.get(cid) ?? new Map<string, CorrDaily>();
  const cur = byDate.get(date) ?? { date, cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, videoViews: 0 };
  cur.cost += m.cost;
  cur.impressions += m.impressions;
  cur.clicks += m.clicks;
  cur.conversions += m.conversions;
  cur.revenue += m.revenue;
  cur.videoViews = (cur.videoViews ?? 0) + (m.videoViews ?? 0);
  byDate.set(date, cur);
  map.set(cid, byDate);
}

const sorted = (m?: Map<string, CorrDaily>) => (m ? [...m.values()].sort((a, b) => a.date.localeCompare(b.date)) : []);

// ── 메타 — 캠페인 일별 인사이트를 페이지 끝까지 + 캠페인 목표 ─────────
export async function metaCampaigns(accountId: string, token: string, since: string, until: string): Promise<CorrCampaign[]> {
  const act = actOf(accountId);
  const [list, rows, totals] = await Promise.all([
    graphAll<{ id: string; name: string; objective?: string }>(`${act}/campaigns`, { fields: "id,name,objective" }, token),
    graphAll<Record<string, unknown>>(
      `${act}/insights`,
      {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
      },
      token,
      60,
    ),
    // 기간 합계 — 도달·빈도는 일별을 더할 수 없어 따로(인지 캠페인 판단 근거). 실패해도 일별 분석은 그대로
    graphAll<Record<string, unknown>>(
      `${act}/insights`,
      {
        level: "campaign",
        time_range: JSON.stringify({ since, until }),
        fields: "campaign_id,reach,frequency,video_thruplay_watched_actions,video_p100_watched_actions",
      },
      token,
      10,
    ).catch(() => [] as Record<string, unknown>[]),
  ]);
  const tot = new Map(
    totals.map((r) => [
      String(r.campaign_id ?? ""),
      { reach: num(r.reach), frequency: num(r.frequency), thruplays: pickAction(r.video_thruplay_watched_actions, ["video_view"]), videoP100: pickAction(r.video_p100_watched_actions, ["video_view"]) },
    ]),
  );
  const byCampaign = new Map<string, Map<string, CorrDaily>>();
  const names = new Map<string, string>();
  for (const r of rows) {
    const cid = String(r.campaign_id ?? "");
    names.set(cid, String(r.campaign_name ?? ""));
    add(byCampaign, cid, String(r.date_start ?? ""), {
      cost: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      conversions: pickAction(r.actions, PURCHASE_TYPES),
      revenue: pickAction(r.action_values, PURCHASE_TYPES),
      videoViews: pickAction(r.actions, ["video_view"]),
    });
  }
  const meta = new Map(list.map((c) => [c.id, c]));
  return [...byCampaign.keys()].map((cid) => ({
    id: `meta:${cid}`,
    media: "meta",
    name: meta.get(cid)?.name ?? names.get(cid) ?? `캠페인 ${cid}`,
    objective: meta.get(cid)?.objective ?? null,
    daily: sorted(byCampaign.get(cid)),
    totals: tot.get(cid),
  }));
}

// ── 네이버 SA — 일별은 캠페인 하나씩만 조회 가능 → 브랜드검색 전부 + 광고비 상위 15개 ─────────
export async function naverCampaigns(creds: NaverAdCredentials, since: string, until: string): Promise<{ campaigns: CorrCampaign[]; note?: string }> {
  const list = (await fetchAllCampaigns(creds)).filter((c) => !c.delFlag);
  const stats = await fetchBulkStats(creds, list.map((c) => c.nccCampaignId), since, until);
  const active = list.filter((c) => {
    const s = stats.get(c.nccCampaignId);
    return s && ((s.salesAmt ?? 0) > 0 || (s.impCnt ?? 0) > 0);
  });
  const brand = active.filter((c) => c.campaignTp === "BRAND_SEARCH");
  const rest = active
    .filter((c) => c.campaignTp !== "BRAND_SEARCH")
    .sort((a, b) => (stats.get(b.nccCampaignId)?.salesAmt ?? 0) - (stats.get(a.nccCampaignId)?.salesAmt ?? 0));
  const picked = [...brand, ...rest.slice(0, 15)];
  const out: CorrCampaign[] = [];
  for (const c of picked) {
    const pts = await fetchDailyStatById(creds, c.nccCampaignId, since, until);
    out.push({
      id: `naver:${c.nccCampaignId}`,
      media: "naver",
      name: c.name,
      objective: c.campaignTp,
      daily: pts
        .filter((p) => p.date)
        .map((p) => ({ date: p.date.slice(0, 10), cost: p.salesAmt, impressions: p.impCnt, clicks: p.clkCnt, conversions: p.ccnt, revenue: p.purchaseConvAmt })),
    });
  }
  const skipped = rest.length - Math.min(rest.length, 15);
  return { campaigns: out, note: skipped > 0 ? `광고비 하위 캠페인 ${skipped}개는 일별 조회 제한으로 제외` : undefined };
}

// ── GFA — 캠페인 과거 성과(일별) 한 번에 + 캠페인 목표 ─────────
export async function gfaCampaigns(creds: GfaCredentials, since: string, until: string): Promise<CorrCampaign[]> {
  const [list, rows] = await Promise.all([fetchGfaCampaigns(creds).catch(() => []), fetchPastPerformance(creds, "campaigns", since, until)]);
  const byCampaign = new Map<string, Map<string, CorrDaily>>();
  for (const r of rows) {
    const m = gfaMetricsOf(r);
    add(byCampaign, String(r.campaignNo ?? ""), r.targetDate?.slice(0, 10) ?? "", { ...m, videoViews: Number(r.vplayCount) || 0 });
  }
  const info = new Map(list.map((c) => [String(c.no), c]));
  return [...byCampaign.keys()].map((cid) => ({
    id: `gfa:${cid}`,
    media: "gfa",
    name: info.get(cid)?.name ?? `캠페인 ${cid}`,
    objective: info.get(cid)?.objective ?? null,
    daily: sorted(byCampaign.get(cid)),
  }));
}

// ── 카카오모먼트 — 계정 보고서 level=CAMPAIGN, timeUnit=DAY(31일씩, 5초 간격) ─────────
export async function kakaoCampaigns(creds: KakaoCredentials, since: string, until: string): Promise<CorrCampaign[]> {
  const [list, rows] = await Promise.all([fetchKakaoCampaigns(creds).catch(() => []), fetchAccountReport(creds, { since, until, timeUnit: "DAY", level: "CAMPAIGN" })]);
  const byCampaign = new Map<string, Map<string, CorrDaily>>();
  for (const r of rows) {
    const d = r.dimensions ?? {};
    const cid = String(d.campaign_id ?? d.campaignId ?? "");
    const raw = d.start ?? d.date ?? d.day ?? d.reportDate;
    if (raw == null) continue;
    const m = kakaoMetricsOf(r);
    add(byCampaign, cid, fromYmd(String(raw)), { cost: m.cost, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions, revenue: m.revenue });
  }
  const info = new Map(list.map((c) => [String(c.id), c]));
  return [...byCampaign.keys()].map((cid) => {
    const c = info.get(cid);
    const tg = c?.campaignTypeGoal;
    return {
      id: `kakao:${cid}`,
      media: "kakao",
      name: c?.name ?? `캠페인 ${cid}`,
      objective: tg ? [tg.campaignType, tg.goal].filter(Boolean).join("/") : null,
      daily: sorted(byCampaign.get(cid)),
    };
  });
}

// ── 구글 Ads — 캠페인 일별(GAQL) + 채널 유형(SEARCH·VIDEO·DEMAND_GEN·PMAX…). TrueView 조회. 도달은 안 받음 ─────────
export async function googleAdsCampaigns(customerId: string, since: string, until: string): Promise<CorrCampaign[]> {
  const creds = await getGoogleAdsCredentials({ google_ads_customer_id: customerId });
  const [rows, views, attrs] = await Promise.all([
    fetchCampaignDaily(creds, since, until),
    // 동영상 조회(TrueView — 30초 이상 또는 끝까지 본 조회). 실패해도 나머지는 그대로
    gadsSearch<{ campaign?: { id?: string }; segments?: { date?: string }; metrics?: { videoTrueviewViews?: string } }>(
      creds,
      `SELECT campaign.id, segments.date, metrics.video_trueview_views FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.video_trueview_views > 0`,
    ).catch(() => []),
    // 입찰 방식 — 동영상 캠페인이 도달형(CPM: VRC·범퍼·마스트헤드)인지 조회형(CPV: VVC)인지 가른다
    gadsSearch<{ campaign?: { id?: string; biddingStrategyType?: string } }>(
      creds,
      `SELECT campaign.id, campaign.bidding_strategy_type FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.impressions > 0`,
    ).catch(() => []),
  ]);
  const bid = new Map(attrs.map((a) => [String(a.campaign?.id ?? ""), a.campaign?.biddingStrategyType ?? ""]));
  const vv = new Map(views.map((v) => [`${v.campaign?.id}|${v.segments?.date}`, Number(v.metrics?.videoTrueviewViews) || 0]));
  const by = new Map<string, CorrCampaign>();
  for (const r of rows) {
    const c = by.get(r.campaignId) ?? { id: `google_ads:${r.campaignId}`, media: "google_ads", name: r.campaignName, objective: [r.channelType, bid.get(r.campaignId)].filter(Boolean).join("/") || null, daily: [] };
    if (r.cost > 0 || r.impressions > 0)
      c.daily.push({ date: r.date, cost: r.cost, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, revenue: r.revenue, videoViews: vv.get(`${r.campaignId}|${r.date}`) ?? 0 });
    by.set(r.campaignId, c);
  }
  return [...by.values()].map((c) => ({ ...c, daily: c.daily.sort((a, b) => a.date.localeCompare(b.date)) }));
}
