import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildGfaAuthorizeUrl, gfaAppFrom, GFA_STATE_COOKIE } from "@/lib/gfa/auth";
import { getShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";

// GFA 공용 네이버 계정 연결 시작(관리자 전용) — state 쿠키를 굽고 네이버 로그인 인가 페이지로 보낸다.
// 로그인하는 네이버 아이디는 NMG GFA 관리 계정의 멤버(운영조회 이상)여야 한다.
export async function GET(req: Request) {
  const { origin } = new URL(req.url);
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);

  if (!(await getKeyManager())) return back({ gfa: "error", msg: "GFA 공용 연결은 관리자만 할 수 있어요." });
  try {
    const app = gfaAppFrom((await getShared("gfa"))?.config);
    const state = randomUUID();
    const res = NextResponse.redirect(buildGfaAuthorizeUrl(app, state));
    res.cookies.set(GFA_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 600 });
    return res;
  } catch (e) {
    return back({ gfa: "error", msg: e instanceof Error ? e.message : "GFA 연결을 시작하지 못했어요." });
  }
}
