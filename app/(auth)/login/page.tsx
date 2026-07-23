"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/ui/Wordmark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
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
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/55">
            미디어믹스·UTM·AI 리포트까지. 매체마다 흩어진 퍼포먼스 데이터를
            CTCH가 한 화면에서 캐치합니다.
          </p>
        </div>
      </section>

      {/* 우측 — 로그인 폼 */}
      <section className="flex items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-10">
            <Wordmark size="lg" />
            <h1 className="mt-6 text-[22px] font-semibold text-ink">다시 오셨네요</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">
              계정으로 로그인해 대시보드를 이어가세요.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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
                placeholder="••••••••"
                className="field"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-signal w-full">
              {loading ? "확인 중…" : "로그인"}
            </button>
          </form>

          <p className="mt-6 text-center text-[14px] text-ink-muted">
            아직 계정이 없으신가요?{" "}
            <Link href="/signup" className="font-medium text-signal hover:underline">
              가입하기
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
