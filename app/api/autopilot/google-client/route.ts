import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gmailApp } from "@/lib/gmail/auth";

// 구글 드라이브 불러오기용 OAuth Client ID(공개 값) — 브라우저 토큰 팝업에 쓴다. Secret은 내보내지 않는다
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const app = await gmailApp();
    return NextResponse.json({ clientId: app.clientId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
