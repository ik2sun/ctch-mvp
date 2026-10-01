import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMetaToken } from "@/lib/meta/token";
import { actOf, MetaGraphError } from "@/lib/meta/graph";
import { fetchCreativeAssets } from "@/features/creative-analysis/fetchAsset";

// 소재 상세 원본 — 소재를 열 때만 호출(읽기 전용)
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId");
  const adId = sp.get("adId");
  if (!clientId || !adId || !/^\d+$/.test(adId)) return NextResponse.json({ error: "clientId, adId가 필요해요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("meta_account_id, meta_access_token").eq("id", clientId).maybeSingle();
  if (!client?.meta_account_id) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  const { token } = await resolveMetaToken(client.meta_access_token);
  if (!token) return NextResponse.json({ error: "메타 액세스 토큰이 없어요." }, { status: 400 });

  try {
    return NextResponse.json({ assets: await fetchCreativeAssets(actOf(client.meta_account_id), adId, token) });
  } catch (e) {
    const status = e instanceof MetaGraphError && e.code === 403 ? 403 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "원본 조회 실패" }, { status });
  }
}
