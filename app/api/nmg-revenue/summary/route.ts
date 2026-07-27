import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSheetValues, getNmgRevenueSheetId, googleSheetsErrorResponse } from "@/lib/google-sheets/client";
import { parseDeptSummary } from "@/lib/google-sheets/parseDeptSummary";

const DEFAULT_TAB = "26년 퍼포 합계";

// 부서 전체 월별 지표(취급고/순매출/영업이익 등)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const tab = process.env.NMG_REVENUE_SUMMARY_TAB?.trim() || DEFAULT_TAB;
    const rows = await fetchSheetValues(getNmgRevenueSheetId(), tab);
    const metrics = parseDeptSummary(rows);
    return NextResponse.json({ metrics, tab });
  } catch (e) {
    return googleSheetsErrorResponse(e, "부서 전체 현황을 불러오지 못했어요.");
  }
}
