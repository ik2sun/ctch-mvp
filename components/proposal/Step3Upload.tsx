"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { FileAnalysis, SupportedFileKind } from "@/features/proposal/types";

const MAX_FILES = 5;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectKind(file: File): SupportedFileKind | "pptx" | "unsupported" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")) return "image";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "word";
  return "unsupported";
}

export default function Step3Upload({
  fileAnalyses,
  setFileAnalyses,
  onNext,
  onBack,
}: {
  fileAnalyses: FileAnalysis[];
  setFileAnalyses: (v: FileAnalysis[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    setNotice(null);

    if (fileAnalyses.length + files.length > MAX_FILES) {
      setNotice(`참고자료는 최대 ${MAX_FILES}개까지 업로드할 수 있어요.`);
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const kind = detectKind(file);

        if (kind === "pptx") {
          setNotice("PPT 파일은 아직 자동 분석을 지원하지 않아요. PDF로 변환한 뒤 업로드해 주세요.");
          continue;
        }
        if (kind === "unsupported") {
          setNotice(`지원하지 않는 파일 형식이에요: ${file.name}`);
          continue;
        }

        let body: Record<string, unknown>;
        if (kind === "excel") {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf);
          const data = wb.SheetNames.map((name) => ({
            sheet: name,
            rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false }).slice(0, 50),
          }));
          body = { type: "excel", fileName: file.name, data };
        } else if (kind === "word") {
          const buf = await file.arrayBuffer();
          const { value: text } = await mammoth.extractRawText({ arrayBuffer: buf });
          body = { type: "word", fileName: file.name, text };
        } else if (kind === "pdf") {
          const base64 = await fileToBase64(file);
          body = { type: "pdf", fileName: file.name, base64 };
        } else {
          const base64 = await fileToBase64(file);
          body = { type: "image", fileName: file.name, base64, mediaType: file.type || "image/png" };
        }

        const res = await fetch("/api/proposal/analyze-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setNotice(`${file.name} 분석 실패: ${json.error ?? "알 수 없는 오류"}`);
          continue;
        }

        const analysis: FileAnalysis = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          kind,
          summary: json.summary,
          keyPoints: json.keyPoints ?? [],
        };
        setFileAnalyses([...fileAnalyses, analysis]);
      }
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    setFileAnalyses(fileAnalyses.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-5">
      <label className="block cursor-pointer rounded-card border border-dashed border-line bg-canvas p-8 text-center hover:border-signal">
        <p className="mb-1 text-[14px] font-medium text-ink">
          참고자료를 업로드하세요 (최대 {MAX_FILES}개)
        </p>
        <p className="text-[12px] text-ink-faint">PDF · 이미지(jpg/png) · 엑셀(xlsx/xls) · 워드(docx/doc)</p>
        <p className="text-[12px] text-ink-faint">PPT는 PDF로 변환 후 업로드해 주세요</p>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.ppt,.pptx"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {uploading && <p className="text-[13px] text-ink-muted">분석 중...</p>}
      {notice && <p className="text-[13px] text-warn">{notice}</p>}

      {fileAnalyses.length > 0 && (
        <div className="space-y-3">
          {fileAnalyses.map((f) => (
            <div key={f.id} className="rounded-card border border-line bg-surface p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-ink">{f.fileName}</p>
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  className="text-[12px] text-ink-faint hover:text-bad"
                >
                  삭제
                </button>
              </div>
              <p className="mb-2 text-[13px] leading-relaxed text-ink-soft">{f.summary}</p>
              {f.keyPoints.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-muted">
                  {f.keyPoints.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-card border border-line px-5 py-2.5 text-[14px] text-ink-soft hover:bg-canvas"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
}
