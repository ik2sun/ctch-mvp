"use client";

// SA 입찰 시뮬레이터 — 키워드 → 네이버·구글 공식 견적으로 순위별 입찰가·입찰가별 예상 노출·클릭·비용.
// 흐름: ① 매체·기기 다중 선택 + 키워드 → 시뮬레이션(조합: 네이버 모바일 / 네이버 PC / 구글을 한 번에)
//       ② 조합 비교 카드에서 하나를 고르면 그 조합의 합계·키워드별 표(순위 칩 클릭·직접 입력 시 재계산)
//       ③ 키워드를 고르면 입찰가 곡선(클릭·비용 두 차트) — 포화 입찰가와 한 단계 올릴 때 추가 클릭당 비용.
// 숫자는 전부 매체 견적 API 값. 전환·매출은 사용자가 넣은 전환율·객단가 가정으로만 계산(구글은 구글 예측 전환도 표시).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { Card } from "@/features/dashboard/ui";
import { MEDIA_COLORS } from "@/features/dashboard/analysis";
import { LadderCharts, readLadder, type LadderPoint } from "./LadderCharts";
import { SimulatorForm, type DeviceKey, type HistoryItem, type MediaKey } from "./SimulatorForm";

type Perf = { bid: number; impressions: number; clicks: number; cost: number };
type ComboId = "naver:MOBILE" | "naver:PC" | "google";

type NaverRow = {
  keyword: string;
  stat: { pcSearch: number; mobileSearch: number; lowVolume: boolean; competition: string; pcCtr: number; mobileCtr: number } | null;
  positions: Record<string, number>;
  minBid: number;
  medianBid: number;
  bid: number;
  perf: Perf | null;
};
type GoogleRow = { keyword: string; stat: { monthlySearch: number; competition: string; lowBid: number; highBid: number } | null; bid: number };
type Related = { keyword: string; search: number; competition: string };
type GoogleTotal = { impressions: number; clicks: number; cost: number; conversions: number };
type NaverResult = { device: DeviceKey; rows: NaverRow[]; related: Related[] };
type GoogleResult = { rows: GoogleRow[]; total: GoogleTotal; related: Related[] };
type ComboState = { status: "loading" | "done" | "error" | "locked"; message?: string };

const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;
const n0 = (v: number) => Math.round(v).toLocaleString("ko-KR");
const norm = (k: string) => k.replace(/\s+/g, "").toUpperCase();
const KW_KEY = "ctch_sa_sim_keywords";
const HIST_KEY = "ctch_sa_sim_history";

const COMBO_LABEL: Record<ComboId, string> = { "naver:MOBILE": "네이버 SA · 모바일", "naver:PC": "네이버 SA · PC", google: "구글 Ads · 전체 기기" };
const comboColor = (c: ComboId) => (c === "google" ? MEDIA_COLORS.google_ads : MEDIA_COLORS.naver);

function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const k = raw.trim();
    if (k && !seen.has(norm(k))) {
      seen.add(norm(k));
      out.push(k);
    }
  }
  return out.slice(0, 20);
}

function combosOf(media: MediaKey[], devices: DeviceKey[]): ComboId[] {
  const out: ComboId[] = [];
  if (media.includes("naver")) for (const d of (["MOBILE", "PC"] as DeviceKey[]).filter((x) => devices.includes(x))) out.push(`naver:${d}`);
  if (media.includes("google")) out.push("google");
  return out;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || "불러오지 못했어요.") as Error & { code?: string };
    err.code = json.code;
    throw err;
  }
  return json as T;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="mt-1 text-[clamp(22px,1.8vw,30px)] font-bold text-[#1A1A1A]">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function BidInput({ value, onChange, step }: { value: number; onChange: (v: number) => void; step: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Math.max(10, Math.round((Number(draft.replace(/[^0-9]/g, "")) || 0) / 10) * 10);
    if (v !== value) onChange(v);
    else setDraft(String(value));
  };
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface">
      <button type="button" onClick={() => onChange(Math.max(10, value - step))} className="h-full px-2 text-ink-muted hover:text-ink" aria-label="입찰가 내리기">−</button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        inputMode="numeric"
        className="h-full w-[76px] border-x border-line bg-transparent text-center text-[15px] tabular-nums text-ink outline-none"
        aria-label="입찰가(원)"
      />
      <button type="button" onClick={() => onChange(value + step)} className="h-full px-2 text-ink-muted hover:text-ink" aria-label="입찰가 올리기">+</button>
    </div>
  );
}

const naverTotals = (r: NaverResult) =>
  r.rows.reduce((a, x) => ({ impressions: a.impressions + (x.perf?.impressions ?? 0), clicks: a.clicks + (x.perf?.clicks ?? 0), cost: a.cost + (x.perf?.cost ?? 0), conversions: 0 }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 });

export function BidSimulator() {
  const { selected } = useClients();
  const [media, setMedia] = useState<MediaKey[]>(["naver"]);
  const [devices, setDevices] = useState<DeviceKey[]>(["MOBILE"]);
  const [text, setText] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [states, setStates] = useState<Partial<Record<ComboId, ComboState>>>({});
  const [naver, setNaver] = useState<Partial<Record<DeviceKey, NaverResult>>>({});
  const [google, setGoogle] = useState<GoogleResult | null>(null);
  const [active, setActive] = useState<ComboId | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [dirty, setDirty] = useState<{ n: number; combo: ComboId | null }>({ n: 0, combo: null });

  const [focus, setFocus] = useState<string | null>(null);
  const [ladders, setLadders] = useState<Record<string, LadderPoint[]>>({});
  const [ladderLoading, setLadderLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const [cvr, setCvr] = useState("");
  const [aov, setAov] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KW_KEY);
      if (saved) setText(saved);
      const h = JSON.parse(localStorage.getItem(HIST_KEY) || "[]") as HistoryItem[];
      if (Array.isArray(h)) setHistory(h.slice(0, 8));
    } catch {
      /* 저장소 없음 */
    }
  }, []);

  const keywords = useMemo(() => parseKeywords(text), [text]);
  const loading = Object.values(states).some((s) => s?.status === "loading");
  const runCombos = (Object.keys(states) as ComboId[]).sort((a, b) => Object.keys(COMBO_LABEL).indexOf(a) - Object.keys(COMBO_LABEL).indexOf(b));

  const saveHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev.filter((h) => !(h.keywords.join("|") === item.keywords.join("|") && h.media.join() === item.media.join() && h.devices.join() === item.devices.join()))].slice(0, 8);
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  };

  const run = useCallback(
    async (m: MediaKey[] = media, d: DeviceKey[] = devices, kws: string[] = keywords) => {
      const combos = combosOf(m, d);
      if (!kws.length) return setError("키워드를 하나 이상 입력하세요.");
      if (!combos.length) return setError("매체와 기기를 하나 이상 고르세요.");
      setError(null);
      setLadders({});
      setNaver({});
      setGoogle(null);
      setStates(Object.fromEntries(combos.map((c) => [c, { status: "loading" }])));
      setActive(combos[0]);
      setFocus(kws[0]);
      try {
        localStorage.setItem(KW_KEY, kws.join("\n"));
      } catch {
        /* 무시 */
      }
      saveHistory({ at: new Date().toISOString(), keywords: kws, media: m, devices: d });

      const done = (c: ComboId, s: ComboState) => setStates((prev) => ({ ...prev, [c]: s }));
      const fail = (c: ComboId, e: unknown) => {
        const err = e as Error & { code?: string };
        done(c, { status: err.code === "PLANNER_LOCKED" ? "locked" : "error", message: err.message });
      };
      // 네이버 기기 조합은 서버 대기열을 같이 쓰니 순서대로, 구글은 동시에
      const naverJob = (async () => {
        for (const c of combos.filter((x) => x.startsWith("naver")) as ComboId[]) {
          const dev = c.split(":")[1] as DeviceKey;
          try {
            const r = await post<NaverResult>("/api/sa-simulator/naver", { clientId: selected?.id, action: "analyze", device: dev, keywords: kws });
            setNaver((prev) => ({ ...prev, [dev]: r }));
            done(c, { status: "done" });
          } catch (e) {
            fail(c, e);
          }
        }
      })();
      const googleJob = combos.includes("google")
        ? post<GoogleResult>("/api/sa-simulator/google", { clientId: selected?.id, action: "analyze", keywords: kws })
            .then((r) => {
              setGoogle(r);
              done("google", { status: "done" });
            })
            .catch((e) => fail("google", e))
        : Promise.resolve();
      await Promise.all([naverJob, googleJob]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, devices, keywords, selected?.id],
  );

  // 입찰가를 바꾸면 0.7초 뒤 그 조합만 재계산(네이버: 키워드별, 구글: 묶음 합계)
  const planSeq = useRef(0);
  useEffect(() => {
    const combo = dirty.combo;
    if (!dirty.n || !combo) return;
    const seq = ++planSeq.current;
    const t = setTimeout(async () => {
      setPlanLoading(true);
      try {
        if (combo.startsWith("naver")) {
          const dev = combo.split(":")[1] as DeviceKey;
          const cur = naver[dev];
          if (!cur) return;
          const r = await post<{ perf: Record<string, Perf> }>("/api/sa-simulator/naver", { clientId: selected?.id, action: "plan", device: dev, items: cur.rows.map((x) => ({ keyword: x.keyword, bid: x.bid })) });
          if (seq === planSeq.current) setNaver((prev) => (prev[dev] ? { ...prev, [dev]: { ...prev[dev]!, rows: prev[dev]!.rows.map((x) => ({ ...x, perf: r.perf[norm(x.keyword)] ?? x.perf })) } } : prev));
        } else if (google) {
          const r = await post<{ total: GoogleTotal }>("/api/sa-simulator/google", { clientId: selected?.id, action: "plan", items: google.rows.map((x) => ({ keyword: x.keyword, bid: x.bid })) });
          if (seq === planSeq.current) setGoogle((s) => (s ? { ...s, total: r.total } : s));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "다시 계산하지 못했어요.");
      } finally {
        if (seq === planSeq.current) setPlanLoading(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty.n]);

  const activeNaver = active?.startsWith("naver") ? naver[active.split(":")[1] as DeviceKey] : undefined;
  const activeGoogle = active === "google" ? google : null;

  const setBid = (keyword: string, bid: number) => {
    if (!active) return;
    const b = Math.max(active.startsWith("naver") ? 70 : 10, Math.min(100000, Math.round(bid / 10) * 10));
    if (active.startsWith("naver")) {
      const dev = active.split(":")[1] as DeviceKey;
      setNaver((prev) => (prev[dev] ? { ...prev, [dev]: { ...prev[dev]!, rows: prev[dev]!.rows.map((x) => (x.keyword === keyword ? { ...x, bid: b } : x)) } } : prev));
    } else setGoogle((s) => (s ? { ...s, rows: s.rows.map((x) => (x.keyword === keyword ? { ...x, bid: b } : x)) } : s));
    setDirty((v) => ({ n: v.n + 1, combo: active }));
  };

  // 입찰가 곡선 — 네이버는 키워드를 고르면 자동(호출 1건), 구글은 버튼으로(호출 8건 — 한도 절약)
  const ladderKey = `${active}|${focus}`;
  const loadLadder = useCallback(async () => {
    if (!focus || !active) return;
    setLadderLoading(true);
    try {
      if (activeNaver) {
        const row = activeNaver.rows.find((x) => x.keyword === focus);
        if (!row) return;
        const r = await post<{ points: LadderPoint[] }>("/api/sa-simulator/naver", {
          clientId: selected?.id,
          action: "ladder",
          device: activeNaver.device,
          keyword: focus,
          minBid: row.minBid,
          topBid: Math.max(row.positions["1"] ?? 0, row.medianBid),
        });
        setLadders((s) => ({ ...s, [ladderKey]: r.points }));
      } else if (activeGoogle) {
        const row = activeGoogle.rows.find((x) => x.keyword === focus);
        if (!row) return;
        const r = await post<{ points: LadderPoint[] }>("/api/sa-simulator/google", { clientId: selected?.id, action: "ladder", keyword: focus, lowBid: row.stat?.lowBid ?? 0, highBid: row.stat?.highBid ?? 0 });
        setLadders((s) => ({ ...s, [ladderKey]: r.points }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "입찰가 곡선을 불러오지 못했어요.");
    } finally {
      setLadderLoading(false);
    }
  }, [focus, active, activeNaver, activeGoogle, selected?.id, ladderKey]);

  useEffect(() => {
    if (activeNaver && focus && !ladders[ladderKey]) loadLadder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladderKey, activeNaver?.rows.length]);

  const addKeyword = (k: string) => {
    const next = parseKeywords(`${text}\n${k}`);
    setText(next.join("\n"));
    run(media, devices, next);
  };

  const pickHistory = (h: HistoryItem) => {
    setText(h.keywords.join("\n"));
    setMedia(h.media);
    setDevices(h.devices.length ? h.devices : ["MOBILE"]);
    run(h.media, h.devices, h.keywords);
  };

  // ---------- 활성 조합 합계 ----------
  const totals = activeNaver ? { ...naverTotals(activeNaver), period: "월 예상" } : activeGoogle ? { ...activeGoogle.total, period: "다음 30일 예상" } : null;
  const cvrN = Number(cvr) / 100;
  const aovN = Number(aov.replace(/[^0-9]/g, ""));
  const assumed = totals && cvrN > 0 ? { conv: totals.clicks * cvrN, revenue: aovN > 0 ? totals.clicks * cvrN * aovN : 0 } : null;

  const related = (activeNaver?.related ?? activeGoogle?.related) ?? [];
  const points = ladders[ladderKey] ?? [];
  const focusRow = activeNaver?.rows.find((r) => r.keyword === focus);
  const focusBid = (focusRow?.bid ?? activeGoogle?.rows.find((r) => r.keyword === focus)?.bid) ?? 0;
  const read = readLadder(points, focusBid, focusRow?.perf ?? null);
  const activeState = active ? states[active] : undefined;
  const color = active ? comboColor(active) : MEDIA_COLORS.naver;

  const pickCombo = (c: ComboId) => {
    setActive(c);
    const rows = c.startsWith("naver") ? naver[c.split(":")[1] as DeviceKey]?.rows : google?.rows;
    if (rows && !rows.some((r) => r.keyword === focus)) setFocus(rows[0]?.keyword ?? null);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9">
      <div>
        <h2 className="font-display text-[26px] font-semibold text-ink">입찰 시뮬레이터</h2>
        <p className="mt-2 text-[15px] text-ink-muted">키워드를 넣으면 네이버·구글 공식 견적으로 순위별 입찰가와, 입찰가별 예상 노출·클릭·비용을 보여줘요. 광고 계정에는 아무것도 바꾸지 않아요.</p>
      </div>

      <SimulatorForm
        media={media}
        devices={devices}
        onMedia={setMedia}
        onDevices={setDevices}
        text={text}
        onText={setText}
        count={keywords.length}
        loading={loading}
        onRun={() => run()}
        history={history}
        onHistory={pickHistory}
        onClearHistory={() => {
          setHistory([]);
          try {
            localStorage.removeItem(HIST_KEY);
          } catch {
            /* 무시 */
          }
        }}
      />

      {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}

      {runCombos.length > 0 && (
        <div className="space-y-6">
          {/* 조합 비교 — 눌러서 상세 전환 */}
          <div className={`grid grid-cols-1 gap-3 ${runCombos.length === 2 ? "md:grid-cols-2" : runCombos.length >= 3 ? "md:grid-cols-3" : ""}`}>
            {runCombos.map((c) => {
              const s = states[c]!;
              const t = c === "google" ? google?.total : naver[c.split(":")[1] as DeviceKey] ? naverTotals(naver[c.split(":")[1] as DeviceKey]!) : null;
              const on = active === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickCombo(c)}
                  aria-pressed={on}
                  className={`rounded-card border bg-surface px-5 py-4 text-left transition ${on ? "border-signal ring-2 ring-signal/15" : "border-line hover:border-ink-faint"}`}
                >
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: comboColor(c) }} aria-hidden />
                    {COMBO_LABEL[c]}
                    {on && <span className="ml-auto text-[12px] font-medium text-signal">보는 중</span>}
                  </p>
                  {s.status === "loading" ? (
                    <p className="mt-3 text-[14px] text-ink-muted">견적 받는 중…{c.startsWith("naver") ? " (네이버는 키워드 10개에 6~8초)" : ""}</p>
                  ) : s.status === "locked" ? (
                    <p className="mt-3 text-[14px] text-warn">키워드 플래너 사용 불가 — Basic 등급 필요</p>
                  ) : s.status === "error" ? (
                    <p className="mt-3 line-clamp-2 text-[14px] text-bad">{s.message}</p>
                  ) : t ? (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                      <div>
                        <dt className="text-ink-muted">{c === "google" ? "30일 광고비" : "월 광고비"}</dt>
                        <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{won(t.cost)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">클릭</dt>
                        <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{n0(t.clicks)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">평균 CPC</dt>
                        <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-ink">{t.clicks ? won(t.cost / t.clicks) : "—"}</dd>
                      </div>
                    </dl>
                  ) : null}
                </button>
              );
            })}
          </div>

          {activeState?.status === "locked" && (
            <section className="rounded-card border border-warn/30 bg-warn/5 p-6">
              <p className="text-[16px] font-semibold text-ink">구글 키워드 플래너는 아직 쓸 수 없어요</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{activeState.message}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-ink-soft">
                <li>Cloud Console → Google Ads API 개요(ctch 프로젝트)에서 브랜드 인증</li>
                <li>Basic 등급 신청 — 보통 몇 분 안에 자동 승인</li>
                <li>승인 후 이 화면에서 다시 시뮬레이션</li>
              </ol>
              <a href="https://console.cloud.google.com/google/ads-apis/overview?project=ctch-503703" target="_blank" rel="noreferrer" className="mt-3 inline-block text-[15px] font-medium text-signal hover:underline">
                Google Ads API 개요 열기 ↗
              </a>
            </section>
          )}
          {activeState?.status === "error" && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{COMBO_LABEL[active!]} — {activeState.message}</p>}

          {totals && (activeNaver?.rows.length || activeGoogle?.rows.length) ? (
            <>
              {/* 활성 조합 합계 */}
              <div className={`grid grid-cols-2 gap-3 ${assumed ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}>
                <Kpi label={`광고비 · ${totals.period}`} value={won(totals.cost)} sub={`일 평균 ${won(totals.cost / 30)}`} />
                <Kpi label="노출" value={n0(totals.impressions)} />
                <Kpi label="클릭" value={n0(totals.clicks)} sub={totals.impressions ? `CTR ${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : undefined} />
                <Kpi label="평균 CPC" value={totals.clicks ? won(totals.cost / totals.clicks) : "—"} sub={activeGoogle && totals.conversions > 0 ? `구글 예측 전환 ${totals.conversions.toFixed(1)}건` : undefined} />
                {assumed && <Kpi label="예상 전환 (가정)" value={assumed.conv.toFixed(1)} sub={`전환율 ${cvr}% 가정`} />}
                {assumed && (
                  <Kpi
                    label="예상 ROAS (가정)"
                    value={assumed.revenue && totals.cost ? `${Math.round((assumed.revenue / totals.cost) * 100)}%` : "—"}
                    sub={assumed.revenue ? `매출 ${won(assumed.revenue)}` : "객단가를 넣으면 계산돼요"}
                  />
                )}
              </div>

              {/* 키워드별 계획 */}
              <Card
                title={`키워드별 입찰 계획 — ${COMBO_LABEL[active!]}`}
                sub={activeNaver ? "순위 칩을 누르거나 입찰가를 직접 바꾸면 예상 실적이 다시 계산돼요 · 행을 누르면 아래에 입찰가 곡선" : "구글은 키워드별이 아니라 전체 합계로 예측돼요 · 행을 누르면 아래에 입찰가 곡선"}
                right={
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                    {planLoading && <span className="text-signal">다시 계산 중…</span>}
                    <label className="flex items-center gap-1.5">
                      전환율
                      <input value={cvr} onChange={(e) => setCvr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="예 2.5" className="field h-8 w-[70px] text-right text-[13px] tabular-nums" />%
                    </label>
                    <label className="flex items-center gap-1.5">
                      객단가
                      <input value={aov} onChange={(e) => setAov(e.target.value.replace(/[^0-9]/g, ""))} placeholder="예 89000" className="field h-8 w-[96px] text-right text-[13px] tabular-nums" />원
                    </label>
                  </div>
                }
              >
                <div className="-mx-6 -my-6 overflow-x-auto [contain:paint]">
                  {activeNaver ? (
                    <table className="w-full min-w-[1180px] text-[15px]">
                      <thead>
                        <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                          <th className="px-6 py-2.5 font-medium">키워드</th>
                          <th className="px-3 py-2.5 text-right font-medium">월 검색량 {activeNaver.device === "PC" ? "(PC)" : "(모바일)"}</th>
                          <th className="px-3 py-2.5 font-medium">경쟁</th>
                          <th className="px-3 py-2.5 font-medium">순위별 입찰가 — 누르면 적용</th>
                          <th className="px-3 py-2.5 text-right font-medium">최소 노출가</th>
                          <th className="px-3 py-2.5 font-medium">내 입찰가</th>
                          <th className="px-3 py-2.5 text-right font-medium">노출</th>
                          <th className="px-3 py-2.5 text-right font-medium">클릭</th>
                          <th className="px-3 py-2.5 text-right font-medium">CPC</th>
                          <th className="px-6 py-2.5 text-right font-medium">월 비용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeNaver.rows.map((r) => {
                          const search = r.stat ? (activeNaver.device === "PC" ? r.stat.pcSearch : r.stat.mobileSearch) : 0;
                          const sparse = !r.perf?.impressions && Object.values(r.positions).every((b) => !b || b <= 70);
                          const on = focus === r.keyword;
                          return (
                            <tr key={r.keyword} onClick={() => setFocus(r.keyword)} className={`cursor-pointer border-b border-line last:border-0 ${on ? "bg-signal-soft/60" : "hover:bg-canvas"}`}>
                              <td className="px-6 py-3">
                                <p className="font-medium text-ink">{r.keyword}</p>
                                {sparse && <p className="text-[12px] text-warn">견적 데이터가 부족해요(검색·경쟁 광고가 적음)</p>}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">{r.stat ? (r.stat.lowVolume && search <= 10 ? "<10" : n0(search)) : "—"}</td>
                              <td className="px-3 py-3"><span className="whitespace-nowrap text-ink-soft">{r.stat?.competition || "—"}</span></td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-wrap gap-1">
                                  {[1, 2, 3, 4, 5].map((p) => {
                                    const b = r.positions[String(p)];
                                    if (!b) return null;
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setBid(r.keyword, b)}
                                        className={`whitespace-nowrap rounded-md border px-2 py-1 text-[12px] tabular-nums transition ${r.bid === b ? "border-signal bg-signal text-white" : "border-line bg-surface text-ink-soft hover:border-signal hover:text-signal"}`}
                                      >
                                        {p}위 {n0(b)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink-soft">{r.minBid ? n0(r.minBid) : "—"}</td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <BidInput value={r.bid} step={r.bid >= 1000 ? 100 : 10} onChange={(v) => setBid(r.keyword, v)} />
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">{r.perf ? n0(r.perf.impressions) : "—"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink">{r.perf ? n0(r.perf.clicks) : "—"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-ink-soft">{r.perf?.clicks ? n0(r.perf.cost / r.perf.clicks) : "—"}</td>
                              <td className="px-6 py-3 text-right font-semibold tabular-nums text-ink">{r.perf ? won(r.perf.cost) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : activeGoogle ? (
                    <table className="w-full min-w-[900px] text-[15px]">
                      <thead>
                        <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                          <th className="px-6 py-2.5 font-medium">키워드</th>
                          <th className="px-3 py-2.5 text-right font-medium">월평균 검색량</th>
                          <th className="px-3 py-2.5 font-medium">경쟁</th>
                          <th className="px-3 py-2.5 font-medium">상단 노출 입찰가(낮음~높음) — 누르면 적용</th>
                          <th className="px-6 py-2.5 font-medium">내 최대 CPC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeGoogle.rows.map((r) => (
                          <tr key={r.keyword} onClick={() => setFocus(r.keyword)} className={`cursor-pointer border-b border-line last:border-0 ${focus === r.keyword ? "bg-signal-soft/60" : "hover:bg-canvas"}`}>
                            <td className="px-6 py-3 font-medium text-ink">{r.keyword}{!r.stat && <span className="ml-2 text-[12px] font-normal text-warn">데이터 없음</span>}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{r.stat ? n0(r.stat.monthlySearch) : "—"}</td>
                            <td className="px-3 py-3 text-ink-soft">{r.stat?.competition ?? "—"}</td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              {r.stat && (r.stat.lowBid || r.stat.highBid) ? (
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    { label: "낮음", v: r.stat.lowBid },
                                    { label: "중간", v: Math.round((r.stat.lowBid + r.stat.highBid) / 20) * 10 },
                                    { label: "높음", v: r.stat.highBid },
                                  ].map((o) => (
                                    <button
                                      key={o.label}
                                      type="button"
                                      onClick={() => setBid(r.keyword, o.v)}
                                      className={`whitespace-nowrap rounded-md border px-2 py-1 text-[12px] tabular-nums transition ${r.bid === o.v ? "border-signal bg-signal text-white" : "border-line bg-surface text-ink-soft hover:border-signal hover:text-signal"}`}
                                    >
                                      {o.label} {n0(o.v)}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-ink-muted">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                              <BidInput value={r.bid} step={r.bid >= 1000 ? 100 : 10} onChange={(v) => setBid(r.keyword, v)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              </Card>

              {related.length > 0 && (
                <div>
                  <p className="mb-2.5 text-[14px] font-semibold text-ink-soft">연관 키워드 — 누르면 추가해서 다시 계산해요</p>
                  <div className="flex flex-wrap gap-1.5">
                    {related.slice(0, 24).map((r) => (
                      <button
                        key={r.keyword}
                        type="button"
                        onClick={() => addKeyword(r.keyword)}
                        disabled={loading || keywords.length >= 20}
                        className="whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
                      >
                        + {r.keyword} <span className="tabular-nums text-ink-muted">{n0(r.search)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 입찰가 곡선 */}
              {focus && (
                <Card
                  title={`입찰가 곡선 — ${focus}`}
                  sub={`${COMBO_LABEL[active!]} · ${activeNaver ? "월 예상" : "다음 30일 예상"} · 그래프를 누르면 그 입찰가로 설정돼요`}
                  right={
                    <div className="flex items-center gap-2">
                      {points.length > 0 && (
                        <button type="button" onClick={() => setShowTable((v) => !v)} className="btn-ghost h-8 px-3 text-[13px]">
                          {showTable ? "표 닫기" : "표로 보기"}
                        </button>
                      )}
                      {activeGoogle && (
                        <button type="button" onClick={loadLadder} disabled={ladderLoading} className="btn-ghost h-8 px-3 text-[13px]">
                          {ladderLoading ? "불러오는 중…" : points.length ? "다시 불러오기" : "곡선 불러오기 (API 8건)"}
                        </button>
                      )}
                    </div>
                  }
                >
                  {ladderLoading && !points.length ? (
                    <p className="py-10 text-center text-[15px] text-ink-muted">입찰가별 견적을 받는 중…</p>
                  ) : !points.length ? (
                    <p className="py-10 text-center text-[15px] text-ink-muted">{activeGoogle ? "'곡선 불러오기'를 누르면 입찰가 8단계의 예상 실적을 그려요." : "견적이 없어요."}</p>
                  ) : read.maxClicks === 0 ? (
                    <p className="py-10 text-center text-[15px] text-ink-muted">어느 입찰가에서도 예상 클릭이 없어요. 검색량이 적거나 견적 데이터가 부족한 키워드예요.</p>
                  ) : (
                    <div className="space-y-5">
                      <ul className="grid grid-cols-1 gap-3 text-[15px] leading-relaxed md:grid-cols-3">
                        <li className="rounded-lg border border-line bg-canvas px-4 py-3">
                          <p className="text-[13px] text-ink-muted">지금 입찰가 {won(focusBid)}</p>
                          <p className="mt-0.5 text-ink">{read.cur ? `클릭 ${n0(read.cur.clicks)} · 비용 ${won(read.cur.cost)}` : "—"}</p>
                        </li>
                        <li className="rounded-lg border border-line bg-canvas px-4 py-3">
                          <p className="text-[13px] text-ink-muted">한 단계 올리면</p>
                          <p className="mt-0.5 text-ink">
                            {read.step ? (
                              <>
                                {won(read.step.bid)} → 클릭 +{n0(read.step.clicks)}, 비용 +{won(read.step.cost)}
                                <span className="block text-[13px] text-ink-muted">늘어나는 클릭 1회당 {won(read.step.perClick)}</span>
                              </>
                            ) : (
                              "더 올려도 클릭이 늘지 않아요"
                            )}
                          </p>
                        </li>
                        <li className="rounded-lg border border-line bg-canvas px-4 py-3">
                          <p className="text-[13px] text-ink-muted">클릭이 더 늘지 않는 입찰가</p>
                          <p className="mt-0.5 text-ink">
                            {read.saturation ? `${won(read.saturation.bid)} 이상 (클릭 ${n0(read.saturation.clicks)})` : "—"}
                            {read.saturation && focusBid > read.saturation.bid && (
                              <button type="button" onClick={() => setBid(focus, read.saturation!.bid)} className="mt-1 block text-[13px] font-medium text-signal hover:underline">
                                {won(read.saturation.bid)}로 낮추기 — 같은 클릭, 비용 절약
                              </button>
                            )}
                          </p>
                        </li>
                      </ul>
                      <LadderCharts points={points} color={color} bid={focusBid} onPick={(b) => setBid(focus, b)} />
                      {focusRow && (
                        <p className="text-[13px] text-ink-muted">
                          참고 — 순위별 평균 입찰가: {[1, 2, 3, 4, 5].map((p) => (focusRow.positions[String(p)] ? `${p}위 ${n0(focusRow.positions[String(p)])}` : null)).filter(Boolean).join(" · ") || "—"} · 최소 노출 {n0(focusRow.minBid)} · 중간 {n0(focusRow.medianBid)}
                        </p>
                      )}
                      {showTable && (
                        <div className="overflow-x-auto rounded-lg border border-line">
                          <table className="w-full text-[14px] tabular-nums">
                            <thead>
                              <tr className="border-b border-line bg-canvas text-left text-[13px] text-ink-muted">
                                <th className="px-4 py-2 font-medium">입찰가</th>
                                <th className="px-4 py-2 text-right font-medium">노출</th>
                                <th className="px-4 py-2 text-right font-medium">클릭</th>
                                <th className="px-4 py-2 text-right font-medium">비용</th>
                                <th className="px-4 py-2 text-right font-medium">평균 CPC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {points.map((p) => (
                                <tr key={p.bid} className="border-b border-line last:border-0">
                                  <td className="px-4 py-1.5">{won(p.bid)}</td>
                                  <td className="px-4 py-1.5 text-right">{n0(p.impressions)}</td>
                                  <td className="px-4 py-1.5 text-right">{n0(p.clicks)}</td>
                                  <td className="px-4 py-1.5 text-right">{won(p.cost)}</td>
                                  <td className="px-4 py-1.5 text-right">{p.clicks ? won(p.cost / p.clicks) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              <p className="text-[13px] leading-relaxed text-ink-muted">
                {activeNaver
                  ? "네이버 견적은 최근 입찰·노출 통계로 만든 예측이라 실제 순위·실적과 다를 수 있어요. 순위별 입찰가·최소 노출가·중간 입찰가는 네이버가 제공하는 최근 통계 값이에요. 키워드의 품질지수·광고 소재에 따라 같은 입찰가라도 순위가 달라져요."
                  : "구글 예측은 키워드 플래너 값이에요. 실제 실적은 품질평가점수·광고 순위·자동 입찰 여부에 따라 달라져요. 예측은 수동 CPC·일치 검색 기준이에요."}
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
