"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/ui/Wordmark";

const COPY = {
  pending: {
    title: "승인 대기 중입니다",
    desc: "관리자가 가입 요청을 확인하는 중이에요. 승인이 완료되면 이용하실 수 있어요.",
    icon: "ti-clock-hour-4",
  },
  rejected: {
    title: "접근이 거부되었습니다",
    desc: "관리자가 이 계정의 가입 요청을 거절했어요. 문의사항은 관리자에게 연락해 주세요.",
    icon: "ti-lock",
  },
} as const;

export function StatusScreen({ kind }: { kind: "pending" | "rejected" }) {
  const router = useRouter();
  const copy = COPY[kind];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[380px] text-center">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>
        <div className="rounded-card border border-line bg-surface p-8">
          <div
            className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
              kind === "rejected" ? "bg-bad/10" : "bg-signal-soft"
            }`}
          >
            <i
              className={`ti ${copy.icon} text-[22px] ${kind === "rejected" ? "text-bad" : "text-signal"}`}
              aria-hidden
            />
          </div>
          <p className="text-[16px] font-semibold text-ink">{copy.title}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{copy.desc}</p>
          <button onClick={signOut} className="btn-ghost mt-6 w-full">
            로그아웃
          </button>
        </div>
      </div>
    </main>
  );
}
