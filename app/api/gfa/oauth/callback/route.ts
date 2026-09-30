import { NextResponse } from "next/server";
import { exchangeGfaCode, gfaAppFrom, GFA_STATE_COOKIE } from "@/lib/gfa/auth";
import { fetchMyManagerAccounts } from "@/lib/gfa/aggregate";
import { getShared, patchShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";

// 네이버 로그인 콜백 — 인가 코드를 토큰으로 바꿔 공용 키(gfa)에 저장. 관리 계정이 하나뿐이고 번호가 비어 있으면 자동으로 채운다.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);
    res.cookies.set(GFA_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  if (oauthError) return back({ gfa: "error", msg: `네이버 인증이 취소되었거나 실패했어요. (${searchParams.get("error_description") ?? oauthError})` });

  const saved = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GFA_STATE_COOKIE}=`))
    ?.slice(GFA_STATE_COOKIE.length + 1);
  if (!code || !state || !saved || state !== decodeURIComponent(saved)) return back({ gfa: "error", msg: "인증 상태(state)가 일치하지 않아요. 다시 연결해 주세요." });

  const manager = await getKeyManager();
  if (!manager) return back({ gfa: "error", msg: "GFA 공용 연결은 관리자만 할 수 있어요." });

  try {
    const cfg = (await getShared("gfa"))?.config;
    const tokens = await exchangeGfaCode(gfaAppFrom(cfg), code, state);

    // API 사용 권한 확인 겸 관리 계정 목록 — 실패해도 토큰은 저장하고 사유를 보여준다
    let managers: { no: number; name: string }[] = [];
    let warn = "";
    try {
      managers = await fetchMyManagerAccounts(tokens.accessToken);
    } catch (e) {
      warn = e instanceof Error ? e.message : "관리 계정 조회 실패";
    }

    const err = await patchShared("gfa", {
      access_token: tokens.accessToken,
      expires_at: tokens.expiresAt,
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      linked_at: new Date().toISOString(),
      ...(!cfg?.manager_account_no && managers.length === 1 ? { manager_account_no: String(managers[0].no) } : {}),
    });
    if (err) return back({ gfa: "error", msg: "저장에 실패했어요. supabase/migrations/0015_shared_media_keys.sql을 실행했는지 확인하세요." });

    return back(warn ? { gfa: "error", msg: `연결은 저장했지만 GFA API 호출이 거절됐어요 — ${warn}` } : { gfa: "linked", managers: String(managers.length) });
  } catch (e) {
    return back({ gfa: "error", msg: e instanceof Error ? e.message : "네이버 토큰 교환에 실패했어요." });
  }
}
