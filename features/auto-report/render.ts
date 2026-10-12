// 자동 리포트 — 메일 본문 HTML(인라인 스타일, 메일 클라이언트 호환)과 첨부 엑셀(순수)
import * as XLSX from "xlsx";
import { change, type Metrics, type ReportData, type Row } from "./compute";
import { LOWER_BETTER, METRICS, type MetricKey, type ReportSection, type ReportSpec } from "./types";

export function fmt(k: MetricKey, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (METRICS[k].unit) {
    case "won":
      return `${Math.round(v).toLocaleString("ko-KR")}원`;
    case "pct":
      return `${(v * 100).toFixed(2)}%`;
    case "pct0":
      return `${Math.round(v * 100).toLocaleString("ko-KR")}%`;
    case "count1":
      return v % 1 ? v.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("ko-KR");
    default:
      return Math.round(v).toLocaleString("ko-KR");
  }
}

export function fillVars(t: string, vars: { client: string; period: string }) {
  return t.replace(/\{광고주\}/g, vars.client).replace(/\{기간\}/g, vars.period);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ORANGE = "#D9531F";
const INK = "#101828";
const MUTED = "#5B6472";
const LINE = "#EAECF0";
const GOOD = "#067647";
const BAD = "#B42318";

function delta(k: MetricKey, cur: number | null, prev: number | null | undefined): string {
  const c = change(cur, prev);
  if (c == null) return "";
  const better = LOWER_BETTER.includes(k) ? c < 0 : c > 0;
  const color = Math.abs(c) < 0.005 ? MUTED : better ? GOOD : BAD;
  return `<div style="font-size:11px;color:${color};margin-top:2px">${c > 0 ? "▲" : c < 0 ? "▼" : ""} ${Math.abs(c * 100).toFixed(1)}%</div>`;
}

function table(rows: Row[], metrics: MetricKey[], compare: boolean, firstCol: string): string {
  const th = (t: string, left = false) => `<th style="padding:8px 10px;border-bottom:2px solid ${INK};font-size:12px;color:${MUTED};text-align:${left ? "left" : "right"};white-space:nowrap">${esc(t)}</th>`;
  const head = `<tr>${th(firstCol, true)}${metrics.map((k) => th(METRICS[k].label)).join("")}</tr>`;
  const body = rows
    .map((r, i) => {
      const bold = r.key === "total" ? "font-weight:700;" : "";
      const bg = r.key === "total" ? "background:#F8F7F5;" : i % 2 ? "background:#FCFCFD;" : "";
      const tds = metrics
        .map((k) => `<td style="padding:8px 10px;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;${bold}">${fmt(k, r.cur[k])}${compare && r.prev ? delta(k, r.cur[k], r.prev[k]) : ""}</td>`)
        .join("");
      return `<tr style="${bg}"><td style="padding:8px 10px;border-bottom:1px solid ${LINE};${bold}">${esc(r.label)}</td>${tds}</tr>`;
    })
    .join("");
  return `<div style="overflow-x:auto"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;color:${INK}">${head}${body}</table></div>`;
}

function kpi(total: Row, metrics: MetricKey[], compare: boolean): string {
  const cells = metrics
    .map(
      (k) =>
        `<td style="padding:12px 14px;border:1px solid ${LINE};vertical-align:top;width:${Math.floor(100 / metrics.length)}%"><div style="font-size:12px;color:${MUTED}">${METRICS[k].label}</div><div style="font-size:18px;font-weight:700;color:${INK};margin-top:4px;white-space:nowrap">${fmt(k, total.cur[k])}</div>${compare && total.prev ? delta(k, total.cur[k], total.prev[k]) : ""}</td>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>${cells}</tr></table>`;
}

export type RenderInput = {
  spec: ReportSpec;
  data: ReportData;
  clientName: string;
  periodLabel: string;
  compareLabel: string | null;
  texts: Record<string, string>; // insights 섹션 id → AI가 쓴 글
};

export function sectionRows(s: ReportSection, d: ReportData): Row[] {
  if (s.type === "media_table") return [...d.byMedia, d.total];
  if (s.type === "campaign_table") {
    const by = s.sortBy ?? "cost";
    const sorted = [...d.byCampaign].sort((a, b) => (b.cur[by] ?? -Infinity) - (a.cur[by] ?? -Infinity));
    const ML: Record<string, string> = { meta: "메타", naver: "네이버 SA", gfa: "GFA", kakao: "카카오", google_ads: "구글 Ads" };
    return sorted.slice(0, Math.max(1, Math.min(50, s.limit ?? 10))).map((r) => ({ ...r, label: `[${ML[r.media ?? ""] ?? r.media}] ${r.label}` }));
  }
  if (s.type === "daily_table") return d.daily.map((x) => ({ key: x.date, label: x.date.slice(5).replace("-", "/"), cur: x.m, prev: null }));
  return [];
}

export function renderHtml(i: RenderInput): string {
  const vars = { client: i.clientName, period: i.periodLabel };
  const parts: string[] = [];
  parts.push(`<div style="border-top:4px solid ${ORANGE};padding:20px 0 6px"><div style="font-size:12px;color:${MUTED}">${esc(i.clientName)} · ${esc(i.periodLabel)}${i.compareLabel ? ` · 비교 ${esc(i.compareLabel)}` : ""}</div><div style="font-size:22px;font-weight:800;color:${INK};margin-top:4px">${esc(fillVars(i.spec.subject, vars))}</div></div>`);
  if (i.spec.intro) parts.push(`<p style="font-size:14px;line-height:1.7;color:${INK};margin:12px 0">${esc(fillVars(i.spec.intro, vars)).replace(/\n/g, "<br>")}</p>`);
  for (const s of i.spec.sections) {
    const title = `<h2 style="font-size:16px;color:${INK};margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid ${LINE}">${esc(s.title)}</h2>`;
    const metrics = s.metrics.length ? s.metrics : (["cost", "conversions", "roas"] as MetricKey[]);
    if (s.type === "kpi") parts.push(title + kpi(i.data.total, metrics, !!s.showCompare));
    else if (s.type === "media_table") parts.push(title + table(sectionRows(s, i.data), metrics, !!s.showCompare, "매체"));
    else if (s.type === "campaign_table") parts.push(title + table(sectionRows(s, i.data), metrics, !!s.showCompare, "캠페인"));
    else if (s.type === "daily_table") parts.push(title + table(sectionRows(s, i.data), metrics, false, "날짜"));
    else if (s.type === "insights") {
      const t = i.texts[s.id] ?? "";
      parts.push(title + `<div style="font-size:14px;line-height:1.75;color:${INK}">${esc(t).replace(/\n/g, "<br>") || `<span style="color:${MUTED}">(코멘트 없음)</span>`}</div>`);
    } else if (s.type === "text") parts.push((s.title ? title : "") + `<p style="font-size:14px;line-height:1.7;color:${INK}">${esc(fillVars(s.note ?? "", vars)).replace(/\n/g, "<br>")}</p>`);
  }
  parts.push(`<p style="font-size:11px;color:${MUTED};margin-top:32px;border-top:1px solid ${LINE};padding-top:10px">CTCH 자동 리포트 · 매체 API 기준 수치(매체 관리자 화면과 집계 기준·시간대에 따라 다를 수 있음)${i.data.mediaIncluded.length ? ` · 포함 매체: ${esc(i.data.mediaIncluded.map((m) => ({ meta: "메타", naver: "네이버 SA", gfa: "GFA", kakao: "카카오모먼트", google_ads: "구글 Ads" })[m] ?? m).join(", "))}` : ""}</p>`);
  return `<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;max-width:860px;margin:0 auto;padding:0 16px;color:${INK}">${parts.join("")}</div>`;
}

// 첨부 엑셀 — 섹션마다 시트(표 섹션만) + 코멘트 시트
export function renderXlsx(i: RenderInput): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const sheetName = (t: string) => {
    let n = t.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "시트";
    for (let k = 2; used.has(n); k++) n = `${n.slice(0, 26)}_${k}`;
    used.add(n);
    return n;
  };
  const num = (k: MetricKey, v: number | null) => (v == null ? "" : METRICS[k].unit === "pct" || METRICS[k].unit === "pct0" ? Math.round(v * 10000) / 100 : Math.round(v * 10) / 10);
  const head = (k: MetricKey) => `${METRICS[k].label}${METRICS[k].unit.startsWith("pct") ? "(%)" : ""}`;
  for (const s of i.spec.sections) {
    const metrics = s.metrics.length ? s.metrics : (["cost", "conversions", "roas"] as MetricKey[]);
    let aoa: (string | number)[][] | null = null;
    if (s.type === "kpi") {
      aoa = [["지표", "값", ...(i.data.total.prev ? ["비교 기간", "증감(%)"] : [])]];
      for (const k of metrics) {
        const c = change(i.data.total.cur[k], i.data.total.prev?.[k]);
        aoa.push([head(k), num(k, i.data.total.cur[k]), ...(i.data.total.prev ? [num(k, i.data.total.prev[k]), c == null ? "" : Math.round(c * 1000) / 10] : [])]);
      }
    } else if (s.type === "media_table" || s.type === "campaign_table" || s.type === "daily_table") {
      const rows = sectionRows(s, i.data);
      const first = s.type === "media_table" ? "매체" : s.type === "campaign_table" ? "캠페인" : "날짜";
      const cmp = s.type !== "daily_table" && !!s.showCompare;
      aoa = [[first, ...(s.type === "campaign_table" ? ["매체"] : []), ...metrics.map(head), ...(cmp ? metrics.map((k) => `${METRICS[k].label} 증감(%)`) : [])]];
      for (const r of rows) {
        aoa.push([
          r.label,
          ...(s.type === "campaign_table" ? [r.media ?? ""] : []),
          ...metrics.map((k) => num(k, r.cur[k])),
          ...(cmp ? metrics.map((k) => { const c = change(r.cur[k], r.prev?.[k]); return c == null ? "" : Math.round(c * 1000) / 10; }) : []),
        ]);
      }
    }
    if (aoa) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = aoa[0].map((_, c) => ({ wch: c === 0 ? (s.type === "campaign_table" ? 40 : 14) : 14 }));
      XLSX.utils.book_append_sheet(wb, ws, sheetName(s.title));
    }
  }
  const notes = i.spec.sections.filter((s) => s.type === "insights" && i.texts[s.id]);
  if (notes.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["항목", "내용"], ...notes.map((s) => [s.title, i.texts[s.id]])]), sheetName("코멘트"));
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["표 섹션이 없어요"]]), "리포트");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export type { Metrics };
