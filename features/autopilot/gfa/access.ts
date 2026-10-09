// 캠페인 오토파일럿 · GFA 라우트 공통 — 로그인 → 광고주 소유 확인 → GFA 자격 증명
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId, memberOnly } from "@/lib/workspace";
import { getGfaCredentials, type GfaCredentials } from "@/lib/gfa/auth";

export type GfaAccess = { creds: GfaCredentials; clientName: string; userEmail: string | null };

// write=true(실제 광고 계정에 생성·변경)도 구성원 누구나(2026-10-09 사용자 지시 — 담당자가 직접 업로드). 실행자는 autopilot_actions에 이메일로 남는다
export async function gfaAccess(clientId: unknown, write: boolean): Promise<GfaAccess | NextResponse> {
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
  const { data: client } = await supabase.from("clients").select("name, gfa_customer_id").eq("id", clientId).eq("user_id", await dataOwnerId(user)).maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  const creds = await getGfaCredentials(client.gfa_customer_id as string | null);
  return { creds, clientName: client.name as string, userEmail: user.email ?? null };
}
