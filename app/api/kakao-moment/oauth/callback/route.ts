import { dataOwnerId, ownerOnly } from "@/lib/workspace";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeAuthorizationCode, KakaoAuthError, STATE_COOKIE } from "@/lib/kakao-moment/auth";
import { fetchAdAccounts } from "@/lib/kakao-moment/aggregate";
import { saveShared } from "@/lib/sharedKeys";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";


// 카카오 비즈니스 인가 코드 콜백 — 코드를 비즈니스 토큰으로 교환해 광고주 행에 저장하고, 접근 가능한 광고계정이 하나면 자동 선택한다.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const oauthErrorDesc = searchParams.get("error_description");

  const cookieHeader = req.headers.get("cookie") ?? "";
  const rawCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  let saved: { state?: string; clientId?: string; shared?: boolean } = {};
  try {
    saved = rawCookie ? (JSON.parse(decodeURIComponent(rawCookie)) as { state?: string; clientId?: string; shared?: boolean }) : {};
  } catch {
    saved = {};
  }
  const clientId = saved.clientId ?? "";

  const finish = (params: Record<string, string>) => {
    const res = NextResponse.redirect(`${origin}/clients?${new URLSearchParams(params).toString()}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // 공용 카카오 계정 연결(API 공용 키 관리) — 토큰을 shared_media_keys(kakao)에 저장
  if (saved.shared) {
    const back = (params: Record<string, string>) => {
      const res = NextResponse.redirect(`${origin}/admin/api-keys?${new URLSearchParams(params).toString()}`);
      res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    };
    if (oauthError) return back({ kakao: "error", msg: `카카오 인증이 취소되었거나 실패했어요. (${oauthErrorDesc ?? oauthError})` });
    if (!code || !state || state !== saved.state) return back({ kakao: "error", msg: "인증 상태(state)가 일치하지 않아요. 다시 연결해 주세요." });
    const manager = await getKeyManager();
    if (!manager) return back({ kakao: "error", msg: "공용 키는 관리자만 연결할 수 있어요." });
    try {
      const tokens = await exchangeAuthorizationCode(code);
      let count = 0;
      try {
        count = (await fetchAdAccounts(tokens.accessToken)).length;
      } catch {
        /* 계정 수 조회 실패는 저장을 막지 않는다 */
      }
      const err = await saveShared(
        "kakao",
        { access_token: tokens.accessToken, linked_at: new Date().toISOString(), ...(tokens.scope ? { scope: tokens.scope } : {}) },
        manager.userId,
      );
      if (err) return back({ kakao: "error", msg: "저장에 실패했어요. supabase/migrations/0015_shared_media_keys.sql을 실행했는지 확인하세요." });
      return back({ kakao: "linked", accounts: String(count) });
    } catch (e) {
      return back({ kakao: "error", msg: e instanceof Error ? e.message : "카카오 토큰 교환에 실패했어요." });
    }
  }

  if (oauthError) return finish({ kakao: "error", clientId, msg: `카카오 인증이 취소되었거나 실패했어요. (${oauthErrorDesc ?? oauthError})` });
  if (!code || !state || !saved.state || state !== saved.state || !clientId) {
    return finish({ kakao: "error", clientId, msg: "인증 상태(state)가 일치하지 않아요. 다시 연결해 주세요." });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const denied = ownerOnly(user);
  if (denied) return denied;

  const { data: client } = await supabase.from("clients").select("id, kakao_ad_account_id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return finish({ kakao: "error", msg: "광고주를 찾을 수 없어요." });

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const update: Record<string, string | null> = {
      kakao_access_token: tokens.accessToken,
      kakao_token_expires_at: tokens.expiresAt || null,
      // 비즈니스 토큰은 리프레시 토큰이 없다 — 예전 카카오 로그인 방식으로 저장된 값은 비운다
      kakao_refresh_token: null,
      kakao_refresh_expires_at: null,
      kakao_linked_at: new Date().toISOString(),
    };

    // 접근 가능한 광고계정 조회 — 하나면 바로 선택, 여럿이면 화면에서 고르게 한다
    let accountCount = 0;
    let autoSelected = "";
    try {
      const accounts = await fetchAdAccounts(tokens.accessToken);
      accountCount = accounts.length;
      if (accounts.length === 1 && !client.kakao_ad_account_id) {
        autoSelected = String(accounts[0].id);
        update.kakao_ad_account_id = autoSelected;
      }
    } catch {
      /* 광고계정 조회 실패는 연결 자체를 막지 않는다 — 화면에서 재조회 */
    }

    const { error } = await supabase.from("clients").update(update).eq("id", clientId).eq("user_id", await dataOwnerId(user));
    if (error) return finish({ kakao: "error", clientId, msg: "토큰 저장에 실패했어요. supabase/migrations/0013_kakao_moment.sql을 실행했는지 확인해 주세요." });

    return finish({ kakao: "linked", clientId, accounts: String(accountCount), ...(autoSelected ? { selected: autoSelected } : {}) });
  } catch (e) {
    const msg = e instanceof KakaoAuthError ? e.message : e instanceof Error ? e.message : "카카오 토큰 교환에 실패했어요.";
    return finish({ kakao: "error", clientId, msg });
  }
}
