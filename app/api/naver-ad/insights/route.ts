import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildApproxDailyTrend,
  fetchAdsByAdGroup,
  fetchAllAdGroups,
  fetchAllCampaigns,
  fetchBulkStats,
  shiftDays,
  shiftMonths,
} from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverErrorResponse } from "@/lib/naver-ad/client";
import type { NaverAdGroup, NaverCampaign, NaverStatRaw } from "@/lib/naver-ad/types";

// 실시간 리포트(계층형 트리)용 — 메타 /api/meta-insights와 동일한 응답 모양(MetaHierarchy)을
// 반환해 프런트엔드(TreeTable, AI 진단 등)를 그대로 재사용할 수 있게 한다.

type Row = {
  id: string;
  level: "campaign" | "adset" | "ad";
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  reach: number;
  frequency: number;
  conversions: number;
  revenue: number;
};

type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  reach: number;
  frequency: number;
};

// 광고그룹 하위 광고(소재) 전체를 계정 규모(광고그룹 수천 개)에서 다 끌어오면 API 호출이
// 폭발하므로, 지출 상위 N개 광고그룹의 소재만 조회해 트리에 채운다.
const ADS_TOP_N_ADGROUPS = 20;
const DAILY_TOP_N_CAMPAIGNS = 20;

function metricsOf(r: NaverStatRaw | undefined) {
  return {
    impressions: r?.impCnt ?? 0,
    clicks: r?.clkCnt ?? 0,
    cost: r?.salesAmt ?? 0,
    conversions: r?.ccnt ?? 0,
    revenue: r?.purchaseConvAmt ?? 0,
  };
}

function sumTotals(statMap: Map<string, NaverStatRaw>): Totals {
  const rows = [...statMap.values()];
  return rows.reduce(
    (a, r) => {
      const m = metricsOf(r);
      return {
        impressions: a.impressions + m.impressions,
        clicks: a.clicks + m.clicks,
        cost: a.cost + m.cost,
        conversions: a.conversions + m.conversions,
        revenue: a.revenue + m.revenue,
        reach: 0,
        frequency: 0,
      };
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 },
  );
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  if (!since || !until) {
    return NextResponse.json({ error: "since, until 쿼리 파라미터가 필요해요." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = Math.max(1, Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);

  try {
    const credentials = await resolveNaverAdCredentials(client);

    const [campaigns, adGroups] = await Promise.all([
      fetchAllCampaigns(credentials),
      fetchAllAdGroups(credentials),
    ]);
    const campaignById = new Map<string, NaverCampaign>(campaigns.map((c) => [c.nccCampaignId, c]));
    const adGroupById = new Map<string, NaverAdGroup>(adGroups.map((g) => [g.nccAdgroupId, g]));

    const campaignIds = campaigns.map((c) => c.nccCampaignId);
    const adGroupIds = adGroups.map((g) => g.nccAdgroupId);

    const [campaignStats, adGroupStats, prevCampaignStats, monthCampaignStats] = await Promise.all([
      fetchBulkStats(credentials, campaignIds, since, until),
      fetchBulkStats(credentials, adGroupIds, since, until),
      fetchBulkStats(credentials, campaignIds, prevSince, prevUntil),
      fetchBulkStats(credentials, campaignIds, monthSince, monthUntil),
    ]);

    const campaignRows: Row[] = campaigns.map((c) => ({
      id: c.nccCampaignId,
      level: "campaign",
      name: c.name,
      campaignId: c.nccCampaignId,
      campaignName: c.name,
      adsetId: null,
      adsetName: null,
      ...metricsOf(campaignStats.get(c.nccCampaignId)),
      reach: 0,
      frequency: 0,
    }));

    const adsetRows: Row[] = adGroups.map((g) => {
      const campaign = campaignById.get(g.nccCampaignId);
      return {
        id: g.nccAdgroupId,
        level: "adset",
        name: g.name,
        campaignId: g.nccCampaignId,
        campaignName: campaign?.name ?? null,
        adsetId: g.nccAdgroupId,
        adsetName: g.name,
        ...metricsOf(adGroupStats.get(g.nccAdgroupId)),
        reach: 0,
        frequency: 0,
      };
    });

    // 소재(ad) 레벨: 지출 상위 N개 광고그룹만 실제 조회
    const topAdGroupIds = [...adGroupStats.entries()]
      .sort((a, b) => (b[1].salesAmt ?? 0) - (a[1].salesAmt ?? 0))
      .slice(0, ADS_TOP_N_ADGROUPS)
      .map(([id]) => id);

    const adsByGroup = await Promise.all(topAdGroupIds.map((id) => fetchAdsByAdGroup(credentials, id)));
    const flatAds = adsByGroup.flat();
    const adIds = flatAds.map((a) => a.nccAdId);
    const adStats = await fetchBulkStats(credentials, adIds, since, until);

    const adRows: Row[] = flatAds.map((a) => {
      const group = adGroupById.get(a.nccAdgroupId);
      const campaign = group ? campaignById.get(group.nccCampaignId) : undefined;
      const title = typeof a.ad?.headline === "string" ? a.ad.headline : a.nccAdId;
      return {
        id: a.nccAdId,
        level: "ad",
        name: title,
        campaignId: group?.nccCampaignId ?? null,
        campaignName: campaign?.name ?? null,
        adsetId: a.nccAdgroupId,
        adsetName: group?.name ?? null,
        ...metricsOf(adStats.get(a.nccAdId)),
        reach: 0,
        frequency: 0,
      };
    });

    const daily = await buildApproxDailyTrend(credentials, campaignStats, since, until, DAILY_TOP_N_CAMPAIGNS);

    return NextResponse.json({
      campaigns: campaignRows,
      adsets: adsetRows,
      ads: adRows,
      daily,
      clientName: client.name,
      period: { since, until },
      compare: { previous: sumTotals(prevCampaignStats), lastMonth: sumTotals(monthCampaignStats) },
      scopeNote: `광고그룹 ${adGroups.length.toLocaleString("ko-KR")}개 중 지출 상위 ${ADS_TOP_N_ADGROUPS}개 그룹의 소재만 표시돼요.`,
    });
  } catch (e) {
    return naverErrorResponse(e, "네이버 데이터를 불러오지 못했어요.");
  }
}
