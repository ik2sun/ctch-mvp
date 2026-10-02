import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceEmail } from "@/lib/workspaceEmail";
import { buildGmailAuthorizeUrl, gmailApp, GMAIL_STATE_COOKIE } from "@/lib/gmail/auth";

// 담당자 본인 Gmail 연결 시작 — 로그인한 @nmg.co.kr 구성원 누구나(본인 메일함만). 구글 동의 화면으로 보낸다.
export async function GET(req: Request) {
  const { origin } = new URL(req.url);
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/ai-agent?${new URLSearchParams(params).toString()}`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!isWorkspaceEmail(user.email)) return back({ gmail: "error", msg: "@nmg.co.kr 계정만 연결할 수 있어요." });
  try {
    const state = randomUUID();
    const res = NextResponse.redirect(buildGmailAuthorizeUrl(await gmailApp(), state, user.email));
    res.cookies.set(GMAIL_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/", maxAge: 600 });
    return res;
  } catch (e) {
    return back({ gmail: "error", msg: e instanceof Error ? e.message : "Gmail 연결을 시작하지 못했어요." });
  }
}
