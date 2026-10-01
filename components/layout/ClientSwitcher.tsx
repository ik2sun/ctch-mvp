"use client";

// 우측 상단 광고주 메뉴 — 광고주 전환 + 광고주 관리/신규 등록 바로가기 ("선택 안 함" 없음)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/features/clients/ClientContext";
import { clientLabel, brandColorOf, onColor } from "@/features/clients/clientData";

export function ClientSwitcher() {
  const router = useRouter();
  const { clients, selected, selectClient, loading } = useClients();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTimeout(() => inputRef.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const shown = q.trim()
    ? sorted.filter((c) => `${c.name} ${c.industry ?? ""} ${c.manager ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : sorted;

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-9 max-w-[280px] items-center gap-2 rounded-lg border px-3 text-[15px] transition ${
          open ? "border-signal" : "border-line hover:border-ink-faint"
        }`}
      >
        {selected ? (
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[12px] font-bold"
            style={{ background: brandColorOf(selected), color: onColor(brandColorOf(selected)) }}
            aria-hidden
          >
            {selected.name.slice(0, 1)}
          </span>
        ) : (
          <i className="ti ti-building-store text-[16px] text-ink-muted" aria-hidden />
        )}
        <span className={`truncate ${selected ? "font-medium text-ink" : "text-ink-muted"}`}>
          {loading ? "불러오는 중…" : selected ? clientLabel(selected, clients) : "광고주 없음"}
        </span>
        <i className={`ti ti-chevron-down text-[15px] text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-[320px] overflow-hidden rounded-card border border-line bg-surface shadow-lg">
          {clients.length > 6 && (
            <div className="border-b border-line p-2">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="광고주 검색"
                autoComplete="off"
                className="field h-8 text-[15px]"
              />
            </div>
          )}
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium tracking-wide text-ink-faint">광고주 전환</p>
          <ul className="max-h-[320px] overflow-y-auto px-1.5 pb-1.5">
            {shown.length === 0 && <li className="px-2 py-2 text-[13px] text-ink-muted">{clients.length ? "검색 결과가 없어요." : "등록된 광고주가 없어요."}</li>}
            {shown.map((c) => {
              const cur = c.id === selected?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={cur}
                    onClick={() => {
                      selectClient(c.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] transition ${
                      cur ? "bg-signal-soft font-medium text-signal" : "text-ink hover:bg-canvas"
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[12px] font-bold"
                      style={{ background: brandColorOf(c), color: onColor(brandColorOf(c)) }}
                      aria-hidden
                    >
                      {c.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{clientLabel(c, clients)}</span>
                    {cur && <i className="ti ti-check text-[15px]" aria-hidden />}
                    {c.industry && !cur && <span className="flex-shrink-0 text-[12px] text-ink-faint">{c.industry}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line p-1.5">
            <button type="button" onClick={() => go("/clients")} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[15px] text-ink-soft hover:bg-canvas">
              <i className="ti ti-settings w-4 text-[16px]" aria-hidden />
              광고주 관리
            </button>
            <button type="button" onClick={() => go("/clients?new=1")} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[15px] text-signal hover:bg-signal-soft">
              <i className="ti ti-plus w-4 text-[16px]" aria-hidden />
              신규 광고주 등록
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
