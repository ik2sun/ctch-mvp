"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useClients } from "@/features/clients/ClientContext";
import {
  addKeyword,
  deleteKeyword,
  listCheckHistory,
  listKeywords,
  listLatestChecks,
  updateCheckInterval,
  type CheckIntervalHours,
  type CompetitorKeyword,
  type RankCheck,
} from "@/features/competitor/competitorData";
import type { Device, RankCheckResult } from "@/lib/naver-serp/rankChecker";

type LatestMap = Record<string, Partial<Record<Device, RankCheck>>>;

const DEVICE_LABEL: Record<Device, string> = { pc: "PC", mobile: "모바일" };

const INTERVAL_OPTIONS: { label: string; value: CheckIntervalHours }[] = [
  { label: "수동", value: null },
  { label: "6시간마다", value: 6 },
  { label: "12시간마다", value: 12 },
  { label: "매일", value: 24 },
  { label: "매주", value: 168 },
];

function intervalToSelectValue(hours: CheckIntervalHours): string {
  return hours === null ? "manual" : String(hours);
}

function selectValueToInterval(value: string): CheckIntervalHours {
  return value === "manual" ? null : (Number(value) as CheckIntervalHours);
}

function RankBadge({ check }: { check?: RankCheck }) {
  if (!check) return <span className="text-[15px] text-ink-faint">-</span>;
  if (check.matched_rank == null) {
    return <span className="text-[15px] text-ink-muted">10위 밖</span>;
  }
  const good = check.matched_rank <= 3;
  return (
    <span
      className={`inline-flex h-6 min-w-[36px] items-center justify-center rounded-md px-1.5 text-[15px] font-semibold ${
        good ? "bg-good/10 text-good" : "bg-signal-soft text-signal"
      }`}
    >
      {check.matched_rank}위
    </span>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CompetitorMonitorPage() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;

  const [keywords, setKeywords] = useState<CompetitorKeyword[]>([]);
  const [latest, setLatest] = useState<LatestMap>({});
  const [listLoading, setListLoading] = useState(true);

  const [newKeyword, setNewKeyword] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newInterval, setNewInterval] = useState<CheckIntervalHours>(24);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    setLatest(await listLatestChecks(rows.map((r) => r.id)));
    setListLoading(false);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAdd() {
    if (!clientId) return;
    const keyword = newKeyword.trim();
    const targetDomain = newDomain.trim();
    if (!keyword || !targetDomain) {
      setAddError("키워드와 타겟 도메인을 모두 입력해 주세요.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const { data, error } = await addKeyword({ clientId, keyword, targetDomain, checkIntervalHours: newInterval });
      if (error) throw new Error(error.message.includes("duplicate") ? "이미 등록된 키워드예요." : error.message);
      setKeywords((prev) => [data as CompetitorKeyword, ...prev]);
      setNewKeyword("");
      setNewDomain("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "키워드 추가에 실패했어요.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("이 키워드를 삭제할까요? 체크 이력도 함께 삭제돼요.")) return;
    await deleteKeyword(id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    setLatest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function runCheck(id: string) {
    setCheckingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/naver-serp/rank-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "순위 확인에 실패했어요.");
      const { pc, mobile } = json as { pc: RankCheckResult; mobile: RankCheckResult };
      setLatest((prev) => ({
        ...prev,
        [id]: {
          pc: { id: crypto.randomUUID(), keyword_id: id, device: "pc", matched_rank: pc.matchedRank, ads_snapshot: pc.ads, checked_at: pc.checkedAt },
          mobile: { id: crypto.randomUUID(), keyword_id: id, device: "mobile", matched_rank: mobile.matchedRank, ads_snapshot: mobile.ads, checked_at: mobile.checkedAt },
        },
      }));
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "순위 확인에 실패했어요." }));
    } finally {
      setCheckingId(null);
    }
  }

  async function handleIntervalChange(id: string, hours: CheckIntervalHours) {
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, check_interval_hours: hours } : k)));
    const { error } = await updateCheckInterval(id, hours);
    if (error) {
      setRowError((prev) => ({ ...prev, [id]: "체크 주기 변경에 실패했어요." }));
    }
  }

  async function runCheckAll() {
    setCheckingAll(true);
    for (const k of keywords) {
      await runCheck(k.id);
    }
    setCheckingAll(false);
  }

  async function handleExport() {
    if (keywords.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const history = await listCheckHistory(keywords.map((k) => k.id));
      const keywordById = new Map(keywords.map((k) => [k.id, k]));

      const header = ["확인일시", "키워드", "타겟 도메인", "순위", "업체명", "URL", "광고문구", "타겟 매칭"];
      const colWidths = [
        { wch: 16 },
        { wch: 16 },
        { wch: 20 },
        { wch: 6 },
        { wch: 20 },
        { wch: 24 },
        { wch: 50 },
        { wch: 8 },
      ];

      const wb = XLSX.utils.book_new();
      for (const device of ["pc", "mobile"] as Device[]) {
        const rows: (string | number)[][] = [header];
        for (const check of history) {
          if (check.device !== device) continue;
          const kw = keywordById.get(check.keyword_id);
          if (!kw) continue;
          const checkedAt = new Date(check.checked_at).toLocaleString("ko-KR");
          if (check.ads_snapshot.length === 0) {
            rows.push([checkedAt, kw.keyword, kw.target_domain, "", "", "", "노출된 파워링크 없음", ""]);
            continue;
          }
          for (const ad of check.ads_snapshot) {
            rows.push([
              checkedAt,
              kw.keyword,
              kw.target_domain,
              ad.rank,
              ad.business || ad.title || "",
              ad.domain,
              ad.description || ad.title || "",
              ad.rank === check.matched_rank ? "O" : "",
            ]);
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, DEVICE_LABEL[device]);
      }

      const clientLabel = selected?.name ? `_${selected.name}` : "";
      const dateLabel = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `CTCH_경쟁사모니터링${clientLabel}_${dateLabel}.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "엑셀 내보내기에 실패했어요.");
    } finally {
      setExporting(false);
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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-3 text-[16px] font-semibold text-ink">감시 키워드 추가</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="키워드 (예: 이사업체)"
            className="field h-10 min-w-[180px] flex-1"
          />
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="타겟 도메인 (예: example.com)"
            className="field h-10 min-w-[200px] flex-1"
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
        {addError && (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{addError}</p>
        )}
        <p className="mt-2 text-[13px] text-ink-faint">
          네이버 검색결과의 파워링크(검색광고) 상위 10위 전체를 실시간으로 확인해요. 화면에는 타겟 도메인의 노출 성공 여부와 순위만 보여주고,
          상위 10개 전체(업체명·URL·광고문구)는 &quot;엑셀로 내보내기&quot;에서 확인할 수 있어요. 상위 10위 안에 없으면 &quot;10위 밖&quot;으로 표시돼요.
          자동 체크 주기를 설정하면 매시 정각에 서버가 주기가 된 키워드만 골라 자동으로 다시 확인해요.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-ink">감시 중인 키워드 {selected ? `— ${selected.name}` : ""}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[15px] text-ink-muted">{keywords.length}개</span>
            {keywords.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-soft transition hover:bg-canvas disabled:opacity-50"
                >
                  <i className={`ti ${exporting ? "ti-loader-2 animate-spin" : "ti-file-spreadsheet"} text-[15px]`} aria-hidden />
                  엑셀로 내보내기
                </button>
                <button
                  onClick={runCheckAll}
                  disabled={checkingAll || checkingId !== null}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-soft transition hover:bg-canvas disabled:opacity-50"
                >
                  <i className={`ti ${checkingAll ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
                  전체 확인
                </button>
              </>
            )}
          </div>
        </div>

        {exportError && (
          <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{exportError}</p>
        )}

        {listLoading ? (
          <p className="py-8 text-center text-[15px] text-ink-muted">불러오는 중…</p>
        ) : keywords.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[15px] text-ink-muted">아직 등록된 감시 키워드가 없어요.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-[13px] text-ink-muted">
                  <th className="px-4 py-2.5 font-medium">키워드</th>
                  <th className="px-4 py-2.5 font-medium">타겟 도메인</th>
                  <th className="px-4 py-2.5 font-medium">PC 순위</th>
                  <th className="px-4 py-2.5 font-medium">모바일 순위</th>
                  <th className="px-4 py-2.5 font-medium">마지막 확인</th>
                  <th className="px-4 py-2.5 font-medium">자동 체크</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => {
                  const checks = latest[k.id];
                  const isChecking = checkingId === k.id;
                  const lastCheckedAt = checks?.pc?.checked_at ?? checks?.mobile?.checked_at;
                  return (
                    <Fragment key={k.id}>
                      <tr className="border-b border-line last:border-0 hover:bg-canvas/60">
                        <td className="px-4 py-3 font-medium text-ink">{k.keyword}</td>
                        <td className="px-4 py-3 text-ink-soft">{k.target_domain}</td>
                        <td className="px-4 py-3">
                          <RankBadge check={checks?.pc} />
                        </td>
                        <td className="px-4 py-3">
                          <RankBadge check={checks?.mobile} />
                        </td>
                        <td className="px-4 py-3 text-[13px] text-ink-muted">{fmtTime(lastCheckedAt)}</td>
                        <td className="px-4 py-3">
                          <select
                            value={intervalToSelectValue(k.check_interval_hours)}
                            onChange={(e) => handleIntervalChange(k.id, selectValueToInterval(e.target.value))}
                            className="field h-8 py-0 text-[13px]"
                          >
                            {INTERVAL_OPTIONS.map((opt) => (
                              <option key={opt.label} value={intervalToSelectValue(opt.value)}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => runCheck(k.id)}
                              disabled={isChecking || checkingAll}
                              className="flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-signal transition hover:bg-signal-soft disabled:opacity-50"
                            >
                              <i className={`ti ${isChecking ? "ti-loader-2 animate-spin" : "ti-search"} text-[15px]`} aria-hidden />
                              확인
                            </button>
                            <button
                              onClick={() => handleRemove(k.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-bad/10 hover:text-bad"
                              title="삭제"
                            >
                              <i className="ti ti-trash text-[15px]" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {rowError[k.id] && (
                        <tr key={`${k.id}-error`}>
                          <td colSpan={7} className="px-4 pb-2">
                            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2 text-[13px] text-bad">
                              {rowError[k.id]}
                            </p>
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
      </div>
    </div>
  );
}
