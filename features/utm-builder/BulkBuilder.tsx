"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  parseBulk,
  textToMatrix,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE,
  type BulkRow,
  type CommonDefaults,
} from "@/features/utm-builder/bulkUtm";

export function BulkBuilder() {
  const supabase = createClient();
  const [defaults, setDefaults] = useState<CommonDefaults>({
    source: "",
    medium: "",
    campaign: "",
  });
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const valid = rows.filter((r) => !r.error && r.finalUrl);
  const errorCount = rows.length - valid.length;

  function runParse(matrix: string[][]) {
    setSavedCount(null);
    setRows(parseBulk(matrix, defaults));
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
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    runParse(matrix.map((r) => r.map((c) => String(c))));
    e.target.value = ""; // 같은 파일 재업로드 허용
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "UTM");
    XLSX.writeFile(wb, "CTCH_UTM_템플릿.xlsx");
  }

  function downloadResult() {
    const aoa = [
      ["url", "utm_source", "utm_campaign", "utm_term", "final_url", "상태"],
      ...rows.map((r) => [
        r.url,
        r.source,
        r.campaign,
        r.term,
        r.finalUrl,
        r.error ?? "정상",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "결과");
    XLSX.writeFile(wb, "CTCH_UTM_결과.xlsx");
  }

  async function copyAll() {
    await navigator.clipboard.writeText(valid.map((r) => r.finalUrl).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveAll() {
    if (valid.length === 0) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const payload = valid.map((r) => ({
      user_id: user.id,
      final_url: r.finalUrl,
      base_url: r.url,
      utm_source: r.source || null,
      utm_medium: r.medium || null,
      utm_campaign: r.campaign || null,
      utm_content: r.content || null,
      utm_term: r.term || null,
      extra_params: r.tracking.length
        ? Object.fromEntries(r.tracking.map((t) => [t.key, t.value]))
        : null,
      memo: r.memo || null,
    }));
    const { error } = await supabase.from("utm_links").insert(payload);
    setSaving(false);
    setSavedCount(error ? null : valid.length);
  }

  return (
    <div className="space-y-5">
      {/* 공통값 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">
            공통값{" "}
            <span className="font-normal text-ink-muted">
              (표에 값이 없는 행에만 적용돼요)
            </span>
          </span>
          <button onClick={downloadTemplate} className="btn-ghost h-8 px-3 text-[12px]">
            <i className="ti ti-download text-[14px]" aria-hidden />
            샘플 템플릿
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SmallField label="utm_source" value={defaults.source} onChange={(v) => setDefaults((d) => ({ ...d, source: v }))} placeholder="naver_mo" />
          <SmallField label="utm_medium" value={defaults.medium} onChange={(v) => setDefaults((d) => ({ ...d, medium: v }))} placeholder="cpc" />
          <SmallField label="utm_campaign" value={defaults.campaign} onChange={(v) => setDefaults((d) => ({ ...d, campaign: v }))} placeholder="지역_애드부스트" />
        </div>
      </div>

      {/* 입력: 붙여넣기 + 업로드 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">
            엑셀에서 복사해 붙여넣기 (첫 줄은 헤더)
          </span>
          <label className="btn-ghost h-8 cursor-pointer px-3 text-[12px]">
            <i className="ti ti-file-spreadsheet text-[14px]" aria-hidden />
            엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
        </div>
        <textarea
          onChange={(e) => handlePaste(e.target.value)}
          rows={5}
          placeholder={`url\tsource\tcampaign\tterm\nhttps://...\tnaver_mo\t지역_애드부스트\t울산척추`}
          className="w-full resize-y rounded-lg border border-line bg-canvas p-3 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
        />
      </div>

      {/* 결과 */}
      {rows.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-medium text-ink">변환 결과 {rows.length}행</span>
              <span className="rounded bg-signal-soft px-1.5 py-0.5 text-[12px] text-signal">
                정상 {valid.length}
              </span>
              {errorCount > 0 && (
                <span className="rounded bg-bad/10 px-1.5 py-0.5 text-[12px] text-bad">
                  오류 {errorCount}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={copyAll} disabled={valid.length === 0} className="btn-ghost h-9 px-3 text-[13px]">
                <i className="ti ti-copy text-[15px]" aria-hidden />
                {copied ? "복사됨" : "전체 복사"}
              </button>
              <button onClick={downloadResult} className="btn-ghost h-9 px-3 text-[13px]">
                <i className="ti ti-download text-[15px]" aria-hidden />
                엑셀 다운
              </button>
              <button onClick={saveAll} disabled={valid.length === 0 || saving} className="btn-signal h-9 px-4 text-[13px]">
                {saving ? "저장 중…" : `${valid.length}건 저장`}
              </button>
            </div>
          </div>

          {savedCount !== null && (
            <p className="mb-3 rounded-lg border border-signal/20 bg-signal-soft px-3.5 py-2 text-[13px] text-signal">
              {savedCount}건을 저장했어요. 단일 생성 탭 아래 목록에서 확인할 수 있어요.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-canvas text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">campaign</th>
                  <th className="px-3 py-2 font-medium">term</th>
                  <th className="px-3 py-2 font-medium">완성 URL</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-ink-muted">{r.index}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.campaign || "—"}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.term || "—"}</td>
                    <td className="max-w-[420px] truncate px-3 py-2 font-mono text-ink">
                      {r.finalUrl || <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="text-bad">{r.error}</span>
                      ) : (
                        <span className="text-good">정상</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[12px] text-ink-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field h-10 text-[14px]"
      />
    </div>
  );
}
