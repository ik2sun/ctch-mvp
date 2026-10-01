"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navByPath } from "./nav";
import { ClientSwitcher } from "./ClientSwitcher";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const current = navByPath(pathname);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 2xl:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold text-ink">{current.label}</h1>
        <p className="truncate text-[13px] text-ink-muted">{current.desc}</p>
      </div>

      <div className="flex items-center gap-2.5">
        {/* 광고주 전환 · 광고주 관리 */}
        <ClientSwitcher />

        <button
          onClick={signOut}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink-soft shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:bg-canvas"
        >
          <i className="ti ti-logout text-[17px]" aria-hidden />
          로그아웃
        </button>
      </div>
    </header>
  );
}
