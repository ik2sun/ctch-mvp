"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, ADMIN_NAV, API_KEYS_NAV, isInCategory, type NavItem } from "./nav";
import { Wordmark } from "@/components/ui/Wordmark";
import { useClients } from "@/features/clients/ClientContext";
import { brandColorOf, fmtBudget, onColor } from "@/features/clients/clientData";
import { CurrentClientDialog } from "@/features/clients/CurrentClientDialog";
import type { Role } from "@/lib/supabase/profile";

// 메뉴 아이콘 색 — 카테고리 색(nav.ts accent, 검증된 범주 팔레트)을 옅은 타일 + 한 단계 눌린 아이콘으로.
// 원색 그대로면 노랑·분홍이 튀어서 아이콘은 검정 쪽으로 18% 섞고, 바탕은 10% 투명도로만 깐다.
const NEUTRAL = "#475467"; // 관리 메뉴(API 키·회원) — 차분한 회청색
function shade(hex: string, amt = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * (1 - amt)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function IconTile({ icon, color, active, small }: { icon: string; color: string; active: boolean; small?: boolean }) {
  const size = small ? "h-6 w-6 rounded-[7px]" : "h-7 w-7 rounded-lg";
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center transition ${size}`}
      style={active ? { background: color, boxShadow: `0 1px 2px ${color}55` } : { background: `${color}1A` }}
      aria-hidden
    >
      <i className={`ti ti-${icon} ${small ? "text-[15px]" : "text-[17px]"}`} style={{ color: active ? "#FFFFFF" : shade(color) }} />
    </span>
  );
}

export function Sidebar({ email, role }: { email: string; role: Role }) {
  const pathname = usePathname();
  const { selected, loading } = useClients();
  const [dialogOpen, setDialogOpen] = useState(false);

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

  function renderLeaf(item: NavItem, depth = 0, accent?: string) {
    const active = pathname === item.href;
    const color = accent ?? NEUTRAL;
    return (
      <Link
        key={item.href}
        href={item.href!}
        className={`group relative flex items-center gap-3 rounded-lg py-1.5 text-[15px] transition ${depth > 0 ? "pl-7 pr-3" : "px-2.5"} ${
          active ? "font-semibold text-ink" : "text-ink-soft hover:bg-canvas hover:text-ink"
        }`}
        style={active ? { background: `${color}17` } : undefined}
      >
        {/* 현재 메뉴 — 카테고리 색 왼쪽 막대 */}
        {active && <span className="absolute inset-y-1 left-0 w-1 rounded-r-full" style={{ background: color }} aria-hidden />}
        <IconTile icon={item.icon} color={color} active={active} small={depth > 0} />
        <span className="flex-1">{item.label}</span>
      </Link>
    );
  }

  return (
    <aside className="flex w-[236px] flex-shrink-0 flex-col border-r border-line bg-surface">
      {/* 로고: NMG + CTCH — 클릭 시 광고주 홈으로 이동 */}
      <Link
        href="/home"
        className="flex h-16 items-center gap-2.5 border-b border-line px-5 transition hover:bg-canvas"
        title="광고주 목록 보기"
      >
        {/* 상단 정렬 — nmg 이미지는 위 여백이 약 1px(8/258)이라 CTCH·구분선을 1px 내림 */}
        <div className="flex items-start gap-2.5">
          <img src="/nmg-logo.png" alt="NMG" className="h-6 w-auto object-contain" />
          <span className="mt-px h-5 w-px bg-line" aria-hidden />
          <Wordmark className="mt-px" />
        </div>
      </Link>

      {/* 현재 광고주 — 표시만 하고, 누르면 이 광고주의 상태 점검·정보 수정 팝업 (전환은 우측 상단) */}
      <div className="p-3">
        {selected ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:border-ink-faint"
            title="연동 상태 점검 · 정보 수정"
          >
            {/* Cake 워크스페이스 선택처럼 — 이니셜 사각형 + 이름 */}
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[15px] font-bold"
              style={{ background: brandColorOf(selected), color: onColor(brandColorOf(selected)) }}
              aria-hidden
            >
              {selected.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{selected.name}</span>
              <span className="block truncate text-[12px] text-ink-muted">
              {[selected.industry, selected.monthly_budget ? `월 ${fmtBudget(selected.monthly_budget)}` : null]
                .filter(Boolean)
                .join(" · ") || "정보 없음"}
              </span>
            </span>
            <i className="ti ti-settings text-[16px] text-ink-muted" aria-hidden />
          </button>
        ) : (
          <Link
            href="/clients?new=1"
            className="block rounded-lg border border-dashed border-line px-3 py-2.5 transition hover:border-ink-faint"
          >
            <span className="text-[12px] font-medium tracking-wide text-ink-faint">현재 광고주</span>
            <div className="mt-0.5 text-[15px] text-ink-muted">{loading ? "불러오는 중…" : "광고주를 먼저 등록하세요 →"}</div>
          </Link>
        )}
      </div>
      <CurrentClientDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {/* 기능 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-3 pb-2 pt-2 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">기능</p>
        <div className="space-y-0.5">
          {NAV.map((item) => {
            if (!item.children) return renderLeaf(item, 0, item.accent);

            const expanded = open[item.label] ?? false;
            const hasActiveChild = isInCategory(item, pathname);
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-[15px] transition ${
                    hasActiveChild ? "font-semibold text-ink" : "text-ink-soft hover:bg-canvas hover:text-ink"
                  }`}
                >
                  <IconTile icon={item.icon} color={item.accent ?? NEUTRAL} active={false} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <i
                    className={`ti ti-chevron-right text-[16px] text-ink-muted transition-transform ${
                      expanded ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map((c) => renderLeaf(c, 1, item.accent))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* 관리 메뉴 — API 공용 키: 관리자·최고관리자 / 회원 관리: 최고관리자 */}
      {role === "superadmin" && (
        <div className="space-y-0.5 border-t border-line px-3 py-2">
          {renderLeaf(API_KEYS_NAV, 0)}
          {role === "superadmin" && renderLeaf(ADMIN_NAV, 0)}
        </div>
      )}

      {/* 유저 */}
      <div className="flex items-center gap-2.5 border-t border-line p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-signal-soft text-[13px] font-medium text-signal">
          {email.slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate font-mono text-[13px] text-ink-muted">{email}</span>
      </div>
    </aside>
  );
}
