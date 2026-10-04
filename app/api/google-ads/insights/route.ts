import { dataOwnerId } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAdsCredentials } from "@/lib/google-ads/auth";
import {
  addMetrics,
  dailyFromCampaignDays,
  daysBetween,
  EMPTY_GADS_METRICS,
  fetchAdGroupTotals,
  fetchAdTotals,
  fetchCampaignDaily,
  shiftDays,
  shiftMonths,
  sumMetrics,
  type GadsMetrics,
} from "@/lib/google-ads/aggregate";
import { googleAdsErrorResponse } from "@/lib/google-ads/client";

export const maxDuration = 120;

// 실시간 리포트(계층형 트리)용 — 메타·카카오·GFA insights와 같은 응답 모양(MetaHierarchy). 호출 5회.
type Row = {
  id: string;
  level: "campaign" | "adset" | "ad";
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
} & GadsMetrics & { frequency: number };

const withFreq = (m: GadsMetrics) => ({ ...m, frequency: 0 });
const pick = (m: GadsMetrics): GadsMetrics => ({ impressions: m.impressions, clicks: m.clicks, cost: m.cost, conversions: m.conversions, revenue: m.revenue, reach: 0 });
const AD_TYPE: Record<string, string> = {
  RESPONSIVE_SEARCH_AD: "반응형 검색 광고",
  RESPONSIVE_DISPLAY_AD: "반응형 디스플레이 광고",
  EXPANDED_TEXT_AD: "확장 텍스트 광고",
  VIDEO_AD: "동영상 광고",
  VIDEO_RESPONSIVE_AD: "반응형 동영상 광고",
  IMAGE_AD: "이미지 광고",
  DEMAND_GEN_MULTI_ASSET_AD: "디맨드젠 이미지 광고",
  DEMAND_GEN_VIDEO_RESPONSIVE_AD: "디맨드젠 동영상 광고",
  APP_AD: "앱 광고",
  SHOPPING_PRODUCT_AD: "쇼핑 상품 광고",
};

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
  if (!since || !until) return NextResponse.json({ error: "since, until 쿼리 파라미터가 필요해요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("name, google_ads_customer_id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = daysBetween(since, until);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);

  try {
    const creds = await getGoogleAdsCredentials(client);
    const [campaignDays, adGroups, ads, prev, month] = await Promise.all([
      fetchCampaignDaily(creds, since, until),
      fetchAdGroupTotals(creds, since, until),
      fetchAdTotals(creds, since, until),
      fetchCampaignDaily(creds, prevSince, prevUntil),
      fetchCampaignDaily(creds, monthSince, monthUntil),
    ]);

    const byCampaign = new Map<string, { name: string; m: GadsMetrics }>();
    for (const r of campaignDays) {
      const cur = byCampaign.get(r.campaignId) ?? { name: r.campaignName, m: { ...EMPTY_GADS_METRICS } };
      cur.m = addMetrics(cur.m, r);
      byCampaign.set(r.campaignId, cur);
    }
    const campaignRows: Row[] = [...byCampaign.entries()].map(([id, c]) => ({
      id,
      level: "campaign",
      name: c.name || `캠페인 ${id}`,
      campaignId: id,
      campaignName: c.name || null,
      adsetId: null,
      adsetName: null,
      ...withFreq(c.m),
    }));

    const adsetRows: Row[] = adGroups.map((g) => ({
      id: g.adGroupId,
      level: "adset",
      name: g.adGroupName || `광고그룹 ${g.adGroupId}`,
      campaignId: g.campaignId,
      campaignName: g.campaignName || null,
      adsetId: g.adGroupId,
      adsetName: g.adGroupName || null,
      ...withFreq(pick(g)),
    }));

    // 반응형 검색 광고 등은 이름이 비어 있다 → 유형 + ID
    const adRows: Row[] = ads.map((a) => ({
      id: a.adId,
      level: "ad",
      name: a.adName?.trim() || `${AD_TYPE[a.adType] ?? (a.adType || "광고")} ${a.adId}`,
      campaignId: a.campaignId,
      campaignName: a.campaignName || null,
      adsetId: a.adGroupId,
      adsetName: a.adGroupName || null,
      ...withFreq(pick(a)),
    }));

    const groupCost = adGroups.reduce((s, g) => s + g.cost, 0);
    const campaignOnly = sumMetrics(campaignDays).cost - groupCost > 1;

    return NextResponse.json({
      campaigns: campaignRows,
      adsets: adsetRows,
      ads: adRows,
      daily: dailyFromCampaignDays(campaignDays, since, until),
      clientName: client.name,
      period: { since, until },
      compare: { previous: withFreq(sumMetrics(prev)), lastMonth: withFreq(sumMetrics(month)) },
      scopeNote: `구글 Ads 기준. 도달·빈도는 제공하지 않아요. 전환·매출은 '전환'·'전환 가치' 열.${
        campaignOnly ? " 실적 최대화(PMax) 등 광고그룹이 없는 캠페인 성과는 캠페인 행에만 있어요." : ""
      }`,
    });
  } catch (e) {
    return googleAdsErrorResponse(e, "구글 Ads 데이터를 불러오지 못했어요.");
  }
}
