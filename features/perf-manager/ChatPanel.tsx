"use client";

// 퍼포먼스 매니저 대화창 — 스트리밍(NDJSON), 스킬·검색 표시, 출처. 대화는 화면 메모리에만(새로고침하면 사라짐).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SUGGESTIONS } from "./knowledge";
import type { ChatEvent, ChatTurn } from "./types";

type Msg = ChatTurn & { skills?: string[]; searches?: string[]; sources?: { title: string; url: string }[]; error?: string; pending?: boolean };

export type ChatPanelHandle = { ask: (q: string) => void };

export const ChatPanel = forwardRef<
  ChatPanelHandle,
  { contextText: string | null; contextOn: boolean; onContextToggle: (v: boolean) => void; contextStatus: string; clientName: string | null; className?: string; onClose?: () => void }
>(function ChatPanel({ contextText, contextOn, onContextToggle, contextStatus, clientName, className = "", onClose }, ref) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [webSearch, setWebSearch] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = [...msgs.filter((m) => !m.error && m.content.trim()).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", pending: true, skills: [], searches: [] }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    try {
      const res = await fetch("/api/perf-manager/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: history, context: contextOn ? contextText : null, webSearch }),
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
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface ${className}`} aria-label="퍼포먼스 매니저 대화">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
            <i className="ti ti-chart-arrows-vertical text-[17px]" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-ink">퍼포먼스 매니저</p>
            <p className="text-[12px] text-ink-muted">메타·구글·네이버·카카오 전문 · 대화는 저장되지 않아요</p>
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
              성과 진단, 예산 배분, 매체 운영, 소재 전략, 측정까지 물어보세요. 필요한 전문 스킬을 골라 읽고, 최신 정보는 웹에서 확인해 출처와 함께 답해요.
            </p>
            <ul className="mt-3 space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] leading-snug text-ink-soft transition hover:border-ink/30 hover:text-ink">
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
                {(m.skills?.length || m.searches?.length) ? (
                  <div className="flex flex-wrap gap-1">
                    {m.skills?.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-signal-soft px-1.5 py-0.5 text-[12px] text-signal">
                        <i className="ti ti-book text-[12px]" aria-hidden />
                        {s} 스킬
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
          <Toggle on={webSearch} onChange={setWebSearch} icon="ti-world-search" label="웹 검색(최신 정보)" />
          <Toggle on={contextOn} onChange={onContextToggle} icon="ti-chart-bar" label={clientName ? `${clientName} 성과 포함` : "광고주 성과 포함"} disabled={!clientName} />
          {contextOn && <span className="text-ink-muted">{contextStatus}</span>}
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-ink/40">
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
            placeholder="무엇이든 물어보세요 (Shift+Enter 줄바꿈)"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-muted"
            aria-label="질문"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} title="멈추기" className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink hover:bg-line">
              <i className="ti ti-player-stop-filled text-[15px]" aria-hidden />
              <span className="sr-only">멈추기</span>
            </button>
          ) : (
            <button type="button" onClick={() => send(input)} disabled={!input.trim()} title="보내기" className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white hover:bg-ink-soft disabled:opacity-30">
              <i className="ti ti-arrow-up text-[17px]" aria-hidden />
              <span className="sr-only">보내기</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
});

function Toggle({ on, onChange, icon, label, disabled }: { on: boolean; onChange: (v: boolean) => void; icon: string; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-ink/20 bg-ink/5 font-medium text-ink" : "border-line text-ink-muted hover:text-ink"}`}
    >
      <i className={`ti ${on ? "ti-check" : icon} text-[12px]`} aria-hidden />
      {label}
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
