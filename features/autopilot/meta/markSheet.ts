// 올린 엑셀에 행마다 'CTCH 상태'·'수정할 부분' 열을 덧붙인다 — 브라우저·노드 공용, 템플릿 내려받기와 같은 SheetJS로 만든다
// (2026-10-12: exceljs로 색까지 칠하던 방식은 운영 브라우저에서 파일이 안 내려와 SheetJS로 교체 — SheetJS 무료판은 배경색을 못 넣어 글자 열만)
import * as XLSX from "xlsx";
import { AD_SHEET, AUDIENCE_SHEET, FIX_HEADER, GUIDE_SHEET, SET_SHEET, STATUS_HEADER } from "./bulkSheet";

export type MarkItem = { row: number; status: string; fix: string; tone: "bad" | "ok" | "" }; // row = 엑셀 행 번호(1부터)

const cell = (v: unknown) => (v == null ? "" : String(v).trim());

export function markSheet(ws: XLSX.WorkSheet, isHeader: (vals: string[]) => boolean, items: MarkItem[]): boolean {
  const m = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: true });
  const hi = m.findIndex((r) => isHeader(r.map(cell)));
  if (hi < 0) return false;
  const head = m[hi].map(cell);
  let sc = head.indexOf(STATUS_HEADER);
  let fc = head.indexOf(FIX_HEADER);
  const last = head.reduce((n, v, i) => (v && v !== STATUS_HEADER && v !== FIX_HEADER ? i : n), -1);
  if (sc < 0) sc = Math.max(last, fc) + 1;
  if (fc < 0) fc = Math.max(last, sc) + 1;
  const put = (r: number, c: number, v: string | null) => {
    const a = XLSX.utils.encode_cell({ r, c });
    if (v == null || v === "") delete ws[a];
    else ws[a] = { t: "s", v };
  };
  put(hi, sc, STATUS_HEADER);
  put(hi, fc, FIX_HEADER);
  for (let r = hi + 1; r < m.length; r++) {
    put(r, sc, null);
    put(r, fc, null);
  }
  let maxRow = m.length - 1;
  for (const it of items) {
    const r = it.row - 1; // 해석(parseAdSheet)과 같은 기준 — 시트 첫 행 = 1행
    put(r, sc, it.status);
    put(r, fc, it.fix || null);
    maxRow = Math.max(maxRow, r);
  }
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  range.e.c = Math.max(range.e.c, sc, fc);
  range.e.r = Math.max(range.e.r, maxRow);
  ws["!ref"] = XLSX.utils.encode_range(range);
  const cols = (ws["!cols"] ?? []).slice();
  cols[sc] = { wch: 14 };
  cols[fc] = { wch: 70 };
  ws["!cols"] = cols;
  return true;
}

export function markWorkbook(buf: ArrayBuffer, adItems: MarkItem[], setItems: MarkItem[]): XLSX.WorkBook {
  const wb = XLSX.read(buf, { cellStyles: true });
  const adName = wb.SheetNames.find((n) => n === AD_SHEET) ?? wb.SheetNames.find((n) => ![SET_SHEET, GUIDE_SHEET, AUDIENCE_SHEET].includes(n));
  if (!adName || !markSheet(wb.Sheets[adName], (v) => v.includes("광고세트") && v.includes("소재 파일"), adItems)) throw new Error(`'${AD_SHEET}' 시트 머리글을 못 찾았어요`);
  if (wb.Sheets[SET_SHEET] && setItems.length) markSheet(wb.Sheets[SET_SHEET], (v) => v.includes("광고세트"), setItems);
  return wb;
}
