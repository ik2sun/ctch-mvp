// 서버 전용 — SEO·AEO·GEO 진단 리포트(PPT) 생성.
// 슬라이드 구성은 학습한 진단 보고서(표지 → 한 장 요약 → 측정 방법 → 진단 결론 → 엔진별 → 크롤러 → 스키마 → 온페이지/인용 적합도
// → 고칠 것/잘 된 것 → 두 경로·외부 채널 → 질문 설계 → 우선 액션 → 재해석 → 한계 → 다음 단계)을 따른다.
// 원칙: 확인된 데이터만 기재, 헤드라인은 단정형 한 문장, 엔진별 분리, 한계 섹션 필수.

import PptxGenJS from "pptxgenjs";
import { SOV_CHECKLIST, type AuditResult, type Finding, type SeoDiagnosis } from "./types";
import { buildReportModel, clip, type ExportOptions, type ReportModel } from "./reportModel";

const C = {
  ink: "15181E",
  soft: "3B4048",
  muted: "767C86",
  faint: "A7ACB4",
  canvas: "F6F6F4",
  surface: "FFFFFF",
  line: "E6E6E2",
  signal: "4F46E5",
  signalSoft: "EEF0FE",
  good: "128A6B",
  goodSoft: "E7F4F0",
  warn: "B4690E",
  warnSoft: "FBF1E4",
  bad: "C0392B",
  badSoft: "FBEAE8",
  dark: "0B0B0C",
  navy: "0F1F3D",
};
const F = "Malgun Gothic";
const W = 13.333;
const H = 7.5;
const MX = 0.6; // 좌우 여백
const CW = W - MX * 2; // 콘텐츠 폭

type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;

function sevColor(sev?: string): { fg: string; bg: string } {
  if (sev === "HIGH") return { fg: C.bad, bg: C.badSoft };
  if (sev === "MID") return { fg: C.warn, bg: C.warnSoft };
  return { fg: C.muted, bg: C.canvas };
}

function readinessColor(r: string): { fg: string; bg: string } {
  if (r === "양호") return { fg: C.good, bg: C.goodSoft };
  if (r === "보통") return { fg: C.warn, bg: C.warnSoft };
  return { fg: C.bad, bg: C.badSoft };
}

function toneColor(t: "ink" | "good" | "warn" | "bad"): string {
  return t === "good" ? C.good : t === "warn" ? C.warn : t === "bad" ? C.bad : C.ink;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

// ---------- 공통 프레임 ----------

function frame(slide: Slide, m: ReportModel, section: string, page: number, total: number, dark = false) {
  const fg = dark ? C.faint : C.muted;
  slide.background = { color: dark ? C.dark : C.surface };
  slide.addText(`${m.brand.toUpperCase()} · SEO · AEO · GEO REPORT`, { x: MX, y: 0.28, w: 6, h: 0.3, fontFace: F, fontSize: 8, color: dark ? C.signalSoft : C.ink, bold: true, charSpacing: 3, margin: 0 });
  slide.addText(`${String(page).padStart(2, "0")} · ${section}`, { x: W - MX - 6, y: 0.28, w: 6, h: 0.3, fontFace: F, fontSize: 8, color: fg, align: "right", charSpacing: 2, margin: 0 });
  slide.addShape("line", { x: MX, y: 0.66, w: CW, h: 0, line: { color: dark ? "2A2A2E" : C.line, width: 0.75 } });
  slide.addText(`${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { x: W - MX - 2, y: H - 0.5, w: 2, h: 0.3, fontFace: F, fontSize: 8, color: fg, align: "right", margin: 0 });
}

function sectionLabel(slide: Slide, text: string, y = 0.95, dark = false) {
  slide.addText(text, { x: MX, y, w: CW, h: 0.28, fontFace: F, fontSize: 9, color: dark ? C.signalSoft : C.signal, bold: true, charSpacing: 2, margin: 0 });
}

function headline(slide: Slide, text: string, y = 1.25, size = 26, dark = false, h = 1.1) {
  slide.addText(text, { x: MX, y, w: CW, h, fontFace: F, fontSize: size, bold: true, color: dark ? C.surface : C.ink, valign: "top", margin: 0, fit: "shrink" });
}

function para(slide: Slide, text: string, x: number, y: number, w: number, h: number, size = 11, color = C.soft, dark = false) {
  slide.addText(text, { x, y, w, h, fontFace: F, fontSize: size, color: dark ? C.faint : color, valign: "top", margin: 0, fit: "shrink", lineSpacingMultiple: 1.15 });
}

function box(slide: Slide, x: number, y: number, w: number, h: number, fill = C.canvas, line = C.line) {
  slide.addShape("rect", { x, y, w, h, fill: { color: fill }, line: { color: line, width: 0.75 } });
}

function kpiCard(slide: Slide, x: number, y: number, w: number, k: ReportModel["kpis"][number]) {
  box(slide, x, y, w, 1.55, C.canvas, C.canvas);
  slide.addShape("rect", { x, y, w, h: 0.05, fill: { color: toneColor(k.tone) === C.ink ? C.ink : toneColor(k.tone) }, line: { color: toneColor(k.tone), width: 0 } });
  slide.addText(k.label, { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.28, fontFace: F, fontSize: 9, color: C.muted, margin: 0 });
  slide.addText(k.value, { x: x + 0.2, y: y + 0.48, w: w - 0.4, h: 0.6, fontFace: F, fontSize: 28, bold: true, color: toneColor(k.tone), margin: 0, fit: "shrink" });
  slide.addText(k.sub, { x: x + 0.2, y: y + 1.1, w: w - 0.4, h: 0.3, fontFace: F, fontSize: 8.5, color: C.muted, margin: 0, fit: "shrink" });
}

function tag(slide: Slide, x: number, y: number, text: string, fg: string, bg: string, w = 0.62) {
  slide.addShape("rect", { x, y, w, h: 0.24, fill: { color: bg }, line: { color: bg, width: 0 } });
  slide.addText(text, { x, y, w, h: 0.24, fontFace: F, fontSize: 7.5, bold: true, color: fg, align: "center", valign: "middle", margin: 0 });
}

function headerCell(text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): Cell {
  return { text, options: { bold: true, color: C.surface, fill: { color: C.ink }, fontSize: 9, fontFace: F, valign: "middle", ...opts } };
}
function cell(text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): Cell {
  return { text, options: { color: C.soft, fontSize: 9, fontFace: F, valign: "top", ...opts } };
}

function table(slide: Slide, rows: Cell[][], x: number, y: number, w: number, colW: number[], rowH?: number) {
  slide.addTable(rows, { x, y, w, colW, rowH, fontFace: F, fontSize: 9, border: { type: "solid", pt: 0.5, color: C.line }, valign: "top", margin: 0.06, autoPage: false });
}

// ---------- 슬라이드 ----------

type Builder = (slide: Slide, page: number, total: number) => void;

function buildSlides(audit: AuditResult, m: ReportModel): Builder[] {
  const d = m.diagnosis;
  const builders: Builder[] = [];

  // 01 표지
  builders.push((s, p, t) => {
    frame(s, m, "COVER", p, t);
    sectionLabel(s, `${m.brand.toUpperCase()} · SEO · AEO · GEO DIAGNOSTIC REPORT`, 1.6);
    s.addShape("line", { x: MX, y: 1.95, w: 0.5, h: 0, line: { color: C.signal, width: 2 } });
    headline(s, "적용하신 SEO는\nAI 검색에서 실제로 동작하고 있는가.", 2.2, 40, false, 2.0);
    para(s, `${m.domain} · 대상 페이지 1건 × 점검 항목 ${audit.findings.length}건 × AI 크롤러 ${audit.robots.crawlers.length}종 × 엔진 5종(ChatGPT · Gemini/AI Overviews · Claude · Perplexity · 네이버) 기준 진단.\n그리고 어떤 질문에 답변이 되기를 원하는가에 대한 논의.`, MX, 4.35, CW - 1, 0.9, 13, C.muted);
    s.addShape("line", { x: MX, y: 5.55, w: CW, h: 0, line: { color: C.line, width: 0.75 } });
    const cols = [
      ["TO", `${m.clientName}`],
      ["SUBJECT", "구조화 데이터 · 크롤러 · 콘텐츠\n실작동 진단 + 엔진별 처방 · 질문 설계"],
      ["DATA", `점검 항목 ${audit.findings.length}건 · 크롤러 ${audit.robots.crawlers.length}종\nJSON-LD ${audit.schema.blocks}블록 · FIX ${m.fixItems.length}건`],
      ["DELIVERED", `${m.dateLabel}\n${m.preparedBy}`],
    ];
    cols.forEach(([k, v], i) => {
      const x = MX + (CW / 4) * i;
      s.addText(k, { x, y: 5.75, w: 2.8, h: 0.25, fontFace: F, fontSize: 8, color: C.muted, charSpacing: 2, margin: 0 });
      s.addText(v, { x, y: 6.02, w: CW / 4 - 0.2, h: 0.75, fontFace: F, fontSize: 11, bold: true, color: C.ink, valign: "top", margin: 0, fit: "shrink" });
    });
  });

  // 02 한 장 요약
  builders.push((s, p, t) => {
    frame(s, m, "EXECUTIVE SUMMARY", p, t);
    sectionLabel(s, "02 · EXECUTIVE SUMMARY");
    headline(s, m.headline, 1.25, 26, false, 1.0);
    para(s, m.subline, MX, 2.3, CW, 0.7, 12, C.soft);
    const gap = 0.2;
    const cw = (CW - gap * 3) / 4;
    m.kpis.forEach((k, i) => kpiCard(s, MX + (cw + gap) * i, 3.15, cw, k));
    const cols: Array<[string, string, string, string]> = [
      ["PASS", C.good, "확인된 것 · 긍정", m.passItems.slice(0, 3).map((f) => f.title).join(" · ") || "확인된 양호 항목 없음"],
      ["FIX", C.bad, "확인된 것 · 과제", m.fixItems.slice(0, 3).map((f) => `${f.title}(${f.severity})`).join(" · ") || "고칠 항목 없음"],
      ["NEXT", C.ink, "제안 방향", d?.priorities?.[0] ? `${d.priorities[0].action} — ${clip(d.priorities[0].why, 80)}` : "AI 진단을 실행하면 엔진별 처방과 우선 액션이 여기에 들어갑니다."],
    ];
    const w3 = (CW - gap * 2) / 3;
    cols.forEach(([k, color, title, body], i) => {
      const x = MX + (w3 + gap) * i;
      tag(s, x, 5.05, k, C.surface, color, 0.55);
      s.addText(title, { x: x + 0.65, y: 5.03, w: w3 - 0.7, h: 0.28, fontFace: F, fontSize: 10, bold: true, color: C.ink, margin: 0 });
      para(s, body, x, 5.4, w3, 1.4, 9.5, C.soft);
    });
  });

  // 03 측정 방법
  builders.push((s, p, t) => {
    frame(s, m, "METHODOLOGY", p, t);
    sectionLabel(s, "03 · METHODOLOGY");
    headline(s, "어떻게 측정했는가.", 1.25, 26, false, 0.7);
    para(s, "AI 크롤러가 보는 방식(JavaScript 미실행, HTML만)으로 페이지를 가져와 점검했습니다. 판정은 확인된 데이터만 기재하고, 확인 불가 항목은 별도로 표기합니다.", MX, 1.95, CW, 0.6, 11, C.muted);
    const left: Cell[][] = [
      [headerCell("측정 설계"), headerCell("")],
      [cell("대상", { bold: true, color: C.ink }), cell(m.url)],
      [cell("수집", { bold: true, color: C.ink }), cell(`${m.fetchedAtLabel} · HTTP ${audit.status} · HTML ${(audit.page.htmlBytes / 1024).toFixed(0)}KB · ${audit.ms}ms`)],
      [cell("렌더링", { bold: true, color: C.ink }), cell("JS 미실행 원본 HTML 기준 (SSR 여부 판정)")],
      [cell("크롤러", { bold: true, color: C.ink }), cell(`robots.txt를 UA ${audit.robots.crawlers.length}종별로 경로 단위 판정. 검색용·실시간 fetch·학습용을 분리`)],
      [cell("스키마", { bold: true, color: C.ink }), cell("JSON-LD 전 블록 파싱 → Product·FAQPage·Organization·Article 필드 단위 검증, 지원 종료 타입 표기")],
      [cell("정합성", { bold: true, color: C.ink }), cell("구조화 데이터 값(가격·리뷰·평점·FAQ)이 화면 텍스트에 존재하는지 대조")],
      [cell("온페이지", { bold: true, color: C.ink }), cell("title · h1 · h2 · description · canonical · lang · robots 지시자 · hreflang · alt · OG")],
      [cell("인용 적합도", { bold: true, color: C.ink }), cell("정의문 패턴 · 질문형 헤딩 · 180~700자 자기완결 단락 · 수치 문장 · 날짜 신호 (휴리스틱)")],
      [cell("AI 파일·등록", { bold: true, color: C.ink }), cell("llms.txt · llms-full.txt · sitemap.xml · 네이버 서치어드바이저 인증 메타")],
    ];
    table(s, left, MX, 2.7, 7.4, [1.4, 6.0]);
    box(s, MX + 7.7, 2.7, CW - 7.7, 3.9, C.canvas, C.canvas);
    s.addText("확인 못한 항목", { x: MX + 7.9, y: 2.85, w: 4, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: C.bad, margin: 0 });
    para(s, m.unverified.map((u) => `· ${u}`).join("\n"), MX + 7.9, 3.2, CW - 8.1, 3.3, 9.5, C.soft);
  });

  // 04 진단 결론
  builders.push((s, p, t) => {
    frame(s, m, "DIAGNOSIS", p, t);
    sectionLabel(s, "04 · DIAGNOSIS");
    headline(s, m.headline, 1.25, 26, false, 1.0);
    para(s, d?.siteRole ? `이 페이지의 역할 — ${d.siteRole}` : m.subline, MX, 2.3, CW, 0.7, 12, C.soft);
    // 왼쪽: 읽기 가능 여부 / 오른쪽: 후보군 진입 요건
    const leftW = (CW - 0.3) / 2;
    box(s, MX, 3.15, leftW, 3.6, C.canvas, C.canvas);
    tag(s, MX + 0.2, 3.35, "읽기", C.surface, audit.page.likelyCsr ? C.bad : C.good, 0.55);
    s.addText("AI가 이 페이지를 읽을 수 있는가", { x: MX + 0.85, y: 3.32, w: leftW - 1, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.ink, margin: 0 });
    const readRows: Cell[][] = [
      [cell("크롤러", { bold: true, color: C.ink }), cell(`검색용 ${audit.summary.searchCrawlersAllowed}/${audit.summary.searchCrawlersTotal} 허용${audit.robots.found ? "" : " (robots.txt 없음)"}`)],
      [cell("렌더링", { bold: true, color: C.ink }), cell(audit.page.likelyCsr ? `CSR 추정 — 본문 ${audit.page.textChars}자` : `SSR — 본문 ${audit.page.textChars.toLocaleString()}자 · JSON-LD ${audit.schema.blocks}블록`)],
      [cell("색인 지시자", { bold: true, color: C.ink }), cell(audit.page.noindex ? "noindex 감지" : audit.page.snippetBlocked ? "nosnippet 감지" : "차단 지시자 없음")],
      [cell("구조화 데이터", { bold: true, color: C.ink }), cell(audit.schema.blocks ? clip(audit.schema.types.join(" · "), 70) : "없음")],
    ];
    table(s, readRows, MX + 0.2, 3.75, leftW - 0.4, [1.3, leftW - 1.7]);
    const rx = MX + leftW + 0.3;
    s.addShape("rect", { x: rx, y: 3.15, w: leftW, h: 3.6, fill: { color: C.dark }, line: { color: C.dark, width: 0 } });
    tag(s, rx + 0.2, 3.35, "후보군", C.dark, C.signalSoft, 0.62);
    s.addText("비브랜드 질문의 후보군에 드는가", { x: rx + 0.92, y: 3.32, w: leftW - 1.1, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.surface, margin: 0 });
    const cand = [
      `인용 후보 단락 ${audit.citability.candidatePassages}개 · 질문형 헤딩 ${audit.citability.questionHeadings.length}개 · 정의문 ${audit.citability.definitionPattern ? "있음" : "없음"}`,
      `수치 문장 ${audit.citability.numericSentences}개 · 날짜 신호 ${audit.citability.dates.length ? "있음" : "없음"} · FAQ ${audit.schema.faqQuestions.length}문항`,
      audit.schema.products.length ? `Product 누락 필드: ${clip(audit.schema.products[0].missing.join(", "), 160) || "없음"}` : "Product 스키마 없음 (커머스 카드형 답변 후보 아님)",
      audit.schema.hiddenValues.length ? `화면 미표시 값: ${clip(audit.schema.hiddenValues.join(" · "), 120)}` : "구조화 값이 화면에도 표시됨",
      `title: ${clip(audit.page.title ?? "없음", 60)} / h1: ${clip(audit.page.h1[0] ?? "없음", 50)} / h2 ${audit.page.h2.length}개`,
      d ? `AI 진단: ${d.engines.map((e) => `${e.engine} ${e.readiness}`).join(" · ")}` : "AI 진단 미실행 — 엔진별 판정은 화면에서 AI 진단 실행 후 재출력",
      d?.engines?.length ? `가장 큰 차단 요인: ${clip(d.engines.flatMap((e) => e.blockers).slice(0, 4).join(" · "), 150)}` : "",
    ].filter(Boolean);
    para(s, cand.map((c) => `· ${c}`).join("\n\n"), rx + 0.2, 3.75, leftW - 0.4, 2.9, 10, C.faint, true);
  });

  // 05 엔진별 준비도
  builders.push((s, p, t) => {
    frame(s, m, "ENGINE BEHAVIOR", p, t);
    sectionLabel(s, "05 · ENGINE BEHAVIOR");
    headline(s, "엔진마다 보는 데이터가 다릅니다.", 1.25, 26, false, 0.7);
    para(s, "하나의 조치로 전 엔진이 개선되지 않습니다. 검색 원천과 선호 출처가 다르므로 원인과 처방을 엔진별로 분리합니다.", MX, 1.95, CW, 0.5, 11, C.muted);
    const rows: Cell[][] = [[headerCell("엔진"), headerCell("준비도"), headerCell("근거 (이 페이지에서 확인된 것)"), headerCell("후보군 진입을 막는 요인"), headerCell("처방")]];
    const engines = d?.engines ?? [];
    if (engines.length === 0) {
      rows.push([cell("—"), cell("—"), cell("AI 진단 미실행. 화면에서 'AI 진단 실행' 후 다시 내려받으면 엔진별 판정이 채워집니다.", { colspan: 3 })]);
    }
    for (const e of engines) {
      const rc = readinessColor(e.readiness);
      rows.push([
        cell(e.engine, { bold: true, color: C.ink }),
        cell(e.readiness, { bold: true, color: rc.fg, fill: { color: rc.bg }, align: "center" }),
        cell(clip(e.evidence, 160)),
        cell(clip(e.blockers.map((b) => `· ${b}`).join("\n"), 220)),
        cell(clip(e.actions.map((a) => `· ${a}`).join("\n"), 260)),
      ]);
    }
    table(s, rows, MX, 2.6, CW, [1.6, 0.9, 3.0, 3.1, CW - 8.6]);
  });

  // 06 크롤러
  builders.push((s, p, t) => {
    frame(s, m, "AI CRAWLER ACCESS", p, t);
    sectionLabel(s, "06 · AI CRAWLER ACCESS");
    headline(s, audit.summary.searchCrawlersAllowed === audit.summary.searchCrawlersTotal ? "검색용 AI 크롤러는 전부 들어올 수 있습니다." : "일부 검색용 AI 크롤러가 막혀 있습니다.", 1.25, 26, false, 0.7);
    para(s, `robots.txt ${audit.robots.found ? "확인" : "없음(기본 허용)"} · 경로 ${clip(new URL(audit.finalUrl).pathname, 60)} 기준. 검색용 UA 차단은 인용 불가로 직결되고, 학습용 UA 차단은 인용과 무관합니다. 두 판정을 합치지 않습니다.`, MX, 1.95, CW, 0.5, 10.5, C.muted);
    const mk = (title: string, list: typeof m.searchCrawlers): Cell[][] => {
      const rows: Cell[][] = [[headerCell(title, { colspan: 2 }), headerCell("상태"), headerCell("이 UA가 결정하는 것")]];
      for (const c of list) {
        const ok = c.status === "allowed";
        rows.push([cell(c.ua, { bold: true, color: C.ink }), cell(c.owner, { color: C.muted }), cell(ok ? "허용" : "차단", { bold: true, color: ok ? C.good : C.bad, fill: { color: ok ? C.goodSoft : C.badSoft }, align: "center" }), cell(c.governs)]);
      }
      return rows;
    };
    table(s, mk("검색용 · 실시간 fetch", [...m.searchCrawlers, ...m.fetchCrawlers]), MX, 2.6, 7.6, [1.5, 1.0, 0.7, 4.4]);
    table(s, mk("학습용 (인용과 무관)", m.trainingCrawlers), MX + 7.9, 2.6, CW - 7.9, [1.3, 0.9, 0.6, CW - 7.9 - 2.8]);
    para(s, "IP·CDN(WAF) 차단은 서버 로그 없이는 확인할 수 없습니다. Google-Extended 차단은 AI Overviews에 영향이 없으며, nosnippet / max-snippet:0 이 실제 제어 수단입니다.", MX + 7.9, 5.3, CW - 7.9, 1.0, 9, C.muted);
  });

  // 07 스키마
  builders.push((s, p, t) => {
    frame(s, m, "STRUCTURED DATA", p, t);
    sectionLabel(s, "07 · STRUCTURED DATA");
    headline(s, audit.schema.blocks ? `스키마 ${audit.schema.types.length}종이 있습니다 — 다만 채워야 할 필드가 남아 있습니다.` : "구조화 데이터가 없습니다.", 1.25, 26, false, 0.7);
    para(s, audit.schema.blocks ? `JSON-LD ${audit.schema.blocks}블록 · 파싱 오류 ${audit.schema.parseErrors}건 · ${audit.schema.types.join(" · ")}` : "Product·FAQPage·Organization 등 답변 소재를 정형화한 데이터가 없습니다. Gemini는 JSON-LD 전용 문구까지 인용하고, ChatGPT는 정형 상품 데이터를 우선합니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
    const rows: Cell[][] = [[headerCell("노드"), headerCell("이름"), headerCell("확인됨"), headerCell("과제")]];
    for (const n of audit.schema.nodes.slice(0, 9)) rows.push([cell(n.type, { bold: true, color: C.ink }), cell(clip(n.name ?? "", 30), { color: C.muted }), cell(clip(n.ok.join(" · "), 120), { color: C.good }), cell(clip(n.issues.join(" · "), 120), { color: n.issues.length ? C.bad : C.muted })]);
    if (audit.schema.nodes.length === 0) rows.push([cell("—"), cell("—"), cell("—"), cell("감지된 노드 없음")]);
    table(s, rows, MX, 2.6, 7.6, [1.4, 1.6, 2.3, 2.3]);
    const rx = MX + 7.9;
    const prod = audit.schema.products[0];
    if (prod) {
      box(s, rx, 2.6, CW - 7.9, 2.2, C.canvas, C.canvas);
      s.addText(`Product 필드 체크 — ${clip(prod.name ?? "", 28)}`, { x: rx + 0.2, y: 2.72, w: CW - 8.3, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: C.ink, margin: 0 });
      para(s, `있음: ${prod.present.join(", ") || "—"}`, rx + 0.2, 3.05, CW - 8.3, 0.8, 9, C.good);
      para(s, `없음: ${prod.missing.join(", ") || "—"}`, rx + 0.2, 3.85, CW - 8.3, 0.85, 9, C.bad);
    }
    const hy = prod ? 5.0 : 2.6;
    box(s, rx, hy, CW - 7.9, 1.7, audit.schema.hiddenValues.length ? C.badSoft : C.goodSoft, audit.schema.hiddenValues.length ? C.badSoft : C.goodSoft);
    s.addText(audit.schema.hiddenValues.length ? "정합성 — 구조화 데이터에만 있고 화면에 없는 값" : "정합성 — 구조화 값이 화면에도 표시됨", { x: rx + 0.2, y: hy + 0.12, w: CW - 8.3, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: audit.schema.hiddenValues.length ? C.bad : C.good, margin: 0 });
    para(s, audit.schema.hiddenValues.length ? `${audit.schema.hiddenValues.join(" · ")}\n화면과 데이터가 다르면 신뢰 신호가 약해지고, 가격·리뷰는 판매 채널과 어긋날 수 있습니다.` : "가격·리뷰·평점이 화면에 표시됩니다. 실제 판매 채널 가격과의 일치 여부는 별도 확인이 필요합니다.", rx + 0.2, hy + 0.45, CW - 8.3, 1.15, 9, C.soft);
  });

  // 08 온페이지 · 인용 적합도
  builders.push((s, p, t) => {
    frame(s, m, "ON-PAGE · CITABILITY", p, t);
    sectionLabel(s, "08 · ON-PAGE · CITABILITY");
    headline(s, audit.citability.questionHeadings.length === 0 ? "읽히기는 하지만, 단락 단위로 인용되기 좋은 구조는 아닙니다." : "인용될 수 있는 구조가 일부 갖춰져 있습니다.", 1.25, 24, false, 0.7);
    const left: Cell[][] = [
      [headerCell("온페이지", { colspan: 2 })],
      [cell("title", { bold: true, color: C.ink }), cell(clip(audit.page.title ?? "—", 80))],
      [cell("description", { bold: true, color: C.ink }), cell(clip(audit.page.metaDescription ?? "—", 110))],
      [cell("h1", { bold: true, color: C.ink }), cell(clip(audit.page.h1.join(" | ") || "—", 90))],
      [cell("h2", { bold: true, color: C.ink }), cell(audit.page.h2.length ? `${audit.page.h2.length}개 · ${clip(audit.page.h2.slice(0, 4).join(" / "), 80)}` : "0개")],
      [cell("canonical", { bold: true, color: C.ink }), cell(clip(audit.page.canonical ?? "—", 80) + (audit.page.canonicalMatches === false ? " (현재 URL과 다름)" : ""))],
      [cell("lang / header", { bold: true, color: C.ink }), cell(`${audit.page.lang ?? "—"} / ${audit.page.contentLanguage ?? "—"} · hreflang ${audit.page.hreflangCount}`)],
      [cell("robots", { bold: true, color: C.ink }), cell([audit.page.metaRobots, audit.page.xRobotsTag].filter(Boolean).join(" · ") || "—")],
      [cell("이미지·구조", { bold: true, color: C.ink }), cell(`이미지 ${audit.page.imgCount} (alt 누락 ${audit.page.imgAltMissing}) · 리스트 ${audit.page.listCount} · 표 ${audit.page.tableCount} · 영상 ${audit.page.videoCount}`)],
      [cell("AI 파일·등록", { bold: true, color: C.ink }), cell(`llms.txt ${audit.files.llmsTxt ? "있음" : "없음"} · sitemap ${audit.files.sitemapXml || audit.robots.sitemaps.length ? "있음" : "없음"} · 서치어드바이저 메타 ${audit.page.hasNaverVerification ? "있음" : "미검출"}`)],
    ];
    table(s, left, MX, 2.1, 7.4, [1.4, 6.0]);
    const rx = MX + 7.7;
    const right: Cell[][] = [
      [headerCell("인용 적합도 (휴리스틱)", { colspan: 2 })],
      [cell("정의문 패턴", { bold: true, color: C.ink }), cell(audit.citability.definitionPattern ? "초반 1,200자 안에 있음" : "없음 — \"X는 Y입니다\" 형태의 직접 답변이 필요", { color: audit.citability.definitionPattern ? C.good : C.bad })],
      [cell("질문형 헤딩", { bold: true, color: C.ink }), cell(audit.citability.questionHeadings.length ? clip(audit.citability.questionHeadings.slice(0, 4).join(" / "), 90) : "없음", { color: audit.citability.questionHeadings.length ? C.soft : C.bad })],
      [cell("후보 단락", { bold: true, color: C.ink }), cell(`${audit.citability.candidatePassages}개 (180~700자 자기완결 단락)`)],
      [cell("수치 문장", { bold: true, color: C.ink }), cell(`${audit.citability.numericSentences}개`)],
      [cell("날짜 신호", { bold: true, color: C.ink }), cell(audit.citability.dates.length ? audit.citability.dates.join(" · ") : "없음 — 최신성 가중(Perplexity·Gemini)에서 불리", { color: audit.citability.dates.length ? C.soft : C.bad })],
    ];
    table(s, right, rx, 2.1, CW - 7.7, [1.3, CW - 7.7 - 1.3]);
    if (audit.citability.firstParagraph) {
      box(s, rx, 4.75, CW - 7.7, 2.0, C.canvas, C.canvas);
      s.addText("첫 단락 — AI가 가장 먼저 읽는 부분", { x: rx + 0.2, y: 4.85, w: CW - 8.1, h: 0.28, fontFace: F, fontSize: 9, bold: true, color: C.muted, margin: 0 });
      para(s, clip(audit.citability.firstParagraph, 330), rx + 0.2, 5.15, CW - 8.1, 1.5, 9, C.soft);
    }
  });

  // 09~ 고쳐야 합니다 (8건/슬라이드)
  const fixPages = chunk(m.fixItems, 8);
  fixPages.forEach((items, idx) => {
    builders.push((s, p, t) => {
      frame(s, m, "TECHNICAL AUDIT · FIX", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · TECHNICAL AUDIT · FIX${fixPages.length > 1 ? ` (${idx + 1}/${fixPages.length})` : ""}`);
      headline(s, idx === 0 ? `고쳐야 합니다 — HIGH ${audit.summary.high} · MID ${audit.summary.mid} · LOW ${audit.summary.low}` : "고쳐야 합니다 (계속)", 1.25, 24, false, 0.7);
      const rows: Cell[][] = [[headerCell("#"), headerCell("우선"), headerCell("영역"), headerCell("항목"), headerCell("상세"), headerCell("영향 엔진")]];
      for (const f of items) {
        const sc = sevColor(f.severity);
        rows.push([cell(f.id, { color: C.muted }), cell(f.severity ?? "", { bold: true, color: sc.fg, fill: { color: sc.bg }, align: "center" }), cell(f.area, { color: C.muted }), cell(clip(f.title, 60), { bold: true, color: C.ink }), cell(clip(f.detail, 170)), cell(clip(f.engines.join(" · "), 40), { color: C.muted })]);
      }
      if (items.length === 0) rows.push([cell("—"), cell("—"), cell("—"), cell("고칠 항목이 없습니다.", { colspan: 3 })]);
      table(s, rows, MX, 2.05, CW, [0.5, 0.6, 1.0, 2.9, CW - 0.5 - 0.6 - 1.0 - 2.9 - 1.5, 1.5]);
    });
  });

  // 잘 되어 있습니다 + INFO
  builders.push((s, p, t) => {
    frame(s, m, "TECHNICAL AUDIT · PASS", p, t);
    sectionLabel(s, `${String(p).padStart(2, "0")} · TECHNICAL AUDIT · PASS`);
    headline(s, `잘 되어 있습니다 — ${m.passItems.length}건`, 1.25, 24, false, 0.7);
    const rows: Cell[][] = [[headerCell("영역"), headerCell("항목"), headerCell("확인 내용")]];
    for (const f of m.passItems.slice(0, 10)) rows.push([cell(f.area, { color: C.muted }), cell(clip(f.title, 50), { bold: true, color: C.good }), cell(clip(f.detail, 150))]);
    if (m.passItems.length === 0) rows.push([cell("—"), cell("—"), cell("확인된 양호 항목이 없습니다.")]);
    table(s, rows, MX, 2.05, 7.6, [1.1, 2.6, 3.9]);
    const rx = MX + 7.9;
    box(s, rx, 2.05, CW - 7.9, 4.6, C.canvas, C.canvas);
    s.addText("참고 (INFO) — 판정 보류·맥락 항목", { x: rx + 0.2, y: 2.17, w: CW - 8.3, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: C.ink, margin: 0 });
    para(s, m.infoItems.map((f) => `· ${f.title}\n  ${clip(f.detail, 110)}`).join("\n") || "· 없음", rx + 0.2, 2.55, CW - 8.3, 4.0, 9, C.soft);
  });

  // 두 경로 · 외부 채널
  builders.push((s, p, t) => {
    frame(s, m, "TWO PATHS · OFFSITE", p, t);
    sectionLabel(s, `${String(p).padStart(2, "0")} · TWO PATHS · OFFSITE`);
    headline(s, "원본은 하나인데, 도달 경로는 둘입니다.", 1.25, 26, false, 0.7);
    para(s, "Gemini는 페이지를 직접 읽고(정확하지만 2~3위), Perplexity·네이버는 그 문장을 옮겨 적은 블로그·리뷰 플랫폼을 읽습니다(1순위는 대부분 이 경로). 관건은 어떤 문장을 심을 것인가, 그 문장이 옮겨 적히게 할 것인가입니다.", MX, 1.95, CW, 0.7, 10.5, C.muted);
    const half = (CW - 0.3) / 2;
    s.addShape("rect", { x: MX, y: 2.85, w: half, h: 0.42, fill: { color: C.good }, line: { color: C.good, width: 0 } });
    s.addText("PATH A · 상세페이지 직접 인용 (Gemini · AI Overviews)", { x: MX + 0.2, y: 2.85, w: half - 0.4, h: 0.42, fontFace: F, fontSize: 10.5, bold: true, color: C.surface, valign: "middle", margin: 0 });
    box(s, MX, 3.27, half, 3.4, C.canvas, C.canvas);
    const pathA = d?.geo?.twoPaths?.pathA?.length
      ? d.geo.twoPaths.pathA
      : [
          `이 페이지에서 인용될 수 있는 소재: 정의문 ${audit.citability.definitionPattern ? "있음" : "없음"} · 질문형 헤딩 ${audit.citability.questionHeadings.length} · 후보 단락 ${audit.citability.candidatePassages} · FAQ ${audit.schema.faqQuestions.length}문항 · 수치 문장 ${audit.citability.numericSentences}`,
          "처방: 하위 질의(query fan-out) 단위로 답하는 단락 구조(질문형 H2 + 2~3문장 답), 첫 100~200자 직접 답변, Organization·sameAs 엔티티 연결, 스키마 완결, 날짜 표기.",
          audit.schema.hiddenValues.length ? `주의: 구조화 데이터에만 있는 값(${clip(audit.schema.hiddenValues.join(", "), 50)})은 화면에도 표시해 정합성을 맞춥니다.` : "구조화 값과 화면이 일치합니다.",
        ];
    para(s, pathA.map((x, i) => `${i + 1}. ${x}`).join("\n\n"), MX + 0.2, 3.45, half - 0.4, 3.1, 9.5, C.soft);
    const rx = MX + half + 0.3;
    s.addShape("rect", { x: rx, y: 2.85, w: half, h: 0.42, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
    s.addText("PATH B · 외부 채널 경유 (Perplexity · 네이버 · ChatGPT)", { x: rx + 0.2, y: 2.85, w: half - 0.4, h: 0.42, fontFace: F, fontSize: 10.5, bold: true, color: C.surface, valign: "middle", margin: 0 });
    box(s, rx, 3.27, half, 3.4, C.canvas, C.canvas);
    const offsite = d?.geo?.twoPaths?.pathB?.length
      ? d.geo.twoPaths.pathB
      : d?.offsite?.length
        ? d.offsite
        : ["AI 진단을 실행하면 이 페이지에 맞는 외부 채널 액션(블로그·리뷰 플랫폼·커뮤니티·네이버 생태계)이 채워집니다.", "공통 원칙: 옮겨 적히기 좋은 고유 문장·수치를 페이지에 먼저 심고, 그 문장이 블로그·유튜브·리뷰 플랫폼·지식iN에 그대로 등장하게 합니다.", "네이버: Yeti 허용·서치어드바이저 등록 후 C-Rank 누적 채널(공식 블로그)에서 같은 문장을 반복 발행합니다."];
    para(s, offsite.map((x, i) => `${i + 1}. ${x}`).join("\n\n"), rx + 0.2, 3.45, half - 0.4, 3.1, 9.5, C.soft);
  });

  // 질문 설계 (비브랜드 질의 10선 — 실행 모듈의 기준)
  builders.push((s, p, t) => {
    frame(s, m, "QUESTION DESIGN", p, t);
    sectionLabel(s, `${String(p).padStart(2, "0")} · QUESTION DESIGN`);
    headline(s, "어떤 질문에 답변이 되기를 원하는가.", 1.25, 26, false, 0.7);
    para(s, "질문은 지어내지 않습니다. 이 페이지의 FAQ·속성·본문 문구에서 뽑은, 사용자가 실제로 입력할 법한 비브랜드 질문입니다. 범용형(카테고리 일반 추천)과 검증형(페이지 고유 조건)을 섞고, 여정 4단계(정보 탐색·대안 비교·솔루션 탐색·구매 결정)에 분산합니다.", MX, 1.95, CW, 0.6, 10.5, C.muted);
    const rows: Cell[][] = [[headerCell("No"), headerCell("비브랜드 질문"), headerCell("유형"), headerCell("여정 단계"), headerCell("설계 근거")]];
    const qs = d?.questions ?? [];
    for (const q of qs.slice(0, 10)) rows.push([cell(String(q.no), { color: C.muted, align: "center" }), cell(clip(q.question, 70), { bold: true, color: C.ink }), cell(q.type, { color: q.type === "검증형" ? C.signal : C.soft }), cell(q.intent, { color: C.soft }), cell(clip(q.basis, 80), { color: C.muted })]);
    if (qs.length === 0) rows.push([cell("—"), cell("AI 진단 미실행 — 화면에서 AI 진단을 실행하면 질문 10개가 설계됩니다.", { colspan: 4 })]);
    table(s, rows, MX, 2.65, CW, [0.5, 4.6, 0.9, 1.1, CW - 7.1]);
  });

  // ===== AI 진단이 있을 때만 추가되는 실행 모듈 (구버전 진단 결과처럼 모듈이 비어 있으면 안내 슬라이드로 대체) =====
  const hasModules = !!d && (d.aeo.items.length > 0 || d.geo.snippets.length > 0 || d.sov.prompts.length > 0 || !!d.schemaProposal);
  if (d && hasModules) {
    // 모듈 1-A. AEO 콘텐츠 설계 (5건/슬라이드)
    const aeoPages = chunk(d.aeo.items.slice(0, 10), 5);
    aeoPages.forEach((items, idx) => {
      builders.push((s, p, t) => {
        frame(s, m, "AEO CONTENT DESIGN", p, t);
        sectionLabel(s, `${String(p).padStart(2, "0")} · AEO CONTENT DESIGN${aeoPages.length > 1 ? ` (${idx + 1}/${aeoPages.length})` : ""}`);
        headline(s, idx === 0 ? "질문형 H2와 첫 100~200자 직접 답변." : "질문형 H2와 직접 답변 (계속)", 1.25, 24, false, 0.7);
        if (idx === 0) para(s, "AI는 질의와 매칭되는 헤딩 아래의 자기완결 단락을 추출합니다. 각 질문에 대해 H2 제목과 정의문으로 시작하는 첫 단락을 설계했습니다. 180~700자 확장 단락의 첫 부분으로 그대로 쓸 수 있습니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
        const rows: Cell[][] = [[headerCell("No"), headerCell("단계"), headerCell("질문형 H2"), headerCell("Direct Answer — 첫 100~200자")]];
        for (const it of items) rows.push([cell(String(it.no), { color: C.muted, align: "center" }), cell(it.stage, { color: C.signal, bold: true }), cell(clip(it.h2, 70), { bold: true, color: C.ink }), cell(clip(it.directAnswer, 240))]);
        table(s, rows, MX, idx === 0 ? 2.55 : 2.05, CW, [0.5, 1.0, 3.6, CW - 5.1]);
      });
    });

    // 모듈 1-B. FAQ 스니펫 + 요약 표
    builders.push((s, p, t) => {
      frame(s, m, "FAQ SNIPPET · SUMMARY TABLE", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · FAQ SNIPPET · SUMMARY TABLE`);
      headline(s, "페이지 하단에 바로 넣는 Q&A 블록과 요약 표.", 1.25, 24, false, 0.7);
      const half = (CW - 0.3) / 2;
      const faqRows: Cell[][] = [[headerCell("FAQ 스니펫 (본문 + FAQPage 스키마 동일 문장)", { colspan: 2 })]];
      for (const f of d.aeo.faq.slice(0, 7)) faqRows.push([cell("Q", { bold: true, color: C.signal, align: "center" }), cell([{ text: clip(f.question, 80), options: { bold: true, color: C.ink, breakLine: true } }, { text: clip(f.answer, 200), options: { color: C.soft } }] as unknown as string)]);
      if (d.aeo.faq.length === 0) faqRows.push([cell("—"), cell("FAQ 없음")]);
      table(s, faqRows, MX, 2.05, half, [0.4, half - 0.4]);
      const rx = MX + half + 0.3;
      const st = d.aeo.summaryTable;
      if (st && st.columns.length) {
        s.addText(clip(st.title, 60), { x: rx, y: 2.05, w: half, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: C.ink, margin: 0 });
        const cols = st.columns.slice(0, 5);
        const cw = cols.map(() => half / cols.length);
        const rows: Cell[][] = [cols.map((c) => headerCell(clip(c, 24)))];
        for (const r of st.rows.slice(0, 8)) rows.push(cols.map((_, i) => cell(clip(r[i] ?? "", 60), { bold: i === 0, color: i === 0 ? C.ink : C.soft })));
        table(s, rows, rx, 2.4, half, cw);
      } else {
        box(s, rx, 2.05, half, 2, C.canvas, C.canvas);
        para(s, "요약 표 없음", rx + 0.2, 2.2, half - 0.4, 0.5, 10, C.muted);
      }
    });

    // 모듈 2-A. Citable Snippet 5선
    builders.push((s, p, t) => {
      frame(s, m, "CITABLE SNIPPETS", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · CITABLE SNIPPETS`);
      headline(s, "AI가 그대로 옮겨 적을 문장 5개.", 1.25, 24, false, 0.7);
      para(s, "수치·데이터가 든 고유 문장은 직접 인용(Path A)과 외부 경유 인용(Path B) 양쪽에서 작동합니다. [확인 필요] 표기는 실제 값을 채운 뒤 게시합니다. 확인되지 않은 수치를 만들어 넣지 않았습니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
      const rows: Cell[][] = [[headerCell("No"), headerCell("Citable Snippet"), headerCell("근거"), headerCell("심을 위치"), headerCell("엔진")]];
      for (const sn of d.geo.snippets.slice(0, 5)) rows.push([cell(String(sn.no), { color: C.muted, align: "center" }), cell(clip(sn.snippet, 190), { bold: true, color: C.ink }), cell(clip(sn.basis, 100)), cell(clip(sn.placement, 90)), cell(clip(sn.targetEngines.join(" · "), 40), { color: C.muted })]);
      if (d.geo.snippets.length === 0) rows.push([cell("—"), cell("스니펫 없음", { colspan: 4 })]);
      table(s, rows, MX, 2.55, CW, [0.5, 5.2, 2.6, 2.4, CW - 10.7]);
    });

    // 모듈 2-B. 엔티티 매핑
    builders.push((s, p, t) => {
      frame(s, m, "ENTITY MAPPING", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · ENTITY MAPPING`);
      headline(s, "지식 그래프에서 브랜드를 카테고리에 묶는 키워드 매핑.", 1.25, 24, false, 0.7);
      para(s, "Gemini·AI Overviews는 엔티티 인식에 크게 의존합니다. 브랜드·제품·기술명을 핵심 키워드와 연결하고 sameAs로 외부 엔티티에 묶습니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
      const rows: Cell[][] = [[headerCell("엔티티"), headerCell("카테고리"), headerCell("핵심 키워드"), headerCell("보조 키워드"), headerCell("sameAs 후보"), headerCell("스키마 표현")]];
      for (const e of d.geo.entityMap.slice(0, 8)) rows.push([cell(clip(e.entity, 30), { bold: true, color: C.ink }), cell(clip(e.category, 40)), cell(clip(e.coreKeywords.join(" · "), 70)), cell(clip(e.supportKeywords.join(" · "), 70), { color: C.muted }), cell(clip(e.sameAs.join(" · "), 70), { color: C.muted }), cell(clip(e.schemaHint, 50), { color: C.signal })]);
      if (d.geo.entityMap.length === 0) rows.push([cell("—"), cell("매핑 없음", { colspan: 5 })]);
      table(s, rows, MX, 2.55, CW, [1.7, 1.7, 2.4, 2.2, 2.2, CW - 10.2]);
    });

    // 모듈 3-A. SOV 실측 프롬프트 세트
    builders.push((s, p, t) => {
      frame(s, m, "SOV TEST PROMPTS", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · SOV TEST PROMPTS`);
      headline(s, "5대 엔진에 동일 조건으로 던질 질문 10개.", 1.25, 24, false, 0.7);
      para(s, "ChatGPT · Gemini · Perplexity · Claude · 네이버 AI 브리핑. 매 질의는 세션 초기화(로그아웃·시크릿·대화 이력 없음) 상태에서 한 문장만 입력하고, 응답 원문과 인용 URL을 전수 보관합니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
      const rows: Cell[][] = [[headerCell("No"), headerCell("단계"), headerCell("입력 프롬프트 (그대로 붙여 넣기)"), headerCell("엔진별 기록 주의")]];
      for (const pr of d.sov.prompts.slice(0, 10)) rows.push([cell(String(pr.no), { color: C.muted, align: "center" }), cell(pr.stage, { color: C.signal, bold: true }), cell(clip(pr.prompt, 90), { bold: true, color: C.ink }), cell(clip(pr.note, 80), { color: C.muted })]);
      if (d.sov.prompts.length === 0) rows.push([cell("—"), cell("프롬프트 없음", { colspan: 3 })]);
      table(s, rows, MX, 2.55, CW, [0.5, 1.0, 6.2, CW - 7.7]);
    });

    // 모듈 3-B. 실측 기록 체크리스트
    builders.push((s, p, t) => {
      frame(s, m, "SOV RECORD CHECKLIST", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · SOV RECORD CHECKLIST`);
      headline(s, "실측 때 반드시 기록하는 5가지.", 1.25, 24, false, 0.7);
      const rows: Cell[][] = [[headerCell("#"), headerCell("항목"), headerCell("기록 방법"), headerCell("기록 예")]];
      for (const c of SOV_CHECKLIST) rows.push([cell(String(c.no), { color: C.muted, align: "center" }), cell(c.item, { bold: true, color: C.ink }), cell(c.howToRecord), cell(c.example, { color: C.muted })]);
      table(s, rows, MX, 2.05, 8.2, [0.4, 1.5, 4.5, 1.8]);
      const rx = MX + 8.5;
      box(s, rx, 2.05, CW - 8.5, 4.6, C.canvas, C.canvas);
      s.addText("집계 지표", { x: rx + 0.2, y: 2.17, w: CW - 8.9, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: C.ink, margin: 0 });
      para(
        s,
        [
          "· AI 언급 점유율 = 언급 응답 / 총 응답 (10 × 5 = 50)",
          "· 1순위 추천 수 (엔진별 분리)",
          "· 자사 도메인 인용 비중 = 자사 URL / 전체 인용 (Perplexity·Gemini 기준)",
          "· 인용 경로 판정: 직접(Path A) vs 외부 경유(Path B)",
          "· 경쟁사 동시 호명 · 우위/미언급",
          "· 질문 단계별(정보 탐색·대안 비교·솔루션 탐색·구매 결정) 언급률",
          "",
          "주의: 단일 회차 수치는 성과 지표로 쓰지 않고, 동일 조건 재측정으로 추세를 봅니다. 네이버는 글로벌 엔진과 합산하지 않습니다. 브랜드명 없이 제품명만 등장한 응답은 별도 표기합니다.",
        ].join("\n"),
        rx + 0.2,
        2.5,
        CW - 8.9,
        4.0,
        9.5,
        C.soft,
      );
    });

    // 모듈 3-C. 의사결정 트리
    builders.push((s, p, t) => {
      frame(s, m, "DECISION TREE", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · DECISION TREE`);
      headline(s, "노출이 미흡하면 어디부터 고치는가.", 1.25, 24, false, 0.7);
      para(s, "기술적 차단·SEO 부재인지, 콘텐츠 인용 적합도 부족인지, 엔티티·외부 채널 부재인지를 순서대로 가릅니다. 각 단계에 이 페이지의 현재 판정을 적었습니다.", MX, 1.95, CW, 0.5, 10.5, C.muted);
      const rows: Cell[][] = [[headerCell("단계"), headerCell("점검 질문"), headerCell("이 페이지 판정"), headerCell("미충족 시 조치"), headerCell("충족 시")]];
      for (const n of d.sov.decisionTree.slice(0, 7)) {
        const ok = /^통과|^충족/.test(n.verdictForThisPage);
        const partial = /^부분/.test(n.verdictForThisPage);
        rows.push([cell(String(n.step), { bold: true, color: C.signal, align: "center" }), cell(clip(n.check, 90), { bold: true, color: C.ink }), cell(clip(n.verdictForThisPage, 90), { color: ok ? C.good : partial ? C.warn : C.bad, fill: { color: ok ? C.goodSoft : partial ? C.warnSoft : C.badSoft } }), cell(clip(n.ifFail, 90)), cell(clip(n.ifPass, 40), { color: C.muted })]);
      }
      if (d.sov.decisionTree.length === 0) rows.push([cell("—"), cell("의사결정 트리 없음", { colspan: 4 })]);
      table(s, rows, MX, 2.55, CW, [0.6, 3.4, 3.2, 3.2, CW - 10.4]);
    });

    // 모듈 4. JSON-LD 제안
    builders.push((s, p, t) => {
      frame(s, m, "JSON-LD PROPOSAL", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · JSON-LD PROPOSAL`);
      const sp = d.schemaProposal;
      headline(s, sp ? `${sp.industry} 기준 구조화 데이터 제안.` : "구조화 데이터 제안.", 1.25, 24, false, 0.7);
      const leftW = 4.3;
      box(s, MX, 2.05, leftW, 4.6, C.canvas, C.canvas);
      s.addText("판정 근거와 적용 메모", { x: MX + 0.2, y: 2.17, w: leftW - 0.4, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: C.ink, margin: 0 });
      para(s, sp ? `${sp.reason}\n\n${sp.notes.map((n) => `· ${n}`).join("\n")}` : "AI 진단에서 스키마 제안이 생성되지 않았습니다.", MX + 0.2, 2.5, leftW - 0.4, 4.0, 9.5, C.soft);
      const rx = MX + leftW + 0.3;
      s.addShape("rect", { x: rx, y: 2.05, w: CW - leftW - 0.3, h: 4.6, fill: { color: C.dark }, line: { color: C.dark, width: 0 } });
      const code = sp?.jsonLd ?? "";
      s.addText(clip(code, 2300) + (code.length > 2300 ? "\n… (전문은 별첨 엑셀 13_JSON-LD 시트)" : ""), { x: rx + 0.15, y: 2.15, w: CW - leftW - 0.6, h: 4.4, fontFace: "Consolas", fontSize: 7, color: C.faint, valign: "top", margin: 0, fit: "shrink" });
    });
  } else {
    builders.push((s, p, t) => {
      frame(s, m, "EXECUTION MODULES", p, t);
      sectionLabel(s, `${String(p).padStart(2, "0")} · EXECUTION MODULES`);
      headline(s, "AI 진단을 실행하면 추가되는 실행 모듈.", 1.25, 24, false, 0.7);
      para(
        s,
        [
          "1. AEO 콘텐츠 구조화 — 여정 4단계 비브랜드 질의 10선, 질문형 H2 + 첫 100~200자 직접 답변, 페이지 하단 FAQ 스니펫과 요약 표",
          "2. GEO 전략 — Citable Snippet 5선(고유 수치 문장), Two Paths 실행안(Path A 직접 인용 · Path B 외부 경유), 브랜드 엔티티 키워드 매핑 표",
          "3. SOV 실측 가이드 — 5대 엔진 테스트 프롬프트 세트, 실측 기록 체크리스트 5항목, 노출 미흡 원인 의사결정 트리",
          "4. 업종별 JSON-LD — 커머스/B2B SaaS/기업/아티클/병원·로컬 판정 후 즉시 삽입 가능한 <script type=\"application/ld+json\"> 블록",
          "",
          "화면에서 'AI 진단 실행' 후 다시 내려받으면 위 모듈이 슬라이드와 별첨 시트(10~13)로 채워집니다.",
        ].join("\n\n"),
        MX,
        2.1,
        CW,
        4.5,
        11,
        C.soft,
      );
    });
  }

  // 우선 액션
  builders.push((s, p, t) => {
    frame(s, m, "PRIORITY ACTIONS", p, t);
    sectionLabel(s, `${String(p).padStart(2, "0")} · PRIORITY ACTIONS`);
    headline(s, "먼저 할 것부터.", 1.25, 26, false, 0.7);
    const prios = d?.priorities ?? [];
    const rows: Cell[][] = [[headerCell("#"), headerCell("우선"), headerCell("액션"), headerCell("왜"), headerCell("엔진")]];
    for (const pr of prios.slice(0, 8)) {
      const sc = sevColor(pr.severity);
      rows.push([cell(String(pr.rank), { color: C.muted, align: "center" }), cell(pr.severity, { bold: true, color: sc.fg, fill: { color: sc.bg }, align: "center" }), cell(clip(pr.action, 90), { bold: true, color: C.ink }), cell(clip(pr.why, 150)), cell(clip(pr.engines.join(" · "), 40), { color: C.muted })]);
    }
    if (prios.length === 0) {
      // AI 진단이 없으면 기술 진단 HIGH·MID를 우선 액션으로 대체
      m.fixItems.slice(0, 8).forEach((f, i) => {
        const sc = sevColor(f.severity);
        rows.push([cell(String(i + 1), { color: C.muted, align: "center" }), cell(f.severity ?? "", { bold: true, color: sc.fg, fill: { color: sc.bg }, align: "center" }), cell(clip(f.title, 90), { bold: true, color: C.ink }), cell(clip(f.detail, 150)), cell(clip(f.engines.join(" · "), 40), { color: C.muted })]);
      });
    }
    table(s, rows, MX, 2.05, CW, [0.5, 0.7, 3.6, CW - 0.5 - 0.7 - 3.6 - 1.6, 1.6]);
  });

  // 재해석 + 한계
  builders.push((s, p, t) => {
    frame(s, m, "RE-INTERPRETATION · LIMITS", p, t);
    sectionLabel(s, `${String(p).padStart(2, "0")} · RE-INTERPRETATION · LIMITS`);
    headline(s, "측정과 전략은 분리되지 않습니다.", 1.25, 26, false, 0.7);
    para(s, "측정 결과만 놓고 보면 \"콘텐츠·제품 경쟁력이 부족하다\"는 결론에 이르기 쉽습니다. 실제로는 측정 영역이 사이트의 자산과 맞지 않았을 수 있습니다. 자동 측정은 주어진 질문에 답할 뿐, 어떤 질문을 물어야 하는지는 판단하지 않습니다.", MX, 1.95, CW, 0.7, 10.5, C.muted);
    const half = (CW - 0.3) / 2;
    s.addShape("rect", { x: MX, y: 2.85, w: half, h: 3.85, fill: { color: C.dark }, line: { color: C.dark, width: 0 } });
    s.addText("재해석 — 이 사이트의 자산은 무엇인가", { x: MX + 0.25, y: 3.0, w: half - 0.5, h: 0.32, fontFace: F, fontSize: 11, bold: true, color: C.surface, margin: 0 });
    para(s, d?.reinterpretation ?? "AI 진단을 실행하면 이 페이지·사이트의 실제 자산(연구·전문가 콘텐츠·인증·데이터)과 그 자산이 답할 수 있는 질문 영역, 다음 실험 대상이 정리됩니다.", MX + 0.25, 3.4, half - 0.5, 3.1, 10.5, C.faint, true);
    const rx = MX + half + 0.3;
    box(s, rx, 2.85, half, 3.85, C.canvas, C.canvas);
    s.addText("이 진단의 한계", { x: rx + 0.25, y: 3.0, w: half - 0.5, h: 0.32, fontFace: F, fontSize: 11, bold: true, color: C.bad, margin: 0 });
    const caveats = [...(d?.caveats ?? []), ...m.unverified];
    para(s, Array.from(new Set(caveats)).slice(0, 8).map((c) => `· ${c}`).join("\n"), rx + 0.25, 3.4, half - 0.5, 3.15, 9.5, C.soft);
  });

  // 다음 단계 · Contact
  builders.push((s, p, t) => {
    frame(s, m, "NEXT STEPS", p, t, true);
    sectionLabel(s, `${String(p).padStart(2, "0")} · NEXT STEPS`, 0.95, true);
    headline(s, "다음 단계 —\n측정에서 실행까지.", 1.3, 34, true, 1.6);
    const steps = [
      ["1", "실측", `본 문서의 비브랜드 질문 10개를 ChatGPT · Gemini · Perplexity · Claude · 네이버 AI 브리핑에 세션 초기화 상태로 질의해 언급 여부 · 순위 · 인용 URL을 전수 기록합니다 (별첨 엑셀 02·08 시트 템플릿).`],
      ["2", "집계", "언급 점유율 · 1순위 · 자사 도메인 인용 비중 · 경쟁사 동시 호명을 엔진별로 분리 집계하고, 인용 도달 경로(직접 vs 외부 경유)를 판정합니다."],
      ["3", "개선", `HIGH ${audit.summary.high}건부터 반영 — 크롤러·렌더링·스키마 정합성 → 단락 구조 · 질문형 헤딩 · 날짜 → 외부 채널에 고유 문장 심기.`],
      ["4", "재측정", "동일 질문 · 동일 엔진 · 동일 기준으로 반복 측정해 추세로 판정합니다. 단일 회차 수치는 성과 지표로 쓰지 않습니다."],
    ];
    steps.forEach(([n, k, v], i) => {
      const y = 3.2 + i * 0.85;
      s.addText(n, { x: MX, y, w: 0.5, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: C.signalSoft, margin: 0 });
      s.addText(k, { x: MX + 0.6, y, w: 1.4, h: 0.5, fontFace: F, fontSize: 13, bold: true, color: C.surface, valign: "top", margin: 0 });
      para(s, v, MX + 2.1, y, CW - 2.1, 0.8, 10, C.faint, true);
    });
    s.addShape("line", { x: MX, y: 6.7, w: CW, h: 0, line: { color: "2A2A2E", width: 0.75 } });
    s.addText(`${m.preparedBy} · ${m.dateLabel} · ${m.domain}`, { x: MX, y: 6.85, w: CW, h: 0.3, fontFace: F, fontSize: 9, color: C.faint, margin: 0 });
  });

  return builders;
}

export async function buildPptx(audit: AuditResult, diagnosis: SeoDiagnosis | null, opts: ExportOptions = {}): Promise<Buffer> {
  const m = buildReportModel(audit, diagnosis, opts);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in
  pptx.author = m.preparedBy;
  pptx.company = "NMG";
  pptx.title = `${m.brand} SEO·AEO·GEO 진단 리포트`;
  pptx.subject = m.url;

  const builders = buildSlides(audit, m);
  const total = builders.length;
  builders.forEach((b, i) => {
    const slide = pptx.addSlide();
    b(slide, i + 1, total);
  });

  const out = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(out)) return out;
  if (out instanceof Uint8Array) return Buffer.from(out);
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  throw new Error("PPT 생성 결과 형식을 처리할 수 없어요.");
}

export type { Finding };
