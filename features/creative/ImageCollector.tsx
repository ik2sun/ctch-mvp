"use client";

import { useState } from "react";
import type { ImageCandidate } from "./collectImages";

// 제품 상세·브랜드 페이지 URL을 넣으면 사진 후보를 가져와 보여주고, 고른 사진을 File 로 만들어 돌려준다.
// 실제 다운로드는 /api/proxy-image 를 거친다 (CORS·핫링크 차단 우회).
export function ImageCollector({ keywords, onAdd, remaining }: { keywords: string[]; onAdd: (files: File[]) => void; remaining: number }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ pageTitle: string; message: string; candidates: ImageCandidate[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function collect() {
    if (!url.trim()) return setError("페이지 주소를 입력해 주세요.");
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/shortform/collect-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), keywords }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "사진을 가져오지 못했어요.");
      setResult(json);
      setPicked(new Set((json.candidates as ImageCandidate[]).filter((c) => c.recommended).slice(0, remaining).map((c) => c.url)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 가져오는 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(u: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(u)) n.delete(u);
      else if (n.size < remaining) n.add(u);
      return n;
    });
  }

  async function addPicked() {
    if (!picked.size) return;
    setAdding(true);
    setError(null);
    try {
      const urls = (result?.candidates ?? []).filter((c) => picked.has(c.url)).map((c) => c.url);
      const files: File[] = [];
      for (const [i, u] of urls.entries()) {
        const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(u)}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
        files.push(new File([blob], `web_${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type || "image/jpeg" }));
      }
      if (!files.length) throw new Error("사진을 내려받지 못했어요. 다른 페이지를 시도해 주세요.");
      onAdd(files);
      setResult(null);
      setPicked(new Set());
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 추가하는 중 오류가 발생했어요.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm">
          <i className="ti ti-link text-[16px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && collect()}
            placeholder="제품 상세 페이지 주소를 붙여넣으세요 (예: 공식몰 상품 페이지)"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
          />
        </div>
        <button
          type="button"
          onClick={collect}
          disabled={loading || adding}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-signal px-4 text-[13px] font-medium text-white shadow-sm transition hover:bg-signal-strong disabled:opacity-50"
        >
          <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-download"} text-[15px]`} aria-hidden />
          {loading ? "가져오는 중…" : "사진 가져오기"}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-500">
        페이지에서 큰 사진을 찾아 숏폼에 맞는 순서로 정렬하고, 로고·아이콘·배너는 걸러냅니다. 자바스크립트로만 그려지는 페이지는 못 읽을 수 있어요.
      </p>

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

      {result && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {result.pageTitle && <p className="truncate text-[12.5px] font-medium text-gray-900">{result.pageTitle}</p>}
              <p className="text-[11.5px] text-gray-500">{result.message}</p>
            </div>
            {result.candidates.length > 0 && (
              <button
                type="button"
                onClick={addPicked}
                disabled={adding || picked.size === 0}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-signal px-3 text-[12px] font-medium text-white transition hover:bg-signal-strong disabled:opacity-50"
              >
                <i className={`ti ${adding ? "ti-loader-2 animate-spin" : "ti-plus"}`} aria-hidden />
                {adding ? "추가하는 중…" : `선택한 ${picked.size}장 추가`}
              </button>
            )}
          </div>
          {result.candidates.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {result.candidates.map((c) => {
                const on = picked.has(c.url);
                const full = !on && picked.size >= remaining;
                return (
                  <button
                    key={c.url}
                    type="button"
                    onClick={() => toggle(c.url)}
                    disabled={full}
                    title={`${c.width}×${c.height}${c.note ? ` · ${c.note}` : ""}`}
                    className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-gray-100 transition ${
                      on ? "border-signal ring-2 ring-signal/30" : "border-transparent hover:border-gray-300"
                    } ${full ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(c.url)}`}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover transition ${on ? "" : "opacity-85 group-hover:opacity-100"}`}
                    />
                    <span
                      className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] transition ${
                        on ? "border-signal bg-signal text-white" : "border-white/80 bg-black/30 text-transparent"
                      }`}
                      aria-hidden
                    >
                      <i className="ti ti-check" />
                    </span>
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9.5px] leading-tight text-white">
                      {c.width}×{c.height}
                      {c.note.includes("화질") && <span className="ml-1 text-amber-300">저해상도</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
