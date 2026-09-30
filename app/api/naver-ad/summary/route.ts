import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildApproxDailyTrend,
  fetchAllCampaigns,
  fetchBulkStats,
  shiftDays,
  shiftMonths,
} from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverErrorResponse } from "@/lib/naver-ad/client";
import type { NaverStatRaw } from "@/lib/naver-ad/types";

type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  reach: number;
  frequency: number;
};

// 계정 전체 캠페인 id들의 지표를 합산 — reach/frequency는 네이버에 없는 개념이라 0 고정
// (메타와 동일한 Totals 타입을 공유해 대시보드 컴포넌트를 그대로 재사용하기 위함)
function sumStats(statMap: Map<string, NaverStatRaw>): Totals {
  const rows = Array.from(statMap.values());
  return rows.reduce(
    (a, r) => ({
      impressions: a.impressions + (r.impCnt ?? 0),
      clicks: a.clicks + (r.clkCnt ?? 0),
      cost: a.cost + (r.salesAmt ?? 0),
      conversions: a.conversions + (r.ccnt ?? 0),
      revenue: a.revenue + (r.purchaseConvAmt ?? 0),
      reach: 0,
      frequency: 0,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 },
  );
}

const DAILY_TOP_N = 20;

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
    const campaigns = await fetchAllCampaigns(credentials);
    const campaignIds = campaigns.map((c) => c.nccCampaignId);

    const [curMap, prevMap, monthMap] = await Promise.all([
      fetchBulkStats(credentials, campaignIds, since, until),
      fetchBulkStats(credentials, campaignIds, prevSince, prevUntil),
      fetchBulkStats(credentials, campaignIds, monthSince, monthUntil),
    ]);

    const daily = await buildApproxDailyTrend(credentials, curMap, since, until, DAILY_TOP_N);

    return NextResponse.json({
      current: sumStats(curMap),
      previous: sumStats(prevMap),
      lastMonth: sumStats(monthMap),
      daily,
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
      dailyApprox: campaignIds.length > DAILY_TOP_N,
      campaignCount: campaignIds.length,
    });
  } catch (e) {
    return naverErrorResponse(e, "네이버 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
