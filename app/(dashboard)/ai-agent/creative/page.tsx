"use client";

import { useEffect, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { deleteCreative, listCreatives, saveCreative, type Creative } from "@/features/creative/creativeData";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3"];

function missingTableMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const missing = error.code === "PGRST205" || Boolean(error.message?.includes("Could not find the table"));
  return missing
    ? "Supabase에 creatives 테이블이 아직 없어요. supabase/migrations/0007_creatives.sql을 SQL Editor에서 먼저 실행해 주세요."
    : null;
}

export default function CreativePage() {
  const { clients, selected, selectClient } = useClients();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    setListLoading(true);
    listCreatives(selected?.id ?? null)
      .then(setCreatives)
      .finally(() => setListLoading(false));
  }, [selected?.id]);

  async function generate() {
    if (!prompt.trim()) {
      setError("프롬프트를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/higgsfield/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "이미지 생성에 실패했어요.");

      const result = await saveCreative({
        clientId: selected?.id ?? null,
        kind: "image",
        prompt: prompt.trim(),
        imageUrl: json.url,
        model: "higgsfield-ai/soul/standard",
      });
      if (result.error) {
        throw new Error(missingTableMessage(result.error) ?? "소재 저장에 실패했어요.");
      }

      setCreatives((prev) => [result.data as Creative, ...prev]);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 생성 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await deleteCreative(id);
    setCreatives((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">AI 소재 생성</h3>
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <span>광고주</span>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => selectClient(e.target.value || null)}
              className="field h-8 py-0 text-[12px]"
            >
              <option value="">전체 (미지정)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예) 20-30대 여성이 러닝화를 신고 도심을 달리는 역동적인 사진, 아침 햇살, 광고 캠페인 느낌"
          rows={3}
          className="field w-full resize-y"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <span>비율</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="field h-8 py-0 text-[12px]"
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button onClick={generate} disabled={loading} className="btn-signal h-10">
            <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[16px]`} aria-hidden />
            {loading ? "생성 중… (수십 초 소요될 수 있어요)" : "이미지 생성"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{error}</p>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">
            생성된 소재 {selected ? `— ${selected.name}` : ""}
          </h3>
          <span className="text-[13px] text-ink-muted">{creatives.length}개</span>
        </div>

        {listLoading ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">불러오는 중…</p>
        ) : creatives.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[14px] text-ink-muted">아직 생성된 소재가 없어요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {creatives.map((c) => (
              <div key={c.id} className="group relative overflow-hidden rounded-card border border-line bg-surface">
                <div className="aspect-square overflow-hidden bg-canvas">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="line-clamp-2 p-2 text-[11px] leading-snug text-ink-soft">{c.prompt}</p>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bad"
                  title="삭제"
                >
                  <i className="ti ti-trash text-[14px]" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
