"use client";

import { useEffect, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { deleteCreative, listCreatives, saveCreative, uploadCreativeImage, type Creative } from "./creativeData";
import { AdComposer } from "./AdComposer";
import { ImageEditor } from "./ImageEditor";
import { EDIT_TOOLS, EDIT_TOOL_BY_ID, type EditToolId } from "./editTools";
import { IMAGE_METHODS, IMAGE_METHOD_BY_ID, creativeSourceLabel, type ImageMethodId } from "./imageMethods";

const FIELD =
  "rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";

function missingTableMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const missing = error.code === "PGRST205" || Boolean(error.message?.includes("Could not find the table"));
  return missing
    ? "Supabase에 creatives 테이블이 아직 없어요. supabase/migrations/0007_creatives.sql을 SQL Editor에서 먼저 실행해 주세요."
    : null;
}

// 소재 생성 > 이미지 생성 탭 — 방법 선택(Higgsfield · Gemini · OpenAI API 생성 / 외부 도구 결과 업로드) → creatives 저장
export function ImagePanel() {
  const { clients, selected, selectClient } = useClients();
  const [method, setMethod] = useState<ImageMethodId>("higgsfield");
  const [ready, setReady] = useState<Record<string, boolean> | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [editTool, setEditTool] = useState<EditToolId>("gemini");
  const [editApply, setEditApply] = useState(false); // 옵션: 업로드 후 API로 바로 수정
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [composing, setComposing] = useState<Creative | null>(null);
  const [editing, setEditing] = useState<{ source: Creative; request: string; autoRun: boolean; apply: boolean } | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const m = IMAGE_METHOD_BY_ID[method];
  const isUpload = m.mode === "upload";

  useEffect(() => {
    setListLoading(true);
    listCreatives(selected?.id ?? null)
      .then(setCreatives)
      .finally(() => setListLoading(false));
  }, [selected?.id]);

  useEffect(() => {
    fetch("/api/creative/generate-image")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.ready && setReady(j.ready))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (m.ratios.length && !m.ratios.includes(aspectRatio)) setAspectRatio(m.ratios[0]);
    setError(null);
  }, [m, aspectRatio]);

  async function generate() {
    if (!prompt.trim()) return setError("프롬프트를 입력해 주세요.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/creative/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, prompt: prompt.trim(), aspectRatio }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "이미지 생성에 실패했어요.");
      const result = await saveCreative({ clientId: selected?.id ?? null, kind: "image", prompt: prompt.trim(), imageUrl: json.url, model: json.model });
      if (result.error) throw new Error(missingTableMessage(result.error) ?? "소재 저장에 실패했어요.");
      setCreatives((prev) => [result.data as Creative, ...prev]);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 생성 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function upload() {
    if (!uploadFiles.length) return setError("올릴 이미지를 선택해 주세요.");
    setLoading(true);
    setError(null);
    try {
      const added: Creative[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        const f = uploadFiles[i];
        setProgress(`업로드 중 ${i + 1}/${uploadFiles.length}`);
        const url = await uploadCreativeImage(f);
        const result = await saveCreative({
          clientId: selected?.id ?? null,
          kind: "image",
          prompt: prompt.trim() || f.name.replace(/\.[^.]+$/, ""),
          imageUrl: url,
          model: "upload",
        });
        if (result.error) throw new Error(missingTableMessage(result.error) ?? "소재 저장에 실패했어요.");
        added.push(result.data as Creative);
      }
      setCreatives((prev) => [...[...added].reverse(), ...prev]);
      // 수정 요청을 적었으면 첫 이미지로 수정 프롬프트를 바로 만든다
      if (prompt.trim() && added[0]) setEditing({ source: added[0], request: prompt.trim(), autoRun: true, apply: editApply && Boolean(EDIT_TOOL_BY_ID[editTool]?.api) });
      setUploadFiles([]);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function addFiles(list: FileList | null | undefined) {
    const ok = Array.from(list ?? []).filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (list && ok.length < list.length) setError("png·jpg·webp 이미지만 올릴 수 있어요.");
    setUploadFiles((prev) => [...prev, ...ok].slice(0, 20));
  }

  async function remove(c: Creative) {
    await deleteCreative(c);
    setCreatives((prev) => prev.filter((x) => x.id !== c.id));
  }

  const notReady = !isUpload && ready !== null && ready[method] === false;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">AI 이미지 생성</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">생성 방법을 고르세요. API 방식은 여기서 바로 만들고, 다른 도구에서 만든 이미지는 올려서 광고주별로 모아 둘 수 있어요.</p>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-gray-500">
            <span>광고주</span>
            <select value={selected?.id ?? ""} onChange={(e) => selectClient(e.target.value || null)} className={`${FIELD} h-8 px-2.5 text-[13px]`}>
              <option value="">전체 (미지정)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 방법 선택 */}
        <div role="radiogroup" aria-label="생성 방법" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {IMAGE_METHODS.map((it) => {
            const on = it.id === method;
            const missingKey = it.mode === "api" && ready !== null && ready[it.id] === false;
            return (
              <button
                key={it.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMethod(it.id)}
                className={`relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                  on ? "border-transparent bg-signal-soft ring-2 ring-signal shadow-sm" : "border-gray-200 bg-white hover:border-signal/30 hover:shadow-sm"
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      on ? "bg-gradient-to-br from-signal to-violet-500 text-white shadow-sm shadow-signal/30" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <i className={`ti ti-${it.icon} text-[17px]`} aria-hidden />
                  </span>
                  <span className={`whitespace-nowrap ml-auto rounded-full px-2 py-0.5 text-[12px] font-medium ${
                    it.mode === "upload" ? "bg-emerald-50 text-emerald-700" : missingKey ? "bg-amber-50 text-amber-700" : "bg-white/80 text-gray-500 ring-1 ring-gray-200"
                  }`}>
                    {it.mode === "upload" ? "비용 없음" : missingKey ? "키 필요" : "API"}
                  </span>
                </div>
                <p className={`mt-2.5 text-[15px] font-semibold leading-snug ${on ? "text-signal-strong" : "text-gray-900"}`}>{it.name}</p>
                <p className={`mt-0.5 text-[11.5px] ${on ? "text-signal" : "text-gray-500"}`}>{it.tagline}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-gray-500">
          <i className="ti ti-info-circle mt-0.5 text-signal" aria-hidden />
          <span>
            {m.detail}
            {m.model && <span className="ml-1 font-mono text-[10.5px] text-gray-400">{m.model}</span>}
          </span>
        </p>
        {notReady && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            서버에 <span className="font-mono">{m.envKey}</span>가 없어 지금은 생성할 수 없어요. .env.local(배포 환경은 Vercel 환경변수)에 키를 넣고 서버를 다시 시작해 주세요.
          </p>
        )}

        {isUpload && (
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_200px]">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-b from-slate-50 to-white px-4 py-5 text-center text-gray-500 transition hover:border-signal/50 hover:text-signal"
            >
              <i className="ti ti-photo-up text-[22px] text-signal" aria-hidden />
              <span className="mt-1.5 text-[15px] font-medium">{uploadFiles.length ? `${uploadFiles.length}장 선택됨 · 더 추가` : "이미지 끌어다 놓기 또는 클릭"}</span>
              <span className="mt-0.5 text-[13px] text-gray-400">png · jpg · webp, 한 번에 20장까지</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            </label>
            <div>
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-gray-500">수정에 쓸 도구</span>
                <select value={editTool} onChange={(e) => setEditTool(e.target.value as EditToolId)} className={`${FIELD} h-9 w-full px-3 text-[15px]`}>
                  {EDIT_TOOLS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10.5px] leading-snug text-gray-400">도구마다 프롬프트 형식이 달라요. 수정 요청을 적으면 이 형식으로 만들어요.</span>
              </label>
              {EDIT_TOOL_BY_ID[editTool]?.api && (
                <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-violet-900">
                  <input
                    type="checkbox"
                    checked={editApply}
                    onChange={(e) => setEditApply(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-violet-600"
                  />
                  API로 바로 수정 <span className="text-[10.5px] text-gray-500">(종량제)</span>
                </label>
              )}
            </div>
            {uploadFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 md:col-span-2">
                {uploadFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setUploadFiles((p) => p.filter((_, j) => j !== i))}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="빼기"
                    >
                      <i className="ti ti-x" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isUpload
              ? "수정하고 싶은 내용 (선택) — 예) 배경을 여름 해변으로, 제품은 그대로. 비우면 업로드만 해요"
              : "예) 20-30대 여성이 러닝화를 신고 도심을 달리는 역동적인 사진, 아침 햇살, 광고 캠페인 느낌"
          }
          rows={isUpload ? 2 : 3}
          className={`${FIELD} mt-4 w-full resize-y px-3.5 py-2.5 text-[15px]`}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!isUpload ? (
            <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
              <span className="mr-1">비율</span>
              {m.ratios.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspectRatio(r)}
                  className={`h-8 rounded-lg px-2.5 font-mono text-[11.5px] transition ${
                    r === aspectRatio ? "bg-signal-soft font-semibold text-signal ring-1 ring-signal/30" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-signal/30"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-gray-500">{progress ?? (prompt.trim() ? "업로드 후 첫 이미지로 수정 프롬프트를 만들어요." : "보관함에 올린 이미지는 카드의 '수정'으로 언제든 고칠 수 있어요.")}</span>
          )}
          <button
            onClick={isUpload ? upload : generate}
            disabled={loading || notReady}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[13.5px] font-medium text-white shadow-sm shadow-signal/25 transition hover:brightness-110 disabled:opacity-50"
          >
            <i className={`ti ${loading ? "ti-loader-2 animate-spin" : isUpload ? "ti-upload" : "ti-sparkles"} text-[17px]`} aria-hidden />
            {loading ? (isUpload ? "업로드 중…" : "생성 중… (수십 초 소요될 수 있어요)") : isUpload ? prompt.trim() ? "업로드하고 수정 프롬프트 만들기" : `${uploadFiles.length || ""}${uploadFiles.length ? "장 " : ""}업로드` : `${m.name}로 생성`}
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[15px] text-red-700">{error}</p>}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-gray-900">
            이미지 보관함 {selected ? <span className="font-normal text-gray-500">— {selected.name}</span> : null}
          </h3>
          <span className="text-[13px] text-gray-500">{creatives.length}개</span>
        </div>

        {listLoading ? (
          <p className="py-8 text-center text-[15px] text-gray-500">불러오는 중…</p>
        ) : creatives.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-soft text-signal">
              <i className="ti ti-photo text-[22px]" aria-hidden />
            </span>
            <p className="mt-3 text-[15px] text-gray-500">아직 생성하거나 올린 이미지가 없어요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {creatives.map((c) => (
              <div key={c.id} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                <a href={c.image_url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden bg-gray-100">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  )}
                </a>
                <div className="p-3">
                  <span className="inline-block rounded-full bg-signal-soft px-2 py-0.5 text-[10.5px] font-medium text-signal">{creativeSourceLabel(c.model)}</span>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-gray-700">{c.prompt}</p>
                  <p className="mt-1.5 text-[13px] text-gray-500">{new Date(c.created_at).toLocaleDateString("ko-KR")}</p>
                </div>
                <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditing({ source: c, request: "", autoRun: false, apply: false })}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-white/90 px-2.5 text-[13px] font-medium text-signal shadow-sm backdrop-blur hover:bg-white"
                    title="수정 요청 → 도구별 수정 프롬프트 (옵션: API로 바로 수정)"
                  >
                    <i className="ti ti-wand text-[15px]" aria-hidden /> 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposing(c)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-white/90 px-2.5 text-[13px] font-medium text-signal shadow-sm backdrop-blur hover:bg-white"
                    title="매체 규격·카피 입힌 광고 소재 만들기"
                  >
                    <i className="ti ti-layout-grid text-[15px]" aria-hidden /> 광고 소재
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  title="삭제"
                >
                  <i className="ti ti-trash text-[15px]" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ImageEditor
          source={editing.source}
          initialRequest={editing.request}
          initialTool={editTool}
          autoRun={editing.autoRun}
          initialApply={editing.apply}
          apiReady={ready}
          onClose={() => setEditing(null)}
          onSaved={(item) => setCreatives((prev) => [item, ...prev])}
        />
      )}
      {composing && (
        <AdComposer
          source={composing}
          clientId={selected?.id ?? composing.client_id}
          brand={selected?.name ?? clients.find((c) => c.id === composing.client_id)?.name ?? "creative"}
          onClose={() => setComposing(null)}
          onSaved={(items) => setCreatives((prev) => [...items.reverse(), ...prev])}
        />
      )}
    </div>
  );
}
