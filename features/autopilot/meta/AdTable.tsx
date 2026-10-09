"use client";

// 메타 빠른 세팅 — 오른쪽: 소재 파일 → 광고 표
// · 파일을 화면 아무 곳에 놓으면 광고가 생긴다(파일명으로 피드 1:1·4:5 + 세로 9:16 자동 짝 → 게재 위치 맞춤 광고 하나)
// · 맨 위 '공통' 줄 = 모든 광고 기본 문구, 광고 줄 칸을 비우면 공통 값(회색 미리보기)
// · 엑셀·시트에서 여러 칸을 복사해 아무 칸에 붙여 넣으면 그 칸부터 아래·오른쪽으로 채운다
// · 오른쪽 세트 열 = 광고세트 × 광고 연결(기본 전부 연결, 머리 체크 = 그 세트 모두 선택·해제)
import { useRef, useState, type ClipboardEvent, type Dispatch, type SetStateAction } from "react";
import { CTAS, ratioOf, type AdDraft, type AdSetDraft, type Copy, type Defaults, type Problem } from "./model";
import { ACCEPT, fmtDur, fmtSize, type LocalMedia } from "./media";

const CELL = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink outline-none placeholder:text-ink-faint hover:border-line focus:border-[#eb6834] focus:bg-white";
// 붙여넣기 순서(표 칸 순서)
const TEXT_COLS = ["name", "message", "headline", "description", "url"] as const;
type TextCol = (typeof TEXT_COLS)[number];

export function AdTable(p: {
  ads: AdDraft[];
  setAds: Dispatch<SetStateAction<AdDraft[]>>;
  media: Map<string, LocalMedia>;
  adSets: AdSetDraft[];
  setAdSets: Dispatch<SetStateAction<AdSetDraft[]>>;
  defaults: Defaults;
  setDefaults: Dispatch<SetStateAction<Defaults>>;
  addFiles: (files: File[]) => void;
  readErr: string[];
  removeAd: (key: string) => void;
  splitAd: (key: string) => void;
  mergeInto: (target: string, verticalAd: string) => void;
  problems: Problem[];
  focus: string | null;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const common = p.defaults.copy;
  const setCommon = (x: Partial<Copy>) => p.setDefaults((d) => ({ ...d, copy: { ...d.copy, ...x } }));
  const setAd = (key: string, x: Partial<AdDraft> | ((a: AdDraft) => AdDraft)) => p.setAds((l) => l.map((a) => (a.key === key ? (typeof x === "function" ? x(a) : { ...a, ...x }) : a)));
  const toggleLink = (setKey: string, adKey: string) => p.setAdSets((l) => l.map((s) => (s.key === setKey ? { ...s, ads: s.ads.includes(adKey) ? s.ads.filter((k) => k !== adKey) : [...s.ads, adKey] } : s)));
  const setAllLinks = (setKey: string, on: boolean) => p.setAdSets((l) => l.map((s) => (s.key === setKey ? { ...s, ads: on ? p.ads.map((a) => a.key) : [] } : s)));
  const setRowLinks = (adKey: string, on: boolean) => p.setAdSets((l) => l.map((s) => ({ ...s, ads: on ? (s.ads.includes(adKey) ? s.ads : [...s.ads, adKey]) : s.ads.filter((k) => k !== adKey) })));

  // 여러 칸 붙여넣기 — 탭·줄바꿈이 있으면 표로 보고 (행, 열)부터 채운다. 행이 모자라면 남은 줄은 버림
  function onPaste(e: ClipboardEvent, rowIdx: number, col: TextCol) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\n$/, ""))) return;
    e.preventDefault();
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((r) => r.split("\t"));
    const c0 = TEXT_COLS.indexOf(col);
    p.setAds((l) =>
      l.map((a, i) => {
        const r = grid[i - rowIdx];
        if (i < rowIdx || !r) return a;
        const n = { ...a, copy: { ...a.copy } };
        r.forEach((v, j) => {
          const k = TEXT_COLS[c0 + j];
          if (!k) return;
          if (k === "name") n.name = v.trim();
          else n.copy[k] = v.trim();
        });
        return n;
      }),
    );
  }

  const verticalOnly = p.ads.filter((a) => a.vertical && !a.feed);
  const feedOnly = p.ads.filter((a) => a.feed && !a.vertical);
  const sets = p.adSets;

  return (
    <section id="meta-ads" className="min-w-0 rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF1EA] text-[13px] font-bold text-[#eb6834]">3</span>
        <h3 className="text-[16px] font-bold text-ink">광고 소재·문구</h3>
        <span className="text-[13px] tabular-nums text-ink-muted">광고 {p.ads.length}개 · 파일 {p.media.size}개</span>
        <span className="ml-auto text-[12px] text-ink-muted">엑셀에서 여러 칸 복사 → 칸에 붙여넣기 가능</span>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={p.disabled} className="flex items-center gap-1 whitespace-nowrap rounded-full bg-[#eb6834] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40">
          <i className="ti ti-upload text-[14px]" aria-hidden />
          파일 추가
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            p.addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {!p.ads.length ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragEnter={() => setDrag(true)}
          onDragLeave={() => setDrag(false)}
          onDrop={() => setDrag(false)}
          className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-12 transition ${drag ? "border-[#eb6834] bg-[#FFF8F4]" : "border-[#D0D5DD] hover:border-[#F6C3AE] hover:bg-[#FFFBF9]"}`}
        >
          <i className="ti ti-photo-video text-[34px] text-[#eb6834]" aria-hidden />
          <p className="text-[16px] font-semibold text-ink">이미지·영상을 여기(화면 어디든)에 끌어 놓으세요</p>
          <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">
            파일명이 같은 피드용(1:1·4:5)과 세로용(9:16)은 한 광고로 묶어 <b className="text-ink-soft">피드엔 피드 소재, 스토리·릴스엔 세로 소재</b>가 나가게 합니다.
            <br />예) <span className="font-mono">fall_01_feed.jpg</span> + <span className="font-mono">fall_01_story.jpg</span> → 광고 <span className="font-mono">fall_01</span> · JPG·PNG·MP4·MOV
          </p>
        </button>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr className="text-left text-[12px] font-medium text-ink-muted">
                <th className="w-[112px] pb-1.5 pl-1">소재</th>
                <th className="w-[150px] pb-1.5">광고 이름</th>
                <th className="min-w-[220px] pb-1.5">기본 문구</th>
                <th className="w-[160px] pb-1.5">제목</th>
                <th className="w-[130px] pb-1.5">설명</th>
                <th className="w-[112px] pb-1.5">버튼</th>
                <th className="min-w-[180px] pb-1.5">랜딩 URL</th>
                {sets.map((s, i) => {
                  const n = s.ads.filter((k) => p.ads.some((a) => a.key === k)).length;
                  return (
                    <th key={s.key} className="w-[44px] pb-1.5 text-center" title={`${s.name} — 이 세트에 넣을 광고`}>
                      <span className="block truncate text-[11px] font-semibold text-ink-soft">S{i + 1}</span>
                      <input type="checkbox" className="accent-[#eb6834]" aria-label={`${s.name} 모두 선택`} checked={n === p.ads.length && n > 0} ref={(el) => { if (el) el.indeterminate = n > 0 && n < p.ads.length; }} onChange={(e) => setAllLinks(s.key, e.target.checked)} />
                    </th>
                  );
                })}
                <th className="w-[64px]" />
              </tr>
              {/* 공통 문구 */}
              <tr className="bg-[#FFF8F4]">
                <td className="rounded-l-lg py-1.5 pl-2 text-[12px] font-semibold text-[#B93815]" colSpan={2}>
                  공통 — 비운 칸은 이 값
                </td>
                <td className="py-1.5">
                  <textarea rows={2} className={`${CELL} resize-y bg-white`} value={common.message} onChange={(e) => setCommon({ message: e.target.value })} placeholder="모든 광고 기본 문구" />
                </td>
                <td className="py-1.5">
                  <input className={`${CELL} bg-white`} value={common.headline} onChange={(e) => setCommon({ headline: e.target.value })} placeholder="제목" />
                </td>
                <td className="py-1.5">
                  <input className={`${CELL} bg-white`} value={common.description} onChange={(e) => setCommon({ description: e.target.value })} placeholder="설명(선택)" />
                </td>
                <td className="py-1.5">
                  <CtaSelect value={common.cta} onChange={(v) => setCommon({ cta: v })} />
                </td>
                <td className="py-1.5">
                  <input className={`${CELL} bg-white`} value={common.url} onChange={(e) => setCommon({ url: e.target.value.trim() })} placeholder="https://" />
                </td>
                <td colSpan={sets.length + 1} className="rounded-r-lg py-1.5 pr-2 text-right text-[12px] text-ink-muted">
                  {!sets.length && "← 광고세트를 추가하면 여기서 연결"}
                </td>
              </tr>
            </thead>
            <tbody>
              {p.ads.map((ad, i) => {
                const probs = p.problems.filter((x) => x.target === ad.key);
                const f = ad.feed ? p.media.get(ad.feed) : undefined;
                const v = ad.vertical ? p.media.get(ad.vertical) : undefined;
                const allLinked = sets.length > 0 && sets.every((s) => s.ads.includes(ad.key));
                return (
                  <tr key={ad.key} id={`meta-${ad.key}`} className={`align-top ${p.focus === ad.key ? "bg-[#FFFBF9]" : ""}`}>
                    <td className="border-b border-[#F2F4F7] py-2 pl-1">
                      <div className="flex items-end gap-1">
                        {f && <Thumb m={f} />}
                        {v && <Thumb m={v} />}
                      </div>
                      {f && v && <p className="mt-0.5 text-[11px] text-[#3538CD]">피드 + 스토리·릴스</p>}
                    </td>
                    <td className="border-b border-[#F2F4F7] py-2">
                      <input className={`${CELL} font-semibold`} value={ad.name} onChange={(e) => setAd(ad.key, { name: e.target.value })} onPaste={(e) => onPaste(e, i, "name")} />
                      {probs.map((x) => (
                        <p key={x.text} className="px-2 text-[12px] leading-snug text-[#C2410C]">
                          · {x.text}
                        </p>
                      ))}
                    </td>
                    <td className="border-b border-[#F2F4F7] py-2">
                      <textarea rows={2} className={`${CELL} resize-y`} value={ad.copy.message} placeholder={common.message || "기본 문구"} onChange={(e) => setAd(ad.key, (a) => ({ ...a, copy: { ...a.copy, message: e.target.value } }))} onPaste={(e) => onPaste(e, i, "message")} />
                    </td>
                    {(["headline", "description"] as const).map((k) => (
                      <td key={k} className="border-b border-[#F2F4F7] py-2">
                        <input className={CELL} value={ad.copy[k]} placeholder={common[k] || (k === "headline" ? "제목" : "설명")} onChange={(e) => setAd(ad.key, (a) => ({ ...a, copy: { ...a.copy, [k]: e.target.value } }))} onPaste={(e) => onPaste(e, i, k)} />
                      </td>
                    ))}
                    <td className="border-b border-[#F2F4F7] py-2">
                      <CtaSelect value={ad.copy.cta} onChange={(val) => setAd(ad.key, (a) => ({ ...a, copy: { ...a.copy, cta: val } }))} inherit={common.cta} />
                    </td>
                    <td className="border-b border-[#F2F4F7] py-2">
                      <input className={CELL} value={ad.copy.url} placeholder={common.url || "https://"} onChange={(e) => setAd(ad.key, (a) => ({ ...a, copy: { ...a.copy, url: e.target.value.trim() } }))} onPaste={(e) => onPaste(e, i, "url")} />
                    </td>
                    {sets.map((s) => (
                      <td key={s.key} className="border-b border-[#F2F4F7] py-2 text-center">
                        <input type="checkbox" className="mt-1.5 accent-[#eb6834]" checked={s.ads.includes(ad.key)} onChange={() => toggleLink(s.key, ad.key)} aria-label={`${s.name}에 ${ad.name}`} />
                      </td>
                    ))}
                    <td className="border-b border-[#F2F4F7] py-2 pr-1">
                      <div className="flex items-center justify-end gap-0.5">
                        {sets.length > 1 && (
                          <IconBtn icon={allLinked ? "square-check" : "square"} title={allLinked ? "모든 세트에서 빼기" : "모든 세트에 넣기"} onClick={() => setRowLinks(ad.key, !allLinked)} />
                        )}
                        {f && v && <IconBtn icon="arrows-split-2" title="피드·세로를 각각 다른 광고로 나누기" onClick={() => p.splitAd(ad.key)} />}
                        <IconBtn icon="trash" title="광고 빼기" onClick={() => p.removeAd(ad.key)} danger />
                      </div>
                      {/* 세로만 있는 광고 → 피드만 있는 광고에 합치기 */}
                      {v && !f && feedOnly.length > 0 && (
                        <select className="mt-1 w-full max-w-[120px] rounded border border-line bg-white px-1 py-0.5 text-[11px] text-ink-soft" value="" onChange={(e) => e.target.value && p.mergeInto(e.target.value, ad.key)} title="이 세로 소재를 다른 광고의 스토리·릴스용으로">
                          <option value="">피드 광고에 합치기…</option>
                          {feedOnly.map((x) => (
                            <option key={x.key} value={x.key}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sets.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-muted">
              {sets.map((s, i) => (
                <span key={s.key}>
                  <b className="text-ink-soft">S{i + 1}</b> {s.name}
                </span>
              ))}
            </p>
          )}
          {verticalOnly.length > 0 && feedOnly.length > 0 && <p className="mt-1 text-[12px] text-ink-muted">세로 소재만 있는 광고 {verticalOnly.length}개 — 피드 광고와 같은 소재라면 오른쪽 '피드 광고에 합치기'로 묶으세요.</p>}
        </div>
      )}
      {p.readErr.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] text-bad">
          {p.readErr.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Thumb({ m }: { m: LocalMedia }) {
  const r = ratioOf(m.width, m.height);
  const h = 64;
  const w = Math.max(28, Math.min(96, Math.round((h * m.width) / m.height)));
  return (
    <figure className="shrink-0" title={`${m.name}\n${m.width}×${m.height} · ${fmtSize(m.size)}${m.duration ? ` · ${fmtDur(m.duration)}` : ""}`}>
      <div className="relative overflow-hidden rounded-md bg-[#F2F4F7] ring-1 ring-[#EAECF0]" style={{ width: w, height: h }}>
        {m.kind === "image" ? <img src={m.url} alt="" className="h-full w-full object-cover" /> : <video src={m.url} muted className="h-full w-full object-cover" />}
        {m.kind === "video" && <i className="ti ti-player-play-filled absolute bottom-0.5 left-0.5 text-[11px] text-white drop-shadow" aria-hidden />}
      </div>
      <figcaption className={`mt-0.5 text-center text-[11px] tabular-nums ${r === "기타" ? "font-semibold text-[#C2410C]" : "text-ink-muted"}`}>{r}</figcaption>
    </figure>
  );
}

function CtaSelect({ value, onChange, inherit }: { value: string; onChange: (v: string) => void; inherit?: string }) {
  return (
    <select className={`${CELL} cursor-pointer bg-white pr-1 ${!value && inherit !== undefined ? "text-ink-faint" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {inherit !== undefined && <option value="">{CTAS.find((c) => c.key === inherit)?.label ?? "공통"} (공통)</option>}
      {CTAS.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function IconBtn({ icon, title, onClick, danger }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={`flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint ${danger ? "hover:bg-[#FEF3F2] hover:text-bad" : "hover:bg-canvas hover:text-ink"}`}>
      <i className={`ti ti-${icon} text-[15px]`} aria-hidden />
    </button>
  );
}
