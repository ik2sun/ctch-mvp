"use client";

import { useState } from "react";
import type { BasicInfo, Insight } from "@/features/proposal/types";

export default function Step2Research({
  basicInfo,
  insights,
  setInsights,
  selectedIds,
  setSelectedIds,
  onNext,
  onBack,
}: {
  basicInfo: BasicInfo;
  insights: Insight[];
  setInsights: (v: Insight[]) => void;
  selectedIds: string[];
  setSelectedIds: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proposal/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorUrls: basicInfo.competitorUrls,
          industry: basicInfo.industry,
          kpi: basicInfo.kpi,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "리서치에 실패했어요.");
      setInsights(json.insights);
      setSelectedIds(json.insights.map((i: Insight) => i.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "리서치 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelectedIds(
      selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id],
    );
  }

  return (
    <div className="space-y-5">
      {insights.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-canvas p-8 text-center">
          <p className="mb-3 text-[14px] text-ink-soft">
            경쟁사 URL 크롤링과 업종·KPI 트렌드를 AI로 리서치해요.
          </p>
          <button
            type="button"
            onClick={runResearch}
            disabled={loading}
            className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "리서치 진행 중..." : "AI 리서치 시작"}
          </button>
          {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-muted">
              사용할 인사이트를 선택하세요 ({selectedIds.length}/{insights.length})
            </p>
            <button
              type="button"
              onClick={runResearch}
              disabled={loading}
              className="text-[13px] font-medium text-signal hover:underline disabled:opacity-50"
            >
              {loading ? "다시 리서치 중..." : "다시 리서치"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {insights.map((ins) => (
              <label
                key={ins.id}
                className={`cursor-pointer rounded-card border p-4 transition ${
                  selectedIds.includes(ins.id)
                    ? "border-signal bg-signal-soft"
                    : "border-line bg-surface"
                }`}
              >
                <div className="mb-1.5 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.includes(ins.id)}
                    onChange={() => toggle(ins.id)}
                  />
                  <div>
                    <span
                      className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        ins.source === "competitor"
                          ? "bg-warn/15 text-warn"
                          : "bg-good/15 text-good"
                      }`}
                    >
                      {ins.sourceLabel}
                    </span>
                    <p className="text-[14px] font-semibold text-ink">{ins.title}</p>
                  </div>
                </div>
                <p className="pl-6 text-[13px] leading-relaxed text-ink-soft">{ins.summary}</p>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-card border border-line px-5 py-2.5 text-[14px] text-ink-soft hover:bg-canvas"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={insights.length === 0}
          className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
}
