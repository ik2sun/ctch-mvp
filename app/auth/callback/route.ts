import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 이메일 인증 링크 클릭 후 돌아오는 콜백 (회원가입 이메일 확인 흐름)
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=인증에 실패했어요`);
}
