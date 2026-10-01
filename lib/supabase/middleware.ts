import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isWorkspaceEmail } from "@/lib/workspaceEmail";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// 매 요청마다 세션을 갱신하고, 미로그인 사용자의 대시보드 접근을 차단
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup");

  // @nmg.co.kr 이외 계정(예전 비밀번호 가입 계정 포함) → 로그아웃 후 /login?error=domain
  if (user && !isWorkspaceEmail(user.email) && !path.startsWith("/auth")) {
    await supabase.auth.signOut();
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "@nmg.co.kr 계정으로 로그인해 주세요." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=domain";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // 로그인 안 했는데 보호 페이지 접근 → /login 으로
  // /api/cron/* 은 Vercel 크론(로그인 없음) — 각 라우트가 CRON_SECRET으로 직접 검증한다
  if (!user && !isAuthPage && !path.startsWith("/auth") && !path.startsWith("/api/cron/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 이미 로그인했는데 로그인/가입 페이지 접근 → 대시보드로
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
