"use client";

import { useEffect, useState } from "react";
import { listCreatives, type Creative } from "./creativeData";
import { creativeSourceLabel } from "./imageMethods";

// 이미지 보관함(creatives)에서 사진을 골라 File 로 돌려준다 — 사진형 숏폼 재료.
// Higgsfield 웹·Midjourney 등에서 만들어 보관함에 올려 둔 이미지를 API 비용 없이 숏폼으로 이어 쓰는 경로.
export function LibraryPicker({ clientId, onAdd, remaining }: { clientId: string | null; onAdd: (files: File[]) => void; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Creative[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setPicked([]);
    listCreatives(clientId)
      .then((list) => setItems(list.filter((c) => c.kind === "image" && c.image_url)))
      .catch(() => setError("보관함을 불러오지 못했어요."));
  }, [open, clientId]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < remaining ? [...p, id] : p));
  }

  async function add() {
    setAdding(true);
    setError(null);
    try {
      const files: File[] = [];
      for (const [i, id] of picked.entries()) {
        const c = items?.find((x) => x.id === id);
        if (!c?.image_url) continue;
        const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(c.image_url)}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
        files.push(new File([blob], `library_${String(i + 1).padStart(2, "0")}.${ext}`, { type: blob.type || "image/jpeg" }));
      }
      if (!files.length) throw new Error("이미지를 내려받지 못했어요. URL이 만료된 이미지일 수 있어요.");
      onAdd(files);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 중 오류가 발생했어요.");
    } finally {
      setAdding(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={remaining <= 0}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-[12.5px] font-medium text-gray-700 transition hover:border-signal/40 hover:text-signal disabled:opacity-50"
      >
        <i className="ti ti-photo-search text-[15px] text-signal" aria-hidden /> 이미지 보관함에서 가져오기
        <span className="text-[11px] font-normal text-gray-400">Higgsfield·Midjourney 등에서 만든 이미지</span>
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-signal/20 bg-signal-soft/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-gray-800">
          이미지 보관함 <span className="font-normal text-gray-500">· 순서대로 {remaining}장까지 선택</span>
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-gray-500 hover:text-gray-900">
          닫기
        </button>
      </div>
      {items === null ? (
        <p className="py-6 text-center text-[12px] text-gray-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-gray-500">보관함에 이미지가 없어요. 소재 생성 &gt; 이미지 생성에서 만들거나 올려 주세요.</p>
      ) : (
        <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
          {items.map((c) => {
            const idx = picked.indexOf(c.id);
            const on = idx >= 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                title={`${creativeSourceLabel(c.model)} · ${c.prompt}`}
                className={`group relative aspect-square overflow-hidden rounded-lg bg-gray-100 transition ${on ? "ring-2 ring-signal" : "ring-1 ring-gray-200 hover:ring-signal/40"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image_url!} alt="" loading="lazy" className={`h-full w-full object-cover ${on ? "" : "opacity-90 group-hover:opacity-100"}`} />
                <span
                  className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                    on ? "border-signal bg-signal text-white" : "border-white/80 bg-black/30 text-transparent"
                  }`}
                >
                  {on ? idx + 1 : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-red-600">{error}</span>
        <button
          type="button"
          onClick={add}
          disabled={!picked.length || adding}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-signal px-3.5 text-[12.5px] font-medium text-white shadow-sm transition hover:bg-signal-strong disabled:opacity-50"
        >
          <i className={`ti ${adding ? "ti-loader-2 animate-spin" : "ti-plus"}`} aria-hidden /> {picked.length ? `${picked.length}장 추가` : "선택하세요"}
        </button>
      </div>
    </div>
  );
}
