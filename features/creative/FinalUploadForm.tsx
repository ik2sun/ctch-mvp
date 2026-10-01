"use client";

import { useEffect, useMemo, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { PLATFORMS } from "./platforms";
import { createJob, missingTableMessage, newJobId, uploadPoster, uploadRender, type ShortFormJob } from "./shortFormJobs";

const INPUT =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";

// 완성본을 만든 도구 — 클립 업로드형 플랫폼 + 기타 (Veo API 자동은 워커 경로라 제외)
const TOOLS = [...PLATFORMS.filter((p) => p.mode === "upload").map((p) => ({ id: p.id as string, name: p.name, icon: p.icon })), { id: "other", name: "기타 편집기", icon: "dots" }];

const MAX_MB = 200; // shortform 버킷 file_size_limit

type Meta = { duration: number; width: number; height: number };

// 영상 앞부분(1초 또는 길이의 1/3)에서 한 프레임을 떠서 카드 썸네일 JPEG 로 만든다. 실패하면 null (카드는 기본 배경으로 표시).
async function capturePoster(url: string): Promise<{ blob: Blob | null; meta: Meta | null }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    let meta: Meta | null = null;
    const done = (blob: Blob | null) => {
      v.removeAttribute("src");
      v.load();
      resolve({ blob, meta });
    };
    const timer = setTimeout(() => done(null), 15000);
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    v.onloadedmetadata = () => {
      meta = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
      v.currentTime = Math.min(1, (v.duration || 3) / 3);
    };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const w = Math.min(720, v.videoWidth || 720);
        const h = Math.round((w * (v.videoHeight || 1280)) / (v.videoWidth || 720));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")!.drawImage(v, 0, 0, w, h);
        c.toBlob((b) => done(b), "image/jpeg", 0.85);
      } catch {
        done(null);
      }
    };
  });
}

// 완성본 업로드 — Higgsfield 등 외부 편집기에서 자막·내레이션·편집까지 끝낸 최종 영상을 광고주별 작업 목록에 올린다.
// 워커 합성을 거치지 않으므로 바로 '완료' 상태로 등록된다.
export function FinalUploadForm({ onClose, onCreated }: { onClose: () => void; onCreated: (job: ShortFormJob) => void }) {
  const { clients, selected } = useClients();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>(selected?.id ?? "");
  const [tool, setTool] = useState<string>("higgsfield");
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, submitting]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^video\/(mp4|quicktime)$/.test(f.type) && !/\.(mp4|mov)$/i.test(f.name)) return setError("mp4 또는 mov 파일만 올릴 수 있어요.");
    if (f.size > MAX_MB * 1048576) return setError(`파일이 ${MAX_MB}MB를 넘어요. 내보내기 설정에서 비트레이트를 낮춰 주세요.`);
    setError(null);
    setMeta(null);
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  const vertical = meta ? meta.height > meta.width : null;

  async function submit() {
    if (!file) return setError("완성본 영상을 선택해 주세요.");
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    setSubmitting(true);
    setError(null);
    try {
      const id = newJobId();
      setProgress("썸네일 만드는 중…");
      const { blob, meta: m } = await capturePoster(previewUrl!);
      setProgress(`영상 업로드 중… (${(file.size / 1048576).toFixed(1)}MB)`);
      const videoPath = await uploadRender(id, file);
      const posterPath = blob ? await uploadPoster(id, blob).catch(() => null) : null;
      setProgress("작업 등록 중…");
      const result = await createJob({
        id,
        clientId: clientId || null,
        title: title.trim(),
        platform: tool,
        template: "final_upload",
        genMode: "final",
        shots: {},
        assets: [],
        copy: {},
        brief: {},
        script: {},
        options: {},
        final: { videoPath, posterPath, durationSec: m?.duration ? Math.round(m.duration * 10) / 10 : null },
      });
      if (result.error) throw new Error(missingTableMessage(result.error) ?? result.error.message);
      onCreated(result.data as ShortFormJob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-signal-soft/70 via-white to-violet-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-violet-500 text-white shadow-sm shadow-signal/30">
              <i className="ti ti-upload text-[18px]" aria-hidden />
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-gray-900">완성본 업로드</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">Higgsfield 등에서 자막·내레이션·편집까지 끝낸 최종 영상을 올려요. 합성 없이 바로 완료로 저장됩니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="닫기"
          >
            <i className="ti ti-x text-[18px]" aria-hidden />
          </button>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5 md:grid-cols-[220px_1fr]">
          {/* 영상 */}
          <div>
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-xl bg-gray-950 ring-1 ring-gray-200">
                <video
                  src={previewUrl}
                  controls
                  muted
                  playsInline
                  className="aspect-[9/16] w-full object-contain"
                  onLoadedMetadata={(e) => setMeta({ duration: e.currentTarget.duration, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
                />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={submitting}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-red-600"
                  aria-label="영상 빼기"
                >
                  <i className="ti ti-x text-[15px]" aria-hidden />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={`flex aspect-[9/16] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition ${
                  dragging ? "border-signal bg-signal-soft text-signal" : "border-gray-300 bg-gradient-to-b from-slate-50 to-white text-gray-500 hover:border-signal/50 hover:text-signal"
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-soft text-signal">
                  <i className="ti ti-movie text-[22px]" aria-hidden />
                </span>
                <span className="mt-3 text-[15px] font-medium">완성본 영상 선택</span>
                <span className="mt-1 text-[13px] text-gray-400">끌어다 놓거나 클릭 · mp4 권장 · {MAX_MB}MB 이하</span>
                <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
              </label>
            )}
            {meta && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] text-gray-500">
                <span>{meta.duration.toFixed(1)}s</span>
                <span>
                  {meta.width}×{meta.height}
                </span>
                {vertical === false && <span className="font-sans text-amber-700">가로 영상이에요 (숏폼은 9:16 권장)</span>}
              </p>
            )}
          </div>

          {/* 정보 */}
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-gray-500">제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 르무통 위크 9월 2차 · Higgsfield 편집본" className={INPUT} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-gray-500">광고주</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={INPUT}>
                <option value="">미지정</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-gray-500">제작 도구</span>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {TOOLS.map((t) => {
                  const on = t.id === tool;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setTool(t.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition ${
                        on ? "border-transparent bg-signal-soft font-medium text-signal-strong ring-2 ring-signal" : "border-gray-200 bg-white text-gray-700 hover:border-signal/30"
                      }`}
                    >
                      <i className={`ti ti-${t.icon} text-[16px] ${on ? "text-signal" : "text-gray-400"}`} aria-hidden />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600">
              <i className="ti ti-info-circle mr-1 text-signal" aria-hidden />
              CTCH가 자막·내레이션을 자동으로 입히게 하려면 이 창 대신 <b>새 숏폼 생성</b>에서 샷별 클립을 올리세요. 완성본은 올린 그대로 저장·재생·다운로드만 됩니다.
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="min-w-0 text-[13px]">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : progress ? (
              <span className="inline-flex items-center gap-1.5 text-signal">
                <i className="ti ti-loader-2 animate-spin" aria-hidden /> {progress}
              </span>
            ) : (
              <span className="text-gray-500">등록하면 작업 목록에 '완료'로 바로 나타나요. 렌더 워커가 꺼져 있어도 됩니다.</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-4 text-[15px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !file}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[15px] font-medium text-white shadow-sm shadow-signal/25 transition hover:brightness-110 disabled:opacity-50"
            >
              <i className={`ti ${submitting ? "ti-loader-2 animate-spin" : "ti-upload"} text-[16px]`} aria-hidden />
              업로드
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
