"use client";

import { useEffect, useState } from "react";
import { saveCreative, type Creative } from "./creativeData";
import { EDIT_RATIOS, EDIT_TOOLS, EDIT_TOOL_BY_ID, type EditPromptResult, type EditToolId } from "./editTools";

const FIELD =
  "rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";

// 이미지 수정 — 원본 + 수정 요청 → Claude 가 이미지를 보고 도구별 수정 프롬프트를 만든다.
// Nano Banana 2 · GPT Image 2 는 옵션으로 '바로 수정'(편집 API, 종량제)까지 하고 결과를 보관함에 저장한다.
export function ImageEditor({
  source,
  initialRequest = "",
  initialTool = "gemini",
  autoRun = false,
  initialApply = false,
  apiReady,
  onClose,
  onSaved,
}: {
  source: Creative;
  initialRequest?: string;
  initialTool?: EditToolId;
  autoRun?: boolean;
  initialApply?: boolean; // 'API로 바로 수정' 옵션 체크 상태로 연다
  apiReady: Record<string, boolean> | null;
  onClose: () => void;
  onSaved: (item: Creative) => void;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [tool, setTool] = useState<EditToolId>(initialTool);
  const [ratio, setRatio] = useState<string>("원본");
  const [result, setResult] = useState<EditPromptResult | null>(null);
  const [prompt, setPrompt] = useState("");
  const [useApi, setUseApi] = useState(initialApply);
  const [edited, setEdited] = useState<Creative | null>(null);
  const [busy, setBusy] = useState<"prompt" | "apply" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = EDIT_TOOL_BY_ID[tool];
  const keyMissing = Boolean(t.api && apiReady !== null && apiReady[t.api] === false);
  const applyOn = Boolean(t.api) && useApi && !keyMissing; // 옵션 체크 시 프롬프트 생성 후 바로 수정까지

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, busy]);

  useEffect(() => {
    if (autoRun && initialRequest.trim()) makePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/creative/edit-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creativeId: source.id, tool, aspectRatio: ratio, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "요청에 실패했어요.");
    return json;
  }

  async function makePrompt() {
    setBusy("prompt");
    setError(null);
    try {
      const json = await call({ action: "prompt", request });
      const r = json.result as EditPromptResult;
      setResult(r);
      setPrompt(r.prompt);
      setBusy(null);
      if (applyOn && r.prompt) await apply(r.prompt, r.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "프롬프트 생성 중 오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function apply(promptText = prompt, title = result?.title) {
    setBusy("apply");
    setError(null);
    try {
      const json = await call({ action: "apply", prompt: promptText });
      const saved = await saveCreative({
        clientId: source.client_id,
        kind: "image",
        prompt: request.trim() || title || "이미지 수정",
        imageUrl: json.url,
        sourceImageUrl: source.image_url,
        model: json.model,
      });
      if (saved.error) throw new Error(saved.error.message);
      setEdited(saved.data as Creative);
      onSaved(saved.data as Creative);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정 중 오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError("클립보드 복사에 실패했어요.");
    }
  }

  const fullText = result ? [prompt, result.params, result.negative && (tool === "midjourney" ? `--no ${result.negative}` : `Negative: ${result.negative}`)].filter(Boolean).join(" ") : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-signal-soft/70 via-white to-violet-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-violet-500 text-white shadow-sm shadow-signal/30">
              <i className="ti ti-wand text-[18px]" aria-hidden />
            </span>
            <div>
              <h3 className="text-[16px] font-semibold text-gray-900">이미지 수정</h3>
              <p className="mt-0.5 text-xs text-gray-500">바꾸고 싶은 내용을 적으면 AI가 이미지를 보고 고른 도구에 맞는 수정 프롬프트를 만들어요.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="닫기"
          >
            <i className="ti ti-x text-[18px]" aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[300px_1fr]">
          {/* 원본 · 결과 */}
          <div className="space-y-3 overflow-y-auto border-r border-gray-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5">
            <figure>
              <figcaption className="mb-1.5 text-[11px] font-semibold text-gray-500">원본</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.image_url ?? ""} alt="" className="w-full rounded-lg ring-1 ring-gray-200" />
            </figure>
            {edited?.image_url && (
              <figure>
                <figcaption className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-signal">
                  수정 결과 <span className="font-normal text-gray-400">보관함에 저장됨</span>
                </figcaption>
                <a href={edited.image_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={edited.image_url} alt="" className="w-full rounded-lg ring-2 ring-signal/40" />
                </a>
              </figure>
            )}
          </div>

          {/* 요청 · 결과 */}
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-gray-700">수정하고 싶은 내용</span>
                <textarea
                  rows={3}
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="예) 배경을 여름 해변으로 바꾸고 제품은 그대로. 오후 햇살, 광고 사진 느낌으로"
                  className={`${FIELD} w-full resize-none px-3 py-2 text-[13px]`}
                />
              </label>
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-gray-700">수정에 쓸 도구</span>
                <div role="radiogroup" className="flex flex-wrap gap-1.5">
                  {EDIT_TOOLS.map((it) => {
                    const on = it.id === tool;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setTool(it.id);
                          if (!it.api) setUseApi(false);
                        }}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] transition ${
                          on ? "bg-signal-soft font-semibold text-signal-strong ring-2 ring-signal" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-signal/40"
                        }`}
                      >
                        <i className={`ti ti-${it.icon} text-[14px]`} aria-hidden />
                        {it.name}
                        {it.api && <span className="rounded bg-violet-100 px-1 text-[9.5px] font-semibold text-violet-700">API</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                  <span className="mr-1">비율</span>
                  {EDIT_RATIOS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRatio(r)}
                      className={`h-7 rounded-md px-2 text-[11px] transition ${
                        r === ratio ? "bg-signal-soft font-semibold text-signal ring-1 ring-signal/30" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-signal/30"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {t.api && (
                  <label className={`flex items-center gap-2 text-[12px] ${keyMissing ? "cursor-not-allowed text-gray-400" : "cursor-pointer text-violet-900"}`}>
                    <input
                      type="checkbox"
                      checked={useApi && !keyMissing}
                      disabled={keyMissing}
                      onChange={(e) => setUseApi(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-violet-600"
                    />
                    <span>
                      API로 바로 수정 <span className="text-[11px] text-gray-500">({t.name} · 종량제)</span>
                      {keyMissing && <span className="ml-1 text-[11px] text-amber-700">서버 키 없음</span>}
                    </span>
                  </label>
                )}
                <button
                  type="button"
                  onClick={makePrompt}
                  disabled={Boolean(busy)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[13px] font-semibold text-white shadow-sm shadow-signal/25 transition hover:brightness-110 disabled:opacity-50"
                >
                  <i className={`ti ${busy ? "ti-loader-2 animate-spin" : applyOn ? "ti-wand" : "ti-sparkles"} text-[15px]`} aria-hidden />
                  {busy === "prompt"
                    ? "이미지 분석 중… (20~40초)"
                    : busy === "apply"
                      ? "수정 중… (수십 초)"
                      : applyOn
                        ? result
                          ? "다시 만들고 바로 수정"
                          : "프롬프트 만들고 바로 수정"
                        : result
                          ? "다시 만들기"
                          : "프롬프트 만들기"}
                </button>
              </div>
            </section>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">{error}</p>}

            {result && (
              <section className="space-y-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-[14px] font-semibold text-gray-900">{result.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">{result.analysis}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-emerald-50/70 p-3">
                    <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-emerald-800">
                      <i className="ti ti-lock" aria-hidden /> 유지
                    </p>
                    <ul className="space-y-1 text-[12px] text-emerald-900">
                      {result.keep.map((k) => (
                        <li key={k}>· {k}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-amber-50/70 p-3">
                    <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-amber-800">
                      <i className="ti ti-arrows-exchange" aria-hidden /> 바뀌는 점
                    </p>
                    <ul className="space-y-1 text-[12px] text-amber-900">
                      {result.changes.map((c) => (
                        <li key={c}>· {c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <i className="ti ti-file-text text-signal" aria-hidden /> {t.name} 프롬프트 · 직접 고칠 수 있어요
                    </span>
                    <button
                      type="button"
                      onClick={() => copy("all", fullText)}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:text-signal"
                    >
                      <i className={`ti ${copied === "all" ? "ti-check" : "ti-copy"}`} aria-hidden /> {copied === "all" ? "복사됨" : "전체 복사"}
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full resize-y bg-transparent font-mono text-[11.5px] leading-relaxed text-slate-700 outline-none"
                  />
                  {(result.params || result.negative) && (
                    <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 font-mono text-[11px] text-slate-600">
                      {result.params && (
                        <p>
                          <span className="mr-1 font-sans text-[10.5px] font-semibold text-slate-400">파라미터</span>
                          {result.params}
                        </p>
                      )}
                      {result.negative && (
                        <p>
                          <span className="mr-1 font-sans text-[10.5px] font-semibold text-slate-400">제외</span>
                          {result.negative}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {result.howTo && (
                  <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-gray-600">
                    <i className="ti ti-info-circle mt-0.5 text-signal" aria-hidden /> {result.howTo}
                  </p>
                )}

                {/* API 바로 수정 — 옵션 체크 시에만 */}
                {applyOn && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5">
                    <span className="text-[11.5px] text-violet-800">
                      {edited ? "결과가 마음에 안 들면 프롬프트를 고쳐 다시 수정하세요." : "프롬프트를 고쳤다면 이 버튼으로 수정하세요."}
                    </span>
                    <button
                      type="button"
                      onClick={() => apply()}
                      disabled={Boolean(busy) || !prompt.trim()}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[12.5px] font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      <i className={`ti ${busy === "apply" ? "ti-loader-2 animate-spin" : "ti-wand"} text-[14px]`} aria-hidden />
                      {busy === "apply" ? "수정 중…" : edited ? "다시 수정" : "이 프롬프트로 수정"}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
