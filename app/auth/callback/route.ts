import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceEmail } from "@/lib/workspace";

// 구글 로그인 후 돌아오는 콜백 — @nmg.co.kr 계정만 통과(그 밖은 바로 로그아웃).
// 프로필 생성·승인은 app/(dashboard)/layout.tsx의 ensureProfile()에서 일괄 처리한다.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!isWorkspaceEmail(data.user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=domain`);
      }
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
