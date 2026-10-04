"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/ui/Wordmark";
import { SignalNetwork } from "@/features/auth/SignalNetwork";

// 로그인 — 회사 구글 계정(@nmg.co.kr)만. hd 파라미터는 계정 선택 화면을 좁히는 힌트이고,
// 실제 차단은 /auth/callback·미들웨어가 이메일 도메인으로 한다.
const ERRORS: Record<string, string> = {
  domain: "@nmg.co.kr 회사 구글 계정으로만 로그인할 수 있어요.",
  auth: "로그인에 실패했어요. 다시 시도해 주세요.",
};

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(ERRORS[code] ?? code);
  }, []);

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        queryParams: { hd: "nmg.co.kr", prompt: "select_account" },
      },
    });
    if (error) {
      setError("구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 좌측 — 다크 네이비 + 로고 오렌지 단일 포인트: 흩어진 노드가 코어로 응집되는 데이터 네트워크 */}
      <section className="relative hidden overflow-hidden bg-[#0B1220] lg:block">
        <SignalNetwork coreX={0.76} coreY={0.5} />
        {/* 글자 쪽 가림막 — 선이 문구와 겹쳐도 읽히게 */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1220] via-[#0B1220]/75 to-transparent [background-size:70%_100%] bg-no-repeat" />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
          <h2 className="font-display text-[40px] font-bold leading-[1.25] tracking-tight text-white xl:text-[46px]">
            숫자가 꺾이는 순간,
            <br />
            <span className="text-[#F45B35]">캐치(CTCH).</span>
          </h2>
          <p className="mt-6 max-w-[520px] text-[17px] leading-[1.7] text-white/70">
            매체 성과, 소재 피로도, 검색 수요, 그리고 AI 답변 속 브랜드 언급까지.
            <br />
            흩어진 하락의 시그널을 놓치기 전에 가장 먼저 잡아냅니다.
          </p>
        </div>
      </section>

      {/* 우측 — 구글 로그인 */}
      <section className="flex items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-5">
            <Wordmark size="xl" />
            <p className="mt-3 text-[16px] text-ink-muted">
              @nmg.co.kr 회사 구글 계정으로 로그인해 주세요.
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            type="button"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface text-[16px] font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:bg-canvas disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {loading ? "구글로 이동 중…" : "Google 계정으로 로그인"}
          </button>

          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-muted">
            로그인하면 공유 대시보드를 볼 수 있어요. 저장·수정·삭제는 관리자만 할 수 있어요.
          </p>
        </div>
      </section>
    </main>
  );
}
