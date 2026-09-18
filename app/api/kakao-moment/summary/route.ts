import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS } from "@/lib/kakao-moment/auth";
import { dailyFromRows, daysBetween, fetchAccountReport, shiftDays, shiftMonths, sumRows } from "@/lib/kakao-moment/aggregate";
import { kakaoErrorResponse } from "@/lib/kakao-moment/client";
import type { KakaoMetrics } from "@/lib/kakao-moment/types";

export const maxDuration = 60;

// 대시보드 요약 — 메타/네이버 요약과 동일한 응답 모양(current/previous/lastMonth/daily)
type Totals = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number; reach: number; frequency: number };

function toTotals(m: KakaoMetrics): Totals {
  return { ...m, frequency: m.reach > 0 ? m.impressions / m.reach : 0 };
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

  const { data: client } = await supabase.from("clients").select(`name, ${KAKAO_TOKEN_COLUMNS}`).eq("id", clientId).eq("user_id", user.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const days = daysBetween(since, until);
  const prevSince = shiftDays(since, -days);
  const prevUntil = shiftDays(until, -days);
  const monthSince = shiftMonths(since, -1);
  const monthUntil = shiftMonths(until, -1);

  try {
    const creds = await ensureKakaoAccessToken(supabase, clientId, client);
    // 같은 광고계정의 계정 보고서는 5초에 1회만 허용되므로 클라이언트 대기열이 자동으로 간격을 둔다 (약 10~15초 소요)
    const [curRows, prevRows, monthRows] = await Promise.all([
      fetchAccountReport(creds, { since, until, timeUnit: "DAY" }),
      fetchAccountReport(creds, { since: prevSince, until: prevUntil, timeUnit: "ALL" }),
      fetchAccountReport(creds, { since: monthSince, until: monthUntil, timeUnit: "ALL" }),
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
      adAccountId: creds.adAccountId,
      note: "카카오모먼트 보고서는 당일 데이터가 다음날 08:00 전까지 변동될 수 있어요. 전환·매출은 픽셀&SDK '구매' 지표(7일 기여) 기준이에요.",
    });
  } catch (e) {
    return kakaoErrorResponse(e, "카카오모먼트 요약 데이터 조회 중 오류가 발생했어요.");
  }
}
