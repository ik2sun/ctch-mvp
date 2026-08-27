"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useClients } from "@/features/clients/ClientContext";
import {
  addKeyword,
  deleteKeyword,
  listAlerts,
  listCheckHistory,
  listKeywords,
  listLatestChecks,
  updateAlertEmail,
  updateCheckInterval,
  type BrandKeyword,
  type BrandKeywordAlert,
  type BrandKeywordCheck,
  type CheckIntervalHours,
} from "@/features/brand-keyword/brandKeywordData";
import type { Device } from "@/lib/naver-serp/rankChecker";
import type { BrandCheckResult } from "@/lib/naver-serp/runBrandCheck";
import { parseEmailList } from "@/lib/utils/email";
import { BulkKeywordUpload } from "@/features/brand-keyword/BulkKeywordUpload";

type LatestMap = Record<string, Partial<Record<Device, BrandKeywordCheck>>>;

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

function StatusBadge({ check }: { check?: BrandKeywordCheck }) {
  if (!check) return <span className="text-[13px] text-ink-faint">-</span>;
  if (check.ads_snapshot.length === 0) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-md bg-line/40 px-1.5 text-[13px] font-medium text-ink-faint">
        미노출
      </span>
    );
  }
  const infringingCount = check.infringing_ads.length;
  const ownerCount = check.ads_snapshot.length - infringingCount;
  const domains = Array.from(new Set(check.infringing_ads.map((a) => a.domain)));
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {ownerCount > 0 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md bg-good/10 px-1.5 text-[13px] font-semibold text-good">
            <i className="ti ti-shield-check text-[13px]" aria-hidden />
            {ownerCount} (광고주)
          </span>
        )}
        {infringingCount > 0 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md bg-bad/10 px-1.5 text-[13px] font-semibold text-bad">
            <i className="ti ti-alert-triangle text-[13px]" aria-hidden />
            {infringingCount}
          </span>
        )}
      </div>
      {domains.length > 0 && <span className="text-[11px] text-ink-faint">{domains.join(", ")}</span>}
    </div>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function BrandKeywordMonitorPage() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;

  const [keywords, setKeywords] = useState<BrandKeyword[]>([]);
  const [latest, setLatest] = useState<LatestMap>({});
  const [alerts, setAlerts] = useState<BrandKeywordAlert[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [newKeyword, setNewKeyword] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newInterval, setNewInterval] = useState<CheckIntervalHours>(24);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [showBulk, setShowBulk] = useState(false);

  const reload = useCallback(async () => {
    if (!clientId) {
      setKeywords([]);
      setLatest({});
      setAlerts([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    const rows = await listKeywords(clientId);
    setKeywords(rows);
    const ids = rows.map((r) => r.id);
    setLatest(await listLatestChecks(ids));
    setAlerts(await listAlerts(ids));
    setListLoading(false);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAdd() {
    if (!clientId) return;
    const keyword = newKeyword.trim();
    const ownerDomain = newDomain.trim();
    if (!keyword || !ownerDomain || !newEmail.trim()) {
      setAddError("키워드, 광고주 도메인, 담당자 메일을 모두 입력해 주세요.");
      return;
    }
    const emails = parseEmailList(newEmail);
    if (!emails) {
      setAddError("담당자 메일 형식이 올바르지 않아요. 여러 명은 콤마(,)로 구분해 주세요.");
      return;
    }
    const alertEmail = emails.join(", ");
    setAdding(true);
    setAddError(null);
    try {
      const { data, error } = await addKeyword({ clientId, keyword, ownerDomain, alertEmail, checkIntervalHours: newInterval });
      if (error) throw new Error(error.message.includes("duplicate") ? "이미 등록된 키워드예요." : error.message);
      setKeywords((prev) => [data as BrandKeyword, ...prev]);
      setNewKeyword("");
      setNewDomain("");
      setNewEmail("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "키워드 추가에 실패했어요.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("이 키워드를 삭제할까요? 체크·알림 이력도 함께 삭제돼요.")) return;
    await deleteKeyword(id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    setLatest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setAlerts((prev) => prev.filter((a) => a.keyword_id !== id));
  }

  async function runCheck(id: string) {
    setCheckingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/naver-serp/brand-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "확인에 실패했어요.");
      const { pc, mobile } = json as { pc: BrandCheckResult; mobile: BrandCheckResult };
      // 침해 여부는 서버가 domainMatches로 판정해 DB에 저장한 값을 그대로 쓴다(www·모바일 서브도메인
      // 정규화가 필요해서 클라이언트에서 단순 문자열 비교로 다시 계산하면 오판이 생긴다).
      const toCheck = (r: BrandCheckResult): BrandKeywordCheck => ({
        id: crypto.randomUUID(),
        keyword_id: id,
        device: r.device,
        owner_matched_rank: r.ownerMatchedRank,
        ads_snapshot: r.ads,
        infringing_ads: r.infringingAds,
        checked_at: r.checkedAt,
      });
      setLatest((prev) => ({ ...prev, [id]: { pc: toCheck(pc), mobile: toCheck(mobile) } }));
      if (clientId) setAlerts(await listAlerts(keywords.map((k) => k.id)));
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "확인에 실패했어요." }));
    } finally {
      setCheckingId(null);
    }
  }

  function startEditEmail(k: BrandKeyword) {
    setEditingEmailId(k.id);
    setEditEmailValue(k.alert_email);
    setRowError((prev) => ({ ...prev, [k.id]: "" }));
  }

  function cancelEditEmail() {
    setEditingEmailId(null);
    setEditEmailValue("");
  }

  async function saveEditEmail(id: string) {
    const emails = parseEmailList(editEmailValue);
    if (!emails) {
      setRowError((prev) => ({ ...prev, [id]: "담당자 메일 형식이 올바르지 않아요. 여러 명은 콤마(,)로 구분해 주세요." }));
      return;
    }
    const alertEmail = emails.join(", ");
    setSavingEmail(true);
    try {
      const { error } = await updateAlertEmail(id, alertEmail);
      if (error) throw new Error(error.message);
      setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, alert_email: alertEmail } : k)));
      setEditingEmailId(null);
      setEditEmailValue("");
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "담당자 메일 수정에 실패했어요." }));
    } finally {
      setSavingEmail(false);
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

      const header = ["확인일시", "키워드", "광고주 도메인", "순위", "업체명", "URL", "광고문구", "침해여부"];
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
            rows.push([checkedAt, kw.keyword, kw.owner_domain, "", "", "", "노출된 파워링크 없음", ""]);
            continue;
          }
          const infringingDomains = new Set(check.infringing_ads.map((a) => a.domain));
          for (const ad of check.ads_snapshot) {
            rows.push([
              checkedAt,
              kw.keyword,
              kw.owner_domain,
              ad.rank,
              ad.business || ad.title || "",
              ad.domain,
              ad.description || ad.title || "",
              infringingDomains.has(ad.domain) ? "O" : "",
            ]);
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, DEVICE_LABEL[device]);
      }

      const clientLabel = selected?.name ? `_${selected.name}` : "";
      const dateLabel = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `CTCH_브랜드키워드모니터링${clientLabel}_${dateLabel}.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "엑셀 내보내기에 실패했어요.");
    } finally {
      setExporting(false);
    }
  }

  if (!clientId) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">먼저 상단에서 광고주를 선택해 주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">감시 브랜드 키워드 추가</h3>
          <button
            onClick={() => setShowBulk((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-soft transition hover:bg-canvas"
          >
            <i className="ti ti-file-spreadsheet text-[14px]" aria-hidden />
            엑셀로 일괄 등록
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="브랜드 키워드 (예: 캐치이사)"
            className="field h-10 min-w-[160px] flex-1"
          />
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="광고주 도메인 (예: example.com)"
            className="field h-10 min-w-[180px] flex-1"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="담당자 메일 (여러 명은 콤마로 구분)"
            type="email"
            multiple
            className="field h-10 min-w-[220px] flex-1"
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
            <i className={`ti ${adding ? "ti-loader-2 animate-spin" : "ti-plus"} text-[16px]`} aria-hidden />
            추가
          </button>
        </div>
        {addError && (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{addError}</p>
        )}
        <p className="mt-2 text-[11px] text-ink-faint">
          등록한 브랜드 키워드의 네이버 파워링크 상위 10위를 PC·모바일 모두 확인해서, 광고주 도메인이 아닌 타사 광고가
          노출되면 &quot;침해&quot;로 표시하고 담당자 메일로 알려드려요. 같은 타사가 계속 노출 중이면 재발송하지 않고,
          새로운 타사가 추가로 나타날 때만 다시 알려요. 자동 체크 주기를 설정하면 매시 정각에 서버가 자동으로 다시 확인해요.
          담당자 메일은 여러 명 등록할 수 있고, 등록 후에도 목록의 연필 아이콘으로 언제든 수정할 수 있어요.
        </p>
      </div>

      {showBulk && clientId && (
        <BulkKeywordUpload
          clientId={clientId}
          existingKeywords={keywords}
          onClose={() => setShowBulk(false)}
          onAdded={reload}
        />
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">감시 중인 브랜드 키워드 {selected ? `— ${selected.name}` : ""}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-muted">{keywords.length}개</span>
            {keywords.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-soft transition hover:bg-canvas disabled:opacity-50"
                >
                  <i className={`ti ${exporting ? "ti-loader-2 animate-spin" : "ti-file-spreadsheet"} text-[14px]`} aria-hidden />
                  엑셀로 내보내기
                </button>
                <button
                  onClick={runCheckAll}
                  disabled={checkingAll || checkingId !== null}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-soft transition hover:bg-canvas disabled:opacity-50"
                >
                  <i className={`ti ${checkingAll ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[14px]`} aria-hidden />
                  전체 확인
                </button>
              </>
            )}
          </div>
        </div>

        {exportError && (
          <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{exportError}</p>
        )}

        {listLoading ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">불러오는 중…</p>
        ) : keywords.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[14px] text-ink-muted">아직 등록된 감시 키워드가 없어요.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-[11px] text-ink-muted">
                  <th className="px-4 py-2.5 font-medium">키워드</th>
                  <th className="px-4 py-2.5 font-medium">광고주 도메인</th>
                  <th className="px-4 py-2.5 font-medium">담당자 메일</th>
                  <th className="px-4 py-2.5 font-medium">PC</th>
                  <th className="px-4 py-2.5 font-medium">모바일</th>
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
                        <td className="px-4 py-3 text-ink-soft">{k.owner_domain}</td>
                        <td className="px-4 py-3 text-ink-soft">
                          {editingEmailId === k.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={editEmailValue}
                                onChange={(e) => setEditEmailValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEditEmail(k.id);
                                  if (e.key === "Escape") cancelEditEmail();
                                }}
                                placeholder="담당자 메일 (여러 명은 콤마로 구분)"
                                autoFocus
                                className="field h-8 min-w-[180px] py-0 text-[12px]"
                              />
                              <button
                                onClick={() => saveEditEmail(k.id)}
                                disabled={savingEmail}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-signal transition hover:bg-signal-soft disabled:opacity-50"
                                title="저장"
                              >
                                <i className={`ti ${savingEmail ? "ti-loader-2 animate-spin" : "ti-check"} text-[14px]`} aria-hidden />
                              </button>
                              <button
                                onClick={cancelEditEmail}
                                disabled={savingEmail}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-canvas disabled:opacity-50"
                                title="취소"
                              >
                                <i className="ti ti-x text-[14px]" aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>{k.alert_email}</span>
                              <button
                                onClick={() => startEditEmail(k)}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition hover:bg-canvas hover:text-ink-soft"
                                title="담당자 메일 수정"
                              >
                                <i className="ti ti-pencil text-[13px]" aria-hidden />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge check={checks?.pc} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge check={checks?.mobile} />
                        </td>
                        <td className="px-4 py-3 text-[12px] text-ink-muted">{fmtTime(lastCheckedAt)}</td>
                        <td className="px-4 py-3">
                          <select
                            value={intervalToSelectValue(k.check_interval_hours)}
                            onChange={(e) => handleIntervalChange(k.id, selectValueToInterval(e.target.value))}
                            className="field h-8 py-0 text-[12px]"
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
                              className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-signal transition hover:bg-signal-soft disabled:opacity-50"
                            >
                              <i className={`ti ${isChecking ? "ti-loader-2 animate-spin" : "ti-search"} text-[13px]`} aria-hidden />
                              확인
                            </button>
                            <button
                              onClick={() => handleRemove(k.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-bad/10 hover:text-bad"
                              title="삭제"
                            >
                              <i className="ti ti-trash text-[14px]" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {rowError[k.id] && (
                        <tr key={`${k.id}-error`}>
                          <td colSpan={8} className="px-4 pb-2">
                            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2 text-[12px] text-bad">
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

      <div>
        <h3 className="mb-3 text-[15px] font-semibold text-ink">알림 발송 이력</h3>
        {alerts.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-8 text-center">
            <p className="text-[13px] text-ink-muted">아직 발송된 알림이 없어요.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-[11px] text-ink-muted">
                  <th className="px-4 py-2.5 font-medium">발송일시</th>
                  <th className="px-4 py-2.5 font-medium">키워드</th>
                  <th className="px-4 py-2.5 font-medium">기기</th>
                  <th className="px-4 py-2.5 font-medium">타사 도메인</th>
                  <th className="px-4 py-2.5 font-medium">수신</th>
                  <th className="px-4 py-2.5 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const kw = keywords.find((k) => k.id === a.keyword_id);
                  return (
                    <tr key={a.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                      <td className="px-4 py-3 text-[12px] text-ink-muted">{fmtTime(a.sent_at)}</td>
                      <td className="px-4 py-3 font-medium text-ink">{kw?.keyword ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-soft">{DEVICE_LABEL[a.device]}</td>
                      <td className="px-4 py-3 text-ink-soft">{a.infringing_domains.join(", ")}</td>
                      <td className="px-4 py-3 text-ink-soft">{a.recipient}</td>
                      <td className="px-4 py-3">
                        {a.status === "sent" ? (
                          <span className="text-[12px] font-medium text-good">발송됨</span>
                        ) : (
                          <span title={a.error ?? ""} className="text-[12px] font-medium text-bad">
                            실패
                          </span>
                        )}
                      </td>
                    </tr>
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
