import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAdsByAdGroup } from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverErrorResponse } from "@/lib/naver-ad/client";

// 네이버 검색광고 광고 목록 (읽기 전용). 네이버 API 특성상 반드시 광고그룹 단위로 조회한다.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const adgroupId = searchParams.get("adgroupId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  if (!adgroupId) return NextResponse.json({ error: "adgroupId 쿼리 파라미터가 필요해요." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("naver_ad_api_key, naver_ad_secret, naver_ad_customer_id")
    .eq("id", clientId)
    .eq("user_id", await dataOwnerId(user))
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  try {
    const credentials = await resolveNaverAdCredentials(client);
    const ads = await fetchAdsByAdGroup(credentials, adgroupId);
    return NextResponse.json({ ads });
  } catch (e) {
    return naverErrorResponse(e, "네이버 광고 조회 중 오류가 발생했어요.");
  }
}
