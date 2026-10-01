"use client";

// 사이드바 "현재 광고주" 카드를 누르면 열리는 팝업 — 현재 광고주의 연동 상태 점검과 정보 수정만 한다.
// 광고주 전환·등록·삭제는 우측 상단 광고주 메뉴 / 광고주 관리 화면에서.
import { useEffect, useState } from "react";
import { EditGate, useCanEdit } from "@/features/workspace/WorkspaceContext";
import Link from "next/link";
import { useClients } from "./ClientContext";
import { ClientInfoForm } from "./ClientInfoForm";
import { MediaConnections } from "./MediaConnections";
import { fmtBudget } from "./clientData";

export function CurrentClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selected, refresh } = useClients();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<"status" | "info">("status");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open) setTab("status");
  }, [open]);

  function close() {
    if (dirty && !confirm("저장하지 않은 변경 사항이 있어요. 닫을까요?")) return;
    setDirty(false);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  if (!open || !selected) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[8vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${selected.name} 광고주 정보`}
        className="w-full max-w-2xl rounded-card border border-line bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium tracking-wide text-signal-strong">현재 광고주</p>
            <h2 className="truncate text-[17px] font-semibold text-ink">{selected.name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {[selected.industry, selected.monthly_budget ? `월 ${fmtBudget(selected.monthly_budget)}` : null, selected.manager ? `담당 ${selected.manager}` : null]
                .filter(Boolean)
                .join(" · ") || "기본 정보 없음"}
            </p>
          </div>
          <button type="button" onClick={close} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas" aria-label="닫기">
            <i className="ti ti-x text-[18px]" aria-hidden />
          </button>
        </div>

        <div className="flex gap-1 border-b border-line px-5">
          {(
            [
              ["status", "연동 상태 · 매체 설정", "plug-connected"],
              ["info", "기본 정보 수정", "pencil"],
            ] as const
          ).filter(([k]) => canEdit || k === "status").map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (k === tab) return;
                if (dirty && !confirm("저장하지 않은 변경 사항이 있어요. 이동할까요?")) return;
                setDirty(false);
                setTab(k);
              }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-2 py-2.5 text-[15px] transition ${
                tab === k ? "border-signal font-medium text-signal" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <i className={`ti ti-${icon} text-[16px]`} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">
          <EditGate>
            {tab === "status" || !canEdit ? (
              <MediaConnections client={selected} />
            ) : (
              <ClientInfoForm client={selected} onSaved={() => refresh()} onDirtyChange={setDirty} />
            )}
          </EditGate>
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>다른 광고주로 바꾸려면 우측 상단 광고주 메뉴를 쓰세요.</span>
          {canEdit && (
            <Link href="/clients" onClick={close} className="text-signal hover:underline">
              광고주 관리 →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
