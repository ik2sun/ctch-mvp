import { NextResponse } from "next/server";
import { exchangeGa4Code, ga4AppFrom, GA4_SCOPE, GA4_STATE_COOKIE } from "@/lib/ga4/auth";
import { fetchAccessibleProperties } from "@/lib/ga4/client";
import { getShared, patchShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";

// 구글 OAuth 콜백 — 인가 코드를 토큰으로 바꿔 공용 키(ga4)에 저장하고, 접근 가능한 속성 수를 확인한다.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);
    res.cookies.set(GA4_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  if (oauthError) return back({ ga4: "error", msg: `구글 인증이 취소되었거나 실패했어요. (${oauthError})` });

  const saved = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GA4_STATE_COOKIE}=`))
    ?.slice(GA4_STATE_COOKIE.length + 1);
  if (!code || !state || !saved || state !== decodeURIComponent(saved)) return back({ ga4: "error", msg: "인증 상태(state)가 일치하지 않아요. 다시 연결해 주세요." });

  if (!(await getKeyManager())) return back({ ga4: "error", msg: "GA4 공용 연결은 관리자만 할 수 있어요." });

  try {
    const cfg = (await getShared("ga4"))?.config;
    const tokens = await exchangeGa4Code(ga4AppFrom(cfg), code);
    if (tokens.scope && !tokens.scope.includes(GA4_SCOPE)) {
      return back({ ga4: "error", msg: "동의 화면에서 'Google 애널리틱스 데이터 보기' 권한을 체크하지 않았어요. 다시 연결하면서 체크해 주세요." });
    }
    if (!tokens.refreshToken && !cfg?.refresh_token) {
      return back({ ga4: "error", msg: "리프레시 토큰을 받지 못했어요. 구글 계정 → 보안 → 서드파티 액세스에서 이 앱을 삭제한 뒤 다시 연결하세요." });
    }

    // 접근 가능한 속성 수 — Admin API가 꺼져 있어도 연결 자체는 저장한다
    let properties = -1;
    try {
      properties = (await fetchAccessibleProperties(tokens.accessToken)).length;
    } catch {
      /* Admin API 미사용 설정 등 — 무시 */
    }

    const err = await patchShared("ga4", {
      access_token: tokens.accessToken,
      expires_at: tokens.expiresAt,
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      linked_at: new Date().toISOString(),
      ...(tokens.email ? { linked_email: tokens.email } : {}),
    });
    if (err) return back({ ga4: "error", msg: "저장에 실패했어요. supabase/migrations/0015_shared_media_keys.sql을 실행했는지 확인하세요." });

    return back({ ga4: "linked", email: tokens.email ?? "", properties: String(properties) });
  } catch (e) {
    return back({ ga4: "error", msg: e instanceof Error ? e.message : "구글 토큰 교환에 실패했어요." });
  }
}
