"use client";

// 인스타 분석 — 대시보드형(2026-10-04 개편).
// 위(흰 띠): 검색창 + 자동 완성(분석했던 계정에서 앞 글자 검색) + 퀵 버튼(내 브랜드 계정·최근 검색)
// 아래(옅은 회색 #F4F5F7): 최근 분석 히스토리(카드/목록) — [리포트 보기]는 저장된 결과를 바로 연다(Apify 재호출 없음).
// 리포트를 열면 같은 회색 영역에 리포트 본문(InstaReport)이 뜨고 '← 분석 히스토리'로 돌아간다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import type { InstagramProfile } from "@/features/brand-analysis/apifyClient";
import type { Diagnosis } from "@/features/brand-analysis/diagnosisTypes";
import type { HistoryRow } from "@/features/brand-analysis/historyStore";
import { InstaReport } from "./InstaReport";

type Report = { profile: InstagramProfile; diagnosis: Diagnosis | null; analyzedAt: string };
const VIEW_KEY = "ctch_insta_view";
const handleOf = (input: string) => {
  const m = input.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return (m ? m[1] : input.trim().replace(/^@/, "")).toLowerCase();
};
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ko-KR"));
const compact = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1e8 ? `${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1)}억` : v >= 1e4 ? `${(v / 1e4).toFixed(v >= 1e5 ? 0 : 1)}만` : v.toLocaleString("ko-KR");
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

function ago(iso: string): string {
  const d = Date.now() - Date.parse(iso);
  if (d < 3600000) return `${Math.max(1, Math.round(d / 60000))}분 전`;
  if (d < 86400000) return `${Math.round(d / 3600000)}시간 전`;
  if (d < 30 * 86400000) return `${Math.floor(d / 86400000)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

function Avatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={style} onError={() => setBroken(true)} className="flex-shrink-0 rounded-full object-cover ring-1 ring-line" />;
  }
  return (
    <span style={style} className="flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-[15px] font-semibold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-canvas px-2.5 py-1 text-[12px] text-ink-soft ring-1 ring-line">
      {label} <b className="font-semibold tabular-nums text-ink">{value}</b>
    </span>
  );
}

function Pill({ icon, children, onClick, disabled, tone = "default" }: { icon: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "brand" | "default" | "ghost" }) {
  const cls =
    tone === "brand"
      ? "border-[#F45B35]/30 bg-[#FFF3EF] text-ink hover:border-[#F45B35]/60"
      : tone === "ghost"
        ? "border-dashed border-line bg-surface text-ink-muted hover:border-signal hover:text-signal"
        : "border-line bg-surface text-ink-soft hover:border-signal hover:text-signal";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[14px] transition disabled:opacity-50 ${cls}`}>
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

export default function InstaAnalysisPage() {
  const { selected } = useClients();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [ready, setReady] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const [brandEdit, setBrandEdit] = useState<string | null>(null); // null = 편집 안 함
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("");
  const [acOpen, setAcOpen] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-analysis/history");
      const j = (await res.json()) as { ready: boolean; rows: HistoryRow[] };
      setRows(j.rows ?? []);
      setReady(j.ready !== false);
    } catch {
      setReady(false);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "grid") setView(v);
    } catch {
      /* 무시 */
    }
  }, [loadHistory]);

  useEffect(() => {
    setBrand(null);
    setBrandEdit(null);
    if (!selected?.id) return;
    fetch(`/api/brand-analysis/brand?clientId=${selected.id}`)
      .then((r) => r.json())
      .then((j) => setBrand(j.username ?? null))
      .catch(() => undefined);
  }, [selected?.id]);

  // 바깥을 누르면 자동 완성 닫기
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAcOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const analyze = async (raw: string) => {
    const handle = handleOf(raw);
    if (!handle) return setError("인스타그램 URL 또는 @계정명을 입력해 주세요.");
    setAcOpen(false);
    setInput(`@${handle}`);
    setAnalyzing(handle);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/brand-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: handle }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "분석에 실패했어요.");
      setReport({ profile: json as InstagramProfile, diagnosis: null, analyzedAt: new Date().toISOString() });
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setAnalyzing(null);
    }
  };

  const openSaved = async (username: string) => {
    setOpening(username);
    setError(null);
    try {
      const res = await fetch(`/api/brand-analysis/history/${encodeURIComponent(username)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "리포트를 열지 못했어요.");
      setReport({ profile: json.profile, diagnosis: json.diagnosis, analyzedAt: json.analyzed_at });
      window.scrollTo?.({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setOpening(null);
    }
  };

  const saveBrand = async (value: string | null) => {
    if (!selected?.id) return;
    const res = await fetch("/api/brand-analysis/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: selected.id, username: value }) });
    const j = await res.json();
    if (!res.ok) return setError(j.error || "저장하지 못했어요.");
    setBrand(j.username);
    setBrandEdit(null);
  };

  // 자동 완성 — 분석했던 계정(핸들·이름) + 내 브랜드, 마지막 줄은 입력값 그대로 새로 분석
  const typed = handleOf(input);
  const suggestions = useMemo(() => {
    if (!typed) return [] as { username: string; row?: HistoryRow; brand?: boolean }[];
    const list: { username: string; row?: HistoryRow; brand?: boolean }[] = rows
      .filter((r) => r.username.includes(typed) || (r.full_name ?? "").toLowerCase().includes(typed))
      .slice(0, 6)
      .map((r) => ({ username: r.username, row: r, brand: r.username === brand }));
    if (brand && brand.includes(typed) && !list.some((s) => s.username === brand)) list.unshift({ username: brand, brand: true });
    if (!list.some((s) => s.username === typed)) list.push({ username: typed });
    return list;
  }, [typed, rows, brand]);

  const recent = rows.filter((r) => r.username !== brand).slice(0, 3);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase().replace(/^@/, "");
    return f ? rows.filter((r) => r.username.includes(f) || (r.full_name ?? "").toLowerCase().includes(f)) : rows;
  }, [rows, filter]);
  const busy = !!analyzing;

  const reportRow = report ? rows.find((r) => r.username === report.profile.username.toLowerCase()) : undefined;

  return (
    <div className="-m-6 flex min-h-[calc(100%+3rem)] flex-col 2xl:-mx-8">
      {/* ── 위: 검색 ── */}
      <section className="border-b border-line bg-surface px-6 py-8 2xl:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <h2 className="font-display text-[26px] font-semibold text-ink">인스타 분석</h2>
          <p className="mt-1.5 text-[15px] text-ink-muted">계정을 넣으면 최근 게시물 50개로 참여율·포맷·시간대를 분석하고, AI가 잘 되는 게시물의 공통점과 광고 소재 후보를 뽑아요.</p>

          <div ref={boxRef} className="relative mt-6 max-w-[760px]">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <i className="ti ti-brand-instagram pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-ink-muted" aria-hidden />
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setAcOpen(true);
                    setAcIndex(0);
                  }}
                  onFocus={() => setAcOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setAcIndex((i) => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setAcIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      analyze(acOpen && suggestions[acIndex] ? suggestions[acIndex].username : input);
                    } else if (e.key === "Escape") setAcOpen(false);
                  }}
                  placeholder="@계정명 또는 인스타그램 URL — 앞 글자만 쳐도 찾아요"
                  role="combobox"
                  aria-expanded={acOpen && suggestions.length > 0}
                  aria-autocomplete="list"
                  className="field h-12 w-full pl-11 text-[16px]"
                />
              </div>
              <button type="button" onClick={() => analyze(input)} disabled={busy} className="btn-signal h-12 min-w-[120px] px-6 text-[16px]">
                {busy ? "분석 중…" : "분석 시작"}
              </button>
            </div>

            {acOpen && suggestions.length > 0 && (
              <ul role="listbox" className="absolute left-0 right-[128px] top-[52px] z-20 overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-[0_12px_32px_rgba(16,24,40,0.12)]">
                {suggestions.map((s, i) => (
                  <li key={s.username} role="option" aria-selected={i === acIndex}>
                    <div className={`flex items-center gap-3 px-3.5 py-2 ${i === acIndex ? "bg-signal-soft" : ""}`} onMouseEnter={() => setAcIndex(i)}>
                      <button type="button" onClick={() => analyze(s.username)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        {s.row || s.brand ? <Avatar src={s.row?.avatar} name={s.username} size={32} /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-[15px] text-ink-muted ring-1 ring-line">+</span>}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium text-ink">
                            @{s.username}
                            {s.brand && <span className="ml-1.5 rounded-full bg-[#FFF3EF] px-1.5 py-0.5 text-[11px] font-semibold text-[#C2410C]">내 브랜드</span>}
                          </span>
                          <span className="block truncate text-[13px] text-ink-muted">
                            {s.row ? `${s.row.full_name ? `${s.row.full_name} · ` : ""}마지막 분석 ${ago(s.row.analyzed_at)}` : s.brand ? "브랜드 계정" : "새로 분석하기"}
                          </span>
                        </span>
                      </button>
                      {s.row && (
                        <button type="button" onClick={() => { setAcOpen(false); openSaved(s.username); }} className="whitespace-nowrap rounded-md px-2 py-1 text-[13px] text-signal hover:bg-surface">
                          저장된 리포트
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 퀵 버튼 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {brandEdit !== null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveBrand(brandEdit.trim() || null);
                }}
                className="flex items-center gap-1.5"
              >
                <input autoFocus value={brandEdit} onChange={(e) => setBrandEdit(e.target.value)} placeholder="@브랜드계정" className="field h-9 w-[180px] rounded-full px-4 text-[14px]" />
                <button type="submit" className="btn-signal h-9 rounded-full px-4 text-[14px]">저장</button>
                <button type="button" onClick={() => setBrandEdit(null)} className="h-9 px-2 text-[13px] text-ink-muted hover:text-ink">취소</button>
              </form>
            ) : brand ? (
              <>
                <Pill icon="🔥" tone="brand" onClick={() => analyze(brand)} disabled={busy}>
                  내 브랜드 계정 분석하기 <span className="text-ink-muted">@{brand}</span>
                </Pill>
                <button type="button" onClick={() => setBrandEdit(brand)} className="-ml-1 px-1 text-[12px] text-ink-muted hover:text-ink">변경</button>
              </>
            ) : (
              selected && (
                <Pill icon="🔥" tone="ghost" onClick={() => setBrandEdit("")}>
                  {selected.name} 브랜드 계정 지정하기
                </Pill>
              )
            )}
            {recent.map((r) => (
              <Pill key={r.username} icon="🕒" onClick={() => analyze(r.username)} disabled={busy}>
                최근 검색: @{r.username}
              </Pill>
            ))}
          </div>
        </div>
      </section>

      {/* ── 아래: 히스토리 / 리포트 ── */}
      <section className="flex-1 bg-[#F4F5F7] px-6 py-8 2xl:px-8">
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}

          {analyzing && (
            <div className="flex items-center gap-4 rounded-card bg-surface p-6 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)]">
              <i className="ti ti-loader-2 animate-spin text-[24px] text-signal" aria-hidden />
              <div>
                <p className="text-[16px] font-semibold text-ink">@{analyzing} 분석 중…</p>
                <p className="mt-0.5 text-[14px] text-ink-muted">최근 게시물 50개를 가져오고 있어요. 보통 30초~1분 걸려요.</p>
              </div>
            </div>
          )}

          {report ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface px-6 py-4 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)]">
                <div className="flex min-w-0 items-center gap-4">
                  <button type="button" onClick={() => setReport(null)} className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink-soft hover:border-ink-faint hover:text-ink">
                    ← 분석 히스토리
                  </button>
                  <Avatar src={reportRow?.avatar ?? (report.profile.profilePicUrl ? `/api/proxy-image?url=${encodeURIComponent(report.profile.profilePicUrl)}` : null)} name={report.profile.username} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-semibold text-ink">
                      @{report.profile.username}
                      {report.profile.username.toLowerCase() === brand && <span className="ml-2 rounded-full bg-[#FFF3EF] px-2 py-0.5 text-[12px] font-semibold text-[#C2410C]">내 브랜드</span>}
                    </p>
                    <p className="truncate text-[13px] text-ink-muted">{report.profile.fullName} · {dateLabel(report.analyzedAt)} 분석</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected && report.profile.username.toLowerCase() !== brand && (
                    <button type="button" onClick={() => saveBrand(report.profile.username)} className="btn-ghost h-9 px-3 text-[14px]">
                      내 브랜드로 지정
                    </button>
                  )}
                  <button type="button" onClick={() => analyze(report.profile.username)} disabled={busy} className="btn-ghost h-9 px-3 text-[14px]">
                    다시 분석
                  </button>
                </div>
              </div>
              <InstaReport key={`${report.profile.username}|${report.analyzedAt}`} profile={report.profile} initialDiagnosis={report.diagnosis} onDiagnosed={loadHistory} />
            </>
          ) : (
            !analyzing && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-[19px] font-semibold text-ink">최근 분석 히스토리</h3>
                    <p className="mt-0.5 text-[14px] text-ink-muted">팀이 분석한 계정이 모두 모여요 · 계정당 가장 최근 분석 1건 · {rows.length}개</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-muted" aria-hidden />
                      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="히스토리에서 찾기" className="field h-9 w-[200px] bg-surface pl-8 text-[14px]" />
                    </div>
                    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
                      {(["grid", "list"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setView(v);
                            try {
                              localStorage.setItem(VIEW_KEY, v);
                            } catch {
                              /* 무시 */
                            }
                          }}
                          aria-pressed={view === v}
                          className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[14px] transition ${view === v ? "bg-canvas font-medium text-ink" : "text-ink-muted hover:text-ink"}`}
                        >
                          <i className={`ti ti-${v === "grid" ? "layout-grid" : "list"} text-[15px]`} aria-hidden />
                          {v === "grid" ? "카드" : "목록"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!ready ? (
                  <div className="rounded-card bg-surface p-8 text-center shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
                    <p className="text-[16px] font-semibold text-ink">히스토리 저장소가 아직 없어요</p>
                    <p className="mt-1 text-[14px] text-ink-muted">Supabase SQL Editor에서 supabase/migrations/0027_insta_analyses.sql을 실행하면 분석할 때마다 여기에 쌓여요. 분석 자체는 지금도 돼요.</p>
                  </div>
                ) : !historyLoaded ? (
                  <p className="py-10 text-center text-[15px] text-ink-muted">불러오는 중…</p>
                ) : shown.length === 0 ? (
                  <div className="rounded-card bg-surface p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
                    <p className="text-[16px] font-semibold text-ink">{rows.length ? "찾는 계정이 없어요" : "아직 분석한 계정이 없어요"}</p>
                    <p className="mt-1 text-[14px] text-ink-muted">{rows.length ? "다른 이름으로 찾아보세요." : "위에서 @계정명을 넣고 분석을 시작하면 여기에 카드로 쌓여요."}</p>
                  </div>
                ) : view === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                    {shown.map((r) => (
                      <article key={r.username} className="flex flex-col rounded-card bg-surface p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)] transition hover:shadow-[0_2px_6px_rgba(16,24,40,0.08),0_12px_28px_rgba(16,24,40,0.10)]">
                        <div className="flex items-start gap-3">
                          <Avatar src={r.avatar} name={r.username} size={48} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[16px] font-semibold text-ink">
                              @{r.username}
                              {r.username === brand && <span className="ml-1.5 rounded-full bg-[#FFF3EF] px-1.5 py-0.5 text-[11px] font-semibold text-[#C2410C]">내 브랜드</span>}
                            </p>
                            <p className="truncate text-[13px] text-ink-muted">{r.full_name || "—"}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          <Badge label="팔로워" value={compact(r.followers)} />
                          <Badge label="참여율" value={pct(r.median_er, 2)} />
                          <Badge label="주간 게시" value={r.posts_per_week != null ? `${r.posts_per_week.toFixed(1)}회` : "—"} />
                          {r.reel_view_rate != null && <Badge label="릴스 확산" value={pct(r.reel_view_rate, 0)} />}
                          {r.diagnosed_at && <span className="inline-flex items-center whitespace-nowrap rounded-full bg-signal-soft px-2.5 py-1 text-[12px] font-medium text-signal">AI 진단 완료</span>}
                          {r.is_mock && <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warn/10 px-2.5 py-1 text-[12px] font-medium text-warn">샘플 데이터</span>}
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
                          <p className="min-w-0 text-[12px] leading-snug text-ink-muted">
                            <span className="block">{dateLabel(r.analyzed_at)} 분석</span>
                            <span className="block truncate">{ago(r.analyzed_at)}{r.analyzed_by ? ` · ${r.analyzed_by.split("@")[0]}` : ""}</span>
                          </p>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <button type="button" onClick={() => analyze(r.username)} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-muted hover:text-ink disabled:opacity-50" title="새로 분석(Apify 호출)">
                              다시 분석
                            </button>
                            <button type="button" onClick={() => openSaved(r.username)} disabled={opening === r.username} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50">
                              {opening === r.username ? "여는 중…" : "리포트 보기"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-card bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.06),0_6px_16px_rgba(16,24,40,0.06)] [contain:paint]">
                    <table className="w-full min-w-[960px] text-[15px]">
                      <thead>
                        <tr className="border-b border-line bg-canvas text-left text-[13px] text-ink-muted">
                          <th className="px-5 py-3 font-medium">계정</th>
                          <th className="px-3 py-3 text-right font-medium">팔로워</th>
                          <th className="px-3 py-3 text-right font-medium">참여율(중앙값)</th>
                          <th className="px-3 py-3 text-right font-medium">주간 게시</th>
                          <th className="px-3 py-3 text-right font-medium">릴스 확산</th>
                          <th className="px-3 py-3 font-medium">AI 진단</th>
                          <th className="px-3 py-3 font-medium">마지막 분석</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.username} className="border-b border-line last:border-0 hover:bg-canvas/60">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar src={r.avatar} name={r.username} size={36} />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-ink">
                                    @{r.username}
                                    {r.username === brand && <span className="ml-1.5 rounded-full bg-[#FFF3EF] px-1.5 py-0.5 text-[11px] font-semibold text-[#C2410C]">내 브랜드</span>}
                                  </p>
                                  <p className="truncate text-[13px] text-ink-muted">{r.full_name || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{n0(r.followers)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{pct(r.median_er, 2)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{r.posts_per_week != null ? `${r.posts_per_week.toFixed(1)}회` : "—"}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{pct(r.reel_view_rate, 0)}</td>
                            <td className="px-3 py-3">{r.diagnosed_at ? <span className="whitespace-nowrap rounded-full bg-signal-soft px-2 py-0.5 text-[12px] font-medium text-signal">완료</span> : <span className="text-[13px] text-ink-muted">—</span>}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-[14px] text-ink-soft">
                              {dateLabel(r.analyzed_at)} <span className="text-ink-muted">· {ago(r.analyzed_at)}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button type="button" onClick={() => openSaved(r.username)} disabled={opening === r.username} className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50">
                                {opening === r.username ? "여는 중…" : "리포트 보기"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
