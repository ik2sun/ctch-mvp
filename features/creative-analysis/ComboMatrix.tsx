"use client";

// 조합 분석 매트릭스 — 항목(성별·연령대·타겟·캠페인 목표·콘텐츠·상품·모델·TVC·포맷·캠페인 유형)을 체크하면
// 체크한 항목 값의 조합이 한 행이 되고, '열로 펼치기'로 고른 항목은 열이 된다(기본: 전체 체크 · 성별을 열로).
// 칸 색 = 평균 대비 '확실히' 좋음(파랑)/나쁨(빨강)만(90% 구간이 평균을 벗어날 때), 나머지는 무색 — 효율 표 히트맵과 같은 규칙.
// 순서: 항목 선택 → 매트릭스(칸·행 클릭 = 바로 아래 상세) → 추천 조합(체크한 항목 짝에서 자동 발굴, combos.ts).
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { fmt } from "@/features/ai-report/calcMetrics";
import { comboSheets } from "./comboExport";
import { Segmented } from "@/features/dashboard/ui";
import type { Enriched } from "./analyze";
import { ALL, ALL_DIM, DEMO_DIM_KEYS, METRIC_META, availableDims, distinctValues, OTHER, SEP, cellKey, compositeDim, crossTab, discoverCombos, groupBy, type ComboMetric, type Discovery, type Stat } from "./combos";

const GOOD = "37,99,235";
const BAD = "220,38,38";
const shade = (s: Stat | undefined, higher: boolean) => {
  if (!s || (s.verdict !== "good" && s.verdict !== "bad") || s.vsBase == null) return undefined;
  const diff = Math.abs((higher ? s.vsBase : 1 / s.vsBase) - 1);
  const a = Math.min(0.16, Math.max(0.05, (diff / 0.5) * 0.16));
  return `rgba(${s.verdict === "good" ? GOOD : BAD},${a.toFixed(3)})`;
};
const mark = (v: Stat["verdict"]) => (v === "good" ? "▲" : v === "bad" ? "▼" : "");
const tone = (v: Stat["verdict"]) => (v === "good" ? "#2563EB" : v === "bad" ? "#DC2626" : undefined);
const PAGE = 30;
const LIST = ""; // 열로 펼치지 않음
const AUTO = "auto"; // 열 자동(성별 → 값이 가장 적은 항목)

type Pick = { row?: string; col?: string; title: string; stat: Stat; expected?: number | null; synergy?: number | null };

// 조합 항목 선택 줄 — 화면 위쪽(성과 맵 위)에 두고 성과 맵·조합 매트릭스가 함께 따른다. null = 전체
// '전체' 상태에서 항목을 누르면 그 항목만 선택해 새로 시작, 그다음부터는 하나씩 추가·해제
export function ComboSelector({ rows, checked, onChange }: { rows: Enriched[]; checked: string[] | null; onChange: (c: string[] | null) => void }) {
  const dims = useMemo(() => availableDims(rows), [rows]);
  const toggle = (k: string) => {
    const next = checked == null ? [k] : checked.includes(k) ? checked.filter((x) => x !== k) : [...checked, k];
    onChange(next.length === 0 || next.length === dims.length ? null : next);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[15px] font-semibold text-ink">조합 항목</span>
      <Check label="전체" on={checked == null} onClick={() => onChange(null)} strong />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      {dims.map((d) => {
        const vals = distinctValues(rows, d);
        const single = vals.length < 2;
        return (
          <Check
            key={d.key}
            label={single ? `${d.label} (${vals[0] ?? "없음"}만)` : d.label}
            title={`기준: ${d.basis}${single ? ` · 이 기간 소재는 모두 '${vals[0]}'이라 비교는 안 되지만 조합에 넣을 수 있어요` : ` · 값 ${vals.length}개`}`}
            on={checked == null || checked.includes(d.key)}
            onClick={() => toggle(d.key)}
            dim={single}
          />
        );
      })}
      <span className="ml-2 text-[13px] text-ink-muted">{checked == null ? "전체 = 소재 유형(테마)별 · 항목을 누르면 그 항목부터 골라요(이어서 누르면 추가)" : `${dims.filter((d) => checked.includes(d.key)).map((d) => d.label).join(" × ")} 조합으로 성과 맵·매트릭스를 그렸어요`}</span>
    </div>
  );
}

export function ComboMatrix({ rows: creativeRows, segRows, demoNote, checked, onChecked, defaultMetric, onOpen, targetRoas, exportInfo }: { rows: Enriched[]; segRows?: Enriched[] | null; demoNote?: string | null; checked: string[] | null; onChecked: (c: string[] | null) => void; defaultMetric: ComboMetric; onOpen: (r: Enriched) => void; targetRoas?: number; exportInfo?: { fileTag: string; lines: [string, string][] } }) {
  const dims = useMemo(() => availableDims(segRows ?? creativeRows), [segRows, creativeRows]);
  const [colKey, setColKey] = useState<string>(AUTO);
  const [metric, setMetric] = useState<ComboMetric>(defaultMetric);
  const [sort, setSort] = useState<"cost" | "metric">("cost");
  const [hideThin, setHideThin] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [pick, setPick] = useState<Pick | null>(null);
  const [more, setMore] = useState(false);
  const meta = METRIC_META[metric];

  const on = useMemo(() => (checked == null ? dims : dims.filter((d) => checked.includes(d.key))), [checked, dims]);
  // 성별·연령대가 들어가면 실제 구간으로 쪼갠 행(있을 때), 아니면 소재 행 그대로
  const useSeg = !!segRows && on.some((d) => DEMO_DIM_KEYS.includes(d.key));
  const rows = useSeg ? segRows! : creativeRows;
  useEffect(() => {
    setPick(null);
    setLimit(PAGE);
  }, [checked]);
  // 열: 2개 이상 선택일 때만. 직접 고른 항목 → 성별 → 값이 가장 적은 항목. '펼치지 않음'이면 목록형
  const colDim = useMemo(() => {
    if (on.length < 2 || colKey === LIST) return null;
    const chosen = on.find((d) => d.key === colKey);
    if (chosen) return chosen;
    const multi = on.filter((d) => groupBy(rows, d).size >= 2); // 값이 하나뿐인 항목은 열로 펼쳐도 한 칸
    return multi.find((d) => d.key === "gender") ?? [...multi].sort((a, b) => groupBy(rows, a).size - groupBy(rows, b).size)[0] ?? null;
  }, [on, colKey, rows]);
  const rowDims = useMemo(() => on.filter((d) => d !== colDim), [on, colDim]);
  const tab = useMemo(() => crossTab(rows, rowDims.length ? compositeDim(rowDims) : ALL_DIM, colDim ?? ALL_DIM, metric, 8, 300), [rows, rowDims, colDim, metric]);
  const found = useMemo(() => discoverCombos(segRows ?? creativeRows, metric, on.length >= 2 ? on : dims), [segRows, creativeRows, metric, on, dims]); // 체크한 항목 안에서 추천
  const v = (n: number | null) => fmt(n, meta.fmt);
  useEffect(() => setPick(null), [creativeRows, segRows]); // 필터가 바뀌면 열어 둔 묶음은 닫는다

  const reset = () => {
    setPick(null);
    setLimit(PAGE);
  };
  const openDiscovery = (d: Discovery) => {
    onChecked([d.rowDim.key, d.colDim.key]);
    setColKey(d.colDim.key);
    setLimit(PAGE);
    setPick({ row: d.row, col: d.col, title: `${d.row} × ${d.col}`, stat: d, expected: d.expected, synergy: d.synergy });
    setTimeout(() => document.getElementById("ca-combo-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  // 행 정렬·판단 보류 숨기기('기타'는 맨 아래)
  const rowKeys = useMemo(() => {
    let ks = tab.rowKeys.filter((k) => k !== OTHER);
    if (hideThin) ks = ks.filter((k) => tab.rowStats.get(k)!.verdict !== "thin");
    if (sort === "metric") {
      const val = (k: string) => {
        const s = tab.rowStats.get(k)!;
        if (s.verdict === "thin" || s.value == null) return -Infinity;
        return meta.higher ? s.value : -s.value;
      };
      ks = [...ks].sort((a, b) => val(b) - val(a));
    }
    return tab.rowKeys.includes(OTHER) ? [...ks, OTHER] : ks;
  }, [tab, hideThin, sort, meta.higher]);
  const shown = rowKeys.slice(0, limit);
  const matrix = !!colDim;
  const headCols = rowDims.length ? rowDims : [ALL_DIM];
  const rowTitle = (k: string) => (k === OTHER ? `기타(${tab.foldedRows}개 조합)` : k.split(SEP).join(" · "));
  const total = tab.total;
  const download = () => {
    const sheets = comboSheets({ tab, rowDims, colDim, metric, rowKeys, found, rows, info: [...(exportInfo?.lines ?? []), ["성별·연령대 기준", useSeg ? "메타 리포트 실제 성과(연령 및 성별 분석 기준)" : "광고세트 타겟팅 설정"], ["내려받은 시각", new Date().toLocaleString("ko-KR")]] });
    const wb = XLSX.utils.book_new();
    for (const [name, aoa] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = (aoa[0] ?? []).map((_, i) => ({ wch: name === "안내" ? (i === 0 ? 16 : 100) : i < headCols.length ? 18 : 13 }));
      if (name !== "안내") ws["!freeze"] = { xSplit: headCols.length, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    const shape = rowDims.map((d) => d.label).join("_") + (colDim ? `_x_${colDim.label}` : "");
    XLSX.writeFile(wb, `CTCH_조합분석_${exportInfo?.fileTag ?? ""}_${shape || "전체"}.xlsx`.replace(/[\\/:*?"<>|]/g, ""));
  };

  return (
    <div className="space-y-5">
      {/* 표 설정(항목 선택은 화면 위 ComboSelector) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[14px] text-ink-muted">
            열로 펼치기
            <select
              value={colDim?.key ?? LIST}
              disabled={on.length < 2}
              onChange={(e) => {
                setColKey(e.target.value);
                reset();
              }}
              className="field h-8 w-auto px-2 text-[14px]"
            >
              <option value={LIST}>펼치지 않음(목록)</option>
              {on.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[14px] text-ink-muted">지표</span>
          <Segmented
            value={metric}
            options={(Object.keys(METRIC_META) as ComboMetric[]).map((k) => ({ key: k, label: METRIC_META[k].label }))}
            onChange={(k) => {
              setMetric(k as ComboMetric);
              setPick(null);
            }}
          />
          <span className="text-[14px] text-ink-muted">정렬</span>
          <Segmented value={sort} options={[{ key: "cost", label: "광고비순" }, { key: "metric", label: `${meta.label} 좋은 순` }]} onChange={(k) => setSort(k as "cost" | "metric")} />
          <label className="flex items-center gap-1.5 text-[14px] text-ink-soft">
            <input
              type="checkbox"
              checked={hideThin}
              onChange={(e) => {
                setHideThin(e.target.checked);
                setLimit(PAGE);
              }}
              className="accent-[#F45B35]"
            />
            판단 보류 숨기기
          </label>
          <button type="button" onClick={download} className="ml-auto h-8 rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-signal hover:text-signal" title="조합 목록(전 지표)·매트릭스(지표·광고비·판정)·추천 조합·안내 시트 — 지금 표 모양 그대로, '더 보기'와 무관하게 전체 행">
            <i className="ti ti-download mr-1" aria-hidden />
            엑셀 다운로드
          </button>
          <span className="text-[13px] text-ink-muted">
            전체 평균 <b className="tabular-nums text-ink">{v(tab.base)}</b>
            {metric === "roas" && targetRoas ? ` · 목표 ${targetRoas.toLocaleString("ko-KR")}%` : ""}
          </span>
        </div>
        {useSeg && demoNote && <p className="rounded-lg bg-[#F4F3FF] px-3 py-2 text-[13px] text-ink-soft">{demoNote}</p>}
        <p className="text-[13px] text-ink-muted">
          {on.length === 0
            ? "항목을 고르지 않아 전체 합계만 보여요."
            : `지금 표: ${rowDims.length ? rowDims.map((d) => d.label).join(" · ") : "전체"} ${rowKeys.length.toLocaleString("ko-KR")}행${matrix ? ` × ${colDim!.label} ${tab.colKeys.length}열` : ""}`}
        </p>
      </div>

      {/* 표 — 체크한 항목만큼 머리 열, 열로 펼친 항목은 값마다 열 */}
      <div className="overflow-x-auto rounded-lg border border-line [contain:paint]">
        <table className="w-full border-collapse text-[14px]" style={{ minWidth: headCols.length * 120 + (matrix ? tab.colKeys.length * 120 : 560) }}>
          <thead>
            <tr className="bg-canvas text-ink-muted">
              {headCols.map((d) => (
                <th key={d.key} className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-medium" title={`기준: ${d.basis}`}>
                  {d.label}
                </th>
              ))}
              {matrix ? (
                tab.colKeys.map((c) => {
                  const s = tab.colStats.get(c)!;
                  return (
                    <th key={c} className="border-b border-l border-line px-2 py-2 text-center font-medium">
                      <button type="button" onClick={() => setPick({ col: c, title: `${colDim!.label}: ${c}`, stat: s })} className={`w-full rounded px-1 py-0.5 hover:bg-surface ${pick && !pick.row && pick.col === c ? "ring-2 ring-signal" : ""}`}>
                        <span className="block max-w-[140px] truncate font-semibold text-ink" title={c}>
                          {c}
                        </span>
                        <span className="block text-[12px] tabular-nums" style={{ color: tone(s.verdict) }}>
                          {mark(s.verdict)} {v(s.value)}
                        </span>
                      </button>
                    </th>
                  );
                })
              ) : (
                <>
                  <th className="whitespace-nowrap border-b border-l border-line px-3 py-2.5 text-right font-medium">소재</th>
                  <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">광고비 · 비중</th>
                  <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">{meta.label}</th>
                  <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">90% 구간</th>
                  <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">평균 대비</th>
                  <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">{meta.countLabel}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((rk) => {
              const rs = tab.rowStats.get(rk)!;
              const parts = rk === OTHER ? [rowTitle(rk)] : rk.split(SEP);
              const rowOn = pick?.row === rk && !pick.col;
              const openRow = () => setPick({ row: rk, title: rowTitle(rk), stat: rs });
              const lead = parts.map((p, i) => (
                <td key={i} colSpan={rk === OTHER ? headCols.length : 1} className={`max-w-[220px] border-b border-line px-3 py-2 ${rowOn ? "bg-[#F4F3FF]" : ""}`}>
                  <button type="button" onClick={openRow} className="block w-full truncate text-left font-semibold text-ink hover:text-signal" title={p}>
                    {p}
                  </button>
                  {i === parts.length - 1 && matrix && (
                    <span className="block text-[12px]" style={{ color: tone(rs.verdict) }}>
                      {mark(rs.verdict)} {v(rs.value)} · {fmt(rs.cost, "won")}
                    </span>
                  )}
                </td>
              ));
              if (!matrix) {
                const cs = tab.cells.get(cellKey(rk, ALL)) ?? rs;
                return (
                  <tr key={rk} onClick={openRow} className={`cursor-pointer hover:bg-canvas ${rowOn ? "bg-[#F4F3FF]" : ""}`}>
                    {lead}
                    <td className="border-b border-l border-line px-3 py-2 text-right text-ink-soft">{cs.n}</td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2 text-right text-ink-soft">
                      {fmt(cs.cost, "won")} <span className="text-[12px] text-ink-muted">{total.cost > 0 ? `${((cs.cost / total.cost) * 100).toFixed(1)}%` : ""}</span>
                    </td>
                    <td className="border-b border-line px-3 py-2 text-right text-[15px] font-semibold" style={{ background: shade(cs, meta.higher), color: cs.verdict === "thin" ? "#98A2B3" : "#1A1A1A" }}>
                      {cs.verdict === "good" || cs.verdict === "bad" ? (
                        <span className="mr-0.5 text-[11px]" style={{ color: tone(cs.verdict) }}>
                          {mark(cs.verdict)}
                        </span>
                      ) : null}
                      {v(cs.value)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3 py-2 text-right text-[13px] text-ink-muted">{cs.low != null ? `${v(cs.low)} ~ ${v(cs.high)}` : "판단 보류"}</td>
                    <td className="border-b border-line px-3 py-2 text-right text-ink-soft">{cs.vsBase != null ? `${cs.vsBase.toFixed(2)}배` : "—"}</td>
                    <td className="border-b border-line px-3 py-2 text-right text-ink-soft">{(metric === "ctr" ? cs.linkClicks : cs.conversions).toFixed(0)}</td>
                  </tr>
                );
              }
              return (
                <tr key={rk}>
                  {lead}
                  {tab.colKeys.map((ck) => {
                    const s = tab.cells.get(cellKey(rk, ck));
                    if (!s)
                      return (
                        <td key={ck} className="border-b border-l border-line px-2 py-1.5 text-center text-ink-faint">
                          ·
                        </td>
                      );
                    const sel = pick?.row === rk && pick?.col === ck;
                    return (
                      <td key={ck} className="border-b border-l border-line p-1" style={{ background: shade(s, meta.higher) }}>
                        <button
                          type="button"
                          onClick={() => setPick({ row: rk, col: ck, title: `${rowTitle(rk)} × ${ck}`, stat: s, expected: rowDims.length ? s.expected : null, synergy: rowDims.length ? s.synergy : null })}
                          className={`w-full rounded px-1.5 py-1 text-center hover:ring-1 hover:ring-ink-faint ${sel ? "ring-2 ring-signal" : ""}`}
                          title={s.verdict === "thin" ? `${meta.countLabel} ${meta.min}건 미만 — 판단 보류` : s.low != null ? `90% 구간 ${v(s.low)} ~ ${v(s.high)}` : undefined}
                        >
                          <span className={`block text-[15px] font-semibold ${s.verdict === "thin" ? "text-ink-faint" : "text-[#1A1A1A]"}`}>
                            {s.verdict === "good" || s.verdict === "bad" ? (
                              <span className="mr-0.5 text-[11px]" style={{ color: tone(s.verdict) }}>
                                {mark(s.verdict)}
                              </span>
                            ) : null}
                            {v(s.value)}
                          </span>
                          <span className="block text-[12px] text-ink-muted">
                            {fmt(s.cost, "won")} · {s.n}개
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rowKeys.length > shown.length && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="text-[13px] text-signal hover:underline">
          {Math.min(PAGE, rowKeys.length - shown.length)}행 더 보기 · {shown.length}/{rowKeys.length}
        </button>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm" style={{ background: `rgba(${GOOD},0.16)` }} aria-hidden />▲ 평균보다 확실히 좋음
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm" style={{ background: `rgba(${BAD},0.16)` }} aria-hidden />▼ 확실히 나쁨
        </span>
        <span>색 없음 = 차이 불확실 · 흐린 숫자 = {meta.countLabel} {meta.min}건 미만(판단 보류) · 진할수록 차이 큼(±50%에서 최대)</span>
        {matrix && <span>열 머리·행 아래 작은 숫자 = 그 항목만 본 값 · 열은 광고비 상위 8개, 나머지는 ‘{OTHER}’</span>}
      </p>

      {/* 선택한 묶음 */}
      <div id="ca-combo-detail" className="scroll-mt-4">
        {pick && <PickDetail pick={pick} metric={metric} base={tab.base} onOpen={onOpen} onClose={() => setPick(null)} />}
      </div>
      {/* 자동 발굴 */}
      <div>
        <p className="text-[15px] font-semibold text-ink">
          추천 조합 <span className="text-[13px] font-normal text-ink-muted">{on.length >= 2 ? `체크한 ${on.length}개 항목` : "모든 항목"}의 짝 중 평균과 확실히 다른 조합 · 조합 효과 우선 · 한 요소만으로 설명되는 건 뺐어요 · 누르면 위 표가 그 두 항목으로 바뀌어요</span>
        </p>
        {found.length === 0 ? (
          <p className="mt-2 rounded-lg bg-canvas px-3.5 py-2.5 text-[14px] text-ink-muted">
            평균과 확실히 다른 조합이 아직 없어요. {meta.countLabel} {meta.min}건 이상 쌓인 조합만 판단해요 — 기간을 늘려 보세요.
          </p>
        ) : (
          <div className="mt-2 grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
            {found.slice(0, more ? found.length : 6).map((d) => (
              <button key={`${d.rowDim.key}${d.row}${d.colDim.key}${d.col}`} type="button" onClick={() => openDiscovery(d)} className="rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition hover:border-signal" style={{ boxShadow: `inset 3px 0 0 ${d.verdict === "good" ? "#2563EB" : "#DC2626"}` }}>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                  <span style={{ color: tone(d.verdict) }}>{d.verdict === "good" ? "▲ 평균보다 좋음" : "▼ 평균보다 나쁨"}</span>·{d.rowDim.label} × {d.colDim.label}
                  {d.combo ? <span className="whitespace-nowrap rounded bg-[#FFF3EF] px-1.5 text-[11px] font-semibold text-[#C2410C]">조합 효과</span> : <span className="whitespace-nowrap rounded bg-canvas px-1.5 text-[11px] text-ink-muted">한 요소 덕분</span>}
                </span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-[#1A1A1A]" title={`${d.row} × ${d.col}`}>
                  {d.row} × {d.col}
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-soft">
                  {meta.label} <b className="tabular-nums text-ink">{v(d.value)}</b> (평균의 {(d.vsBase ?? 0).toFixed(1)}배) · 광고비 {fmt(d.cost, "won")} · 소재 {d.n}
                </span>
                {d.synergy != null && (
                  <span className="block text-[12px] text-ink-muted">
                    따로 볼 때 기대 {v(d.expected)} → 실제 ×{(meta.higher ? d.synergy : 1 / d.synergy).toFixed(2)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {found.length > 6 && (
          <button type="button" onClick={() => setMore((x) => !x)} className="mt-2 text-[13px] text-signal hover:underline">
            {more ? "접기" : `${found.length - 6}개 더 보기`}
          </button>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-ink-muted">
        기준: 성별·연령대 = {useSeg ? "메타 리포트 실제 성과(연령 및 성별)" : "광고세트 타겟팅 설정"} · 타겟 = 광고세트 타겟팅 · 캠페인 목표 = 캠페인 설정 · 콘텐츠·상품·모델·TVC·포맷 = 소재명 · 캠페인 유형 = UTM. ‘확실히’ = {meta.countLabel} 수로 계산한 90% 구간이 평균을 벗어남(주문 금액 편차는 반영 못 함).
        항목을 많이 체크할수록 조합이 잘게 쪼개져 판단 보류가 늘어요 — 2~3개로 줄이면 비교가 선명해져요. 같은 광고세트·캠페인에 몰린 조합은 캠페인 차이가 섞여 있을 수 있어요(원인 확정 아님). 상품이 여러 개인 소재는 상품마다 한 번씩 셉니다.
      </p>
    </div>
  );
}

function Check({ label, on, onClick, title, strong, dim }: { label: string; on: boolean; onClick: () => void; title?: string; strong?: boolean; dim?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition ${on ? "border-[#F45B35] bg-[#FFF3EF] text-[#C2410C]" : "border-line text-ink-soft hover:border-ink-faint"} ${strong ? "font-semibold" : ""} ${dim && !on ? "border-dashed text-ink-muted" : ""}`}
    >
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[11px] leading-none ${on ? "border-[#F45B35] bg-[#F45B35] text-white" : "border-ink-faint bg-surface"}`} aria-hidden>
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function PickDetail({ pick, metric, base, onOpen, onClose }: { pick: Pick; metric: ComboMetric; base: number | null; onOpen: (r: Enriched) => void; onClose: () => void }) {
  const meta = METRIC_META[metric];
  const s = pick.stat;
  const v = (n: number | null) => fmt(n, meta.fmt);
  const list = [...s.rows].sort((a, b) => b.cost - a.cost).slice(0, 12);
  const d = (x: number, y: number) => (y > 0 ? x / y : null);
  return (
    <div className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas px-4 py-3">
        <p className="min-w-0 truncate text-[15px] font-semibold text-ink" title={pick.title}>
          {pick.title}
          <span className={`ml-2 text-[13px] font-normal ${s.verdict === "good" ? "text-[#2563EB]" : s.verdict === "bad" ? "text-bad" : "text-ink-muted"}`}>
            {s.verdict === "good" ? "▲ 평균보다 확실히 좋음" : s.verdict === "bad" ? "▼ 평균보다 확실히 나쁨" : s.verdict === "thin" ? `판단 보류(${meta.countLabel} ${meta.min}건 미만)` : "평균과 차이 불확실"}
          </span>
        </p>
        <button type="button" onClick={onClose} className="text-[13px] text-ink-muted hover:text-ink">
          닫기 ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 text-[13px] sm:grid-cols-4 xl:grid-cols-7">
        {[
          ["광고비", fmt(s.cost, "won")],
          [meta.label, v(s.value)],
          ["90% 구간", s.low != null ? `${v(s.low)} ~ ${v(s.high)}` : "—"],
          ["평균 대비", s.vsBase != null ? `${s.vsBase.toFixed(2)}배 (평균 ${v(base)})` : "—"],
          ["전환 · 매출", `${s.conversions.toFixed(0)}건 · ${fmt(s.revenue, "won")}`],
          ["CTR · CVR", `${fmt(d(s.linkClicks, s.impressions), "pct")} · ${fmt(d(s.conversions, s.linkClicks), "pct")}`],
          ["CPA", fmt(d(s.cost, s.conversions), "won")],
        ].map(([k, val]) => (
          <div key={k}>
            <p className="text-ink-muted">{k}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-ink">{val}</p>
          </div>
        ))}
      </div>
      {pick.synergy != null && pick.expected != null && (
        <p className="px-4 pb-2 text-[13px] text-ink-soft">
          두 요소를 따로 볼 때 기대되는 {meta.label}는 <b className="tabular-nums">{v(pick.expected)}</b>, 실제는 <b className="tabular-nums">{v(s.value)}</b>
          {(() => {
            const x = meta.higher ? pick.synergy : 1 / pick.synergy;
            return x >= 1.15 ? " — 함께 쓸 때 더 잘 돼요(조합 효과)." : x <= 0.87 ? " — 함께 쓰면 오히려 약해요(조합 손해)." : " — 조합 자체의 효과는 크지 않아요(한 요소의 영향)."
          })()}
        </p>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {list.map((r) => (
          <li key={r.demo ? `${r.id}|${r.demo.age}|${r.demo.gender}` : r.id}>
            <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-canvas">
              {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" /> : <span className="h-10 w-10 flex-shrink-0 rounded bg-canvas" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] text-ink" title={r.name}>
                  {r.name}
                </span>
                <span className="block truncate text-[12px] text-ink-muted">{r.demo ? `실제 ${r.demo.gender} · ${r.demo.age} 구간 성과` : r.target?.label ?? r.adsetName}</span>
              </span>
              <span className="w-[90px] text-right text-[13px] tabular-nums text-ink-soft">{fmt(r.cost, "won")}</span>
              <span className="w-[80px] text-right text-[14px] font-semibold tabular-nums text-ink">{v(metricOfRow(r, metric))}</span>
            </button>
          </li>
        ))}
      </ul>
      {s.rows.length > list.length && <p className="px-4 py-2 text-[12px] text-ink-muted">광고비 상위 {list.length}개만 표시 · 전체 {s.rows.length}{s.rows[0]?.demo ? "구간(소재 " + s.n + "개)" : "개"}</p>}
    </div>
  );
}

const metricOfRow = (r: Enriched, m: ComboMetric) => (m === "roas" ? r.roas : m === "cpa" ? r.cpa : m === "ctr" ? r.ctr : r.cvr);
