"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import {
  updateCollectSections,
  addKeyword,
  deleteKeywords,
  listKeywords,
  listLatestChecks,
  setAutoPaused,
  updateCheckInterval,
  type CheckIntervalHours,
  type CompetitorKeyword,
  type RankCheck,
} from "@/features/competitor/competitorData";
import type { Device, RankCheckResult } from "@/lib/naver-serp/rankChecker";
import {
  ALL_SECTIONS,
  COLLECT_LABEL,
  SHOP_KIND_LABEL,
  normalizeSections,
  snapshotHas,
  thumbUrl,
  type CollectSection,
  type ShopItem,
  type ShopSection,
} from "@/lib/naver-serp/shopping";

type LatestMap = Record<string, Partial<Record<Device, RankCheck>>>;

const DEVICES: Device[] = ["pc", "mobile"];
const DEVICE_LABEL: Record<Device, string> = { pc: "PC", mobile: "모바일" };

const INTERVAL_OPTIONS: { label: string; value: CheckIntervalHours }[] = [
  { label: "수동", value: null },
  { label: "1시간마다", value: 1 },
  { label: "6시간마다", value: 6 },
  { label: "12시간마다", value: 12 },
  { label: "매일", value: 24 },
  { label: "매주", value: 168 },
];

const EXPORT_PERIODS: { label: string; days: number | null }[] = [
  { label: "최근 1일", days: 1 },
  { label: "최근 7일", days: 7 },
  { label: "최근 30일", days: 30 },
  { label: "전체 기간", days: null },
];

const MIGRATION_HINT_0036 = "수집 항목 선택은 DB 업데이트(0036_competitor_collect_sections.sql)를 Supabase SQL Editor에서 실행한 뒤에 쓸 수 있어요.";
const MIGRATION_HINT = "DB 업데이트(마이그레이션 0035_competitor_monitor_v2.sql)를 Supabase SQL Editor에서 먼저 실행해 주세요.";

function intervalToSelectValue(hours: CheckIntervalHours): string {
  return hours === null ? "manual" : String(hours);
}

function selectValueToInterval(value: string): CheckIntervalHours {
  return value === "manual" ? null : (Number(value) as CheckIntervalHours);
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function won(n: number | null) {
  return n == null ? "" : `${n.toLocaleString("ko-KR")}원`;
}

function Badge({ tone, children, title }: { tone: "good" | "signal" | "muted" | "faint"; children: React.ReactNode; title?: string }) {
  const cls = {
    good: "bg-good/10 text-good font-semibold",
    signal: "bg-signal-soft text-signal font-semibold",
    muted: "text-ink-muted",
    faint: "text-ink-faint",
  }[tone];
  return (
    <span title={title} className={`inline-flex h-6 min-w-[36px] items-center justify-center whitespace-nowrap rounded-md px-1.5 text-[13px] ${cls}`}>
      {children}
    </span>
  );
}

function rankBadge(rank: number | null | undefined, opts: { hasTarget: boolean; outLabel: string }) {
  if (!opts.hasTarget) return <Badge tone="faint" title="타겟을 입력하지 않아 수집만 해요">수집만</Badge>;
  if (rank == null) return <Badge tone="muted">{opts.outLabel}</Badge>;
  return <Badge tone={rank <= 3 ? "good" : "signal"}>{rank}위</Badge>;
}

// 키워드가 지금 그 영역을 수집하지 않으면 회색 '수집 안 함'
const OFF = <Badge tone="faint" title="이 키워드는 이 영역을 수집하지 않아요">수집 안 함</Badge>;

// 파워링크 칸
function PowerLinkCell({ k, check }: { k: CompetitorKeyword; check?: RankCheck }) {
  if (!sectionsOf(k).includes("powerlink")) return OFF;
  if (!check) return <Badge tone="faint">-</Badge>;
  if (!snapshotHas(check.shopping_snapshot, "powerlink")) return <Badge tone="faint" title="최근 확인 때는 수집하지 않았어요. 다시 확인하면 수집돼요">-</Badge>;
  if (!k.target_domain) return <Badge tone="faint" title="타겟 도메인을 입력하지 않아 수집만 해요">{check.ads_snapshot.length}개</Badge>;
  return rankBadge(check.matched_rank, { hasTarget: true, outLabel: "10위 밖" });
}

// 가격비교·플러스 스토어 칸
function ShopCell({ k, check, section }: { k: CompetitorKeyword; check?: RankCheck; section: ShopSection }) {
  if (!sectionsOf(k).includes(section)) return OFF;
  if (!check) return <Badge tone="faint">-</Badge>;
  const shop = check.shopping_snapshot;
  if (!shop || !snapshotHas(shop, section)) return <Badge tone="faint" title="최근 확인 때는 수집하지 않았어요. 다시 확인하면 수집돼요">-</Badge>;
  const items = shop[section] ?? [];
  if (items.length === 0) return <Badge tone="faint" title="이 키워드 검색 결과에 해당 영역이 없어요">영역 없음</Badge>;
  const hasTarget = !!(k.target_domain || k.target_mall);
  if (!hasTarget) return <Badge tone="faint" title="타겟을 입력하지 않아 수집만 해요">{items.length}개</Badge>;
  return rankBadge(section === "price" ? shop.priceRank : shop.storeRank, { hasTarget, outLabel: "순위 밖" });
}

function sectionsOf(k: CompetitorKeyword): CollectSection[] {
  return normalizeSections(k.collect_sections);
}

// 수집 영역 체크박스 3개(최소 1개)
function SectionChecks({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: CollectSection[];
  onChange: (v: CollectSection[]) => void;
  disabled?: boolean;
  compact?: boolean; // 표 행 안 — 줄바꿈 없이 작게
}) {
  return (
    <div className={`flex items-center ${compact ? "shrink-0 gap-1" : "flex-wrap gap-1.5"}`}>
      {ALL_SECTIONS.map((sec) => {
        const on = value.includes(sec);
        const last = on && value.length === 1;
        return (
          <label
            key={sec}
            title={last ? "최소 한 영역은 수집해야 해요" : undefined}
            className={`flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-lg border ${compact ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[13px]"} ${
              on ? "border-signal/40 bg-signal-soft text-signal" : "border-line bg-surface text-ink-muted"
            } ${disabled || last ? "cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={disabled || last}
              onChange={() => onChange(on ? value.filter((x) => x !== sec) : ALL_SECTIONS.filter((x) => x === sec || value.includes(x)))}
              className="h-3.5 w-3.5"
            />
            {COLLECT_LABEL[sec]}
          </label>
        );
      })}
    </div>
  );
}

function ShopGrid({ items, myRank }: { items: ShopItem[]; myRank: number | null }) {
  if (items.length === 0) return <p className="text-[13px] text-ink-muted">이 검색 결과에는 영역이 없어요.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
      {items.map((it) => (
        <a
          key={`${it.position}-${it.title}`}
          href={it.url || undefined}
          target="_blank"
          rel="noreferrer"
          className={`flex gap-2 rounded-lg border bg-surface p-2 transition hover:bg-canvas ${it.position === myRank ? "border-signal ring-1 ring-signal" : "border-line"}`}
        >
          {it.imageUrl ? (
            // 네이버 이미지 서버는 외부 리퍼러를 막을 수 있어 리퍼러 없이 요청
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl(it.imageUrl)} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-16 w-16 shrink-0 rounded-md bg-canvas object-cover" />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-md bg-canvas" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[12px] text-ink-muted">
              <span className="font-semibold text-ink">{it.position}</span>
              <span className={`whitespace-nowrap rounded px-1 ${it.kind === "ad" ? "bg-warn/10 text-warn" : "bg-canvas"}`}>{SHOP_KIND_LABEL[it.kind]}</span>
            </div>
            <p className="line-clamp-2 text-[13px] leading-snug text-ink" title={it.title}>{it.title}</p>
            <p className="truncate text-[12px] text-ink-muted">{it.mall}</p>
            <p className="text-[13px] font-semibold tabular-nums text-ink">{won(it.price)}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function DetailPanel({ k, checks }: { k: CompetitorKeyword; checks?: Partial<Record<Device, RankCheck>> }) {
  const [device, setDevice] = useState<Device>("pc");
  const check = checks?.[device];
  const shop = check?.shopping_snapshot;
  return (
    <div className="space-y-4 bg-canvas/60 px-4 py-4">
      <div className="flex items-center gap-2">
        {DEVICES.map((d) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={`h-8 rounded-lg border px-3 text-[13px] font-medium ${device === d ? "border-signal bg-signal-soft text-signal" : "border-line bg-surface text-ink-soft"}`}
          >
            {DEVICE_LABEL[d]}
          </button>
        ))}
        {check && <span className="text-[13px] text-ink-muted">{fmtTime(check.checked_at)} 확인</span>}
      </div>
      {!check ? (
        <p className="text-[13px] text-ink-muted">아직 확인 기록이 없어요. &quot;확인&quot;을 눌러 주세요.</p>
      ) : (
        <>
          {snapshotHas(shop, "powerlink") && (
            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">파워링크 상위 {check.ads_snapshot.length}개</h4>
              {check.ads_snapshot.length === 0 ? (
                <p className="text-[13px] text-ink-muted">노출된 파워링크가 없어요.</p>
              ) : (
                <ol className="grid gap-1 text-[13px] md:grid-cols-2">
                  {check.ads_snapshot.map((ad) => (
                    <li key={ad.rank} className={`flex gap-2 rounded-md px-2 py-1 ${ad.rank === check.matched_rank ? "bg-signal-soft" : ""}`}>
                      <span className="w-5 shrink-0 text-right font-semibold text-ink">{ad.rank}</span>
                      <span className="min-w-0 truncate text-ink" title={ad.description}>{ad.business || ad.title}</span>
                      <span className="shrink-0 text-ink-muted">{ad.domain}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          {!shop && <p className="text-[13px] text-ink-muted">이 기록은 개편 전에 확인한 것이라 가격비교·플러스 스토어가 없어요. 다시 확인하면 수집돼요.</p>}
          {shop && snapshotHas(shop, "price") && (
            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">네이버 가격비교 {shop.price?.length ? `${shop.price.length}개` : ""}</h4>
              <ShopGrid items={shop.price ?? []} myRank={shop.priceRank ?? null} />
            </section>
          )}
          {shop && snapshotHas(shop, "store") && (
            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">네이버플러스 스토어 {shop.store?.length ? `${shop.store.length}개` : ""}</h4>
              <ShopGrid items={shop.store ?? []} myRank={shop.storeRank ?? null} />
            </section>
          )}
        </>
      )}
      {(k.target_domain || k.target_mall) && (
        <p className="text-[12px] text-ink-muted">테두리 강조 = 타겟({[k.target_domain, k.target_mall].filter(Boolean).join(" · ")})과 일치한 상품</p>
      )}
    </div>
  );
}

export default function CompetitorMonitorPage() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;

  const [keywords, setKeywords] = useState<CompetitorKeyword[]>([]);
  const [latest, setLatest] = useState<LatestMap>({});
  const [listLoading, setListLoading] = useState(true);

  const [newKeyword, setNewKeyword] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newMall, setNewMall] = useState("");
  const [newInterval, setNewInterval] = useState<CheckIntervalHours>(24);
  const [newSections, setNewSections] = useState<CollectSection[]>(ALL_SECTIONS);
  const [bulkSections, setBulkSections] = useState<CollectSection[] | null>(null); // null = 일괄 변경 팝오버 닫힘
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [exportDays, setExportDays] = useState<number | null>(7);

  const reload = useCallback(async () => {
    if (!clientId) {
      setKeywords([]);
      setLatest({});
      setListLoading(false);
      return;
    }
    setListLoading(true);
    const rows = await listKeywords(clientId);
    setKeywords(rows);
    setPicked((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
    setLatest(await listLatestChecks(rows.map((r) => r.id)));
    setListLoading(false);
  }, [clientId]);

  useEffect(() => {
    setPicked(new Set());
    setExpanded(null);
    reload();
  }, [reload]);

  const pickedIds = useMemo(() => keywords.filter((k) => picked.has(k.id)).map((k) => k.id), [keywords, picked]);
  const allPicked = keywords.length > 0 && pickedIds.length === keywords.length;
  const somePicked = pickedIds.length > 0 && !allPicked;
  const headBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headBox.current) headBox.current.indeterminate = somePicked;
  }, [somePicked]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (!clientId) return;
    const keyword = newKeyword.trim();
    if (!keyword) {
      setAddError("키워드를 입력해 주세요.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const { data, error } = await addKeyword({
        clientId,
        keyword,
        targetDomain: newDomain.trim() || null,
        targetMall: newMall.trim() || null,
        collectSections: newSections,
        checkIntervalHours: newInterval,
      });
      if (error) {
        if (error.message.includes("duplicate")) throw new Error("이미 등록된 키워드예요.");
        if (/collect_sections/.test(error.message)) throw new Error(MIGRATION_HINT_0036);
        if (/target_domain|target_mall|null value/.test(error.message)) throw new Error(MIGRATION_HINT);
        throw new Error(error.message);
      }
      setKeywords((prev) => [data as CompetitorKeyword, ...prev]);
      setNewKeyword("");
      setNewDomain("");
      setNewMall("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "키워드 추가에 실패했어요.");
    } finally {
      setAdding(false);
    }
  }

  // 한 키워드 확인. 네이버 이용 제한이면 true를 돌려 일괄 확인을 멈춘다.
  async function runCheck(id: string): Promise<boolean> {
    setChecking((prev) => new Set(prev).add(id));
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/naver-serp/rank-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRowError((prev) => ({ ...prev, [id]: json.error || "확인에 실패했어요." }));
        return !!json.blocked;
      }
      const results = json as Record<Device, RankCheckResult> & { sections?: CollectSection[] };
      const sections = normalizeSections(results.sections);
      const toCheck = (r: RankCheckResult): RankCheck => ({
        id: crypto.randomUUID(),
        keyword_id: id,
        device: r.device,
        matched_rank: r.matchedRank,
        ads_snapshot: r.ads,
        shopping_snapshot: {
          sections,
          ...(sections.includes("price") && r.shopping ? { price: r.shopping.price, priceRank: r.shopping.priceRank } : {}),
          ...(sections.includes("store") && r.shopping ? { store: r.shopping.store, storeRank: r.shopping.storeRank } : {}),
        },
        checked_at: r.checkedAt,
      });
      setLatest((prev) => ({ ...prev, [id]: { pc: toCheck(results.pc), mobile: toCheck(results.mobile) } }));
      return false;
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "확인에 실패했어요." }));
      return false;
    } finally {
      setChecking((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function bulkCheck() {
    setBulkBusy("check");
    setNotice(null);
    for (const id of pickedIds) {
      const blocked = await runCheck(id);
      if (blocked) {
        setNotice({ tone: "bad", text: "네이버가 검색을 잠시 제한해 나머지 키워드 확인을 멈췄어요. 잠시 뒤 다시 확인해 주세요." });
        break;
      }
    }
    setBulkBusy(null);
  }

  async function bulkPause(paused: boolean, ids = pickedIds) {
    if (ids.length === 0) return;
    setBulkBusy(paused ? "pause" : "resume");
    setNotice(null);
    const { error } = await setAutoPaused(ids, paused);
    if (error) {
      setNotice({ tone: "bad", text: /auto_paused/.test(error.message) ? MIGRATION_HINT : `자동 체크 ${paused ? "중지" : "재개"}에 실패했어요. (${error.message})` });
    } else {
      setKeywords((prev) => prev.map((k) => (ids.includes(k.id) ? { ...k, auto_paused: paused } : k)));
    }
    setBulkBusy(null);
  }

  async function changeSections(ids: string[], sections: CollectSection[]) {
    if (ids.length === 0 || sections.length === 0) return;
    const before = keywords;
    setKeywords((prev) => prev.map((k) => (ids.includes(k.id) ? { ...k, collect_sections: sections } : k)));
    const { error } = await updateCollectSections(ids, sections);
    if (error) {
      setKeywords(before);
      setNotice({ tone: "bad", text: /collect_sections/.test(error.message) ? MIGRATION_HINT_0036 : `수집 항목 변경에 실패했어요. (${error.message})` });
    }
  }

  async function changeInterval(ids: string[], hours: CheckIntervalHours) {
    if (ids.length === 0) return;
    setKeywords((prev) => prev.map((k) => (ids.includes(k.id) ? { ...k, check_interval_hours: hours } : k)));
    const { error } = await updateCheckInterval(ids, hours);
    if (error) setNotice({ tone: "bad", text: `체크 주기 변경에 실패했어요. (${error.message})` });
  }

  async function bulkDelete() {
    if (pickedIds.length === 0) return;
    const names = keywords.filter((k) => picked.has(k.id)).map((k) => k.keyword);
    if (!confirm(`키워드 ${names.length}개를 삭제할까요? 체크 이력도 함께 삭제돼요.\n\n${names.slice(0, 10).join(", ")}${names.length > 10 ? " 외" : ""}`)) return;
    setBulkBusy("delete");
    const { error } = await deleteKeywords(pickedIds);
    if (error) {
      setNotice({ tone: "bad", text: `삭제에 실패했어요. (${error.message})` });
    } else {
      setKeywords((prev) => prev.filter((k) => !picked.has(k.id)));
      setPicked(new Set());
    }
    setBulkBusy(null);
  }

  async function bulkExport() {
    if (pickedIds.length === 0) return;
    setBulkBusy("export");
    setNotice(null);
    try {
      const res = await fetch("/api/naver-serp/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: pickedIds, days: exportDays, clientName: selected?.name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "엑셀 내보내기에 실패했어요.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CTCH_경쟁사모니터링${selected?.name ? `_${selected.name}` : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setNotice({ tone: "bad", text: e instanceof Error ? e.message : "엑셀 내보내기에 실패했어요." });
    } finally {
      setBulkBusy(null);
    }
  }

  if (!clientId) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="text-[15px] text-ink-muted">먼저 상단에서 광고주를 선택해 주세요.</p>
        </div>
      </div>
    );
  }

  const none = pickedIds.length === 0;
  const busy = bulkBusy !== null;
  const toolBtn =
    "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft transition hover:bg-canvas disabled:opacity-40";
  const spin = (key: string, icon: string) => `ti ${bulkBusy === key ? "ti-loader-2 animate-spin" : icon} text-[15px]`;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-3 text-[16px] font-semibold text-ink">감시 키워드 추가</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="키워드 (필수, 예: 이사업체)"
            className="field h-10 min-w-[180px] flex-1"
          />
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="타겟 도메인 (선택, 예: example.com)"
            className="field h-10 min-w-[200px] flex-1"
          />
          <input
            value={newMall}
            onChange={(e) => setNewMall(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="타겟 몰·브랜드 (선택, 예: 르무통)"
            className="field h-10 min-w-[180px] flex-1"
          />
          <select
            value={intervalToSelectValue(newInterval)}
            onChange={(e) => setNewInterval(selectValueToInterval(e.target.value))}
            className="field h-10 w-[120px] shrink-0"
            title="자동 체크 주기"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.label} value={intervalToSelectValue(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
          <button onClick={handleAdd} disabled={adding} className="btn-signal h-10">
            <i className={`ti ${adding ? "ti-loader-2 animate-spin" : "ti-plus"} text-[17px]`} aria-hidden />
            추가
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-ink-soft">수집할 영역</span>
          <SectionChecks value={newSections} onChange={setNewSections} />
        </div>
        {addError && <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{addError}</p>}
        <p className="mt-2 text-[13px] text-ink-muted">
          네이버 검색결과에서 <b className="font-semibold text-ink-soft">파워링크 상위 10개 · 네이버 가격비교 · 네이버플러스 스토어</b>(상품 이미지·가격·판매처 포함) 중 고른 영역만 PC·모바일로 수집해요. 키워드마다 나중에 바꿀 수도 있어요.
          타겟은 선택 사항이에요 — 도메인을 넣으면 파워링크·쇼핑 상품 주소로, 몰·브랜드 이름을 넣으면 쇼핑 판매처·상품명으로 순위를 찾고, 둘 다 비우면 순위 없이 수집만 해요.
          키워드 줄을 펼치면 최신 결과를, &quot;엑셀로 내보내기&quot;에서 이력 전체(상품 이미지 포함)를 볼 수 있어요.
        </p>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold text-ink">
            감시 중인 키워드 {selected ? `— ${selected.name}` : ""} <span className="ml-1 text-[15px] font-normal text-ink-muted">{keywords.length}개</span>
          </h3>
        </div>

        {keywords.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas px-3 py-2">
            <span className={`text-[13px] font-semibold ${none ? "text-ink-muted" : "text-signal"}`}>
              {none ? "키워드를 체크해 작업을 고르세요" : `${pickedIds.length}개 선택`}
            </span>
            <button onClick={() => setPicked(new Set(keywords.map((k) => k.id)))} className="text-[13px] text-signal hover:underline">
              모두 선택
            </button>
            <span className="text-ink-faint">·</span>
            <button onClick={() => setPicked(new Set())} className="text-[13px] text-signal hover:underline">
              모두 해제
            </button>
            <span className="mx-1 h-5 w-px bg-line" />
            <button onClick={bulkCheck} disabled={none || busy || checking.size > 0} className={toolBtn}>
              <i className={spin("check", "ti-refresh")} aria-hidden />
              지금 확인
            </button>
            <button onClick={() => bulkPause(true)} disabled={none || busy} className={toolBtn}>
              <i className={spin("pause", "ti-player-pause")} aria-hidden />
              자동 체크 중지
            </button>
            <button onClick={() => bulkPause(false)} disabled={none || busy} className={toolBtn}>
              <i className={spin("resume", "ti-player-play")} aria-hidden />
              자동 체크 재개
            </button>
            <select
              value=""
              disabled={none || busy}
              onChange={(e) => e.target.value && changeInterval(pickedIds, selectValueToInterval(e.target.value))}
              className="field h-8 w-[130px] py-0 text-[13px] disabled:opacity-40"
              title="선택한 키워드의 자동 체크 주기 바꾸기"
            >
              <option value="">주기 일괄 변경</option>
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.label} value={intervalToSelectValue(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <button onClick={() => setBulkSections(bulkSections ? null : ALL_SECTIONS)} disabled={none || busy} className={toolBtn}>
                <i className="ti ti-list-check text-[15px]" aria-hidden />
                수집 항목 변경
              </button>
              {bulkSections && !none && (
                <div className="absolute left-0 top-10 z-20 w-max space-y-2 rounded-lg border border-line bg-surface p-3 shadow-lg">
                  <p className="text-[13px] text-ink-soft">선택한 {pickedIds.length}개 키워드가 수집할 영역</p>
                  <SectionChecks value={bulkSections} onChange={setBulkSections} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setBulkSections(null)} className="h-8 rounded-lg px-3 text-[13px] text-ink-muted hover:bg-canvas">
                      취소
                    </button>
                    <button
                      onClick={() => {
                        changeSections(pickedIds, bulkSections);
                        setBulkSections(null);
                      }}
                      className="btn-signal h-8 px-3 text-[13px]"
                    >
                      적용
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="mx-1 h-5 w-px bg-line" />
            <select
              value={exportDays ?? "all"}
              onChange={(e) => setExportDays(e.target.value === "all" ? null : Number(e.target.value))}
              className="field h-8 w-[110px] py-0 text-[13px]"
              title="엑셀에 넣을 이력 기간"
            >
              {EXPORT_PERIODS.map((p) => (
                <option key={p.label} value={p.days ?? "all"}>
                  {p.label}
                </option>
              ))}
            </select>
            <button onClick={bulkExport} disabled={none || busy} className={toolBtn}>
              <i className={spin("export", "ti-file-spreadsheet")} aria-hidden />
              엑셀로 내보내기
            </button>
            <button onClick={bulkDelete} disabled={none || busy} className={`${toolBtn} hover:border-bad/40 hover:bg-bad/5 hover:text-bad`}>
              <i className={spin("delete", "ti-trash")} aria-hidden />
              삭제
            </button>
          </div>
        )}

        {notice && (
          <p className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[15px] ${notice.tone === "bad" ? "border-bad/20 bg-bad/5 text-bad" : "border-line bg-canvas text-ink-soft"}`}>
            {notice.text}
          </p>
        )}

        {listLoading ? (
          <p className="py-8 text-center text-[15px] text-ink-muted">불러오는 중…</p>
        ) : keywords.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[15px] text-ink-muted">아직 등록된 감시 키워드가 없어요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[1360px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-[13px] text-ink-muted">
                  <th rowSpan={2} className="w-10 px-3 py-2">
                    <input
                      ref={headBox}
                      type="checkbox"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(keywords.map((k) => k.id)))}
                      className="h-4 w-4"
                      aria-label="모두 선택"
                    />
                  </th>
                  <th rowSpan={2} className="px-3 py-2 font-medium">키워드 · 타겟</th>
                  <th colSpan={2} className="border-l border-line px-3 pt-2 text-center font-medium">파워링크</th>
                  <th colSpan={2} className="border-l border-line px-3 pt-2 text-center font-medium">네이버 가격비교</th>
                  <th colSpan={2} className="border-l border-line px-3 pt-2 text-center font-medium">플러스 스토어</th>
                  <th rowSpan={2} className="border-l border-line px-3 py-2 font-medium">마지막 확인</th>
                  <th rowSpan={2} className="px-3 py-2 font-medium">자동 체크</th>
                  <th rowSpan={2} className="px-3 py-2" />
                </tr>
                <tr className="border-b border-line bg-canvas text-[12px] text-ink-muted">
                  {[0, 1, 2].map((g) =>
                    DEVICES.map((d) => (
                      <th key={`${g}-${d}`} className={`px-3 pb-2 text-center font-normal ${d === "pc" ? "border-l border-line" : ""}`}>
                        {DEVICE_LABEL[d]}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => {
                  const checks = latest[k.id];
                  const isChecking = checking.has(k.id);
                  const lastCheckedAt = checks?.pc?.checked_at ?? checks?.mobile?.checked_at;
                  const isOpen = expanded === k.id;
                  const paused = !!k.auto_paused;
                  const auto = k.check_interval_hours !== null;
                  return (
                    <Fragment key={k.id}>
                      <tr className={`border-b border-line hover:bg-canvas/60 ${picked.has(k.id) ? "bg-signal-soft/40" : ""}`}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={picked.has(k.id)}
                            onChange={() => togglePick(k.id)}
                            className="h-4 w-4"
                            aria-label={`${k.keyword} 선택`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <button onClick={() => setExpanded(isOpen ? null : k.id)} className="flex items-center gap-1 text-left font-medium text-ink hover:text-signal">
                                <i className={`ti ${isOpen ? "ti-chevron-down" : "ti-chevron-right"} text-[15px] text-ink-muted`} aria-hidden />
                                {k.keyword}
                              </button>
                              <p className="truncate pl-5 text-[12px] text-ink-muted">
                                {[k.target_domain, k.target_mall].filter(Boolean).join(" · ") || "타겟 없음(수집만)"}
                              </p>
                            </div>
                            <SectionChecks compact value={sectionsOf(k)} onChange={(v) => changeSections([k.id], v)} disabled={busy} />
                          </div>
                        </td>
                        {DEVICES.map((d) => (
                          <td key={`pl-${d}`} className={`px-3 py-3 text-center ${d === "pc" ? "border-l border-line" : ""}`}>
                            <PowerLinkCell k={k} check={checks?.[d]} />
                          </td>
                        ))}
                        {(["price", "store"] as ShopSection[]).map((s) =>
                          DEVICES.map((d) => (
                            <td key={`${s}-${d}`} className={`px-3 py-3 text-center ${d === "pc" ? "border-l border-line" : ""}`}>
                              <ShopCell k={k} check={checks?.[d]} section={s} />
                            </td>
                          )),
                        )}
                        <td className="whitespace-nowrap border-l border-line px-3 py-3 text-[13px] text-ink-muted">{fmtTime(lastCheckedAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={intervalToSelectValue(k.check_interval_hours)}
                              onChange={(e) => changeInterval([k.id], selectValueToInterval(e.target.value))}
                              className={`field h-8 py-0 text-[13px] ${paused ? "text-ink-faint line-through" : ""}`}
                            >
                              {INTERVAL_OPTIONS.map((opt) => (
                                <option key={opt.label} value={intervalToSelectValue(opt.value)}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {auto && (
                              <button
                                onClick={() => bulkPause(!paused, [k.id])}
                                disabled={busy}
                                title={paused ? "자동 체크 재개" : "자동 체크 중지(주기는 그대로 둠)"}
                                className={`flex h-8 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[12px] font-medium transition ${
                                  paused ? "border-warn/40 bg-warn/10 text-warn" : "border-line text-ink-muted hover:bg-canvas"
                                }`}
                              >
                                <i className={`ti ${paused ? "ti-player-play" : "ti-player-pause"} text-[14px]`} aria-hidden />
                                {paused ? "중지됨" : "중지"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => runCheck(k.id)}
                            disabled={isChecking || bulkBusy === "check"}
                            className="flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[13px] font-medium text-signal transition hover:bg-signal-soft disabled:opacity-50"
                          >
                            <i className={`ti ${isChecking ? "ti-loader-2 animate-spin" : "ti-search"} text-[15px]`} aria-hidden />
                            확인
                          </button>
                        </td>
                      </tr>
                      {rowError[k.id] && (
                        <tr>
                          <td colSpan={12} className="px-4 pb-2">
                            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2 text-[13px] text-bad">{rowError[k.id]}</p>
                          </td>
                        </tr>
                      )}
                      {isOpen && (
                        <tr className="border-b border-line">
                          <td colSpan={12} className="p-0">
                            <DetailPanel k={k} checks={checks} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[12px] text-ink-muted">
          자동 체크는 주기가 된 키워드만 서버가 골라 다시 확인해요. &quot;중지&quot;하면 주기 설정은 그대로 두고 자동 체크만 멈춰요(수동 확인은 계속 가능).
          네이버가 짧은 간격의 반복 검색을 막을 수 있어 요청 사이에 2.5초씩 쉬어요.
        </p>
      </div>
    </div>
  );
}
