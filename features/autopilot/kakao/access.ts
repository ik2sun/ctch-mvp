// 캠페인 오토파일럿 · 카카오모먼트 라우트 공통 — 로그인 → 광고주 소유 확인 → 비즈니스 토큰·광고계정
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId, memberOnly } from "@/lib/workspace";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS, type KakaoCredentials } from "@/lib/kakao-moment/auth";

export type KakaoAccess = { creds: KakaoCredentials & { shared: boolean }; clientName: string; userEmail: string | null };

// 쓰기도 구성원 누구나 — GFA·메타와 같은 정책(2026-10-09). 실행자는 autopilot_actions에 이메일로 남는다
export async function kakaoAccess(clientId: unknown, write: boolean): Promise<KakaoAccess | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (write) {
    const denied = memberOnly(user);
    if (denied) return denied;
  }
  if (typeof clientId !== "string" || !clientId) return NextResponse.json({ error: "clientId가 필요해요." }, { status: 400 });
  const { data: client } = await supabase.from("clients").select(`id, name, ${KAKAO_TOKEN_COLUMNS}`).eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  const creds = await ensureKakaoAccessToken(supabase, clientId, client as never);
  return { creds, clientName: (client as { name: string }).name, userEmail: user.email ?? null };
}
