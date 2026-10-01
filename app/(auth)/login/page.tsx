"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/ui/Wordmark";

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
      {/* 좌측 — 시그니처: 신호를 캐치하는 레이더 펄스 */}
      <section className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <span className="absolute inset-0 m-auto h-24 w-24 animate-sweep rounded-full border border-signal/40" />
            <span className="absolute inset-0 m-auto h-24 w-24 animate-sweep rounded-full border border-signal/40 [animation-delay:1.3s]" />
            <span className="relative block h-3 w-3 rounded-full bg-signal shadow-[0_0_24px_6px_rgba(79,70,229,0.5)]" />
          </div>
        </div>
        <div className="absolute bottom-12 left-12 right-12">
          <p className="font-display text-3xl font-semibold leading-tight text-white">
            흩어진 신호를,
            <br />
            하나의 판단으로.
          </p>
          <p className="mt-3 max-w-sm text-[16px] leading-relaxed text-white/55">
            미디어믹스·UTM·AI 리포트까지. 매체마다 흩어진 퍼포먼스 데이터를
            CTCH가 한 화면에서 캐치합니다.
          </p>
        </div>
      </section>

      {/* 우측 — 구글 로그인 */}
      <section className="flex items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-10">
            <Wordmark size="lg" />
            <h1 className="mt-6 text-[22px] font-semibold text-ink">NMG 계정으로 로그인</h1>
            <p className="mt-1.5 text-[16px] text-ink-muted">
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

          <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-muted">
            로그인하면 공유 대시보드를 볼 수 있어요. 저장·수정·삭제는 관리자만 할 수 있어요.
          </p>
        </div>
      </section>
    </main>
  );
}
