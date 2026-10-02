import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeGmailCode, gmailApp, GMAIL_SCOPE, GMAIL_STATE_COOKIE, revokeGmail } from "@/lib/gmail/auth";
import { migrationHint } from "@/features/perf-manager/store";

// Gmail OAuth 콜백 — 로그인한 본인 계정과 같은 메일함만 저장한다(남의 메일함 연결 방지).
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/ai-agent?${new URLSearchParams(params).toString()}`);
    res.cookies.set(GMAIL_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const oauthError = searchParams.get("error");
  if (oauthError) return back({ gmail: "error", msg: `구글 인증이 취소되었거나 실패했어요. (${oauthError})` });
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const saved = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GMAIL_STATE_COOKIE}=`))
    ?.slice(GMAIL_STATE_COOKIE.length + 1);
  if (!code || !state || !saved || state !== decodeURIComponent(saved)) return back({ gmail: "error", msg: "인증 상태(state)가 일치하지 않아요. 다시 연결해 주세요." });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(`${origin}/login`);

  try {
    const t = await exchangeGmailCode(await gmailApp(), code);
    if (t.scope && !t.scope.includes(GMAIL_SCOPE)) {
      await revokeGmail(t.refreshToken ?? t.accessToken);
      return back({ gmail: "error", msg: "동의 화면에서 'Gmail 메일 보기' 권한을 체크하지 않았어요. 다시 연결하면서 체크해 주세요." });
    }
    if (!t.email || t.email.toLowerCase() !== user.email.toLowerCase()) {
      await revokeGmail(t.refreshToken ?? t.accessToken);
      return back({ gmail: "error", msg: `CTCH 로그인 계정(${user.email})과 같은 구글 계정으로 연결해야 해요.` });
    }
    if (!t.refreshToken) return back({ gmail: "error", msg: "리프레시 토큰을 받지 못했어요. 구글 계정 → 보안 → 서드파티 액세스에서 이 앱을 삭제한 뒤 다시 연결하세요." });

    const { error } = await createAdminClient()
      .from("pm_mail_accounts")
      .upsert(
        {
          member_id: user.id,
          email: t.email.toLowerCase(),
          name: t.name ?? null,
          access_token: t.accessToken,
          refresh_token: t.refreshToken,
          expires_at: t.expiresAt,
          linked_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "member_id" },
      );
    if (error) return back({ gmail: "error", msg: migrationHint(error) ?? error.message });
    return back({ gmail: "linked" });
  } catch (e) {
    return back({ gmail: "error", msg: e instanceof Error ? e.message : "구글 토큰 교환에 실패했어요." });
  }
}
