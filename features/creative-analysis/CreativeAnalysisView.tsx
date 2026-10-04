"use client";

// 소재 분석 화면 본문 — 메타 소재를 이미지·소재명·실제 타겟 세팅까지 묶어 분석(1단계: 메타).
// 2026-10-04: 소재명 파싱 태그 칩, 소재 유형(테마·상품)별 성과 맵(버블), 캠페인 목표 탭(전체·CV·TR), A/B 묶음 위너 👑, UTM 고급 필터 사이드바.
// 광고주는 props로 받는다(페이지는 useClients, 시각 점검용 미리보기는 고정 광고주).
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSessionCache, setSessionCache } from "@/features/dashboard/sessionCache";
import { Card, MediaChip, Segmented } from "@/features/dashboard/ui";
import { InsightPanel } from "@/features/dashboard/InsightPanel";
import { MEDIA_COLORS } from "@/features/dashboard/analysis";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { CreativeAnalysisRes, ObjectiveGroup } from "@/features/creative-analysis/types";
import { dictFor } from "@/features/creative-analysis/naming";
import {
  CREATIVE_DIMENSIONS,
  TARGET_DIMENSIONS,
  creativeInsights,
  enrich,
  fatigue,
  settingChecks,
  type Enriched,
} from "@/features/creative-analysis/analyze";
import { CreativeGallery } from "@/features/creative-analysis/CreativeGallery";
import { AttributePanel } from "@/features/creative-analysis/AttributePanel";
import { CreativeMatrix } from "@/features/creative-analysis/CreativeMatrix";
import { FatigueList, SettingCheckList } from "@/features/creative-analysis/SidePanels";
import { CreativeDrawer } from "@/features/creative-analysis/CreativeDrawer";
import { AbTestPanel, ThemeMap, UtmSidebar } from "@/features/creative-analysis/NamingInsights";
import { abGroups, matches, themeStats, type FacetSel } from "@/features/creative-analysis/groups";
import { adsetActions, decide, type TargetRules } from "@/features/creative-analysis/decision";
import { DecisionLog, DecisionQueue, TargetRoasEditor, isActive, type LoggedItem, type Snapshot } from "@/features/creative-analysis/DecisionQueue";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function shortDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

const PRESETS = [
  { key: "7", label: "7일", days: 7 },
  { key: "14", label: "14일", days: 14 },
  { key: "30", label: "30일", days: 30 },
] as const;
const MIN_IMP = [
  { key: "1000", label: "1천" },
  { key: "3000", label: "3천" },
  { key: "10000", label: "1만" },
] as const;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-5 py-5">
      <p className="text-[15px] text-ink-muted">{label}</p>
      <p className="mt-2 whitespace-nowrap text-[clamp(28px,2.1vw,36px)] font-bold leading-tight tracking-tight text-[#1A1A1A]">{value}</p>
      {sub && <p className="mt-1 text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export type ViewClient = { id: string; name: string; meta_account_id: string | null };

export function CreativeAnalysisView({
  selected,
  dataUrl = "/api/creative-analysis/meta",
  assetUrl = "/api/creative-analysis/meta/asset",
}: {
  selected: ViewClient | null;
  dataUrl?: string;
  assetUrl?: string;
}) {
  const [since, setSince] = useState(daysAgo(14));
  const [until, setUntil] = useState(daysAgo(1));
  const [minImp, setMinImp] = useState<string>("3000");
  const [obj, setObj] = useState<"all" | "cv" | "tr">("all");
  const [facets, setFacets] = useState<FacetSel>({});
  const [themePick, setThemePick] = useState<{ keys: string[]; label: string } | null>(null);
  // 광고주별 목표 ROAS(%) — 판정 엔진·성과 맵 기준선. 저장 전이면 기본 500%
  const [target, setTarget] = useState<{ value: number; rules: TargetRules; saved: boolean }>({ value: 500, rules: {}, saved: false });
  const [targetBusy, setTargetBusy] = useState(false);
  // 지난 결정 스냅숏(0030)
  const [log, setLog] = useState<{ snapshot: Snapshot | null; items: LoggedItem[]; ready: boolean }>({ snapshot: null, items: [], ready: true });
  const loadLog = useCallback(async () => {
    if (!selected?.id) return;
    try {
      const r = await fetch(`/api/creative-analysis/decisions?clientId=${selected.id}`);
      if (r.ok) setLog(await r.json());
    } catch {
      /* 무시 */
    }
  }, [selected?.id]);
  useEffect(() => {
    setTarget({ value: 500, rules: {}, saved: false });
    setLog({ snapshot: null, items: [], ready: true });
    if (!selected?.id) return;
    fetch(`/api/clients/${selected.id}/target-roas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setTarget({ value: j.targetRoas, rules: j.rules ?? {}, saved: j.saved }))
      .catch(() => undefined);
    loadLog();
  }, [selected?.id, loadLog]);
  const saveTarget = async (v: number | null, rules: TargetRules) => {
    if (!selected?.id) return;
    setTargetBusy(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}/target-roas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetRoas: v, rules }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "저장하지 못했어요.");
      setTarget({ value: j.targetRoas, rules: j.rules ?? {}, saved: j.saved });
    } catch (e) {
      setError(e instanceof Error ? e.message : "목표 ROAS를 저장하지 못했어요.");
    } finally {
      setTargetBusy(false);
    }
  };
  const pickTheme = (keys: string[], label: string) => {
    setThemePick({ keys, label });
    document.getElementById("ca-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const adsManagerUrl = selected?.meta_account_id ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${selected.meta_account_id.replace(/^act_/, "")}` : null;
  const group: ObjectiveGroup = obj === "tr" ? "upper" : "sales"; // 요소별 표의 평가 지표(전체는 전환 기준)
  const [data, setData] = useState<CreativeAnalysisRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (s: string, u: string, force = false) => {
      if (!selected?.id || !selected.meta_account_id) {
        setData(null);
        return;
      }
      // v2: 썸네일을 원본 비율로 받도록 바뀜(이전 캐시는 정사각형 썸네일) — 응답 모양이 바뀌면 버전을 올린다
      const key = `ctch_creative_meta_v3_${selected.id}_${s}_${u}`; // v3: UTM(utm) 필드 추가
      if (!force) {
        const hit = getSessionCache<CreativeAnalysisRes>(key, 30 * 60 * 1000);
        if (hit) {
          setData(hit);
          setError(null);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selected.id, since: s, until: u }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "불러오기 실패");
        setData(json);
        setSessionCache(key, json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했어요.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [selected, dataUrl],
  );

  useEffect(() => {
    load(since, until);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const { dict, source: dictSource } = useMemo(() => dictFor(selected?.name), [selected?.name]);

  const enriched = useMemo(
    () => (data ? enrich(data.creatives, data.adsets, data.campaigns, dict, data.period.until, Number(minImp)) : []),
    [data, dict, minImp],
  );
  // 목표 탭(CV = 전환 캠페인, TR = 트래픽·인지 캠페인 — 캠페인 실제 목표 기준, 없으면 소재명 목표 코드) → UTM 필터
  const byObj = useMemo(() => (obj === "all" ? enriched : enriched.filter((r) => r.group === (obj === "cv" ? "sales" : "upper"))), [enriched, obj]);
  const rows = useMemo(() => byObj.filter((r) => matches(r, facets)), [byObj, facets]);
  const sales = useMemo(() => rows.filter((r) => r.group === "sales"), [rows]);
  const themes = useMemo(() => themeStats(rows), [rows]);
  const ab = useMemo(() => abGroups(rows), [rows]);
  const winnerIds = useMemo(() => new Set(ab.map((g) => g.winnerId).filter((x): x is string => !!x)), [ab]);
  const decisions = useMemo(() => decide(rows, target.value, target.rules, new Set(fatigue(rows).map((f) => f.row.id))), [rows, target.value, target.rules]);
  const adsetActs = useMemo(() => (data ? adsetActions(rows, decisions, data.adsets, data.campaigns) : []), [rows, decisions, data]);
  const saveSnapshot = async () => {
    if (!selected?.id || !data) return;
    const items = rows
      .map((r) => ({ r, d: decisions.get(r.id) }))
      .filter((x) => x.d && x.d.status !== "new" && !((x.d.status === "kill" || x.d.status === "starved") && !isActive(x.r.status))) // 이미 꺼진 소재의 끄기 권고는 기록 안 함
      .map(({ r, d }) => ({ ad_id: r.id, ad_name: r.name, adset_id: r.adsetId, status: d!.status, reason: d!.reason, roas: r.roas, conversions: r.conversions, cost: r.cost }));
    try {
      const res = await fetch("/api/creative-analysis/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: selected.id, since: data.period.since, until: data.period.until, target: target.value, items }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "저장하지 못했어요.");
      loadLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "결정을 저장하지 못했어요.");
    }
  };
  const fat = useMemo(() => fatigue(rows), [rows]);
  const insights = useMemo(() => creativeInsights(rows, fatigue(sales)), [rows, sales]); // UTM·목표 필터 반영
  const checks = useMemo(() => (data ? settingChecks(enriched, data.adsets, data.campaigns, dict) : []), [data, enriched, dict]);

  const counts = { all: enriched.length, sales: enriched.filter((r) => r.group === "sales").length, upper: enriched.filter((r) => r.group === "upper").length };
  const preset = PRESETS.find((p) => since === daysAgo(p.days) && until === daysAgo(1))?.key ?? null;

  // 그룹 평균(상세 비교용)
  const avg = useMemo(() => {
    const s = rows.reduce(
      (a, r) => ({ cost: a.cost + r.cost, rev: a.rev + r.revenue, conv: a.conv + r.conversions, imp: a.imp + r.impressions, clk: a.clk + r.linkClicks, v3: a.v3 + (r.format === "video" ? r.videoViews3s : 0), vimp: a.vimp + (r.format === "video" ? r.impressions : 0) }),
      { cost: 0, rev: 0, conv: 0, imp: 0, clk: 0, v3: 0, vimp: 0 },
    );
    const d = (a: number, b: number) => (b > 0 ? a / b : null);
    return { roas: d(s.rev, s.cost), cpa: d(s.cost, s.conv), ctr: d(s.clk, s.imp), cvr: d(s.conv, s.clk), cpm: s.imp > 0 ? (s.cost / s.imp) * 1000 : null, hookRate: d(s.v3, s.vimp) };
  }, [rows]);

  // KPI
  const kpi = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.cost, 0);
    const fresh = rows.filter((r) => r.ageDays != null && r.ageDays <= 7);
    const rev = rows.reduce((a, r) => a + r.revenue, 0);
    const n = Math.max(1, Math.round(rows.length * 0.2));
    const topShare = rev > 0 ? [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, n).reduce((a, r) => a + r.revenue, 0) / rev : null;
    const hold = rows.filter((r) => !r.judged);
    return {
      total,
      fresh: fresh.length,
      freshShare: total > 0 ? fresh.reduce((a, r) => a + r.cost, 0) / total : 0,
      topN: n,
      topShare,
      hold: hold.length,
      holdShare: total > 0 ? hold.reduce((a, r) => a + r.cost, 0) / total : 0,
    };
  }, [rows]);

  // 사전에 없는 코드(숫자·기호 포함 조각) — 사전 보강용
  const unknownCodes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of enriched) for (const u of r.parsed.unknown) if (!/^[a-z][a-z.]*$/.test(u)) m.set(u, (m.get(u) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [enriched]);

  const open = openId ? enriched.find((r) => r.id === openId) ?? null : null;
  const peers = useMemo(() => {
    if (!open) return [];
    const key = open.parsed.type === "파트너십" && open.parsed.influencer ? (r: Enriched) => r.parsed.influencer === open.parsed.influencer : (r: Enriched) => !!open.parsed.themeCode && r.parsed.themeCode === open.parsed.themeCode;
    return enriched.filter((r) => r.id !== open.id && key(r)).sort((a, b) => b.cost - a.cost);
  }, [open, enriched]);

  const pick = (days: number) => {
    const s = daysAgo(days);
    setSince(s);
    setUntil(daysAgo(1));
    load(s, daysAgo(1));
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px] text-ink-muted">AI 리포트 · 소재 분석</p>
          <h2 className="mt-1 text-[26px] font-bold tracking-tight text-[#1A1A1A]">{selected ? `${selected.name} 소재 분석` : "광고주를 선택해 주세요"}</h2>
        </div>
        {selected?.meta_account_id && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="field h-[34px] w-auto px-2.5 text-[15px]" aria-label="시작일" />
            <span className="text-ink-faint">~</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="field h-[34px] w-auto px-2.5 text-[15px]" aria-label="종료일" />
            <Segmented value={preset} options={PRESETS.map((p) => ({ key: p.key, label: p.label }))} onChange={(k) => pick(PRESETS.find((p) => p.key === k)!.days)} />
            <button
              type="button"
              onClick={() => load(since, until, true)}
              disabled={loading}
              className="flex h-[34px] items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
            >
              <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
              {loading ? "불러오는 중" : "조회"}
            </button>
          </div>
        )}
      </div>

      {/* 필터 한 줄 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <MediaChip label="메타" color={MEDIA_COLORS.meta} on onClick={() => {}} />
          {["네이버 SA", "GFA", "카카오모먼트"].map((m) => (
            <MediaChip key={m} label={m} color="#D9D9D4" on={false} disabled note="다음 단계" title="메타 완성 후 확장 예정" onClick={() => {}} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px] text-ink-muted">캠페인 목표</span>
            <Segmented
              value={obj}
              options={[
                { key: "all", label: `전체 ${counts.all}` },
                { key: "cv", label: `🎯 전환(CV) ${counts.sales}` },
                { key: "tr", label: `🔗 트래픽(TR) ${counts.upper}` },
              ]}
              onChange={setObj}
            />
          </div>
          {selected?.meta_account_id && <TargetRoasEditor value={target.value} rules={target.rules} saved={target.saved} onSave={saveTarget} busy={targetBusy} />}
          <div className="flex items-center gap-2">
            <span className="text-[15px] text-ink-muted" title="이보다 노출이 적은 소재는 등급·비교에서 '판단 보류'">판단 기준 노출</span>
            <Segmented value={minImp} options={MIN_IMP.map((m) => ({ key: m.key, label: m.label }))} onChange={setMinImp} />
          </div>
        </div>
      </div>

      {!selected ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">광고주를 선택하면 소재를 분석해요.</div>
      ) : !selected.meta_account_id ? (
        <p className="rounded-lg bg-warn/10 px-3.5 py-2.5 text-[15px] text-warn">{selected.name}에 메타 광고계정 ID가 없어요. 광고주 관리에서 등록해 주세요.</p>
      ) : null}
      {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}
      {loading && !data && (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">
          <i className="ti ti-loader-2 mr-1 animate-spin" aria-hidden />
          소재·타겟 세팅을 불러오는 중… (소재가 많으면 20~40초 걸려요)
        </div>
      )}

      {data && (
        <div className={`grid gap-5 transition-opacity xl:grid-cols-[250px_minmax(0,1fr)] ${loading ? "opacity-60" : ""}`}>
          <UtmSidebar rows={byObj} sel={facets} onChange={setFacets} />
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 min-[1440px]:grid-cols-5">
            <Tile label="집행 소재" value={`${rows.length}개`} sub={`${shortDate(data.period.since)} ~ ${shortDate(data.period.until)} · 광고비 ${fmt(kpi.total, "won")}`} />
            <Tile label="신규 소재(1주 이내)" value={`${kpi.fresh}개`} sub={`광고비 비중 ${Math.round(kpi.freshShare * 100)}%`} />
            <Tile label={obj !== "tr" ? `상위 20%(${kpi.topN}개) 매출 비중` : "평균 CTR"} value={obj !== "tr" ? (kpi.topShare != null ? `${Math.round(kpi.topShare * 100)}%` : "—") : fmt(avg.ctr, "pct")} sub={obj !== "tr" ? "높을수록 소수 소재 의존" : `CPM ${fmt(avg.cpm, "won")}`} />
            <Tile label="판단 보류" value={`${kpi.hold}개`} sub={`노출 ${Number(minImp).toLocaleString("ko-KR")} 미만 · 광고비 ${Math.round(kpi.holdShare * 100)}%`} />
            <Tile label="피로 의심" value={`${fat.length}개`} sub="CTR 초반 대비 −30% 이상" />
          </div>

          <Card title="이번 주 결정" sub={`모든 소재를 목표 ROAS ${target.value.toLocaleString("ko-KR")}%${Object.keys(target.rules).length ? "(유형별 목표 반영)" : ""} 기준으로 판정했어요 · 끄기 → 키우기 → 지켜보기 순으로 처리하고, 실행 단위는 ‘광고세트별 행동’에서 확인하세요`}>
            <DecisionQueue
              rows={rows}
              decisions={decisions}
              adsets={adsetActs}
              dict={dict}
              accountId={selected?.meta_account_id ?? null}
              onOpen={(r) => setOpenId(r.id)}
              onSaveSnapshot={log.ready ? saveSnapshot : undefined}
              snapshotInfo={log.snapshot ? `마지막 저장 ${new Date(log.snapshot.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}` : null}
            />
          </Card>

          {log.ready && (
            <Card title="지난 결정 추적" sub="저장해 둔 판정과 지금 데이터를 비교해요 — 끄라고 한 소재를 실제로 껐는지, 키운 소재가 버티는지">
              <DecisionLog snapshot={log.snapshot} items={log.items} rows={enriched} decisions={decisions} onOpen={(r) => setOpenId(r.id)} />
            </Card>
          )}

          <Card title="소재 유형별 성과 맵" sub="소재명에서 뽑은 콘텐츠·상품(테마)을 광고비 × 효율 4사분면에 놓았어요 · 버블이나 패널 버튼을 누르면 아래 갤러리가 그 테마로 좁혀져요">
            <ThemeMap stats={themes.list} avg={obj === "tr" ? themes.ctr : target.value / 100} metric={obj === "tr" ? "ctr" : "roas"} onPick={pickTheme} adsManagerUrl={adsManagerUrl} baseLabel={obj === "tr" ? "평균" : Object.keys(target.rules).length ? "기본 목표" : "목표"} />
          </Card>

          {/* 인사이트·세팅 점검 — 넓은 화면에선 2~3단 Masonry(한 줄이 너무 길어지지 않게) */}
          <Card title="소재 인사이트" sub="전환 캠페인 소재 기준 · 데이터로 확인된 신호만">
            <InsightPanel insights={insights.map((i) => ({ ...i }))} colors={{}} onHighlight={() => {}} columns />
          </Card>
          <Card title="세팅 점검" sub="광고세트의 실제 타겟팅·학습 상태 기준">
            <SettingCheckList checks={checks} max={9} columns />
          </Card>

          <div id="ca-gallery" className="scroll-mt-4" />
          <Card title="소재 갤러리" sub={`${obj === "all" ? "전체" : obj === "cv" ? "전환(CV)" : "트래픽(TR)"} 캠페인 소재 · 등급은 같은 목표 소재끼리(전환=ROAS, 트래픽=CTR) · 태그는 소재명을 파싱한 것 · 눌러서 원본·세팅 보기`}>
            <CreativeGallery rows={rows} onOpen={(r) => setOpenId(r.id)} dict={dict} winnerIds={winnerIds} theme={themePick} onClearTheme={() => setThemePick(null)} decisions={decisions} />
          </Card>

          <Card title="A/B 테스트 그룹" sub={`이름 앞부분(날짜_목표_콘텐츠)이 같고 번호만 다른 소재를 자동으로 묶었어요 · ${ab.length}개 묶음 · 👑 = 전환은 ROAS, 트래픽은 CTR 1위(판단 기준 노출 이상만)`}>
            <AbTestPanel groups={ab} onOpen={(r) => setOpenId(r.id)} />
          </Card>

          <Card title="소재명으로 본 요소별 성과" sub="소재명을 해석해 같은 요소끼리 묶었어요 — 어떤 콘텐츠·모델·상품이 잘 되나">
            <AttributePanel
              rows={rows}
              dims={CREATIVE_DIMENSIONS}
              group={group}
              note={
                <>
                  {dictSource ? `해석 기준: ${dictSource}. ` : "이 광고주는 소재명 사전이 없어 날짜·목표·번호 같은 공통 패턴만 해석해요. "}
                  사전에 없는 단어는 테마·세부 콘텐츠로 그대로 묶었어요.
                  {unknownCodes.length > 0 && (
                    <>
                      {" "}해석 못한 코드:{" "}
                      {unknownCodes.map(([c, n]) => (
                        <span key={c} className="mr-1 rounded bg-canvas px-1 font-mono text-ink-soft">
                          {c}
                          <span className="text-ink-faint">×{n}</span>
                        </span>
                      ))}
                    </>
                  )}
                </>
              }
            />
          </Card>

          <Card title="타겟·세팅별 성과" sub="광고세트 이름이 아니라 메타에 실제로 설정된 타겟팅 기준이에요">
            <AttributePanel rows={rows} dims={TARGET_DIMENSIONS} group={group} />
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card title="후킹 × 전환 진단" sub="CTR(눈길) × CVR(구매 전환) — 전환 캠페인 소재">
              <CreativeMatrix rows={sales} onOpen={(r) => setOpenId(r.id)} />
            </Card>
            <Card title="피로도" sub="광고비 상위 40개 소재의 일별 CTR 변화">
              <FatigueList items={fat} onOpen={setOpenId} />
            </Card>
          </div>

          {data.notes.length > 0 && <p className="text-[13px] text-ink-muted">{data.notes.join(" ")}</p>}
        </div>
        </div>
      )}

      {open && selected && (
        <CreativeDrawer row={open} clientId={selected.id} assetUrl={assetUrl} avg={avg} peers={peers} onClose={() => setOpenId(null)} onOpen={(r) => setOpenId(r.id)} />
      )}
    </div>
  );
}
