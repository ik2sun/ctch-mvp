"use client";

import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  analyzeGrid,
  analyzeGroups,
  extractLabels,
  fmt,
  METRIC_LABELS_KO,
  type MetricSummary,
  type MetricKey,
  type LabelMap,
  type GroupSummary,
} from "@/features/ai-report/calcMetrics";
import { useClients } from "@/features/clients/ClientContext";
import {
  saveReport,
  listReports,
  deleteReport,
  type SavedReport,
} from "@/features/ai-report/reportData";
import { getTemplate, saveTemplate } from "@/features/ai-report/templateData";

type SheetData = { name: string; grid: unknown[][] };
const METRIC_KEYS: MetricKey[] = ["impressions", "clicks", "cost", "conversions", "revenue"];

export default function ReportAnalysisPage() {
  const { selected } = useClients();

  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [summary, setSummary] = useState<MetricSummary | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [fileLabels, setFileLabels] = useState<string[]>([]);
  const [labelMap, setLabelMap] = useState<LabelMap>({});
  const [context, setContext] = useState("");
  const [parsing, setParsing] = useState(false);
  const [sizeWarn, setSizeWarn] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [savedList, setSavedList] = useState<SavedReport[]>([]);
  const [viewingSaved, setViewingSaved] = useState(false);

  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);

  const loadClientData = useCallback(async () => {
    if (!selected) {
      setSavedList([]);
      setLabelMap({});
      return;
    }
    setSavedList(await listReports(selected.id));
    const tpl = await getTemplate(selected.id);
    setLabelMap(tpl ?? {});
  }, [selected]);

  useEffect(() => {
    loadClientData();
  }, [loadClientData]);

  function reanalyze(grid: unknown[][], map: LabelMap) {
    setSummary(analyzeGrid(grid, map));
    setGroups(analyzeGroups(grid, map));
    setFileLabels(extractLabels(grid));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setTitle(file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
    setComment("");
    setAiError(null);
    setSaveMsg(null);
    setTplMsg(null);
    setViewingSaved(false);
    setShowMapping(false);

    const mb = file.size / (1024 * 1024);
    setSizeWarn(
      mb > 20
        ? `이 파일은 ${mb.toFixed(0)}MB로 커서 분석에 시간이 걸리거나 브라우저가 멈출 수 있어요. 원본(raw)보다 집계된 리포트를 권장해요.`
        : null,
    );

    setParsing(true);
    await new Promise((r) => setTimeout(r, 40));
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const parsed: SheetData[] = wb.SheetNames.map((name) => ({
        name,
        grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1,
          defval: "",
          raw: false,
        }),
      })).filter((s) => s.grid.length > 0);

      setSheets(parsed);
      setActiveSheet(0);
      if (parsed.length) reanalyze(parsed[0].grid, labelMap);
    } catch {
      setAiError("파일을 읽지 못했어요. 파일이 너무 크거나 형식이 맞지 않을 수 있어요.");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  }

  function selectSheet(i: number) {
    setActiveSheet(i);
    reanalyze(sheets[i].grid, labelMap);
    setComment("");
    setAiError(null);
  }

  function setMetricLabel(metric: MetricKey, label: string) {
    const next = { ...labelMap };
    if (label) next[metric] = label;
    else delete next[metric];
    setLabelMap(next);
    if (sheets[activeSheet]) reanalyze(sheets[activeSheet].grid, next);
  }

  async function handleSaveTemplate() {
    if (!selected) return;
    setTplMsg(null);
    const { error } = await saveTemplate(selected.id, labelMap);
    setTplMsg(error ? "템플릿 저장 실패" : "템플릿을 저장했어요. 다음부터 자동 적용돼요.");
  }

  async function generateComment() {
    if (!summary) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          context: `${sheets[activeSheet]?.name ?? ""} ${context}`.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI 코멘트 생성 실패");
      setComment(data.comment);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    if (!selected || !summary) return;
    setSaving(true);
    setSaveMsg(null);
    const { error } = await saveReport({
      clientId: selected.id,
      title: title.trim() || "제목 없는 리포트",
      reportDate: reportDate || null,
      sheetName: sheets[activeSheet]?.name ?? null,
      summary,
      aiComment: comment || null,
    });
    setSaving(false);
    setSaveMsg(error ? "저장에 실패했어요." : "저장했어요.");
    if (!error) loadClientData();
  }

  function openSaved(r: SavedReport) {
    setSummary(r.summary);
    setGroups([]);
    setComment(r.ai_comment ?? "");
    setViewingSaved(true);
    setFileName(r.title);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeSaved(id: string) {
    if (!confirm("이 리포트를 삭제할까요?")) return;
    await deleteReport(id);
    loadClientData();
  }

  const cards = summary
    ? [
        { label: "노출수", value: fmt(summary.totals.impressions, "int") },
        { label: "클릭수", value: fmt(summary.totals.clicks, "int") },
        { label: "광고비", value: fmt(summary.totals.cost, "won") },
        { label: "전환수", value: fmt(summary.totals.conversions, "int") },
        { label: "전환매출", value: fmt(summary.totals.revenue, "won") },
        { label: "CTR", value: fmt(summary.derived.ctr, "pct") },
        { label: "CPC", value: fmt(summary.derived.cpc, "won") },
        { label: "CPA", value: fmt(summary.derived.cpa, "won") },
        { label: "CVR", value: fmt(summary.derived.cvr, "pct") },
        { label: "ROAS", value: fmt(summary.derived.roas, "x") },
      ]
    : [];

  const hasMissing = summary && summary.missing.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* 업로드 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <label className="mb-2 block text-[13px] font-medium text-ink-soft">
          리포트 파일 업로드 (CSV · 엑셀)
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-canvas py-8 text-[14px] text-ink-muted transition hover:border-signal hover:text-signal">
          <i className={`ti ${parsing ? "ti-loader-2 animate-spin" : "ti-upload"} text-[18px]`} aria-hidden />
          {parsing ? "파일 분석 중… (큰 파일은 시간이 걸려요)" : fileName || "클릭해서 CSV 또는 .xlsx 파일을 선택하세요"}
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" disabled={parsing} />
        </label>

        {sizeWarn && (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-[12px] text-warn">{sizeWarn}</p>
        )}

        {sheets.length > 1 && !viewingSaved && (
          <div className="mt-3">
            <p className="mb-1.5 text-[12px] text-ink-muted">
              시트 {sheets.length}개 — 분석할 시트를 선택하세요
            </p>
            <div className="flex flex-wrap gap-2">
              {sheets.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => selectSheet(i)}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                    activeSheet === i
                      ? "border-signal bg-signal-soft font-medium text-signal"
                      : "border-line text-ink-soft hover:border-ink-faint"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-3 flex items-center justify-between">
            <p className="font-mono text-[11px] text-ink-muted">
              인식 방식: {summary.mode === "pivot" ? "피벗 리포트" : "표"} · 감지된 지표:{" "}
              {summary.found.length ? summary.found.map((k) => METRIC_LABELS_KO[k]).join(", ") : "없음"}
            </p>
            {!viewingSaved && (
              <button onClick={() => setShowMapping((v) => !v)} className="text-[12px] text-signal hover:underline">
                {showMapping ? "매핑 닫기" : "매핑 수정"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 매핑 수정 */}
      {summary && !viewingSaved && (showMapping || hasMissing) && (
        <div className="rounded-card border border-signal/20 bg-signal-soft/30 p-5">
          <p className="mb-1 text-[13px] font-medium text-ink">지표 매핑</p>
          <p className="mb-3 text-[12px] text-ink-muted">
            {hasMissing
              ? "일부 지표를 자동으로 못 찾았어요. 리포트에서 각 지표가 어떤 이름인지 골라주세요."
              : "각 지표가 리포트의 어떤 라벨과 연결됐는지 확인·수정할 수 있어요."}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {METRIC_KEYS.map((m) => {
              const detected = summary.found.includes(m);
              return (
                <div key={m}>
                  <label className="mb-1 flex items-center gap-1.5 text-[12px] text-ink-soft">
                    {METRIC_LABELS_KO[m]}
                    {detected ? (
                      <span className="text-good"><i className="ti ti-check text-[13px]" aria-hidden /></span>
                    ) : (
                      <span className="text-warn">미인식</span>
                    )}
                  </label>
                  <select
                    value={labelMap[m] ?? ""}
                    onChange={(e) => setMetricLabel(m, e.target.value)}
                    className="field h-10 text-[13px]"
                  >
                    <option value="">자동 감지</option>
                    {fileLabels.map((lbl) => (
                      <option key={lbl} value={lbl}>{lbl}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          {selected ? (
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSaveTemplate} className="btn-signal h-9 text-[13px]">
                <i className="ti ti-device-floppy text-[15px]" aria-hidden />
                {selected.name} 템플릿으로 저장
              </button>
              {tplMsg && <span className="text-[12px] text-signal">{tplMsg}</span>}
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-muted">템플릿으로 저장하려면 먼저 광고주를 선택하세요.</p>
          )}
        </div>
      )}

      {summary && (
        <>
          {viewingSaved && (
            <div className="flex items-center gap-2 rounded-lg border border-signal/20 bg-signal-soft px-3.5 py-2 text-[13px] text-signal">
              <i className="ti ti-eye text-[15px]" aria-hidden />
              저장된 리포트를 보는 중이에요.
            </div>
          )}

          <div className="rounded-card border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-soft">
                지표 요약{" "}
                <span className="font-normal text-ink-muted">
                  ({summary.mode === "pivot" ? `${summary.rowCount}개 블록` : `${summary.rowCount}행`} 집계)
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {cards.map((c) => (
                <div key={c.label} className="rounded-lg bg-canvas p-3">
                  <p className="text-[12px] text-ink-muted">{c.label}</p>
                  <p className="mt-0.5 font-display text-[18px] font-semibold text-ink">{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 매체별 */}
          {!viewingSaved && groups.length > 1 && (
            <div className="rounded-card border border-line bg-surface p-5">
              <p className="mb-3 text-[13px] font-medium text-ink-soft">
                매체별 <span className="font-normal text-ink-muted">({groups.length}개 매체)</span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-canvas text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">매체</th>
                      <th className="px-3 py-2 text-right font-medium">노출</th>
                      <th className="px-3 py-2 text-right font-medium">클릭</th>
                      <th className="px-3 py-2 text-right font-medium">광고비</th>
                      <th className="px-3 py-2 text-right font-medium">전환</th>
                      <th className="px-3 py-2 text-right font-medium">매출</th>
                      <th className="px-3 py-2 text-right font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.name} className="border-t border-line">
                        <td className="px-3 py-2 font-medium text-ink">{g.name}</td>
                        <td className="px-3 py-2 text-right text-ink-soft">{fmt(g.summary.totals.impressions, "int")}</td>
                        <td className="px-3 py-2 text-right text-ink-soft">{fmt(g.summary.totals.clicks, "int")}</td>
                        <td className="px-3 py-2 text-right text-ink-soft">{fmt(g.summary.totals.cost, "won")}</td>
                        <td className="px-3 py-2 text-right text-ink-soft">{fmt(g.summary.totals.conversions, "int")}</td>
                        <td className="px-3 py-2 text-right text-ink-soft">{fmt(g.summary.totals.revenue, "won")}</td>
                        <td className="px-3 py-2 text-right font-medium text-ink">{fmt(g.summary.derived.roas, "x")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!viewingSaved && (
            <div className="rounded-card border border-line bg-surface p-5">
              <label className="mb-2 block text-[13px] font-medium text-ink-soft">추가 컨텍스트 (선택)</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                placeholder="예: 7월 캠페인, 목표 ROAS 400% 이상"
                className="mb-3 w-full resize-y rounded-lg border border-line bg-canvas p-3 text-[14px] outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
              />
              <button onClick={generateComment} disabled={aiLoading} className="btn-signal">
                <i className="ti ti-sparkles text-[16px]" aria-hidden />
                {aiLoading ? "AI가 분석 중…" : "AI 코멘트 생성"}
              </button>
              {aiError && (
                <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{aiError}</p>
              )}
            </div>
          )}

          {comment && (
            <div className="rounded-card border border-signal/15 bg-signal-soft/40 p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="signal-dot" />
                <span className="text-[13px] font-medium text-signal">AI 분석 코멘트</span>
              </div>
              <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">{comment}</div>
            </div>
          )}

          {!viewingSaved && (
            <div className="rounded-card border border-line bg-surface p-5">
              {selected ? (
                <>
                  <p className="mb-3 text-[13px] font-medium text-ink-soft">
                    <span className="text-signal">{selected.name}</span> 광고주로 저장
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1.5 block text-[12px] text-ink-muted">리포트 이름</label>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} className="field h-10 text-[14px]" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[12px] text-ink-muted">기준일 (선택)</label>
                      <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="field h-10 text-[14px]" />
                    </div>
                    <button onClick={handleSave} disabled={saving} className="btn-signal h-10">
                      {saving ? "저장 중…" : "이 리포트 저장"}
                    </button>
                  </div>
                  {saveMsg && <p className="mt-2 text-[13px] text-signal">{saveMsg}</p>}
                </>
              ) : (
                <p className="text-[13px] text-ink-muted">저장하려면 먼저 상단에서 광고주를 선택하세요.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* 저장된 리포트 (실시간 리포트에서 저장한 것도 함께 표시) */}
      {selected && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">
              저장된 리포트 <span className="font-normal text-ink-muted">· {selected.name}</span>
            </h3>
            <span className="text-[13px] text-ink-muted">{savedList.length}건</span>
          </div>
          {savedList.length === 0 ? (
            <div className="rounded-card border border-dashed border-line bg-surface py-8 text-center">
              <p className="text-[14px] text-ink-muted">이 광고주로 저장된 리포트가 아직 없어요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedList.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
                  <button onClick={() => openSaved(r)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-ink">{r.title}</span>
                      {r.sheet_name && (
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">{r.sheet_name}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {r.report_date ? `기준일 ${r.report_date} · ` : ""}
                      ROAS {fmt(r.summary?.derived?.roas ?? null, "x")} · 저장{" "}
                      {new Date(r.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </button>
                  <button
                    onClick={() => removeSaved(r.id)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-bad hover:text-bad"
                    title="삭제"
                  >
                    <i className="ti ti-trash text-[15px]" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
