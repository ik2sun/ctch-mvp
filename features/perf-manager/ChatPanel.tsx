"use client";

// 캠페인 매니저 대화창 — 현재 광고주 기준. 스트리밍(NDJSON), 스킬·데이터 도구·검색 표시, 출처. 대화는 화면 메모리에만(새로고침·광고주 전환 시 사라짐).
// 근거 토글: 웹 검색 · 리포트 분석(실제 매체 API — 캠페인·소재·성별·연령), 둘 다 기본 켜짐·이 브라우저에 기억. [종합 진단]은 메일·리포트·시장·대화를 묶은 답을 요청.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CM_SUGGESTIONS } from "./knowledge";
import type { ChatEvent, ChatTurn } from "./types";

type Msg = ChatTurn & { skills?: string[]; tools?: string[]; searches?: string[]; sources?: { title: string; url: string }[]; error?: string; pending?: boolean };

export type ChatPanelHandle = { ask: (q: string) => void };

export const ChatPanel = forwardRef<
  ChatPanelHandle,
  { clientId: string | null; clientName: string | null; className?: string; onClose?: () => void }
>(function ChatPanel({ clientId, clientName, className = "", onClose }, ref) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(true);
  const [reportAnalysis, setReportAnalysis] = useState(true);
  // 토글은 이 브라우저에 기억(사람마다 쓰는 방식이 달라서)
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("ctch_pm_toggles") ?? "null");
      if (v && typeof v.webSearch === "boolean") setWebSearch(v.webSearch);
      if (v && typeof v.reportAnalysis === "boolean") setReportAnalysis(v.reportAnalysis);
    } catch {
      /* 무시 */
    }
  }, []);
  const setToggle = (k: "webSearch" | "reportAnalysis", v: boolean) => {
    if (k === "webSearch") setWebSearch(v);
    else setReportAnalysis(v);
    try {
      localStorage.setItem("ctch_pm_toggles", JSON.stringify({ webSearch: k === "webSearch" ? v : webSearch, reportAnalysis: k === "reportAnalysis" ? v : reportAnalysis }));
    } catch {
      /* 무시 */
    }
  };
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);

  // 광고주를 바꾸면 대화를 새로 시작(다른 광고주 맥락이 섞이지 않게)
  useEffect(() => {
    abortRef.current?.abort();
    setMsgs([]);
  }, [clientId]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !clientId) return;
    const history: ChatTurn[] = [...msgs.filter((m) => !m.error && m.content.trim()).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", pending: true, skills: [], tools: [], searches: [] }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    try {
      const res = await fetch("/api/perf-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, turns: history, webSearch, reportAnalysis }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "답변을 시작하지 못했어요. 로그인이 만료됐다면 새로고침해 주세요.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.text }));
          else if (e.type === "skill") patch((m) => ({ ...m, skills: [...(m.skills ?? []), e.label] }));
          else if (e.type === "tool") patch((m) => ({ ...m, tools: (m.tools ?? []).includes(e.label) ? m.tools : [...(m.tools ?? []), e.label] }))
          else if (e.type === "search") patch((m) => ({ ...m, searches: [...(m.searches ?? []), e.query] }));
          else if (e.type === "sources") patch((m) => ({ ...m, sources: e.items }));
          else if (e.type === "error") patch((m) => ({ ...m, error: e.message }));
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) patch((m) => ({ ...m, error: e instanceof Error ? e.message : "오류가 발생했어요." }));
    } finally {
      patch((m) => ({ ...m, pending: false }));
      setBusy(false);
      abortRef.current = null;
    }
  };

  useImperativeHandle(ref, () => ({ ask: (q: string) => send(q) }));

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface ${className}`} aria-label="캠페인 매니저 대화">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-signal text-white">
            <i className="ti ti-chart-arrows-vertical text-[17px]" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-ink">{clientName ? `${clientName} 캠페인 매니저` : "캠페인 매니저"}</p>
            <p className="text-[12px] text-ink-muted">메일 · {reportAnalysis ? "리포트(실제 데이터)" : "리포트 꺼짐"} · {webSearch ? "웹 검색" : "웹 검색 꺼짐"} · 대화 내용을 종합해 답해요 · 저장되지 않아요</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {msgs.length > 0 && (
            <button type="button" onClick={() => !busy && setMsgs([])} disabled={busy} title="대화 지우기" className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40">
              <i className="ti ti-eraser text-[17px]" aria-hidden />
              <span className="sr-only">대화 지우기</span>
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} title="닫기" className="rounded-lg p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
              <i className="ti ti-x text-[17px]" aria-hidden />
              <span className="sr-only">닫기</span>
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 ? (
          <div>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {clientName ?? "광고주"}의 캠페인 매니저예요. 주고받은 메일, 연동 매체의 실제 리포트(캠페인·소재·성별·연령), 시장·경쟁 동향, 그리고 여기서 알려 주시는 사정을 종합해 판단하고 담당자별 할 일까지 정리해요.
            </p>
            <ul className="mt-3 space-y-1.5">
              {CM_SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] leading-snug text-ink-soft transition hover:border-signal/40 hover:bg-signal-soft hover:text-signal">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[15px] leading-relaxed text-white">{m.content}</p>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {(m.skills?.length || m.tools?.length || m.searches?.length) ? (
                  <div className="flex flex-wrap gap-1">
                    {m.skills?.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-signal-soft px-1.5 py-0.5 text-[12px] text-signal">
                        <i className="ti ti-book text-[12px]" aria-hidden />
                        {s} 스킬
                      </span>
                    ))}
                    {m.tools?.map((t) => (
                      <span key={t} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] ${t.startsWith("리포트") ? "bg-[#FFF3EF] text-[#C2410C]" : "bg-canvas text-ink-soft"}`}>
                        <i className={`ti ${t.startsWith("리포트") ? "ti-chart-bar" : t.startsWith("메일") ? "ti-mail" : "ti-database"} text-[12px]`} aria-hidden />
                        {t}
                      </span>
                    ))}
                    {m.searches?.map((q, k) => (
                      <span key={k} className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-canvas px-1.5 py-0.5 text-[12px] text-ink-muted" title={q}>
                        <i className="ti ti-world-search text-[12px]" aria-hidden />
                        {q}
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.content ? (
                  <Markdown text={m.content} />
                ) : m.pending ? (
                  <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                    <i className="ti ti-loader-2 animate-spin text-[15px]" aria-hidden />
                    생각하는 중…
                  </p>
                ) : null}
                {m.error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[13px] text-bad">{m.error}</p>}
                {m.sources && m.sources.length > 0 && (
                  <div className="rounded-lg bg-canvas px-3 py-2">
                    <p className="mb-1 text-[12px] font-medium text-ink-muted">참고한 출처</p>
                    <ul className="space-y-0.5">
                      {m.sources.map((s) => (
                        <li key={s.url} className="truncate text-[12px]">
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-signal underline-offset-2 hover:underline" title={s.url}>
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div className="border-t border-line px-3 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <Toggle on={reportAnalysis} onChange={(v) => setToggle("reportAnalysis", v)} icon="ti-chart-bar" label="리포트 분석(실제 데이터)" title="연동 매체 API로 캠페인·소재·성별·연령 성과를 직접 조회해 근거로 써요(조회 10~40초)" />
          <Toggle on={webSearch} onChange={(v) => setToggle("webSearch", v)} icon="ti-world-search" label="웹 검색(최신 정보)" />
          <button
            type="button"
            onClick={() => send(COMPOSITE_PROMPT(reportAnalysis, webSearch))}
            disabled={busy || !clientId}
            title="메일·리포트·시장·이 대화에서 알려 준 내용을 종합해 진단과 이번 주 할 일을 받아요"
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#F45B35]/50 bg-[#FFF3EF] px-2.5 py-0.5 font-medium text-[#C2410C] transition hover:border-[#F45B35] disabled:opacity-40"
          >
            <i className="ti ti-clipboard-check text-[12px]" aria-hidden />
            종합 진단
          </button>
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-signal/60">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder={clientId ? "이 광고주에 대해 무엇이든 물어보세요 (Shift+Enter 줄바꿈)" : "광고주를 먼저 선택하세요"}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-muted"
            aria-label="질문"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} title="멈추기" className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink hover:bg-line">
              <i className="ti ti-player-stop-filled text-[15px]" aria-hidden />
              <span className="sr-only">멈추기</span>
            </button>
          ) : (
            <button type="button" onClick={() => send(input)} disabled={!input.trim() || !clientId} title="보내기" className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal text-white hover:bg-signal-strong disabled:opacity-30">
              <i className="ti ti-arrow-up text-[17px]" aria-hidden />
              <span className="sr-only">보내기</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
});

// [종합 진단] 요청 — 켜진 근거만 언급(꺼진 근거는 매니저가 '꺼짐'으로 표기)
const COMPOSITE_PROMPT = (report: boolean, web: boolean) =>
  `종합 진단해 줘. 주고받은 메일(합의·요청·일정)${report ? ", 최근 30일 매체 리포트(직전 30일 대비)와 소재 판정" : ""}${web ? ", 시장·업계 최신 동향" : ", CTCH 시장 모니터링"}, 그리고 이 대화에서 내가 말한 내용을 모두 합쳐서 지금 상황의 결론, 근거(메일/리포트/시장/대화), 어긋나는 점, 오늘·이번 주 할 일(담당자 포함)을 정리해 줘.`;

function Toggle({ on, onChange, icon, label, disabled, title }: { on: boolean; onChange: (v: boolean) => void; icon: string; label: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={`${title ? `${title} — ` : ""}${on ? `${label} 켜짐, 누르면 꺼요` : `${label} 꺼짐, 누르면 켜요`}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-signal bg-signal font-medium text-white hover:bg-signal-strong" : "border-line bg-surface text-ink-muted hover:border-signal/40 hover:text-signal"}`}
    >
      <i className={`ti ${on ? "ti-check" : icon} text-[12px]`} aria-hidden />
      {label}
      <span className={`ml-0.5 rounded-full px-1.5 text-[11px] ${on ? "bg-white/20" : "bg-canvas"}`}>{on ? "켜짐" : "꺼짐"}</span>
    </button>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <p className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</p>,
          h2: ({ children }) => <p className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</p>,
          h3: ({ children }) => <p className="mb-1 mt-2.5 text-[15px] font-semibold first:mt-0">{children}</p>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-signal underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[13px]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line px-2 py-1 text-left font-medium text-ink-muted">{children}</th>,
          td: ({ children }) => <td className="border-b border-line/60 px-2 py-1 tabular-nums">{children}</td>,
          blockquote: ({ children }) => <blockquote className="mb-2 border-l-2 border-line pl-3 text-ink-soft">{children}</blockquote>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
