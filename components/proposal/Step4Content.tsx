"use client";

import { useState } from "react";
import type { BasicInfo, FileAnalysis, Insight, Slide } from "@/features/proposal/types";

export default function Step4Content({
  basicInfo,
  insights,
  selectedIds,
  fileAnalyses,
  slides,
  setSlides,
  onNext,
  onBack,
}: {
  basicInfo: BasicInfo;
  insights: Insight[];
  selectedIds: string[];
  fileAnalyses: FileAnalysis[];
  slides: Slide[];
  setSlides: (v: Slide[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proposal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basicInfo,
          insights: insights.filter((i) => selectedIds.includes(i.id)),
          fileAnalyses,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "제안서 생성에 실패했어요.");
      setSlides(json.slides);
      setOpenIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제안서 생성 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  function updateSlide(index: number, patch: Partial<Slide>) {
    setSlides(slides.map((s) => (s.index === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-5">
      {slides.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-canvas p-8 text-center">
          <p className="mb-3 text-[14px] text-ink-soft">
            수집한 정보로 8슬라이드 제안서 콘텐츠를 생성해요. 30초~1분 정도 걸릴 수 있어요.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "생성 중..." : "제안서 콘텐츠 생성"}
          </button>
          {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-muted">슬라이드를 눌러 내용을 직접 편집할 수 있어요.</p>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="text-[13px] font-medium text-signal hover:underline disabled:opacity-50"
            >
              {loading ? "다시 생성 중..." : "다시 생성"}
            </button>
          </div>

          <div className="space-y-2">
            {slides.map((s) => {
              const open = openIndex === s.index;
              return (
                <div key={s.index} className="rounded-card border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : s.index)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-[13px] font-semibold text-ink">
                      {s.index}. {s.title}
                    </span>
                    <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} text-ink-faint`} />
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-line px-4 py-4">
                      <div>
                        <label className="mb-1 block text-[12px] font-semibold text-ink-soft">제목</label>
                        <input
                          className="w-full rounded-card border border-line px-3 py-2 text-[14px]"
                          value={s.title}
                          onChange={(e) => updateSlide(s.index, { title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[12px] font-semibold text-ink-soft">부제목</label>
                        <input
                          className="w-full rounded-card border border-line px-3 py-2 text-[14px]"
                          value={s.subtitle}
                          onChange={(e) => updateSlide(s.index, { subtitle: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[12px] font-semibold text-ink-soft">본문</label>
                        <textarea
                          className="h-28 w-full rounded-card border border-line px-3 py-2 text-[13px] leading-relaxed"
                          value={s.content}
                          onChange={(e) => updateSlide(s.index, { content: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
          disabled={slides.length === 0}
          className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
}
