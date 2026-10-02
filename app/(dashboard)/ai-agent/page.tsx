"use client";

// 퍼포먼스 매니저 → 현재 광고주의 캠페인 매니저.
// 왼쪽: 메일 연결·수집, 메일 AI 정리, 메일 규칙·캠페인 담당자·시장 설정 + 업계 최신 정보 / 오른쪽: 캠페인 매니저 대화(메일·매체 성과·시장 도구)
import { useCallback, useEffect, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { ChatPanel, type ChatPanelHandle } from "@/features/perf-manager/ChatPanel";
import { CampaignManagerBoard } from "@/features/perf-manager/CampaignManagerBoard";
import { KnowledgeBoard } from "@/features/perf-manager/KnowledgeBoard";
import type { Brief } from "@/features/perf-manager/types";

export default function PerformanceManagerPage() {
  const { selected } = useClients();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Gmail 연결 후 돌아왔을 때(?gmail=linked|error&msg=)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("gmail");
    if (!g) return;
    setNotice(g === "linked" ? { kind: "ok", text: "Gmail 연동에 동의했어요. '메일 동기화'를 누르면 이 프로젝트 조건에 맞는 메일을 모아요." } : { kind: "error", text: p.get("msg") || "Gmail 연결에 실패했어요." });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const chatRef = useRef<ChatPanelHandle>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const ask = useCallback((q: string) => {
    setMobileOpen(true);
    chatRef.current?.ask(q);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/perf-manager/briefs");
        const j = await res.json();
        if (res.ok) {
          setBriefs(j.briefs ?? []);
          setLastRefreshed(j.lastRefreshed ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/perf-manager/briefs", { method: "POST" });
      const j = await res.json().catch(() => ({ error: "응답을 읽지 못했어요." }));
      if (!res.ok) throw new Error(j.error || "업데이트 실패");
      setBriefs(j.briefs ?? []);
      setLastRefreshed(j.lastRefreshed ?? null);
      setRefreshMsg(j.added ? `새 소식 ${j.added}개를 추가했어요.` : "새로 추가할 소식이 없어요 — 이미 최신이에요.");
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "업데이트 실패");
    } finally {
      setRefreshing(false);
    }
  };

  const chatProps = { clientId: selected?.id ?? null, clientName: selected?.name ?? null };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="text-[24px] font-bold tracking-tight text-ink">{selected ? `${selected.name} 캠페인 매니저` : "캠페인 매니저"}</h2>
            <p className="mt-1 text-[16px] text-ink-soft">광고주와 주고받은 메일, 연동 매체 성과, 시장 동향을 한곳에서 보고 담당자별 할 일을 정리해요</p>
          </div>

          {selected ? (
            <CampaignManagerBoard key={selected.id} clientId={selected.id} clientName={selected.name} onAsk={ask} notice={notice} />
          ) : (
            <p className="rounded-card border border-line bg-surface px-6 py-5 text-[15px] text-ink-muted">오른쪽 위에서 광고주를 선택하세요.</p>
          )}

          <section className="rounded-card border border-line bg-surface">
            <button type="button" onClick={() => setShowKnowledge((v) => !v)} aria-expanded={showKnowledge} className="flex w-full items-center justify-between px-6 py-4 text-left">
              <span>
                <span className="text-[17px] font-semibold text-ink">업계 최신 정보 · 퍼포먼스 정리</span>
                <span className="ml-2 text-[14px] text-ink-muted">메타·구글·네이버·카카오 소식 {briefs.length}건 — 대화에도 반영돼요</span>
              </span>
              <i className={`ti ti-chevron-down text-[18px] text-ink-muted transition ${showKnowledge ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {showKnowledge && (
              <div className="border-t border-line p-5">
                <KnowledgeBoard briefs={briefs} loading={loading} refreshing={refreshing} lastRefreshed={lastRefreshed} canRefresh refreshMsg={refreshMsg} onRefresh={refresh} onAsk={ask} />
              </div>
            )}
          </section>
        </div>
        {wide && (
          <div className="sticky top-0">
            <ChatPanel ref={chatRef} {...chatProps} className="h-[calc(100vh-112px)]" />
          </div>
        )}
      </div>

      {/* 좁은 화면: 떠 있는 버튼 → 전체 화면 대화창. 대화창은 화면 폭에 따라 한 곳에만 그린다 */}
      {!wide && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(21,24,30,0.25)]"
        >
          <i className="ti ti-message-chatbot text-[18px]" aria-hidden />
          캠페인 매니저에게 묻기
        </button>
      )}
      {!wide && (
        <div className={`fixed inset-0 z-50 bg-canvas p-3 ${mobileOpen ? "" : "hidden"}`}>
          <ChatPanel ref={chatRef} {...chatProps} onClose={() => setMobileOpen(false)} className="h-full" />
        </div>
      )}
    </div>
  );
}
