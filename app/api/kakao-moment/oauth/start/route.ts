import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, KakaoAuthError, STATE_COOKIE } from "@/lib/kakao-moment/auth";

// 카카오 계정 연결 시작 — 광고주(clientId)를 state 쿠키에 묶어 두고 카카오 인가 페이지로 보낸다.
// 연결하는 카카오계정은 해당 카카오모먼트 광고계정의 멤버(마스터 또는 멤버 권한)여야 한다.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/clients?${new URLSearchParams(params).toString()}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!clientId) return back({ kakao: "error", msg: "광고주를 먼저 선택해 주세요." });

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).eq("user_id", user.id).maybeSingle();
  if (!client) return back({ kakao: "error", msg: "광고주를 찾을 수 없어요." });

  try {
    const state = randomUUID();
    const res = NextResponse.redirect(buildAuthorizeUrl(state));
    res.cookies.set(STATE_COOKIE, JSON.stringify({ state, clientId }), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    const msg = e instanceof KakaoAuthError ? e.message : "카카오 연결을 시작하지 못했어요.";
    return back({ kakao: "error", clientId, msg });
  }
}
