import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 이메일 인증 링크 클릭 / 구글 로그인 후 돌아오는 콜백
// 프로필 생성·슈퍼관리자 부트스트랩은 로그인 방식과 무관하게
// app/(dashboard)/layout.tsx의 ensureProfile()에서 일괄 처리한다.
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
