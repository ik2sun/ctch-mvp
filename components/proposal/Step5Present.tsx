"use client";

import { useMemo, useRef, useState } from "react";
import { buildPresentationHtml } from "@/features/proposal/buildPresentationHtml";
import { THEMES } from "@/features/proposal/themes";
import type { BasicInfo, BrandColors, Slide, ThemeId } from "@/features/proposal/types";
import { THEME_IDS } from "@/features/proposal/types";

export default function Step5Present({
  basicInfo,
  clientId,
  slides,
  onBack,
}: {
  basicInfo: BasicInfo;
  clientId: string | null;
  slides: Slide[];
  onBack: () => void;
}) {
  const [theme, setTheme] = useState<ThemeId>("premium");
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [customBg, setCustomBg] = useState("#0A1628");
  const [customAccent, setCustomAccent] = useState("#F5C842");
  const [activeIndex, setActiveIndex] = useState(1);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const brandColors: BrandColors = useCustomColors
    ? { background: customBg, accent: customAccent }
    : null;

  const html = useMemo(
    () => buildPresentationHtml(slides, theme, brandColors),
    [slides, theme, brandColors],
  );

  function gotoSlide(index: number) {
    setActiveIndex(index);
    iframeRef.current?.contentWindow?.postMessage({ type: "goto-slide", index: index - 1 }, "*");
  }

  function printPdf() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const printWin = window.open(url + "?print-pdf", "_blank");
    if (printWin) {
      setTimeout(() => {
        printWin.print();
      }, 2500);
    }
  }

  async function saveAndShare() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/proposal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: basicInfo.clientName,
          industry: basicInfo.industry,
          theme,
          brandColors,
          slides,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장에 실패했어요.");
      const url = `${window.location.origin}/proposal/share/${json.shareToken}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink">테마 선택</p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                className={`rounded-card border p-3 text-left transition ${
                  theme === id ? "border-signal ring-1 ring-signal" : "border-line"
                }`}
              >
                <div
                  className="mb-2 h-10 rounded"
                  style={{ background: `linear-gradient(135deg, ${t.background}, ${t.accent})` }}
                />
                <p className="text-[13px] font-semibold text-ink">{t.label}</p>
                <p className="text-[11px] text-ink-faint">{t.description}</p>
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={useCustomColors}
            onChange={(e) => setUseCustomColors(e.target.checked)}
          />
          광고주 브랜드 컬러 직접 지정
        </label>
        {useCustomColors && (
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              배경
              <input type="color" value={customBg} onChange={(e) => setCustomBg(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink-muted">
              포인트
              <input
                type="color"
                value={customAccent}
                onChange={(e) => setCustomAccent(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <div className="w-44 shrink-0 space-y-1.5">
          {slides.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => gotoSlide(s.index)}
              className={`w-full truncate rounded-card border px-3 py-2 text-left text-[12px] ${
                activeIndex === s.index
                  ? "border-signal bg-signal-soft text-signal"
                  : "border-line text-ink-soft hover:bg-canvas"
              }`}
            >
              {s.index}. {s.title}
            </button>
          ))}
        </div>
        <div className="aspect-video flex-1 overflow-hidden rounded-card border border-line bg-black">
          <iframe
            ref={iframeRef}
            key={theme + JSON.stringify(brandColors)}
            srcDoc={html}
            className="h-full w-full"
            title="제안서 미리보기"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-card border border-line px-5 py-2.5 text-[14px] text-ink-soft hover:bg-canvas"
        >
          이전
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={printPdf}
            className="rounded-card border border-line px-5 py-2.5 text-[14px] text-ink-soft hover:bg-canvas"
          >
            PDF 다운로드
          </button>
          <button
            type="button"
            onClick={saveAndShare}
            disabled={saving}
            className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장 및 공유 링크 생성"}
          </button>
        </div>
      </div>

      {saveError && <p className="text-[13px] text-bad">{saveError}</p>}
      {shareUrl && (
        <div className="rounded-card border border-line bg-canvas p-3 text-[13px]">
          공유 링크가 클립보드에 복사되었어요: <span className="font-mono text-signal">{shareUrl}</span>
        </div>
      )}
    </div>
  );
}
