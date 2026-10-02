import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeGmail } from "@/lib/gmail/auth";

// 내 Gmail 연결 해제 — 토큰 폐기 + 연결 행 삭제. 이미 모은 메일은 남는다(광고주 메일 기록)
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createAdminClient();
  const { data } = await db.from("pm_mail_accounts").select("access_token, refresh_token").eq("member_id", user.id).maybeSingle();
  if (data) await revokeGmail(data.refresh_token ?? data.access_token);
  await db.from("pm_mail_shares").delete().eq("member_id", user.id);
  const { error } = await db.from("pm_mail_accounts").delete().eq("member_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
