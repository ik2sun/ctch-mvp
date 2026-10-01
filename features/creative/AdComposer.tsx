"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveCreative, uploadCreativeImage, type Creative } from "./creativeData";
import { AD_FORMATS, canvasBlob, loadImage, renderAd, type AdCopy, type AdFormat, type AdStyle, type AdTheme } from "./adRender";

const FIELD =
  "rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";

const THEMES: { id: AdTheme; label: string }[] = [
  { id: "dark", label: "어두운 그라데이션" },
  { id: "light", label: "흰 패널" },
  { id: "brand", label: "브랜드 컬러 패널" },
];

type Variant = { key: string; format: AdFormat; headline: string; n: number };

// 광고 소재 만들기 — 보관함 이미지 1장 → 매체 규격별 크롭 + (선택) 카피·로고·CTA. 카피 여러 줄이면 A/B 버전을 한 번에 만든다.
// 모두 브라우저 canvas 로 그린다. 결과는 ZIP 다운로드 또는 보관함(creatives, model=edit:<규격>)에 저장.
export function AdComposer({
  source,
  clientId,
  brand,
  onClose,
  onSaved,
}: {
  source: Creative;
  clientId: string | null;
  brand: string;
  onClose: () => void;
  onSaved: (items: Creative[]) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formats, setFormats] = useState<Set<string>>(new Set(["square", "portrait", "story"]));
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5, zoom: 1 });
  const [showCopy, setShowCopy] = useState(true);
  const [headlines, setHeadlines] = useState("");
  const [sub, setSub] = useState("");
  const [badge, setBadge] = useState("");
  const [cta, setCta] = useState("자세히 보기");
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  const [theme, setTheme] = useState<AdTheme>("dark");
  const [accent, setAccent] = useState("#4F46E5");
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(source.image_url ?? "")}`);
        if (!res.ok) throw new Error();
        url = URL.createObjectURL(await res.blob());
        setImg(await loadImage(url));
      } catch {
        setLoadError("원본 이미지를 불러오지 못했어요. 이미지 URL이 만료됐을 수 있어요.");
      }
    })();
    return () => void (url && URL.revokeObjectURL(url));
  }, [source.image_url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, busy]);

  const style: AdStyle = useMemo(() => ({ showCopy, position, theme, accent, logo }), [showCopy, position, theme, accent, logo]);
  const lines = useMemo(() => headlines.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5), [headlines]);
  const variants: Variant[] = useMemo(() => {
    const hs = showCopy && lines.length ? lines : [""];
    return AD_FORMATS.filter((f) => formats.has(f.id)).flatMap((f) => hs.map((h, i) => ({ key: `${f.id}-${i}`, format: f, headline: h, n: i + 1 })));
  }, [formats, lines, showCopy]);
  const copyOf = (v: Variant): AdCopy => ({ headline: v.headline, sub, badge, cta });

  // 미리보기 다시 그리기
  useEffect(() => {
    if (!img) return;
    const id = requestAnimationFrame(() => {
      for (const v of variants) {
        const c = canvases.current[v.key];
        if (c) renderAd(c, img, v.format, copyOf(v), style, focal, 260 / Math.max(v.format.w, v.format.h));
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, variants, style, focal, sub, badge, cta]);

  function toggleFormat(id: string) {
    setFormats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        if (n.size > 1) n.delete(id);
      } else n.add(id);
      return n;
    });
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try {
      setLogo(await loadImage(URL.createObjectURL(file)));
    } catch {
      setError("로고 이미지를 읽지 못했어요.");
    }
  }

  const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "creative";
  const fileName = (v: Variant) => `${safeName(brand)}_${v.format.id}_${v.format.w}x${v.format.h}${lines.length > 1 && showCopy ? `_카피${v.n}` : ""}.jpg`;

  async function renderFull(v: Variant): Promise<Blob> {
    const c = document.createElement("canvas");
    renderAd(c, img!, v.format, copyOf(v), style, focal, 1);
    return canvasBlob(c);
  }

  async function downloadZip() {
    if (!img) return;
    setBusy("ZIP 만드는 중…");
    setError(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [i, v] of variants.entries()) {
        setBusy(`렌더링 ${i + 1}/${variants.length}`);
        zip.file(fileName(v), await renderFull(v));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(brand)}_광고소재_${variants.length}종.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ZIP 생성 중 오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAll() {
    if (!img) return;
    setError(null);
    try {
      const saved: Creative[] = [];
      for (const [i, v] of variants.entries()) {
        setBusy(`보관함 저장 ${i + 1}/${variants.length}`);
        const blob = await renderFull(v);
        const url = await uploadCreativeImage(new File([blob], fileName(v), { type: "image/jpeg" }));
        const result = await saveCreative({
          clientId,
          kind: "image",
          prompt: v.headline || source.prompt,
          imageUrl: url,
          sourceImageUrl: source.image_url,
          model: `edit:${v.format.label}`,
        });
        if (result.error) throw new Error(result.error.message);
        saved.push(result.data as Creative);
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

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
              <i className="ti ti-layout-grid text-[18px]" aria-hidden />
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-gray-900">광고 소재 만들기</h3>
              <p className="mt-0.5 text-[13px] text-gray-500">매체 규격별로 자르고 카피·로고·CTA를 입혀요. 카피를 여러 줄 쓰면 A/B 버전이 한 번에 만들어져요.</p>
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

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[340px_1fr]">
          {/* 설정 */}
          <div className="space-y-5 overflow-y-auto border-r border-gray-100 px-5 py-5">
            <section>
              <p className="mb-2 text-[13px] font-semibold text-gray-700">원본 · 초점 위치</p>
              {loadError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{loadError}</p>
              ) : img ? (
                <div
                  className="relative cursor-crosshair overflow-hidden rounded-lg ring-1 ring-gray-200"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setFocal((f) => ({ ...f, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }));
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt="" className="block w-full" />
                  <span
                    className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-signal/40 shadow-[0_0_0_2px_rgba(79,70,229,0.6)]"
                    style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                  <i className="ti ti-loader-2 animate-spin text-[20px]" aria-hidden />
                </div>
              )}
              <p className="mt-1.5 text-[13px] text-gray-500">사진에서 꼭 보여야 할 곳(제품·얼굴)을 누르면 모든 규격이 그 지점을 기준으로 잘리고, 카피가 있으면 글자 없는 쪽으로 비켜 놓아요.</p>
              <label className="mt-2 flex items-center gap-2 text-[11.5px] text-gray-600">
                <i className="ti ti-zoom-in text-signal" aria-hidden /> 확대
                <input
                  type="range"
                  min={1}
                  max={2}
                  step={0.05}
                  value={focal.zoom}
                  onChange={(e) => setFocal((f) => ({ ...f, zoom: Number(e.target.value) }))}
                  className="flex-1 accent-[#4F46E5]"
                />
                <span className="w-9 text-right tabular-nums text-[10.5px] text-gray-400">{focal.zoom.toFixed(2)}×</span>
              </label>
              <p className="text-[10.5px] text-gray-400">원본 비율이 규격과 비슷하면 자를 여유가 없어요. 조금 확대하면 제품이 문구에 가려지지 않게 옮길 수 있어요.</p>
            </section>

            <section>
              <p className="mb-2 text-[13px] font-semibold text-gray-700">규격</p>
              <div className="space-y-1.5">
                {AD_FORMATS.map((f) => {
                  const on = formats.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleFormat(f.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                        on ? "border-transparent bg-signal-soft ring-1 ring-signal/40" : "border-gray-200 bg-white hover:border-signal/30"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${on ? "border-signal bg-signal text-white" : "border-gray-300"}`}>
                        {on && <i className="ti ti-check text-[12px]" aria-hidden />}
                      </span>
                      <span className="text-[12.5px] font-medium text-gray-900">{f.label}</span>
                      <span className="font-mono text-[10.5px] text-gray-400">
                        {f.w}×{f.h}
                      </span>
                      <span className="ml-auto truncate text-[10.5px] text-gray-500">{f.media}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-gray-700">카피 입히기</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showCopy}
                  onClick={() => setShowCopy((v) => !v)}
                  className={`relative h-5 w-9 rounded-full transition ${showCopy ? "bg-signal" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${showCopy ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              {showCopy && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-gray-500">헤드라인 · 한 줄에 하나씩 (최대 5안 → A/B 버전)</span>
                    <textarea
                      rows={3}
                      value={headlines}
                      onChange={(e) => setHeadlines(e.target.value)}
                      placeholder={"퇴근길에도 발이 안 아파요\n맨발로 신어도 되는 운동화"}
                      className={`${FIELD} w-full resize-none px-3 py-2 text-[15px]`}
                    />
                  </label>
                  <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="보조 문구 (선택)" className={`${FIELD} h-9 w-full px-3 text-[15px]`} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="뱃지 예) 최대 40%" className={`${FIELD} h-9 px-3 text-[15px]`} />
                    <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="버튼 예) 지금 구매" className={`${FIELD} h-9 px-3 text-[15px]`} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={theme} onChange={(e) => setTheme(e.target.value as AdTheme)} className={`${FIELD} h-9 px-2.5 text-[12.5px]`}>
                      {THEMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex rounded-lg bg-gray-100 p-0.5">
                      {(["top", "bottom"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPosition(p)}
                          className={`flex-1 rounded-md text-[13px] transition ${position === p ? "bg-white font-medium text-signal shadow-sm" : "text-gray-600"}`}
                        >
                          {p === "top" ? "위" : "아래"}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <label className="flex h-9 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] text-gray-700 transition hover:border-signal/40">
                  <i className="ti ti-brand-apple-arcade text-signal" aria-hidden />
                  <span className="truncate">{logo ? "로고 교체" : "로고 올리기 (PNG 투명 권장)"}</span>
                  <input type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(e) => (pickLogo(e.target.files?.[0]), (e.target.value = ""))} />
                </label>
                {logo && (
                  <button type="button" onClick={() => setLogo(null)} className="h-9 rounded-lg px-2 text-[13px] text-gray-500 hover:text-red-600">
                    빼기
                  </button>
                )}
                <label className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-[13px] text-gray-500" title="강조색 (뱃지·버튼·패널)">
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                  강조색
                </label>
              </div>
            </section>
          </div>

          {/* 미리보기 */}
          <div className="overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-5 py-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-700">
                미리보기 <span className="font-normal text-gray-500">· {variants.length}종</span>
              </p>
              <p className="text-[13px] text-gray-400">9:16은 상단 14%·하단 20% 안전 영역을 비워 둬요</p>
            </div>
            <div className="flex flex-wrap items-start gap-4">
              {variants.map((v) => (
                <figure key={v.key} className="flex flex-col items-center">
                  <canvas
                    ref={(el) => {
                      canvases.current[v.key] = el;
                    }}
                    className="rounded-lg bg-gray-200 shadow-sm ring-1 ring-gray-200"
                  />
                  <figcaption className="mt-1.5 text-center text-[10.5px] text-gray-500">
                    {v.format.label}
                    {showCopy && lines.length > 1 && <span className="ml-1 rounded bg-signal-soft px-1 font-medium text-signal">카피 {v.n}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="min-w-0 text-[13px]">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : busy ? (
              <span className="inline-flex items-center gap-1.5 text-signal">
                <i className="ti ti-loader-2 animate-spin" aria-hidden /> {busy}
              </span>
            ) : (
              <span className="text-gray-500">브라우저에서 바로 그려요. 워커·API 비용 없음.</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={downloadZip}
              disabled={!img || Boolean(busy)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-[15px] font-medium text-gray-700 transition hover:border-signal/40 hover:text-signal disabled:opacity-50"
            >
              <i className="ti ti-file-zip text-[16px]" aria-hidden /> ZIP 다운로드
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={!img || Boolean(busy)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[15px] font-medium text-white shadow-sm shadow-signal/25 transition hover:brightness-110 disabled:opacity-50"
            >
              <i className="ti ti-device-floppy text-[16px]" aria-hidden /> 보관함에 {variants.length}장 저장
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
