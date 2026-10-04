import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildGoogleAdsAuthorizeUrl, googleAdsAppFrom, GADS_STATE_COOKIE } from "@/lib/google-ads/auth";
import { getShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";

// 구글 Ads 공용 구글 계정 연결 시작(관리자 전용) — state 쿠키를 굽고 구글 동의 화면으로 보낸다.
// 로그인하는 구글 계정은 NMG MCC(또는 조회할 광고계정)의 사용자여야 한다.
export async function GET(req: Request) {
  const { origin } = new URL(req.url);
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);

  if (!(await getKeyManager())) return back({ gads: "error", msg: "구글 Ads 공용 연결은 관리자만 할 수 있어요." });
  try {
    const app = googleAdsAppFrom((await getShared("google_ads"))?.config);
    const state = randomUUID();
    const res = NextResponse.redirect(buildGoogleAdsAuthorizeUrl(app, state));
    res.cookies.set(GADS_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 600 });
    return res;
  } catch (e) {
    return back({ gads: "error", msg: e instanceof Error ? e.message : "구글 Ads 연결을 시작하지 못했어요." });
  }
}
