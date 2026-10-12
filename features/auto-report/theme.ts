// 자동 리포트 — 원본 엑셀의 서식(머리글 색·강조색·줄 배경·글꼴)을 읽는다(서버 전용, exceljs). 테마 색 번호는 해석하지 않고 직접 지정 색만
import ExcelJS from "exceljs";
import type { ReportTheme } from "./types";

const hex6 = (argb?: string) => (argb && /^[0-9A-F]{8}$/i.test(argb) ? argb.slice(2).toUpperCase() : null);
const lum = (h: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const top = (m: Map<string, number>, skip: (k: string) => boolean = () => false) => [...m.entries()].filter(([k]) => !skip(k)).sort((a, b) => b[1] - a[1])[0]?.[0];

export async function themeFromXlsx(buf: Buffer): Promise<ReportTheme | null> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as never);
  } catch {
    return null;
  }
  const fills = new Map<string, number>(); // 진한 칠(머리글·강조 후보)
  const lights = new Map<string, number>(); // 옅은 칠(줄 배경 후보)
  const headFont = new Map<string, number>();
  const fonts = new Map<string, number>();
  const fillFont = new Map<string, Map<string, number>>();
  for (const ws of wb.worksheets.slice(0, 4)) {
    const last = Math.min(ws.rowCount, 200);
    for (let r = 1; r <= last; r++) {
      ws.getRow(r).eachCell((cell) => {
        if (cell.font?.name) fonts.set(cell.font.name, (fonts.get(cell.font.name) ?? 0) + 1);
        const f = cell.fill as ExcelJS.FillPattern | undefined;
        const h = f?.type === "pattern" && f.pattern === "solid" ? hex6(f.fgColor?.argb) : null;
        if (!h || h === "FFFFFF") return;
        if (lum(h) > 0.975) return; // 거의 흰색(줄무늬 등)은 카드 배경으로 안 보임
        if (lum(h) > 0.85) lights.set(h, (lights.get(h) ?? 0) + 1);
        else {
          fills.set(h, (fills.get(h) ?? 0) + 1);
          const fc = hex6(cell.font?.color?.argb) ?? (lum(h) < 0.5 ? "FFFFFF" : "101828");
          const m = fillFont.get(h) ?? new Map<string, number>();
          m.set(fc, (m.get(fc) ?? 0) + 1);
          fillFont.set(h, m);
          if (cell.font?.bold) headFont.set(h, (headFont.get(h) ?? 0) + 1);
        }
      });
    }
  }
  // 머리글 = 굵은 글씨가 가장 많이 놓인 진한 칠, 없으면 가장 많은 진한 칠
  const headerFill = top(headFont) ?? top(fills);
  const theme: ReportTheme = {};
  if (headerFill) {
    theme.headerFill = headerFill;
    theme.headerFont = top(fillFont.get(headerFill) ?? new Map()) ?? (lum(headerFill) < 0.5 ? "FFFFFF" : "101828");
    const accent = top(fills, (k) => k === headerFill);
    if (accent) theme.accent = accent;
  }
  const band = top(lights);
  if (band) theme.band = band;
  const font = top(fonts, (k) => /^(Calibri|Arial)$/i.test(k));
  if (font) theme.font = font;
  return Object.keys(theme).length ? theme : null;
}
