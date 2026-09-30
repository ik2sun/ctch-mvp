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

  try {
    const creds = await getGfaCredentials(client.gfa_customer_id);
    const [curRows, prevRows, monthRows] = await Promise.all([
      fetchPastPerformance(creds, "campaigns", since, until),
      fetchPastPerformance(creds, "campaigns", prevSince, prevUntil),
      fetchPastPerformance(creds, "campaigns", monthSince, monthUntil),
    ]);
    return NextResponse.json({
      current: toTotals(sumRows(curRows)),
      previous: toTotals(sumRows(prevRows)),
      lastMonth: toTotals(sumRows(monthRows)),
      daily: dailyFromRows(curRows, since, until),
      period: { since, until },
      prevPeriod: { since: prevSince, until: prevUntil },
      monthPeriod: { since: monthSince, until: monthUntil },
      clientName: client.name,
      adAccountId: creds.adAccountNo,
      note: "GFA 과거 성과 기준이에요. 도달(reach)은 API에서 제공하지 않아요. 전환·매출은 전 전환 유형 합계예요.",
    });
  } catch (e) {
    return gfaErrorResponse(e, "GFA 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
