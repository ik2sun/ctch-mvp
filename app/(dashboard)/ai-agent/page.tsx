"use client";

// 퍼포먼스 매니저 — 정리된 퍼포먼스 지식·최신 정보 대시보드 + 세계 최고 수준 퍼포먼스 전문가 챗봇(스킬·웹 검색·광고주 성과)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { useMediaHistory } from "@/features/media-mix/useMediaHistory";
import { ChatPanel, type ChatPanelHandle } from "@/features/perf-manager/ChatPanel";
import { KnowledgeBoard } from "@/features/perf-manager/KnowledgeBoard";
import { buildContext } from "@/features/perf-manager/context";
import type { Brief } from "@/features/perf-manager/types";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PerformanceManagerPage() {
  const { selected } = useClients();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const [contextOn, setContextOn] = useState(false);
  const since = daysAgo(30);
  const until = daysAgo(1);
  // 토글을 켰을 때만 매체 데이터를 불러온다(대시보드와 같은 세션 캐시)
  const history = useMediaHistory(contextOn ? selected?.id : null, since, until);
  const contextText = useMemo(() => (selected && contextOn ? buildContext(selected.name, history.inputs, since, until) : null), [selected, contextOn, history.inputs, since, until]);
  const contextStatus = !contextOn ? "" : history.loading ? "매체 데이터 불러오는 중…" : history.inputs.length ? `최근 30일 · ${history.inputs.map((i) => i.label).join("·")}` : "연동된 매체 데이터 없음";

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

  const chatProps = {
    contextText,
    contextOn,
    onContextToggle: setContextOn,
    contextStatus,
    clientName: selected?.name ?? null,
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="text-[24px] font-bold tracking-tight text-ink">퍼포먼스 매니저</h2>
            <p className="mt-1 text-[16px] text-ink-soft">퍼포먼스 마케팅 핵심 정리와 메타·구글·네이버·카카오 최신 소식, 그리고 무엇이든 물어볼 수 있는 퍼포먼스 전문가</p>
          </div>
          <KnowledgeBoard
            briefs={briefs}
            loading={loading}
            refreshing={refreshing}
            lastRefreshed={lastRefreshed}
            canRefresh
            refreshMsg={refreshMsg}
            onRefresh={refresh}
            onAsk={ask}
          />
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
          퍼포먼스 매니저에게 묻기
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

