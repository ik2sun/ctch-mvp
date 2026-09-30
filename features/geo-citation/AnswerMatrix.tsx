"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sourceTypeOf } from "./analyze";
import { setMentionOverride } from "./geoData";
import { ENGINE_LABEL, isMentioned, type GeoAnswer, type GeoEngine, type GeoPrompt, type GeoRun } from "./types";
import { EngineName, ErrorBox } from "./ui";

type Cell = { query: string; promptId: string | null; engine: GeoEngine; answer?: GeoAnswer };

function CellView({ a, engine }: { a?: GeoAnswer; engine: GeoEngine }) {
  if (!a) return <span className="text-[11px] text-ink-faint">{engine === "naver" ? "+ 입력" : "-"}</span>;
  if (a.status === "pending" || a.status === "running")
    return <i className={`ti ${a.status === "running" ? "ti-loader-2 animate-spin" : "ti-clock"} text-[14px] text-ink-faint`} aria-label="대기" />;
  if (a.status === "error") return <span className="text-[11px] font-medium text-bad">오류</span>;
  const m = isMentioned(a);
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold ${m ? "bg-good/10 text-good" : "bg-canvas text-ink-muted"}`}>
        <i className={`ti ${m ? "ti-check" : "ti-minus"} text-[11px]`} aria-hidden />
        {m ? `언급${a.mention_order ? ` ${a.mention_order}` : ""}` : "미언급"}
        {a.mention_override !== null && <span title="사람이 보정한 값">*</span>}
      </span>
      <span className={`text-[10px] ${a.own_cited ? "font-semibold text-signal" : "text-ink-faint"}`}>
        {a.own_cited ? `자사 인용 ${a.own_cite_rank}위` : `인용 ${a.citations.length}`}
      </span>
    </span>
  );
}

export function AnswerMatrix({
  run,
  answers,
  prompts,
  onChanged,
}: {
  run: GeoRun;
  answers: GeoAnswer[];
  prompts: GeoPrompt[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Cell | null>(null);
  const engines: GeoEngine[] = [...run.engines, "naver"];
  // 행 = 이 회차에서 측정한 질문
  const rows = [...new Map(answers.filter((a) => a.engine !== "naver").map((a) => [a.query, a])).values()].map((a) => ({
    query: a.query,
    stage: a.stage,
    promptId: a.prompt_id,
  }));

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] text-[12px]">
          <thead className="bg-canvas text-ink-soft">
            <tr>
              <th className="px-3 py-2 text-left font-medium">질문</th>
              <th className="px-2 py-2 text-left font-medium">단계</th>
              {engines.map((e) => (
                <th key={e} className={`px-2 py-2 text-center font-medium ${e === "naver" ? "border-l border-line" : ""}`}>
                  <EngineName engine={e} className="justify-center" />
                  {e === "naver" && <span className="block text-[10px] font-normal text-ink-muted">수동 · 별도 집계</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.query}>
                <td className="max-w-[360px] px-3 py-2 text-ink">{r.query}</td>
                <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{r.stage}</td>
                {engines.map((e) => {
                  const a = answers.find((x) => x.query === r.query && x.engine === e);
                  const clickable = Boolean(a && a.status !== "pending") || (e === "naver" && r.promptId);
                  return (
                    <td key={e} className={`px-2 py-1.5 text-center ${e === "naver" ? "border-l border-line" : ""}`}>
                      <button
                        disabled={!clickable}
                        onClick={() => setOpen({ query: r.query, promptId: r.promptId, engine: e, answer: a })}
                        className="w-full rounded-md py-1 hover:bg-canvas disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <CellView a={a} engine={e} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        칸을 누르면 답변 원문과 인용 출처가 열려요. &lsquo;언급 N&rsquo;은 추적 브랜드(자사+경쟁사) 중 자사가 N번째로 등장했다는 뜻이고, *는 원문 대조 후 사람이 보정한 값이에요.
      </p>
      {open && (
        <AnswerDetail
          cell={open}
          runId={run.id}
          prompt={prompts.find((p) => p.id === open.promptId)}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AnswerDetail({
  cell,
  runId,
  prompt,
  onClose,
  onChanged,
}: {
  cell: Cell;
  runId: string;
  prompt?: GeoPrompt;
  onClose: () => void;
  onChanged: () => void;
}) {
  const a = cell.answer;
  const [editing, setEditing] = useState(cell.engine === "naver" && !a);
  const [text, setText] = useState(a?.answer ?? "");
  const [urls, setUrls] = useState((a?.citations ?? []).map((c) => c.url).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function override(v: boolean | null) {
    if (!a) return;
    setBusy(true);
    const err = await setMentionOverride(a.id, v);
    setBusy(false);
    if (err) setError(err);
    else onChanged();
  }

  async function saveManual() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/geo-citation/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, promptId: cell.promptId, answer: text, urls }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "저장하지 못했어요.");
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <EngineName engine={cell.engine} className="text-[12px] font-medium text-ink-soft" />
            {a?.model && <span className="ml-2 font-mono text-[10px] text-ink-muted">{a.model}</span>}
            <p className="mt-1 text-[15px] font-semibold text-ink">{cell.query}</p>
            {prompt?.evidence && <p className="mt-0.5 text-[11px] text-ink-muted">질문 근거 · {prompt.evidence}</p>}
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="닫기">
            <i className="ti ti-x text-[18px]" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <ErrorBox>{error}</ErrorBox>}

          {editing ? (
            <div className="space-y-2">
              <p className="text-[12px] text-ink-soft">
                네이버에서 이 질문을 직접 검색해 AI 브리핑 답변을 붙여 넣으세요. 로그아웃·시크릿 창에서 검색하면 개인화 영향이 줄어요.
              </p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="AI 브리핑 답변 원문" className="field h-48 w-full resize-y py-2 text-[13px]" />
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={"출처 URL (한 줄에 하나, 표시된 순서대로)\nhttps://blog.naver.com/...\nhttps://www.brand.com/..."}
                className="field h-28 w-full resize-y py-2 font-mono text-[12px]"
              />
              <div className="flex justify-end gap-2">
                {a && (
                  <button onClick={() => setEditing(false)} className="btn-ghost h-9 px-3 text-[13px]">
                    취소
                  </button>
                )}
                <button onClick={saveManual} disabled={busy} className="btn-signal h-9 px-3 text-[13px]">
                  저장
                </button>
              </div>
            </div>
          ) : a?.status === "error" ? (
            <ErrorBox>{a.error}</ErrorBox>
          ) : a ? (
            <>
              {/* 판정 */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-[12px]">
                <span className={`font-semibold ${isMentioned(a) ? "text-good" : "text-ink-muted"}`}>
                  {isMentioned(a) ? `언급됨${a.mention_order ? ` · 추적 브랜드 중 ${a.mention_order}번째` : ""}` : "미언급"}
                </span>
                <span className="text-ink-faint">|</span>
                <span className={a.own_cited ? "font-semibold text-signal" : "text-ink-muted"}>
                  {a.own_cited ? `자사 인용 ${a.own_cite_rank}위` : "자사 인용 없음"}
                </span>
                {a.competitors_mentioned.length > 0 && (
                  <>
                    <span className="text-ink-faint">|</span>
                    <span className="text-ink-soft">경쟁사 {a.competitors_mentioned.join(", ")}</span>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <span className="text-[11px] text-ink-muted">보정:</span>
                  {[
                    { v: true, label: "언급" },
                    { v: false, label: "미언급" },
                    { v: null, label: "자동" },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      disabled={busy}
                      onClick={() => override(o.v)}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${a.mention_override === o.v ? "bg-ink text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                자동 판정은 브랜드 표기 문자열 매칭이에요. 제품명만 나온 경우나 실재하지 않는 제품명은 원문을 읽고 보정해 주세요.
              </p>

              {/* 원문 */}
              <div className="prose-sm max-w-none rounded-lg border border-line px-4 py-3 text-[13px] leading-relaxed text-ink [&_a]:text-signal [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_table]:text-[12px] [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_th]:border [&_th]:border-line [&_th]:px-1.5 [&_ul]:list-disc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.answer ?? ""}</ReactMarkdown>
              </div>

              {/* 인용 */}
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-ink-soft">인용 출처 {a.citations.length}건 (답변 문장에 연결된 것만)</p>
                {a.citations.length === 0 && <p className="text-[12px] text-ink-muted">이 응답은 인용 출처를 내지 않았어요.</p>}
                <ol className="space-y-1">
                  {a.citations.map((c) => (
                    <li key={c.url} className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-[12px] ${c.own ? "bg-signal/5 ring-1 ring-signal/30" : ""}`}>
                      <span className="w-5 shrink-0 text-right font-mono text-ink-muted">{c.rank}</span>
                      <span className="min-w-0 flex-1">
                        <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-ink hover:text-signal">
                          {c.title || c.url}
                        </a>
                        <span className="text-[11px] text-ink-muted">
                          {c.domain} · {sourceTypeOf(c)}
                        </span>
                      </span>
                      {c.own && <span className="shrink-0 rounded bg-signal px-1.5 py-px text-[10px] font-semibold text-white">자사</span>}
                    </li>
                  ))}
                </ol>
              </div>
              {a.sources.length > 0 && (
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-ink-soft">검색했지만 인용하지 않은 결과 {a.sources.length}건</summary>
                  <ul className="mt-1.5 space-y-0.5 pl-2">
                    {a.sources.map((s) => (
                      <li key={s.url} className="truncate">
                        <a href={s.url} target="_blank" rel="noreferrer" className={`hover:text-signal ${s.own ? "font-semibold text-signal" : "text-ink-muted"}`}>
                          {s.domain} — {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {cell.engine === "naver" && (
                <button onClick={() => setEditing(true)} className="btn-ghost h-8 px-3 text-[12px]">
                  <i className="ti ti-pencil text-[14px]" aria-hidden />
                  수동 입력 고치기
                </button>
              )}
            </>
          ) : null}
        </div>
        <p className="border-t border-line px-5 py-2 text-[10px] text-ink-muted">
          {ENGINE_LABEL[cell.engine]} 응답은 {cell.engine === "naver" ? "담당자가 직접 검색해 입력한 값" : "웹 검색을 켠 API 응답이며 실제 앱 화면과 다를 수 있어요"}.
        </p>
      </div>
    </div>
  );
}
