import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS, KakaoAuthError } from "@/lib/kakao-moment/auth";
import { fetchAdAccounts } from "@/lib/kakao-moment/aggregate";
import { kakaoErrorResponse } from "@/lib/kakao-moment/client";

// 카카오모먼트 연결 상태·광고계정 목록 조회(GET) / 광고계정 선택(POST) / 연결 해제(DELETE)
async function loadClient(clientId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, client: null };
  const { data: client } = await supabase
    .from("clients")
    .select(`id, name, ${KAKAO_TOKEN_COLUMNS}`)
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  return { supabase, user, client };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  const { supabase, user, client } = await loadClient(clientId);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const base = {
    linked: !!client.kakao_refresh_token,
    adAccountId: client.kakao_ad_account_id ?? null,
    linkedAt: client.kakao_linked_at ?? null,
    refreshExpiresAt: client.kakao_refresh_expires_at ?? null,
    configured: !!process.env.KAKAO_REST_API_KEY,
  };
  if (!client.kakao_refresh_token) return NextResponse.json({ ...base, accounts: [] });

  try {
    const creds = await ensureKakaoAccessToken(supabase, clientId, client, false);
    const accounts = await fetchAdAccounts(creds.accessToken);
    return NextResponse.json({ ...base, accounts: accounts.map((a) => ({ id: String(a.id), name: a.name, memberType: a.memberType ?? null, status: a.status ?? null })) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "광고계정 목록을 불러오지 못했어요.";
    const expired = e instanceof KakaoAuthError && e.code === "REFRESH_EXPIRED";
    return NextResponse.json({ ...base, accounts: [], error: message, expired });
  }
}

export async function POST(req: Request) {
  const { clientId, adAccountId } = (await req.json().catch(() => ({}))) as { clientId?: string; adAccountId?: string };
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  if (!adAccountId || !/^\d+$/.test(String(adAccountId).trim())) return NextResponse.json({ error: "광고계정 번호는 숫자여야 해요." }, { status: 400 });
  const { supabase, user, client } = await loadClient(clientId);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  try {
    const { error } = await supabase.from("clients").update({ kakao_ad_account_id: String(adAccountId).trim() }).eq("id", clientId).eq("user_id", user.id);
    if (error) throw new Error("저장 중 오류가 발생했어요.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return kakaoErrorResponse(e, "광고계정 저장에 실패했어요.");
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  const { supabase, user, client } = await loadClient(clientId);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  const { error } = await supabase
    .from("clients")
    .update({ kakao_ad_account_id: null, kakao_access_token: null, kakao_token_expires_at: null, kakao_refresh_token: null, kakao_refresh_expires_at: null, kakao_linked_at: null })
    .eq("id", clientId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "연결 해제 중 오류가 발생했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
