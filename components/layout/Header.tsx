"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { navByPath } from "./nav";
import { useClients } from "@/features/clients/ClientContext";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const current = navByPath(pathname);
  const { clients, selected, selectClient } = useClients();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6">
      <div>
        <h1 className="text-[15px] font-semibold text-ink">{current.label}</h1>
        <p className="text-[12px] text-ink-muted">{current.desc}</p>
      </div>

      <div className="flex items-center gap-2.5">
        {/* 현재 광고주 선택 */}
        <div className="relative">
          <select
            value={selected?.id ?? ""}
            onChange={(e) => selectClient(e.target.value || null)}
            className="h-9 appearance-none rounded-lg border border-line bg-surface pl-8 pr-8 text-[13px] text-ink-soft outline-none transition hover:border-ink-faint focus:border-signal"
          >
            <option value="">광고주 선택 안 함</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <i
            className={`ti ti-building-store pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] ${
              selected ? "text-signal" : "text-ink-muted"
            }`}
            aria-hidden
          />
          <i className="ti ti-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted" aria-hidden />
        </div>

        <button
          onClick={signOut}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-soft transition hover:border-ink-faint"
        >
          <i className="ti ti-logout text-[16px]" aria-hidden />
          로그아웃
        </button>
      </div>
    </header>
  );
}
