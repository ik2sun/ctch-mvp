import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSheetValues, getNmgRevenueSheetId, googleSheetsErrorResponse } from "@/lib/google-sheets/client";
import { parseTeamComparison } from "@/lib/google-sheets/parseTeamComparison";

const DEFAULT_TAB = "주간보고raw";

// 팀별 취급고/순매출 비교
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const tab = process.env.NMG_REVENUE_TEAMS_TAB?.trim() || DEFAULT_TAB;
    const rows = await fetchSheetValues(getNmgRevenueSheetId(), tab);
    const teams = parseTeamComparison(rows);
    return NextResponse.json({ teams, tab });
  } catch (e) {
    return googleSheetsErrorResponse(e, "팀별 비교 데이터를 불러오지 못했어요.");
  }
}
