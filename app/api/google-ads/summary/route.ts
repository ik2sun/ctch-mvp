import { dataOwnerId } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAdsCredentials } from "@/lib/google-ads/auth";
import { dailyFromCampaignDays, daysBetween, fetchCampaignDaily, shiftDays, shiftMonths, sumMetrics, type GadsMetrics } from "@/lib/google-ads/aggregate";
import { googleAdsErrorResponse } from "@/lib/google-ads/client";

export const maxDuration = 60;

// 대시보드 요약 — 메타/네이버/카카오/GFA 요약과 같은 응답 모양(current/previous/lastMonth/daily)
const toTotals = (m: GadsMetrics) => ({ ...m, frequency: 0 });

// 서버 캐시(10분) — Explorer 등급 하루 2,880건 한도 절약. 같은 서버 프로세스 안에서만.
const SUMMARY_TTL_MS = 10 * 60 * 1000;
const summaryCache = new Map<string, { at: number; body: unknown }>();

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
  const yearSince = shiftMonths(since, -12);
  const yearUntil = shiftMonths(until, -12);
  const withYear = searchParams.get("year") === "1";
  const withMonth = searchParams.get("month") !== "0"; // 전월 동기 — 기본 포함, 대시보드는 고를 때만
  const cacheKey = `gads|${clientId}|${since}|${until}|${withMonth ? 1 : 0}|${withYear ? 1 : 0}`;
  const hit = summaryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) return NextResponse.json(hit.body);

  try {
    const creds = await getGoogleAdsCredentials(client);
    const [cur, prev, month, year] = await Promise.all([
      fetchCampaignDaily(creds, since, until),
      fetchCampaignDaily(creds, prevSince, prevUntil),
      withMonth ? fetchCampaignDaily(creds, monthSince, monthUntil) : Promise.resolve(null),
      withYear ? fetchCampaignDaily(creds, yearSince, yearUntil).catch(() => null) : Promise.resolve(null),
    ]);
    const body = {
      current: toTotals(sumMetrics(cur)),
      previous: toTotals(sumMetrics(prev)),
      ...(month ? { lastMonth: toTotals(sumMetrics(month)) } : {}),
      ...(year ? { lastYear: toTotals(sumMetrics(year)), yearPeriod: { since: yearSince, until: yearUntil } } : {}),
      daily: dailyFromCampaignDays(cur, since, until),
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
      adAccountId: creds.customerId,
      note: "구글 Ads 기준이에요. 전환·매출은 '전환'·'전환 가치' 열(계정의 기본 전환 액션)이고, 도달은 제공하지 않아요.",
    };
    if (summaryCache.size > 200) summaryCache.clear();
    summaryCache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return googleAdsErrorResponse(e, "구글 Ads 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
