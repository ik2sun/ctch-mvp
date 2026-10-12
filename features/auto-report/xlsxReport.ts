// 자동 리포트 — 보고서형 첨부 엑셀(exceljs, 서버 전용). 섹션을 원본처럼 시트별로 쌓고(section.sheet),
// 제목 띠·KPI 카드·코멘트 블록·색 머리글·숫자 서식·증감 ▲▼ 색·데이터 막대·합계 강조·눈금선 끄기·가로 인쇄.
// 색·글꼴은 학습한 원본 서식(spec.theme)을 따르고, 없으면 기본 남색 테마
import ExcelJS from "exceljs";
import { change, type ReportData, type Row } from "./compute";
import { FIRST_COL, fillVars, sectionNote, sectionRows, type RenderInput } from "./render";
import { LOWER_BETTER, METRICS, type MetricKey, type ReportSection, type ReportTheme } from "./types";

const DEFAULT_THEME: Required<ReportTheme> = { headerFill: "1F3A5F", headerFont: "FFFFFF", accent: "D9531F", font: "맑은 고딕", band: "F5F7FA" };
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase().slice(-6)}`;
const NUMFMT: Record<string, string> = { won: '#,##0"원"', count: "#,##0", count1: "#,##0.0", pct: "0.00%", pct0: "0%" };
const DELTA_UP_GOOD = '[Color10]"▲ "0.0%;[Red]"▼ "0.0%;"– "0.0%';
const DELTA_UP_BAD = '[Red]"▲ "0.0%;[Color10]"▼ "0.0%;"– "0.0%';
const LAST_COL = 13; // A~M: A = 이름, B~ = 지표

type Ctx = { ws: ExcelJS.Worksheet; row: number; t: Required<ReportTheme>; font: string };

const thin = (color = "D0D5DD"): Partial<ExcelJS.Borders> => ({ top: { style: "thin", color: { argb: argb(color) } }, bottom: { style: "thin", color: { argb: argb(color) } } });
const val = (k: MetricKey, v: number | null) => (v == null || !Number.isFinite(v) ? null : METRICS[k].unit === "won" ? Math.round(v) : v);

function sectionTitle(c: Ctx, text: string) {
  c.row += 1;
  const r = c.ws.getRow(c.row);
  r.getCell(1).value = `■ ${text}`;
  r.getCell(1).font = { name: c.font, size: 12, bold: true, color: { argb: argb(c.t.headerFill) } };
  r.height = 22;
  c.row += 1;
}

function kpiCards(c: Ctx, total: Row, metrics: MetricKey[], compare: boolean) {
  // 카드 1개 = 2열, 한 줄 6개(B~M)
  for (let i = 0; i < metrics.length; i += 6) {
    const chunk = metrics.slice(i, i + 6);
    const [lr, vr, dr] = [c.row, c.row + 1, c.row + 2];
    chunk.forEach((k, j) => {
      const col = 2 + j * 2;
      for (const r of [lr, vr, dr]) c.ws.mergeCells(r, col, r, col + 1);
      const label = c.ws.getCell(lr, col);
      label.value = METRICS[k].label;
      label.font = { name: c.font, size: 9, color: { argb: "FF667085" } };
      const v = c.ws.getCell(vr, col);
      v.value = val(k, total.cur[k]);
      v.numFmt = NUMFMT[METRICS[k].unit];
      v.font = { name: c.font, size: 16, bold: true, color: { argb: "FF101828" } };
      const d = c.ws.getCell(dr, col);
      const ch = compare ? change(total.cur[k], total.prev?.[k]) : null;
      if (ch != null) {
        d.value = ch;
        d.numFmt = LOWER_BETTER.includes(k) ? DELTA_UP_BAD : DELTA_UP_GOOD;
        d.font = { name: c.font, size: 9, bold: true };
      }
      for (const r of [lr, vr, dr])
        for (const cc of [col, col + 1]) {
          const cell = c.ws.getCell(r, cc);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.t.band) } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            left: cc === col ? { style: "thin", color: { argb: "FFFFFFFF" } } : undefined,
            top: r === lr ? { style: "medium", color: { argb: argb(c.t.headerFill) } } : undefined,
          };
        }
    });
    c.ws.getRow(vr).height = 28;
    c.row += 4;
  }
}

function comment(c: Ctx, text: string) {
  const lines = (text || "(코멘트 없음)").split("\n").filter((l) => l.trim());
  for (const l of lines) {
    c.ws.mergeCells(c.row, 1, c.row, LAST_COL);
    const cell = c.ws.getCell(c.row, 1);
    cell.value = l.trim();
    cell.font = { name: c.font, size: 10, color: { argb: "FF101828" } };
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF5" } };
    cell.border = { left: { style: "thick", color: { argb: argb(c.t.accent) } } };
    // 한 줄 약 120자 기준으로 높이
    c.ws.getRow(c.row).height = Math.max(18, Math.ceil(l.length / 120) * 16);
    c.row += 1;
  }
}

function table(c: Ctx, rows: Row[], metrics: MetricKey[], first: string, compare: boolean, bars: boolean) {
  const head = c.ws.getRow(c.row);
  [first, ...metrics.map((k) => METRICS[k].label)].forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { name: c.font, size: 10, bold: true, color: { argb: argb(c.t.headerFont) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.t.headerFill) } };
    cell.alignment = { horizontal: i ? "center" : "left", vertical: "middle", wrapText: true };
  });
  head.height = 30;
  const start = c.row + 1;
  c.row += 1;
  rows.forEach((r, i) => {
    const isTotal = r.key === "total";
    const x = c.ws.getRow(c.row);
    x.getCell(1).value = r.label;
    metrics.forEach((k, j) => {
      const cell = x.getCell(j + 2);
      cell.value = val(k, r.cur[k]);
      cell.numFmt = NUMFMT[METRICS[k].unit];
    });
    x.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > metrics.length + 1) return;
      cell.font = { name: c.font, size: 10, bold: isTotal };
      cell.border = isTotal ? { top: { style: "medium", color: { argb: argb(c.t.headerFill) } }, bottom: { style: "thin", color: { argb: "FFD0D5DD" } } } : thin("EAECF0");
      if (isTotal) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.t.band) } };
      else if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCFCFD" } };
      cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
    });
    c.row += 1;
    // 증감 줄(작은 글씨, ▲ 초록·▼ 빨강, 낮을수록 좋은 지표는 반대)
    if (compare && r.prev) {
      const y = c.ws.getRow(c.row);
      y.getCell(1).value = "  증감";
      y.getCell(1).font = { name: c.font, size: 8, color: { argb: "FF98A2B3" } };
      metrics.forEach((k, j) => {
        const ch = change(r.cur[k], r.prev?.[k]);
        const cell = y.getCell(j + 2);
        if (ch != null) {
          cell.value = ch;
          cell.numFmt = LOWER_BETTER.includes(k) ? DELTA_UP_BAD : DELTA_UP_GOOD;
        }
        cell.font = { name: c.font, size: 8 };
        cell.alignment = { horizontal: "right" };
      });
      y.height = 13;
      c.row += 1;
    }
  });
  // 광고비 열 데이터 막대(합계 행 제외)
  const costIdx = metrics.indexOf("cost");
  const dataRows = rows.filter((r) => r.key !== "total").length;
  if (bars && costIdx >= 0 && dataRows > 1) {
    const colL = c.ws.getColumn(costIdx + 2).letter;
    const end = c.row - 1 - (rows.some((r) => r.key === "total") ? (compare ? 2 : 1) : 0);
    c.ws.addConditionalFormatting({
      ref: `${colL}${start}:${colL}${end}`,
      rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: argb(c.t.accent) }, gradient: true } as never],
    });
  }
}

function achievement(c: Ctx, d: ReportData, metrics: MetricKey[]) {
  const a = d.achievement;
  if (!a) return;
  const rows: Row[] = metrics.map((k) => ({ key: k, label: METRICS[k].label, cur: { ...a.cur }, prev: { ...a.prev } }));
  const head = c.ws.getRow(c.row);
  ["지표", `이번 달 ${a.curRange.since.slice(5)}~${a.curRange.until.slice(5)}`, `지난달 ${a.prevRange.since.slice(5)}~${a.prevRange.until.slice(5)}`, "달성률"].forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { name: c.font, size: 10, bold: true, color: { argb: argb(c.t.headerFont) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(c.t.headerFill) } };
    cell.alignment = { horizontal: i ? "center" : "left", vertical: "middle", wrapText: true };
  });
  head.height = 30;
  const start = c.row + 1;
  c.row += 1;
  for (const [i, r] of rows.entries()) {
    const k = r.key as MetricKey;
    const x = c.ws.getRow(c.row);
    x.getCell(1).value = r.label;
    x.getCell(2).value = val(k, a.cur[k]);
    x.getCell(2).numFmt = NUMFMT[METRICS[k].unit];
    x.getCell(3).value = val(k, a.prev[k]);
    x.getCell(3).numFmt = NUMFMT[METRICS[k].unit];
    const c1 = a.cur[k];
    const p1 = a.prev[k];
    x.getCell(4).value = c1 != null && p1 ? c1 / p1 : null;
    x.getCell(4).numFmt = "0.0%";
    x.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 4) return;
      cell.font = { name: c.font, size: 10, bold: col === 4 };
      cell.border = thin("EAECF0");
      if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCFCFD" } };
      cell.alignment = { horizontal: col === 1 ? "left" : "right" };
    });
    c.row += 1;
  }
  c.ws.addConditionalFormatting({
    ref: `D${start}:D${c.row - 1}`,
    rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: argb(c.t.accent) }, gradient: true } as never],
  });
}

function setupSheet(wb: ExcelJS.Workbook, name: string, t: Required<ReportTheme>, i: RenderInput): Ctx {
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  ws.getColumn(1).width = 42; // 상품·캠페인 이름이 길어 넉넉히
  for (let col = 2; col <= LAST_COL; col++) ws.getColumn(col).width = 14;
  const vars = { client: i.clientName, period: i.periodLabel };
  ws.mergeCells(1, 1, 1, LAST_COL);
  const title = ws.getCell(1, 1);
  title.value = fillVars(i.spec.subject, vars);
  title.font = { name: t.font, size: 18, bold: true, color: { argb: argb(t.headerFont) } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(t.headerFill) } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 36;
  ws.mergeCells(2, 1, 2, LAST_COL);
  const sub = ws.getCell(2, 1);
  sub.value = `${i.clientName} · ${name} · 기간 ${i.periodLabel}${i.compareLabel ? ` · 비교 ${i.compareLabel}` : ""}`;
  sub.font = { name: t.font, size: 10, color: { argb: "FF667085" } };
  sub.border = { bottom: { style: "medium", color: { argb: argb(t.accent) } } };
  return { ws, row: 3, t, font: t.font };
}

export async function renderStyledXlsx(i: RenderInput): Promise<Buffer> {
  const t = { ...DEFAULT_THEME, ...(i.spec.theme ?? {}) } as Required<ReportTheme>;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CTCH 자동 리포트";
  // 원본 시트 구성대로 섹션을 묶는다(없으면 '리포트' 한 장)
  const order: string[] = [];
  const bySheet = new Map<string, ReportSection[]>();
  for (const s of i.spec.sections) {
    const n = (s.sheet || "리포트").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    if (!bySheet.has(n)) {
      bySheet.set(n, []);
      order.push(n);
    }
    bySheet.get(n)!.push(s);
  }
  for (const name of order) {
    const c = setupSheet(wb, name, t, i);
    if (name === order[0] && i.spec.intro) {
      c.row += 1;
      c.ws.mergeCells(c.row, 1, c.row, LAST_COL);
      const cell = c.ws.getCell(c.row, 1);
      cell.value = fillVars(i.spec.intro, { client: i.clientName, period: i.periodLabel });
      cell.font = { name: c.font, size: 10, color: { argb: "FF344054" } };
      c.row += 1;
    }
    for (const s of bySheet.get(name)!) {
      const metrics = s.metrics.length ? s.metrics : (["cost", "conversions", "roas"] as MetricKey[]);
      if (s.type === "text") {
        sectionTitle(c, s.title);
        comment(c, fillVars(s.note ?? "", { client: i.clientName, period: i.periodLabel }));
        continue;
      }
      sectionTitle(c, s.title);
      const note = sectionNote(s, i.data);
      if (note) {
        c.ws.getCell(c.row, 1).value = note;
        c.ws.getCell(c.row, 1).font = { name: c.font, size: 9, italic: true, color: { argb: "FF98A2B3" } };
        c.row += 1;
      } else if (s.type === "insights") comment(c, i.texts[s.id] ?? "");
      else if (s.type === "kpi") kpiCards(c, i.data.total, metrics, !!s.showCompare);
      else if (s.type === "achievement") achievement(c, i.data, metrics);
      else if (FIRST_COL[s.type]) {
        const rows = sectionRows(s, i.data);
        const cmp = s.type === "weekly_table" ? s.showCompare !== false : s.type !== "daily_table" && !!s.showCompare;
        if (rows.length) table(c, rows, metrics, FIRST_COL[s.type]!, cmp, s.type !== "daily_table" && s.type !== "weekly_table");
        else {
          c.ws.getCell(c.row, 1).value = "이 기간 데이터가 없어요.";
          c.ws.getCell(c.row, 1).font = { name: c.font, size: 9, italic: true, color: { argb: "FF98A2B3" } };
          c.row += 1;
        }
      }
    }
    c.row += 1;
    c.ws.mergeCells(c.row, 1, c.row, LAST_COL);
    const foot = c.ws.getCell(c.row, 1);
    foot.value = "CTCH 자동 리포트 · 매체 API 기준 수치(매체 관리자 화면과 집계 기준·시간대에 따라 다를 수 있음)";
    foot.font = { name: c.font, size: 8, color: { argb: "FF98A2B3" } };
  }
  // 네이버 원본(RD) — 표 서식 + 필터 + 머리글 고정
  if (i.data.naver?.raw.length) {
    const ws = wb.addWorksheet("RD_네이버SA", { views: [{ state: "frozen", ySplit: 1 }] });
    const [head, ...body] = i.data.naver.raw;
    ws.addRow(head);
    for (const r of body) ws.addRow(r);
    ws.getRow(1).eachCell((cell) => {
      cell.font = { name: t.font, size: 10, bold: true, color: { argb: argb(t.headerFont) } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(t.headerFill) } };
    });
    [12, 12, 28, 28, 22, 36, 8, 10, 10, 12, 8, 14].forEach((w, k) => (ws.getColumn(k + 1).width = w));
    for (const k of [8, 9, 11]) ws.getColumn(k).numFmt = "#,##0";
    for (const k of [10, 12]) ws.getColumn(k).numFmt = '#,##0"원"';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
