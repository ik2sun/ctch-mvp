import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildGa4AuthorizeUrl, ga4AppFrom, GA4_STATE_COOKIE } from "@/lib/ga4/auth";
import { getShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";

// GA4 공용 구글 계정 연결 시작(관리자 전용) — state 쿠키를 굽고 구글 동의 화면으로 보낸다.
// 로그인하는 구글 계정은 조회할 GA4 속성에 뷰어 이상 권한이 있어야 한다.
export async function GET(req: Request) {
  const { origin } = new URL(req.url);
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);

  if (!(await getKeyManager())) return back({ ga4: "error", msg: "GA4 공용 연결은 관리자만 할 수 있어요." });
  try {
    const app = ga4AppFrom((await getShared("ga4"))?.config);
    const state = randomUUID();
    const res = NextResponse.redirect(buildGa4AuthorizeUrl(app, state));
    res.cookies.set(GA4_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 600 });
    return res;
  } catch (e) {
    return back({ ga4: "error", msg: e instanceof Error ? e.message : "GA4 연결을 시작하지 못했어요." });
  }
}
