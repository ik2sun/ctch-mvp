"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, CLIENTS_NAV, isInCategory, type NavItem } from "./nav";
import { Wordmark } from "@/components/ui/Wordmark";
import { useClients } from "@/features/clients/ClientContext";
import { fmtBudget } from "@/features/clients/clientData";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const { selected } = useClients();
  const onClientsPage = pathname === CLIENTS_NAV.href;

  // 현재 경로가 속한 카테고리는 자동으로 펼침
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const next: Record<string, boolean> = {};
    NAV.forEach((n) => {
      if (n.children && isInCategory(n, pathname)) next[n.label] = true;
    });
    setOpen((prev) => ({ ...prev, ...next }));
  }, [pathname]);

  function toggle(label: string) {
    setOpen((p) => ({ ...p, [label]: !p[label] }));
  }

  function renderLeaf(item: NavItem, depth = 0) {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href!}
        className={`group flex items-center gap-3 rounded-lg py-2.5 text-[14px] transition ${
          depth > 0 ? "pl-9 pr-3" : "px-3"
        } ${active ? "bg-signal-soft font-medium text-signal" : "text-ink-soft hover:bg-canvas"}`}
      >
        <i
          className={`ti ti-${item.icon} ${depth > 0 ? "text-[16px]" : "text-[18px]"} ${
            active ? "text-signal" : "text-ink-muted group-hover:text-ink-soft"
          }`}
          aria-hidden
        />
        <span className="flex-1">{item.label}</span>
        {active && <span className="signal-dot" aria-hidden />}
      </Link>
    );
  }

  return (
    <aside className="flex w-[236px] flex-shrink-0 flex-col border-r border-line bg-surface">
      {/* 로고: NMG + CTCH */}
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <img src="/nmg-logo.png" alt="NMG" className="h-6 w-auto object-contain" />
        <span className="h-4 w-px bg-line" aria-hidden />
        <Wordmark />
      </div>

      {/* 현재 광고주 컨텍스트 카드 */}
      <div className="p-3">
        <Link
          href={CLIENTS_NAV.href!}
          className={`block rounded-lg border px-3 py-2.5 transition ${
            onClientsPage
              ? "border-signal bg-signal-soft"
              : selected
                ? "border-signal/40 bg-signal-soft/50 hover:border-signal"
                : "border-dashed border-line hover:border-ink-faint"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium tracking-wide text-signal-strong">현재 광고주</span>
            <i className="ti ti-selector text-[14px] text-signal-strong" aria-hidden />
          </div>
          {selected ? (
            <>
              <div className="mt-0.5 truncate text-[15px] font-medium text-ink">{selected.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-ink-muted">
                {[selected.industry, selected.monthly_budget ? `월 ${fmtBudget(selected.monthly_budget)}` : null]
                  .filter(Boolean)
                  .join(" · ") || "정보 없음"}
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-[13px] text-ink-muted">광고주를 선택하세요</div>
          )}
        </Link>
      </div>

      {/* 기능 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-medium tracking-wide text-ink-faint">기능</p>
        <div className="space-y-0.5">
          {NAV.map((item) => {
            if (!item.children) return renderLeaf(item);

            const expanded = open[item.label] ?? false;
            const hasActiveChild = isInCategory(item, pathname);
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition ${
                    hasActiveChild ? "font-medium text-ink" : "text-ink-soft hover:bg-canvas"
                  }`}
                >
                  <i
                    className={`ti ti-${item.icon} text-[18px] ${
                      hasActiveChild ? "text-signal" : "text-ink-muted"
                    }`}
                    aria-hidden
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  <i
                    className={`ti ti-chevron-down text-[14px] text-ink-muted transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map((c) => renderLeaf(c, 1))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* 유저 */}
      <div className="flex items-center gap-2.5 border-t border-line p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-signal-soft text-[12px] font-medium text-signal">
          {email.slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate font-mono text-[12px] text-ink-muted">{email}</span>
      </div>
    </aside>
  );
}
