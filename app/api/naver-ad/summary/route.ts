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

const DAILY_TOP_N = 8; // 일별은 근사치 — 광고비 상위 8개면 대부분을 덮고, 네이버 대기열(1초 간격) 12건을 줄인다


// 서버 캐시(10분) — 같은 광고주·기간·옵션은 새로고침·다른 탭에서도 바로. 같은 서버 프로세스 안에서만.
const SUMMARY_TTL_MS = 10 * 60 * 1000;
const summaryCache = new Map<string, { at: number; body: unknown }>();
function cachedSummary(key: string) {
  const hit = summaryCache.get(key);
  return hit && Date.now() - hit.at < SUMMARY_TTL_MS ? hit.body : null;
}
function saveSummary(key: string, body: unknown) {
  if (summaryCache.size > 200) summaryCache.clear();
  summaryCache.set(key, { at: Date.now(), body });
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
  const withYear = searchParams.get("year") === "1";
  const withMonth = searchParams.get("month") !== "0"; // 전월 동기 — 기본 포함, 대시보드는 고를 때만
  const cacheKey = `naver|${clientId}|${since}|${until}|${withMonth ? 1 : 0}|${withYear ? 1 : 0}`;
  const hit = cachedSummary(cacheKey);
  if (hit) return NextResponse.json(hit);
  const yearSince = shiftMonths(since, -12);
  const yearUntil = shiftMonths(until, -12);

  try {
    const credentials = await resolveNaverAdCredentials(client);
    const campaigns = await fetchAllCampaigns(credentials);
    const campaignIds = campaigns.map((c) => c.nccCampaignId);

    const [curMap, prevMap, monthMap, yearMap] = await Promise.all([
      fetchBulkStats(credentials, campaignIds, since, until),
      fetchBulkStats(credentials, campaignIds, prevSince, prevUntil),
      withMonth ? fetchBulkStats(credentials, campaignIds, monthSince, monthUntil) : Promise.resolve(null),
      withYear ? fetchBulkStats(credentials, campaignIds, yearSince, yearUntil).catch(() => null) : Promise.resolve(null),
    ]);

    const daily = await buildApproxDailyTrend(credentials, curMap, since, until, DAILY_TOP_N);

    const body = {
      current: sumStats(curMap),
      previous: sumStats(prevMap),
      ...(monthMap ? { lastMonth: sumStats(monthMap) } : {}),
      ...(yearMap ? { lastYear: sumStats(yearMap), yearPeriod: { since: yearSince, until: yearUntil } } : {}),
      daily,
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
      dailyApprox: campaignIds.length > DAILY_TOP_N,
      campaignCount: campaignIds.length,
    };
    saveSummary(cacheKey, body);
    return NextResponse.json(body);
  } catch (e) {
    return naverErrorResponse(e, "네이버 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
