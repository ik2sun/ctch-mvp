import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGfaCredentials } from "@/lib/gfa/auth";
import { dailyFromRows, daysBetween, fetchPastPerformance, shiftDays, shiftMonths, sumRows, type GfaMetrics } from "@/lib/gfa/aggregate";
import { gfaErrorResponse } from "@/lib/gfa/client";

export const maxDuration = 60;

// 대시보드 요약 — 메타/네이버/카카오 요약과 같은 응답 모양(current/previous/lastMonth/daily)
function toTotals(m: GfaMetrics) {
  return { ...m, frequency: 0 };
}


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
  if (!since || !until) return NextResponse.json({ error: "since, until 쿼리 파라미터가 필요해요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("name, gfa_customer_id").eq("id", clientId).eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = daysBetween(since, until);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);
  const withYear = searchParams.get("year") === "1";
  const withMonth = searchParams.get("month") !== "0"; // 전월 동기 — 기본 포함, 대시보드는 고를 때만
  const cacheKey = `gfa|${clientId}|${since}|${until}|${withMonth ? 1 : 0}|${withYear ? 1 : 0}`;
  const hit = cachedSummary(cacheKey);
  if (hit) return NextResponse.json(hit);
  const yearSince = shiftMonths(since, -12);
  const yearUntil = shiftMonths(until, -12);

  try {
    const creds = await getGfaCredentials(client.gfa_customer_id);
    const [curRows, prevRows, monthRows, yearRows] = await Promise.all([
      fetchPastPerformance(creds, "campaigns", since, until),
      fetchPastPerformance(creds, "campaigns", prevSince, prevUntil),
      withMonth ? fetchPastPerformance(creds, "campaigns", monthSince, monthUntil) : Promise.resolve(null),
      withYear ? fetchPastPerformance(creds, "campaigns", yearSince, yearUntil).catch(() => null) : Promise.resolve(null),
    ]);
    const body = {
      current: toTotals(sumRows(curRows)),
      previous: toTotals(sumRows(prevRows)),
      ...(monthRows ? { lastMonth: toTotals(sumRows(monthRows)) } : {}),
      ...(yearRows ? { lastYear: toTotals(sumRows(yearRows)), yearPeriod: { since: yearSince, until: yearUntil } } : {}),
      daily: dailyFromRows(curRows, since, until),
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
      adAccountId: creds.adAccountNo,
      note: "GFA 과거 성과 기준이에요. 도달(reach)은 API에서 제공하지 않아요. 전환·매출은 전 전환 유형 합계예요.",
    };
    saveSummary(cacheKey, body);
    return NextResponse.json(body);
  } catch (e) {
    return gfaErrorResponse(e, "GFA 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
