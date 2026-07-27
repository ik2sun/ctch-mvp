import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSheetValues, getNmgRevenueSheetId, googleSheetsErrorResponse } from "@/lib/google-sheets/client";
import { parseClientPivot } from "@/lib/google-sheets/parseClientPivot";

// 사용자가 직접 고른 탭의 광고주별 상세 — "광고주" 헤더가 있는 표만 지원
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("name")?.trim();
  if (!tab) return NextResponse.json({ error: "탭 이름(name)이 필요해요." }, { status: 400 });

  try {
    const rows = await fetchSheetValues(getNmgRevenueSheetId(), tab);
    const clients = parseClientPivot(rows);
    return NextResponse.json({ clients, tab });
  } catch (e) {
    return googleSheetsErrorResponse(e, "탭 데이터를 불러오지 못했어요.");
  }
}
