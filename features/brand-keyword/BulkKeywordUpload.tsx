"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  parseBulk,
  textToMatrix,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE,
  type BulkKeywordRow,
  type BulkKeywordDefaults,
} from "@/features/brand-keyword/bulkBrandKeyword";
import {
  addKeywordsBulk,
  type BrandKeyword,
  type CheckIntervalHours,
} from "@/features/brand-keyword/brandKeywordData";

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

export function BulkKeywordUpload({
  clientId,
  existingKeywords,
  onClose,
  onAdded,
}: {
  clientId: string;
  existingKeywords: BrandKeyword[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [defaults, setDefaults] = useState<BulkKeywordDefaults>({
    ownerDomain: "",
    alertEmail: "",
    checkIntervalHours: 24,
  });
  const [rows, setRows] = useState<BulkKeywordRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: { keyword: string; error: string }[] } | null>(
    null,
  );

  const existingSet = useMemo(
    () => new Set(existingKeywords.map((k) => k.keyword.trim().toLowerCase())),
    [existingKeywords],
  );
  const valid = rows.filter((r) => !r.error);
  const errorCount = rows.length - valid.length;

  function runParse(matrix: string[][]) {
    setResult(null);
    setRows(parseBulk(matrix, defaults, existingSet));
  }

  function handlePaste(text: string) {
    if (!text.trim()) {
      setRows([]);
      return;
    }
    runParse(textToMatrix(text));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });
    runParse(matrix.map((r) => r.map((c) => String(c))));
    e.target.value = ""; // 같은 파일 재업로드 허용
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "브랜드키워드");
    XLSX.writeFile(wb, "CTCH_브랜드키워드_템플릿.xlsx");
  }

  async function submit() {
    if (valid.length === 0) return;
    setSaving(true);
    setResult(null);
    try {
      const { succeeded, failed } = await addKeywordsBulk({
        clientId,
        rows: valid.map((r) => ({
          keyword: r.keyword,
          ownerDomain: r.ownerDomain,
          alertEmail: r.alertEmail,
          checkIntervalHours: r.checkIntervalHours,
          memo: r.memo || null,
        })),
      });
      setResult({ succeeded: succeeded.length, failed });
      const failedKeywords = new Set(failed.map((f) => f.keyword));
      setRows((prev) => prev.filter((r) => r.error || failedKeywords.has(r.keyword)));
      if (succeeded.length > 0) onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-ink">엑셀로 브랜드 키워드 일괄 등록</h3>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-canvas hover:text-ink-soft"
          title="닫기"
        >
          <i className="ti ti-x text-[15px]" aria-hidden />
        </button>
      </div>

      {/* 공통값 */}
      <div className="mb-3 rounded-lg border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">
            공통값 <span className="font-normal text-ink-faint">(표에 값이 없는 행에만 적용돼요)</span>
          </span>
          <button onClick={downloadTemplate} className="btn-ghost h-7 px-2.5 text-[13px]">
            <i className="ti ti-download text-[15px]" aria-hidden />
            샘플 템플릿
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={defaults.ownerDomain}
            onChange={(e) => setDefaults((d) => ({ ...d, ownerDomain: e.target.value }))}
            placeholder="광고주 도메인 (예: example.com)"
            className="field h-9 text-[15px]"
          />
          <input
            value={defaults.alertEmail}
            onChange={(e) => setDefaults((d) => ({ ...d, alertEmail: e.target.value }))}
            placeholder="담당자 메일 (여러 명은 콤마로 구분)"
            className="field h-9 text-[15px]"
          />
          <select
            value={intervalToSelectValue(defaults.checkIntervalHours)}
            onChange={(e) => setDefaults((d) => ({ ...d, checkIntervalHours: selectValueToInterval(e.target.value) }))}
            className="field h-9 text-[15px]"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.label} value={intervalToSelectValue(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 입력: 붙여넣기 + 업로드 */}
      <div className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">엑셀에서 복사해 붙여넣기 (첫 줄은 헤더)</span>
          <label className="btn-ghost h-7 cursor-pointer px-2.5 text-[13px]">
            <i className="ti ti-file-spreadsheet text-[15px]" aria-hidden />
            엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
        </div>
        <textarea
          onChange={(e) => handlePaste(e.target.value)}
          rows={4}
          placeholder={`키워드\t광고주 도메인\t담당자 메일\t체크 주기\t메모\n캐치이사\texample.com\tmarketing@example.com\t매일\t`}
          className="w-full resize-y rounded-lg border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
        />
      </div>

      {result && (
        <p className="mb-3 rounded-lg border border-signal/20 bg-signal-soft px-3.5 py-2 text-[15px] text-signal">
          {result.succeeded}건 등록 완료
          {result.failed.length > 0 && ` · ${result.failed.length}건 실패 (아래 표에서 확인해 주세요)`}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-2 text-[15px]">
            <span className="font-medium text-ink">{rows.length}행</span>
            <span className="whitespace-nowrap rounded bg-signal-soft px-1.5 py-0.5 text-[13px] text-signal">등록 가능 {valid.length}</span>
            {errorCount > 0 && (
              <span className="whitespace-nowrap rounded bg-bad/10 px-1.5 py-0.5 text-[13px] text-bad">오류 {errorCount}</span>
            )}
          </div>
          <div className="mb-3 max-h-72 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-canvas text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">키워드</th>
                  <th className="px-3 py-2 font-medium">광고주 도메인</th>
                  <th className="px-3 py-2 font-medium">담당자 메일</th>
                  <th className="px-3 py-2 font-medium">체크 주기</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-ink-muted">{r.index}</td>
                    <td className="px-3 py-2 font-medium text-ink">{r.keyword || "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.ownerDomain || "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.alertEmail || "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {INTERVAL_OPTIONS.find((o) => o.value === r.checkIntervalHours)?.label ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      {r.error ? <span className="text-bad">{r.error}</span> : <span className="text-good">정상</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button onClick={submit} disabled={valid.length === 0 || saving} className="btn-signal h-9 px-4 text-[15px]">
              {saving ? (
                <>
                  <i className="ti ti-loader-2 animate-spin text-[16px]" aria-hidden />
                  등록 중…
                </>
              ) : (
                `${valid.length}건 일괄 등록`
              )}
            </button>
          </div>
        </>
      )}

      <p className="mt-2 text-[13px] text-ink-faint">
        체크 주기 열에는 수동·6·12·24·168(시간) 또는 매일·매주 중 하나를 입력해 주세요. 비워두면 위 공통값이 적용돼요.
      </p>
    </div>
  );
}
