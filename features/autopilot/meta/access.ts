// 캠페인 오토파일럿 · 메타 라우트 공통 — 로그인 → 광고주 소유 확인 → 메타 광고계정·토큰
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId, memberOnly } from "@/lib/workspace";
import { resolveMetaToken } from "@/lib/meta/token";
import { actOf } from "@/lib/meta/graph";

export type MetaAccess = { act: string; token: string; clientName: string; userEmail: string | null };

// 쓰기(실제 광고계정에 생성)도 구성원 누구나 — GFA와 같은 정책(2026-10-09). 실행자는 autopilot_actions에 이메일로 남는다
export async function metaAccess(clientId: unknown, write: boolean): Promise<MetaAccess | NextResponse> {
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
  const { data: client } = await supabase.from("clients").select("name, meta_account_id, meta_access_token").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  if (!client.meta_account_id) return NextResponse.json({ error: `${client.name}에 메타 광고계정 ID가 없어요. 광고주 관리 > 매체 연동에서 등록해 주세요.`, code: "NO_AD_ACCOUNT" }, { status: 400 });
  const { token } = await resolveMetaToken(client.meta_access_token as string | null);
  if (!token) return NextResponse.json({ error: "메타 액세스 토큰이 없어요. 관리자 > API 공용 키에서 메타 토큰을 등록해 주세요." }, { status: 400 });
  return { act: actOf(String(client.meta_account_id)), token, clientName: client.name as string, userEmail: user.email ?? null };
}
