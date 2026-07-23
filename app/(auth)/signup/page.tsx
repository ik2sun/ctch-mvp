"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/ui/Wordmark";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 설정해 주세요.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) {
      setError("가입에 실패했어요. 이미 등록된 이메일인지 확인해 주세요.");
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
  }

  async function handleGoogleSignup() {
    setError(null);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) setError("구글 가입에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
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
            팀의 리소스를,
            <br />
            판단에 집중시키세요.
          </p>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/55">
            반복 작업은 CTCH가. 마케터는 전략에.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-10">
            <Wordmark size="lg" />
            <h1 className="mt-6 text-[22px] font-semibold text-ink">계정 만들기</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">
              사내 퍼포먼스 대시보드를 시작하세요.
            </p>
          </div>

          {done ? (
            <div className="rounded-card border border-line bg-surface p-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-signal-soft">
                <span className="signal-dot" />
              </div>
              <p className="text-[15px] font-medium text-ink">
                가입이 완료되었습니다
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
                <span className="font-mono text-ink-soft">{email}</span> 받은편지함의
                링크를 눌러 이메일 인증을 완료해 주세요. 인증 후 관리자 승인이
                완료되면 이용하실 수 있어요.
              </p>
              <Link href="/login" className="btn-ghost mt-5 w-full">
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">
                    이메일
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marketer@nmg.co.kr"
                    className="field font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8자 이상"
                    className="field"
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading} className="btn-signal w-full">
                  {loading ? "생성 중…" : "계정 만들기"}
                </button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" aria-hidden />
                <span className="text-[12px] text-ink-faint">또는</span>
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>

              <button onClick={handleGoogleSignup} type="button" className="btn-ghost w-full">
                <i className="ti ti-brand-google text-[16px]" aria-hidden />
                구글로 가입하기
              </button>

              <p className="mt-6 text-center text-[14px] text-ink-muted">
                이미 계정이 있으신가요?{" "}
                <Link href="/login" className="font-medium text-signal hover:underline">
                  로그인
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
