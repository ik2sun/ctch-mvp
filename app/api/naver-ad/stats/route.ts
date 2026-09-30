import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchBulkStats } from "@/lib/naver-ad/aggregate";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverErrorResponse } from "@/lib/naver-ad/client";
import { deriveNaverMetrics } from "@/lib/naver-ad/types";

// 네이버 검색광고 성과 데이터 (읽기 전용).
// ?clientId=&ids=cmp-...,cmp-...&since=2026-07-01&until=2026-07-27
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const idsParam = searchParams.get("ids");
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  if (!idsParam || !since || !until) {
    return NextResponse.json({ error: "ids, since, until 쿼리 파라미터가 모두 필요해요." }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("naver_ad_api_key, naver_ad_secret, naver_ad_customer_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const credentials = await resolveNaverAdCredentials(client);
    const statMap = await fetchBulkStats(credentials, ids, since, until);
    const stats = ids.map((id) => deriveNaverMetrics(statMap.get(id), id));
    return NextResponse.json({ stats });
  } catch (e) {
    return naverErrorResponse(e, "네이버 성과 데이터 조회 중 오류가 발생했어요.");
  }
}
