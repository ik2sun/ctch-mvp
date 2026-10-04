"use client";

// 이번 주 결정 — 판정 엔진 결과를 상태별 탭(끄기·키우기·지켜보기·예산 못 받음·신규)으로.
// 보기 전환: [소재별] 소재마다 이유·구간·신뢰도 / [광고세트별] 메타 예산 단위(ABO 세트·CBO·Advantage+ 캠페인)로 묶은 실행 행동.
// 실행은 메타 광고 관리자에서(선택한 광고·세트를 고른 채 열기) — 쓰기 권한(ads_management) 확인 전까지 CTCH에서 직접 바꾸지 않는다.
// '이번 주 결정 저장'은 스냅숏을 남겨 '지난 결정 추적'(DecisionLog)에서 실제로 껐는지·이후 성과를 비교한다.
import { useState } from "react";
import type { Enriched } from "./analyze";
import type { NamingDict } from "./naming";
import { KIND_LABEL, STATUS_META, type AdsetAction, type Decision, type DecisionStatus, type TargetRules } from "./decision";
import { Thumb } from "./CreativeGallery";
import { ParsedTags } from "./NamingInsights";

const won = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : Math.round(v).toLocaleString("ko-KR"));
const ORDER: DecisionStatus[] = ["kill", "scale", "watch", "starved", "new"];
const HINT: Record<DecisionStatus, string> = {
  kill: "목표에 확실히 못 미치거나(ROAS 90% 구간 상한 < 목표) 전환 없이 돈을 쓰는 소재 — 광고 관리자에서 끄세요",
  scale: "목표를 확실히 넘고(구간 하한 ≥ 목표) 꺾임·피로가 없는 소재 — 광고세트별 보기에서 예산을 어디서 늘릴지 확인하세요",
  watch: "목표와 아직 구분이 안 되거나, 좋았지만 최근 꺾인 소재 — 교체 소재를 준비하세요",
  starved: "집행 8일 이상인데 메타가 예산을 거의 안 줘서 데이터가 안 쌓이는 소재 — 기다려도 판단이 안 돼요. 정리하면 학습이 좋은 소재에 모여요",
  new: "집행 7일 이하 · 전환 5건 미만 — 그대로 두고 다음 주에 다시 보세요",
};
const VERDICT: Record<AdsetAction["verdict"], { label: string; cls: string }> = {
  cut: { label: "축소·중단", cls: "bg-bad/10 text-bad" },
  scale: { label: "증액", cls: "bg-good/10 text-good" },
  prune: { label: "소재 정리", cls: "bg-warn/10 text-warn" },
  hold: { label: "유지", cls: "bg-canvas text-ink-muted" },
};

// 지금 켜져 있는 광고 — 끄기·정리 권고는 켜진 소재에만(기간 중 돈을 썼어도 이미 꺼졌으면 할 일이 아님)
export const isActive = (s: string) => s === "ACTIVE" || s === "IN_PROCESS" || s === "WITH_ISSUES" || s === "PENDING_REVIEW";

export function adsManagerUrl(accountId: string | null | undefined, level: "ads" | "adsets", ids: string[]): string | null {
  if (!accountId) return null;
  const act = accountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/${level}?act=${act}${ids.length ? `&selected_${level === "ads" ? "ad" : "adset"}_ids=${ids.slice(0, 50).join(",")}` : ""}`;
}

// 목표 ROAS — 기본 + 캠페인 유형별(선택)
export function TargetRoasEditor({ value, rules, saved, onSave, busy }: { value: number; rules: TargetRules; saved: boolean; onSave: (v: number | null, rules: TargetRules) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [r, setR] = useState<Record<string, string>>({});
  const n = Object.keys(rules).length;
  const start = () => {
    setBase(String(value));
    setR(Object.fromEntries((["promo", "ongoing", "brand"] as const).map((k) => [k, rules[k] ? String(rules[k]) : ""])));
    setOpen(true);
  };
  const num = (s: string) => {
    const v = Number(s.replace(/[^0-9]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const save = () => {
    const next: TargetRules = {};
    for (const k of ["promo", "ongoing", "brand"] as const) {
      const v = num(r[k] ?? "");
      if (v != null) next[k] = v;
    }
    onSave(num(base), next);
    setOpen(false);
  };
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={start} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[14px] text-ink hover:border-[#F45B35]/60" title="판정 기준 — 광고주별로 저장돼요">
        <span className="text-ink-muted">목표 ROAS</span>
        <b className="tabular-nums">{value.toLocaleString("ko-KR")}%</b>
        {n > 0 ? <span className="text-[11px] text-[#C2410C]">유형별 {n}</span> : !saved && <span className="text-[11px] text-ink-muted">기본값</span>}
        <span className="text-ink-muted" aria-hidden>✎</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[40px] z-30 w-[300px] rounded-xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <p className="text-[13px] font-semibold text-ink">목표 ROAS — 이 광고주에만 적용</p>
          <label className="mt-3 flex items-center justify-between gap-2 text-[13px] text-ink-soft">
            기본
            <span className="flex items-center gap-1">
              <input autoFocus value={base} onChange={(e) => setBase(e.target.value)} inputMode="numeric" className="h-8 w-[84px] rounded border border-line px-2 text-right tabular-nums outline-none focus:border-[#F45B35]" aria-label="기본 목표 ROAS(%)" />%
            </span>
          </label>
          <p className="mt-3 text-[12px] text-ink-muted">캠페인 유형별(비우면 기본을 따름) — UTM 캠페인·소재명·캠페인 이름으로 구분</p>
          {(["promo", "ongoing", "brand"] as const).map((k) => (
            <label key={k} className="mt-1.5 flex items-center justify-between gap-2 text-[13px] text-ink-soft">
              {KIND_LABEL[k]}
              <span className="flex items-center gap-1">
                <input value={r[k] ?? ""} onChange={(e) => setR((s) => ({ ...s, [k]: e.target.value }))} placeholder={String(num(base) ?? value)} inputMode="numeric" className="h-8 w-[84px] rounded border border-line px-2 text-right tabular-nums outline-none placeholder:text-ink-faint focus:border-[#F45B35]" aria-label={`${KIND_LABEL[k]} 목표 ROAS(%)`} />%
              </span>
            </label>
          ))}
          <div className="mt-4 flex items-center justify-between">
            {saved || n > 0 ? (
              <button type="button" onClick={() => (onSave(null, {}), setOpen(false))} className="text-[12px] text-ink-muted hover:text-ink">
                모두 기본값(500%)으로
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setOpen(false)} className="h-8 px-2.5 text-[13px] text-ink-muted hover:text-ink">
                취소
              </button>
              <button type="button" onClick={save} disabled={busy} className="h-8 rounded-lg bg-[#F45B35] px-3 text-[13px] font-semibold text-white hover:brightness-95 disabled:opacity-50">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function DecisionQueue({
  rows,
  decisions,
  adsets,
  dict,
  accountId,
  onOpen,
  onSaveSnapshot,
  snapshotInfo,
}: {
  rows: Enriched[];
  decisions: Map<string, Decision>;
  adsets: AdsetAction[];
  dict: NamingDict;
  accountId: string | null;
  onOpen: (r: Enriched) => void;
  onSaveSnapshot?: () => void;
  snapshotInfo?: string | null;
}) {
  const by = new Map<DecisionStatus, Enriched[]>(ORDER.map((s) => [s, []]));
  const offCount: Partial<Record<DecisionStatus, number>> = {};
  for (const r of rows) {
    const d = decisions.get(r.id);
    if (!d) continue;
    if ((d.status === "kill" || d.status === "starved") && !isActive(r.status)) {
      offCount[d.status] = (offCount[d.status] ?? 0) + 1;
      continue;
    }
    by.get(d.status)!.push(r);
  }
  by.get("scale")!.sort((a, b) => (b.roas ?? 0) * b.conversions - (a.roas ?? 0) * a.conversions);
  for (const s of ["kill", "watch", "starved", "new"] as DecisionStatus[]) by.get(s)!.sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const [tab, setTab] = useState<DecisionStatus>(by.get("kill")!.length ? "kill" : "scale");
  const [view, setView] = useState<"ads" | "adsets">("ads");
  const [limit, setLimit] = useState(8);
  const list = by.get(tab)!;
  const bulkUrl = adsManagerUrl(accountId, "ads", list.map((r) => r.id));
  const actionSets = adsets.filter((a) => a.verdict !== "hold");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
          {(["ads", "adsets"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-md px-3 py-1.5 text-[14px] ${view === v ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(21,24,30,0.08)]" : "text-ink-muted hover:text-ink"}`}>
              {v === "ads" ? "소재별" : `광고세트별 행동 ${actionSets.length}`}
            </button>
          ))}
        </div>
        {onSaveSnapshot && (
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            {snapshotInfo && <span>{snapshotInfo}</span>}
            <button type="button" onClick={onSaveSnapshot} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:border-ink-faint hover:text-ink" title="지금 판정을 기록해 다음 주에 실제로 껐는지·성과가 어땠는지 비교해요">
              📌 이번 주 결정 저장
            </button>
          </div>
        )}
      </div>

      {view === "adsets" ? (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-soft">메타 예산은 소재가 아니라 광고세트(ABO)나 캠페인(CBO·Advantage+)에 있어요. 소재 판정을 실제로 바꿀 수 있는 단위로 묶었어요(전환 소재 기준).</p>
          {actionSets.length === 0 ? (
            <p className="rounded-lg bg-canvas py-8 text-center text-[14px] text-ink-muted">지금 바꿀 광고세트가 없어요(모두 유지).</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {actionSets.slice(0, 20).map((a) => {
                const v = VERDICT[a.verdict];
                const link = adsManagerUrl(accountId, "adsets", [a.adsetId]);
                return (
                  <li key={a.adsetId} className="flex flex-wrap items-center gap-3 px-3 py-3 lg:flex-nowrap">
                    <span className={`w-[78px] flex-shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-center text-[12px] font-semibold ${v.cls}`}>{v.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink" title={a.adsetName}>{a.adsetName}</p>
                      <p className="truncate text-[12px] text-ink-muted">
                        {a.campaignName} · <b className="font-medium text-ink-soft">{a.budgetMode}</b>
                        {a.dailyBudget ? ` · 일 예산 ₩${won(a.dailyBudget)}` : ""}
                      </p>
                      <p className="mt-1 text-[13px] text-ink">{a.action}</p>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap gap-1 text-[11px]">
                      {(["scale", "watch", "kill", "starved", "new"] as DecisionStatus[]).filter((s) => a.counts[s]).map((s) => (
                        <span key={s} className={`whitespace-nowrap rounded-full px-2 py-0.5 ${STATUS_META[s].chip}`}>
                          {STATUS_META[s].icon} {a.counts[s]}
                        </span>
                      ))}
                    </div>
                    <div className="w-[150px] flex-shrink-0 text-right text-[13px] tabular-nums">
                      <span className="block text-[11px] text-ink-muted">ROAS / 목표 {Math.round(a.target)}%</span>
                      <b className={a.roas == null ? "text-ink-muted" : a.roas * 100 >= a.target ? "text-good" : "text-bad"}>{a.roas != null ? `${Math.round(a.roas * 100)}%` : "—"}</b>
                      <span className="text-ink-muted"> · ₩{won(a.cost)}</span>
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" className="flex-shrink-0 rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:border-ink-faint hover:text-ink">
                        세트 열기 ↗
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div role="tablist" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {ORDER.map((s) => {
              const items = by.get(s)!;
              const cost = items.reduce((a, r) => a + r.cost, 0);
              const m = STATUS_META[s];
              const on = tab === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => (setTab(s), setLimit(8))}
                  className={`rounded-lg border px-4 py-3 text-left transition ${on ? "border-ink/20 bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.08)]" : "border-line bg-canvas hover:border-ink-faint"}`}
                >
                  <p className={`text-[14px] font-semibold ${m.head}`}>
                    <span aria-hidden>{m.icon}</span> {m.label}
                  </p>
                  <p className="mt-0.5 text-[22px] font-bold tabular-nums text-[#1A1A1A]">{items.length}개</p>
                  <p className="text-[12px] text-ink-muted">광고비 ₩{won(cost)} · {total > 0 ? Math.round((cost / total) * 100) : 0}%</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ink-soft">
              {HINT[tab]}
              {offCount[tab] ? <span className="text-ink-muted"> · 이미 꺼진 {offCount[tab]}개는 뺐어요</span> : null}
            </p>
            {bulkUrl && list.length > 0 && (tab === "kill" || tab === "starved") && (
              <a href={bulkUrl} target="_blank" rel="noreferrer" className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white hover:brightness-95 ${tab === "kill" ? "bg-bad" : "bg-ink-soft"}`}>
                {Math.min(list.length, 50)}개를 광고 관리자에서 선택해 열기 ↗
              </a>
            )}
          </div>

          {list.length === 0 ? (
            <p className="rounded-lg bg-canvas py-8 text-center text-[14px] text-ink-muted">해당 소재가 없어요.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.slice(0, limit).map((r) => {
                const d = decisions.get(r.id)!;
                const ratio = r.roas != null ? r.roas / (d.target / 100) : null;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                    <button type="button" onClick={() => onOpen(r)} className="flex-shrink-0" aria-label="소재 상세">
                      <Thumb row={r} fit="cover" className="h-14 w-11 rounded" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <ParsedTags row={r} dict={dict} max={4} />
                      <p className="mt-1 text-[13px] leading-snug text-ink">{d.reason}</p>
                    </div>
                    <div className="grid w-full grid-cols-4 gap-3 text-right text-[13px] tabular-nums sm:w-auto sm:min-w-[340px]">
                      <span>
                        <span className="block text-[11px] text-ink-muted">광고비</span>₩{won(r.cost)}
                      </span>
                      <span>
                        <span className="block text-[11px] text-ink-muted">{d.basis === "target" ? `ROAS / ${d.target}%` : "CTR"}</span>
                        {d.basis === "target" ? (
                          <b className={ratio == null ? "text-ink-muted" : d.status === "scale" ? "text-good" : d.status === "kill" ? "text-bad" : "text-ink"}>{r.roas != null ? `${Math.round(r.roas * 100)}%` : "—"}</b>
                        ) : (
                          <b>{r.ctr != null ? `${(r.ctr * 100).toFixed(2)}%` : "—"}</b>
                        )}
                      </span>
                      <span>
                        <span className="block text-[11px] text-ink-muted">전환</span>
                        {r.conversions.toFixed(0)}
                      </span>
                      <span>
                        <span className="block text-[11px] text-ink-muted">신뢰도</span>
                        <span className={d.confidence === "높음" ? "font-semibold text-ink" : d.confidence === "보통" ? "text-ink-soft" : "text-ink-muted"}>{d.confidence}</span>
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 gap-1.5">
                      <button type="button" onClick={() => onOpen(r)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:border-ink-faint hover:text-ink">
                        상세
                      </button>
                      {accountId && (
                        <a href={adsManagerUrl(accountId, "ads", [r.id])!} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:border-ink-faint hover:text-ink">
                          관리자 ↗
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + 12)} className="mx-auto flex rounded-lg border border-line px-4 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint">
              더 보기 ({list.length - limit}개 남음)
            </button>
          )}
        </>
      )}
      <p className="text-[12px] leading-relaxed text-ink-muted">
        판정 기준 — 전환 소재: 목표 ROAS(캠페인 유형별 목표가 있으면 그것) 대비, ROAS 90% 구간(전환 수 기준 — 주문 금액 편차는 반영 못 함)으로 확실히 넘으면 키우기·확실히 못 미치면 끄기, 걸치면 지켜보기. 전환 5건 미만은 집행 7일 이하 신규 / 8일 이상 예산 못 받음, 단 계정 CPA의 3배 이상 쓰면 끄기. 최근 3일 ROAS 30%↑ 꺾임·피로면 지켜보기. 트래픽 소재: CTR 중앙값 대비(상대).
      </p>
    </div>
  );
}

// ── 지난 결정 추적 ─────────────────────────────
export type LoggedItem = { ad_id: string; ad_name: string | null; status: DecisionStatus; reason: string | null; roas: number | null; conversions: number | null; cost: number | null };
export type Snapshot = { at: string; since: string | null; until: string | null; target: number | null; by: string | null };


export function DecisionLog({ snapshot, items, rows, decisions, onOpen }: { snapshot: Snapshot | null; items: LoggedItem[]; rows: Enriched[]; decisions: Map<string, Decision>; onOpen: (r: Enriched) => void }) {
  if (!snapshot) return <p className="rounded-lg bg-canvas py-6 text-center text-[14px] text-ink-muted">저장된 결정이 없어요. 위의 ‘📌 이번 주 결정 저장’을 누르면 다음에 실제로 껐는지·성과가 어땠는지 여기서 비교해요.</p>;
  const now = new Map(rows.map((r) => [r.id, r]));
  const rank: Record<string, number> = { kill: 0, starved: 1, scale: 2 };
  const tracked = items.filter((i) => i.status === "kill" || i.status === "scale" || i.status === "starved").sort((a, b) => rank[a.status] - rank[b.status] || (b.cost ?? 0) - (a.cost ?? 0));
  const verdict = (i: LoggedItem) => {
    const r = now.get(i.ad_id);
    if (i.status === "kill" || i.status === "starved") {
      if (!r) return { ok: true, text: "이번 기간 집행 없음(꺼졌거나 예산 0)" };
      return isActive(r.status) ? { ok: false, text: `아직 켜져 있어요 · 지금 조회 기간 광고비 ₩${won(r.cost)}` } : { ok: true, text: "꺼짐 ✓" };
    }
    if (!r) return { ok: false, text: "이번 기간 집행 없음 — 의도한 거라면 무시" };
    const d = decisions.get(r.id);
    const kept = d && (d.status === "scale" || d.status === "watch");
    const label = `지금 판정 ${d ? STATUS_META[d.status].label : "—"}`;
    // 트래픽 소재는 ROAS가 아니라 CTR로 판정 → ROAS 비교 대신 판정만
    if (r.group === "upper") return { ok: !!kept, text: `CTR ${r.ctr != null ? (r.ctr * 100).toFixed(2) : "—"}% · ${label}` };
    return { ok: !!kept, text: `ROAS ${i.roas != null ? Math.round(i.roas * 100) : "—"}% → ${r.roas != null ? Math.round(r.roas * 100) : "—"}% · ${label}` };
  };
  const killDone = tracked.filter((i) => (i.status === "kill" || i.status === "starved") && verdict(i).ok).length;
  const killAll = tracked.filter((i) => i.status === "kill" || i.status === "starved").length;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-soft">
        {new Date(snapshot.at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 저장{snapshot.by ? ` · ${snapshot.by.split("@")[0]}` : ""} · 목표 {snapshot.target ?? "—"}% ·{" "}
        <b className="text-ink">끄기·정리 권고 {killAll}개 중 {killDone}개 처리됨</b>
      </p>
      {tracked.length === 0 ? (
        <p className="text-[13px] text-ink-muted">그때 끄기·키우기 판정이 없었어요.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {tracked.slice(0, 15).map((i) => {
            const v = verdict(i);
            const r = now.get(i.ad_id);
            return (
              <li key={i.ad_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS_META[i.status].chip}`}>
                  {STATUS_META[i.status].icon} {STATUS_META[i.status].label}
                </span>
                <button type="button" disabled={!r} onClick={() => r && onOpen(r)} className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-ink-soft enabled:hover:text-ink" title={i.ad_name ?? i.ad_id}>
                  {i.ad_name ?? i.ad_id}
                </button>
                <span className={`text-[13px] ${v.ok ? "text-good" : "text-warn"}`}>{v.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
