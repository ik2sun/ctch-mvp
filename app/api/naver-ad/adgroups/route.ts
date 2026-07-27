import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllAdGroups } from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverErrorResponse } from "@/lib/naver-ad/client";

// 네이버 검색광고 광고그룹 목록 (읽기 전용). ?clientId=&campaignId= 로 조회
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const campaignId = searchParams.get("campaignId") ?? undefined;
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("naver_ad_api_key, naver_ad_secret, naver_ad_customer_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  try {
    const credentials = resolveNaverAdCredentials(client);
    const adGroups = await fetchAllAdGroups(credentials, campaignId);
    return NextResponse.json({ adGroups });
  } catch (e) {
    return naverErrorResponse(e, "네이버 광고그룹 조회 중 오류가 발생했어요.");
  }
}
