import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNmgRevenueSheetId, getSpreadsheetTabs, googleSheetsErrorResponse } from "@/lib/google-sheets/client";

// NMG 매출 시트의 전체 탭 목록 — 화면의 탭 선택 드롭다운용. 전사 공용 데이터라 광고주 소유권
// 체크는 필요 없고 로그인만 확인한다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const tabs = await getSpreadsheetTabs(getNmgRevenueSheetId());
    return NextResponse.json({ tabs });
  } catch (e) {
    return googleSheetsErrorResponse(e, "탭 목록을 불러오지 못했어요.");
  }
}
