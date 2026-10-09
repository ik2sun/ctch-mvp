"use client";

// 캠페인 오토파일럿 · GFA 수동 세팅 — 편집 화면 조각(섹션·선택 카드·칩·코드 검색 선택·요일×시간 표·이미지 넣기)
import { useMemo, useRef, useState, type ReactNode } from "react";
import { readImage, type SourceImage } from "../imageFit";
import { CHIP, CHIP_ON, INPUT, SelectAllLinks } from "../ui";
import { DAYS, fullGrid, type Schedule } from "./model";

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-t border-[#F2F4F7] pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-[16px] font-bold text-ink">{title}</h4>
          {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[150px_1fr] md:gap-4">
      <div className="pt-2 text-[14px] font-semibold text-ink-soft">{label}</div>
      <div className="min-w-0">
        {children}
        {help && <p className="mt-1.5 text-[13px] text-ink-muted">{help}</p>}
      </div>
    </div>
  );
}

// 큰 선택 카드(목적·입찰 목표·소재 유형)
export function ChoiceCards<T extends string>({ value, options, onChange, disabled }: { value: T; options: { key: T; label: string; desc?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              on ? "border-[#eb6834] bg-[#FFF8F4] shadow-[0_0_0_3px_rgba(235,104,52,0.12)]" : "border-line bg-white hover:border-[#F6C3AE]"
            }`}
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${on ? "border-[#eb6834]" : "border-[#D0D5DD]"}`}>{on && <span className="h-2 w-2 rounded-full bg-[#eb6834]" />}</span>
              {o.label}
            </span>
            {o.desc && <span className="mt-1 block pl-6 text-[13px] text-ink-muted">{o.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

// 작은 단일 선택(세그먼트)
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[14px] transition ${value === o.key ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(21,24,30,0.08)]" : "text-ink-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 여러 개 선택 칩 + '전체'(빈 배열 = 제한 없음) + 모두 선택(전부 고른 뒤 필요 없는 것만 눌러 빼기)
export function MultiChips<T extends string>({ value, options, onChange, allLabel = "전체" }: { value: T[]; options: { key: T; label: string }[]; onChange: (v: T[]) => void; allLabel?: string }) {
  const allOn = options.length > 0 && options.every((o) => value.includes(o.key));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange([])} className={`${CHIP} ${value.length === 0 ? CHIP_ON : ""}`}>
        {value.length === 0 && "✓ "}
        {allLabel}
      </button>
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button key={o.key} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])} className={`${CHIP} ${on ? CHIP_ON : ""}`}>
            {on && "✓ "}
            {o.label}
          </button>
        );
      })}
      {options.length > 1 && <SelectAllLinks onAll={() => onChange(options.map((o) => o.key))} allDisabled={allOn} />}
    </div>
  );
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-[#eb6834]" : "bg-[#D0D5DD]"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span className="text-[14px] text-ink">
        {label}
        {desc && <span className="block text-[13px] text-ink-muted">{desc}</span>}
      </span>
    </label>
  );
}

// 코드 검색 선택 — 지역(6천여 개)·관심사·구매 의도처럼 긴 목록. 빈 선택 = 전체
// 모두 선택: 검색어가 없으면 최상위 항목 전부(topLevel — 시·도, 대분류), 검색어가 있으면 검색 결과 전부 → 필요 없는 것만 빼기
export function CodePicker({
  map,
  value,
  onChange,
  placeholder,
  emptyLabel = "전체",
  topLevel,
  topLabel = "최상위 전체",
  max = 40,
}: {
  map: Record<string, string>;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  emptyLabel?: string;
  topLevel?: (key: string, label: string) => boolean;
  topLabel?: string;
  max?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const entries = useMemo(() => Object.entries(map), [map]);
  const n = q.replace(/\s/g, "").toLowerCase();
  const matches = useMemo(() => (n ? entries.filter(([, v]) => v.replace(/\s/g, "").toLowerCase().includes(n)) : entries), [entries, n]);
  const tops = useMemo(() => (topLevel ? entries.filter(([k, v]) => topLevel(k, v)).map(([k]) => k) : []), [entries, topLevel]);
  const hits = matches.slice(0, max);
  const selected = new Set(value);
  const addAll = (keys: string[]) => onChange([...value, ...keys.filter((k) => !selected.has(k))]);
  const removeAll = (keys: string[]) => {
    const drop = new Set(keys);
    onChange(value.filter((k) => !drop.has(k)));
  };
  const matchKeys = matches.map(([k]) => k);
  const allSet = tops.length ? tops : entries.map(([k]) => k);
  const CHIP_LIMIT = 24;
  const chips = showAll ? value : value.slice(0, CHIP_LIMIT);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 ? (
          <span className="rounded-full bg-[#F2F4F7] px-3 py-1 text-[13px] text-ink-soft">{emptyLabel}</span>
        ) : (
          chips.map((k) => (
            <span key={k} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#FDF1EC] py-0.5 pl-3 pr-1 text-[13px] text-ink ring-1 ring-[#FAD9CB]">
              <span className="truncate" title={map[k] ?? k}>
                {map[k] ?? k}
              </span>
              <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label="빼기" className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-white hover:text-ink">
                <i className="ti ti-x text-[12px]" aria-hidden />
              </button>
            </span>
          ))
        )}
        {value.length > CHIP_LIMIT && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="text-[13px] text-ink-soft underline hover:text-ink">
            {showAll ? "접기" : `+${value.length - CHIP_LIMIT}개 더 보기`}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
        {value.length > 0 && <span className="tabular-nums">{value.length}개 선택</span>}
        <SelectAllLinks
          allLabel={tops.length ? `${topLabel} 선택(${tops.length})` : "모두 선택"}
          onAll={() => addAll(allSet)}
          allDisabled={!entries.length || allSet.every((k) => selected.has(k))}
          onNone={() => onChange([])}
          noneDisabled={!value.length}
        />
      </div>
      <div className="relative mt-2">
        <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-faint" aria-hidden />
        <input
          className={`${INPUT} pl-9`}
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-[300px] w-full overflow-y-auto rounded-lg border border-line bg-white pb-1 shadow-[0_8px_24px_-8px_rgba(16,24,40,0.25)]">
            {!entries.length && <p className="px-3 py-2 text-[13px] text-ink-muted">목록을 불러오는 중이거나 없어요</p>}
            {entries.length > 0 && !hits.length && <p className="px-3 py-2 text-[13px] text-ink-muted">맞는 항목이 없어요</p>}
            {hits.length > 0 && (
              // 검색 결과 전체(목록에 안 보이는 것 포함)를 한 번에 고르거나 뺀다
              <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-[#F2F4F7] bg-white px-3 py-1.5" onMouseDown={(e) => e.preventDefault()}>
                <span className="text-[12px] text-ink-muted">{n ? `'${q.trim()}' 검색 결과 ${matchKeys.length.toLocaleString("ko-KR")}개` : `전체 ${matchKeys.length.toLocaleString("ko-KR")}개`}</span>
                <SelectAllLinks
                  allLabel={n ? "결과 모두 선택" : "모두 선택"}
                  onAll={() => addAll(matchKeys)}
                  allDisabled={matchKeys.every((k) => selected.has(k))}
                  noneLabel={n ? "결과 모두 해제" : "모두 해제"}
                  onNone={() => removeAll(matchKeys)}
                  noneDisabled={!matchKeys.some((k) => selected.has(k))}
                />
              </div>
            )}
            {hits.map(([k, v]) => {
              const on = selected.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[14px] hover:bg-canvas ${on ? "text-[#C2410C]" : "text-ink"}`}
                >
                  <i className={`ti ${on ? "ti-square-check-filled" : "ti-square"} text-[16px]`} aria-hidden />
                  <span className="truncate">{v}</span>
                </button>
              );
            })}
            {matches.length > max && <p className="px-3 py-1.5 text-[12px] text-ink-muted">목록에는 처음 {max}개만 보여요 — 검색어를 더 적거나, 위 &apos;모두 선택&apos;으로 결과 전체를 고르세요</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// 요일×시간 표 — 칸 클릭·끌기로 켜고 끄기, 요일·시간 머리 클릭은 줄 전체
export function ScheduleGrid({ value, onChange }: { value: Schedule; onChange: (v: Schedule) => void }) {
  const grid = value ?? fullGrid();
  const drag = useRef<boolean | null>(null);
  const set = (d: number, h: number, v: boolean) => {
    if (grid[d][h] === v) return;
    onChange(grid.map((row, i) => (i === d ? row.map((x, j) => (j === h ? v : x)) : row)));
  };
  const presets: { label: string; make: () => boolean[][] }[] = [
    { label: "항상", make: () => fullGrid() },
    { label: "평일만", make: () => DAYS.map((_, d) => Array.from({ length: 24 }, () => d < 5)) },
    { label: "주말만", make: () => DAYS.map((_, d) => Array.from({ length: 24 }, () => d >= 5)) },
    { label: "오전 7시~자정", make: () => DAYS.map(() => Array.from({ length: 24 }, (_, h) => h >= 7)) },
  ];
  return (
    <div className="space-y-2" onMouseLeave={() => (drag.current = null)} onMouseUp={() => (drag.current = null)}>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange(p.make())} className={CHIP}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => onChange(fullGrid(false))} className={CHIP}>
          모두 지우기
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="select-none border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="w-[22px] cursor-pointer font-normal tabular-nums text-ink-muted hover:text-ink" onClick={() => onChange(grid.map((row) => row.map((x, j) => (j === h ? !grid.every((r) => r[h]) : x))))}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={d}>
                <th className="cursor-pointer pr-1 text-[13px] font-semibold text-ink-soft hover:text-ink" onClick={() => onChange(grid.map((r, i) => (i === d ? r.map(() => !row.every(Boolean)) : r)))}>
                  {DAYS[d]}
                </th>
                {row.map((on, h) => (
                  <td
                    key={h}
                    onMouseDown={() => {
                      drag.current = !on;
                      set(d, h, !on);
                    }}
                    onMouseEnter={() => drag.current != null && set(d, h, drag.current)}
                    className={`h-[20px] w-[22px] cursor-pointer rounded-[3px] ${on ? "bg-[#eb6834]" : "bg-[#F2F4F7] hover:bg-[#FAD9CB]"}`}
                    title={`${DAYS[d]} ${h}시~${h + 1}시`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-muted">칸을 누르거나 끌어서 켜고 끕니다. 요일·시간 머리를 누르면 줄 전체. 색이 있는 시간에만 노출돼요.</p>
    </div>
  );
}

// 이미지 넣기(끌어 놓기·선택) — 하나 또는 여러 장
export function ImageDrop({ onImages, multiple = false, label, compact = false }: { onImages: (imgs: SourceImage[]) => void; multiple?: boolean; label: string; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const take = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    const read = await Promise.all((multiple ? list : list.slice(0, 1)).map((f) => readImage(f).catch(() => null)));
    const ok = read.filter((x): x is SourceImage => !!x);
    if (ok.length) onImages(ok);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition ${compact ? "px-3 py-3" : "px-4 py-6"} ${
        over ? "border-[#eb6834] bg-[#FFF4EE]" : "border-line bg-canvas hover:bg-[#FFF8F4]"
      }`}
    >
      <i className={`ti ti-photo-plus ${compact ? "text-[18px]" : "text-[24px]"} text-ink-muted`} aria-hidden />
      <span className="mt-1 text-[13px] text-ink-muted">{label}</span>
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function CharInput({ value, onChange, max, placeholder, multiline }: { value: string; onChange: (v: string) => void; max: number; placeholder?: string; multiline?: boolean }) {
  const n = value.trim().length;
  const bad = n > max || n === 1;
  return (
    <div className="relative">
      {multiline ? (
        <textarea rows={2} className={`${INPUT} pr-16`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={`${INPUT} pr-16`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      <span className={`pointer-events-none absolute right-3 top-2.5 text-[12px] tabular-nums ${bad ? "font-semibold text-bad" : "text-ink-muted"}`}>
        {n}/{max}
      </span>
    </div>
  );
}
