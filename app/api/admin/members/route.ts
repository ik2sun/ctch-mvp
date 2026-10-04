import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/workspace";

// 회원 관리(소유자 전용) — 구글 @nmg.co.kr 로그인 이후 역할은 소유자(최고관리자)·보기 전용 둘뿐이라 '차단/차단 해제'만 한다.
// 차단 = profiles.status 'rejected' → 대시보드 진입 시 /rejected, RLS(is_workspace_member)로 데이터도 못 읽음.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isOwnerEmail(user.email)) return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });

  const { userId, action } = (await req.json().catch(() => ({}))) as { userId?: string; action?: "block" | "unblock" };
  if (!userId || (action !== "block" && action !== "unblock")) return NextResponse.json({ error: "필수 값이 없어요." }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "본인 계정은 차단할 수 없어요." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update(action === "block" ? { status: "rejected", role: "viewer" } : { status: "approved", role: "viewer" })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
