// 올린 엑셀에 행마다 'CTCH 상태'·'수정할 부분'을 덧붙인다(원본 서식 유지, 고칠 행은 빨간 배경) — 브라우저·노드 공용(노드에서 실파일로 검증)
import { AD_SHEET, AUDIENCE_SHEET, FIX_HEADER, GUIDE_SHEET, SET_SHEET, STATUS_HEADER } from "./bulkSheet";

export type MarkItem = { row: number; status: string; fix: string; tone: "bad" | "ok" | "" };

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (o.result != null) return String(o.result).trim();
  }
  return String(v).trim();
};
const RED = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } } as const;
const GREEN = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } } as const;

export async function markWorkbook(buf: ArrayBuffer, adItems: MarkItem[], setItems: MarkItem[]): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.slice(0));

  const mark = (ws: import("exceljs").Worksheet, isHeader: (vals: string[]) => boolean, items: MarkItem[]) => {
    let hr = 0;
    ws.eachRow((row, n) => {
      if (!hr && isHeader((Array.isArray(row.values) ? row.values : []).map(text))) hr = n;
    });
    if (!hr) return false;
    const header = ws.getRow(hr);
    let sc = 0;
    let fc = 0;
    let last = 0;
    header.eachCell((c, col) => {
      const v = text(c.value);
      if (v === STATUS_HEADER) sc = col;
      else if (v === FIX_HEADER) fc = col;
      else if (v) last = Math.max(last, col);
    });
    if (!sc) sc = Math.max(last, fc) + 1;
    if (!fc) fc = Math.max(last, sc) + 1;
    for (const [c, v] of [[sc, STATUS_HEADER], [fc, FIX_HEADER]] as const) {
      const cellH = header.getCell(c);
      cellH.value = v;
      cellH.font = { bold: true, color: { argb: "FFB42318" } };
    }
    ws.getColumn(sc).width = 14;
    ws.getColumn(fc).width = 70;
    for (let n = hr + 1; n <= ws.rowCount; n++) {
      const r = ws.getRow(n);
      r.getCell(sc).value = null;
      r.getCell(fc).value = null;
    }
    const width = Math.max(sc, fc);
    for (const it of items) {
      const r = ws.getRow(it.row);
      r.getCell(sc).value = it.status;
      const f = r.getCell(fc);
      f.value = it.fix || null;
      f.alignment = { wrapText: true, vertical: "top" };
      if (it.tone === "bad") {
        for (let c = 1; c <= width; c++) r.getCell(c).fill = RED;
        f.font = { color: { argb: "FFB42318" } };
        r.getCell(sc).font = { bold: true, color: { argb: "FFB42318" } };
      } else if (it.tone === "ok") r.getCell(sc).fill = GREEN;
    }
    return true;
  };

  const adWs = wb.getWorksheet(AD_SHEET) ?? wb.worksheets.find((w) => ![SET_SHEET, GUIDE_SHEET, AUDIENCE_SHEET].includes(w.name));
  if (!adWs || !mark(adWs, (v) => v.includes("광고세트") && v.includes("소재 파일"), adItems)) throw new Error(`'${AD_SHEET}' 시트 머리글을 못 찾았어요`);
  const setWs = wb.getWorksheet(SET_SHEET);
  if (setWs && setItems.length) mark(setWs, (v) => v.includes("광고세트"), setItems);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
