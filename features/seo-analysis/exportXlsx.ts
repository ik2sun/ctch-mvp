// 서버 전용 — SEO·AEO·GEO 진단 별첨(엑셀) 생성.
// 시트 구성은 학습한 별첨 기록(00_요약 · 01_질문설계 · 02_응답매트릭스 · 03_응답원문 · 04_인용출처 · 05_인용도메인집계 · 06_경쟁사동시언급 · 07_유의사항)을 따르되,
// 실측(엔진 질의) 전 단계이므로 응답 매트릭스·인용 출처는 채울 수 있는 템플릿으로 제공하고, 기술 진단 결과 시트를 추가한다.

import ExcelJS from "exceljs";
import { SOV_CHECKLIST, type AuditResult, type SeoDiagnosis } from "./types";
import { buildReportModel, type ExportOptions } from "./reportModel";

const INK = "FF15181E";
const WHITE = "FFFFFFFF";
const CANVAS = "FFF6F6F4";
const LINE = "FFE6E6E2";
const GOOD = "FF128A6B";
const WARN = "FFB4690E";
const BAD = "FFC0392B";
const MUTED = "FF767C86";
const SIGNAL = "FF4F46E5";
const FONT = "Malgun Gothic";

const ENGINES = ["ChatGPT", "Gemini", "Perplexity", "Claude", "네이버 AI 브리핑"];

type Ws = ExcelJS.Worksheet;

function titleBlock(ws: Ws, title: string, sub: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  ws.mergeCells(2, 1, 2, cols);
  const t = ws.getCell(1, 1);
  t.value = `  ${title}`;
  t.font = { name: FONT, size: 14, bold: true, color: { argb: INK } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;
  const s = ws.getCell(2, 1);
  s.value = `  ${sub}`;
  s.font = { name: FONT, size: 9, color: { argb: MUTED } };
  s.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(2).height = 30;
  ws.addRow([]);
}

function header(ws: Ws, values: string[], rowIndex?: number) {
  const row = rowIndex ? ws.getRow(rowIndex) : ws.addRow(values);
  if (rowIndex) row.values = values;
  row.eachCell((c) => {
    c.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: LINE } } };
  });
  row.height = 22;
  return row;
}

function body(ws: Ws, values: (string | number | null)[], opts: { fillArgb?: string; colorByCol?: Record<number, string>; boldCols?: number[] } = {}) {
  const row = ws.addRow(values);
  row.eachCell({ includeEmpty: true }, (c, col) => {
    c.font = { name: FONT, size: 9, color: { argb: opts.colorByCol?.[col] ?? INK }, bold: opts.boldCols?.includes(col) ?? false };
    c.alignment = { vertical: "top", wrapText: true };
    c.border = { bottom: { style: "hair", color: { argb: LINE } } };
    if (opts.fillArgb) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fillArgb } };
  });
  return row;
}

function subTitle(ws: Ws, text: string) {
  ws.addRow([]);
  const r = ws.addRow([text]);
  r.getCell(1).font = { name: FONT, size: 10, bold: true, color: { argb: SIGNAL } };
  return r;
}

function note(ws: Ws, text: string, cols: number) {
  const r = ws.addRow([`  ※ ${text}`]);
  ws.mergeCells(r.number, 1, r.number, cols);
  r.getCell(1).font = { name: FONT, size: 8.5, color: { argb: MUTED } };
  r.getCell(1).alignment = { wrapText: true, vertical: "top" };
  r.height = Math.min(90, 15 * Math.ceil(text.length / 110) + 6);
}

function widths(ws: Ws, w: number[]) {
  w.forEach((width, i) => (ws.getColumn(i + 1).width = width));
}

function sevColor(sev?: string | null): string {
  return sev === "HIGH" ? BAD : sev === "MID" ? WARN : MUTED;
}

export async function buildXlsx(audit: AuditResult, rawDiagnosis: SeoDiagnosis | null, opts: ExportOptions = {}): Promise<Buffer> {
  const m = buildReportModel(audit, rawDiagnosis, opts);
  const diagnosis = m.diagnosis; // 기본값이 채워진 정규화 결과를 쓴다
  const wb = new ExcelJS.Workbook();
  wb.creator = m.preparedBy;
  wb.created = new Date();

  // ---------- 00_요약 ----------
  {
    const ws = wb.addWorksheet("00_요약");
    widths(ws, [22, 26, 16, 16, 16, 18, 22, 22]);
    titleBlock(ws, `${m.brand} SEO·AEO·GEO 진단 — 기술 진단·질문 설계 원천 기록`, `${m.fetchedAtLabel} 측정 · ${m.url} · 점검 항목 ${audit.findings.length}건 · AI 크롤러 ${audit.robots.crawlers.length}종 · 본 문서의 모든 수치는 JS 미실행 원본 HTML과 robots.txt에서 직접 산출되었습니다.`, 8);

    subTitle(ws, "핵심 지표");
    header(ws, ["구분", "검색용 AI 크롤러 허용", "JS 없이 읽힌 본문(자)", "JSON-LD 블록", "스키마 타입", "FIX HIGH / MID / LOW", "PASS", "인용 후보 단락"]);
    body(ws, ["값", `${audit.summary.searchCrawlersAllowed} / ${audit.summary.searchCrawlersTotal}`, audit.page.textChars, audit.schema.blocks, audit.schema.types.join(", ") || "없음", `${audit.summary.high} / ${audit.summary.mid} / ${audit.summary.low}`, audit.summary.pass, audit.citability.candidatePassages], { boldCols: [1] });

    subTitle(ws, "진단 결론");
    body(ws, ["헤드라인", m.headline], { boldCols: [1] });
    body(ws, ["보충", m.subline]);
    if (diagnosis?.siteRole) body(ws, ["페이지 역할", diagnosis.siteRole]);

    subTitle(ws, "엔진별 준비도 (AI 진단)");
    header(ws, ["엔진", "준비도", "근거", "후보군 진입을 막는 요인", "처방"]);
    if (diagnosis?.engines?.length) {
      for (const e of diagnosis.engines) body(ws, [e.engine, e.readiness, e.evidence, e.blockers.map((b) => `· ${b}`).join("\n"), e.actions.map((a) => `· ${a}`).join("\n")], { boldCols: [1], colorByCol: { 2: e.readiness === "양호" ? GOOD : e.readiness === "보통" ? WARN : BAD } });
    } else {
      body(ws, ["—", "—", "AI 진단 미실행. 화면에서 AI 진단을 실행한 뒤 다시 내려받으면 채워집니다.", "", ""]);
    }

    subTitle(ws, "시트 구성");
    const sheets: Array<[string, string]> = [
      ["01_질문설계", "비브랜드 질문 10개 전문 · 유형 · 여정 · 설계 근거 (AI 진단 결과)"],
      ["02_응답매트릭스", "질문 × 엔진 5종 언급 순위 기록 템플릿 — 실측 후 채움"],
      ["03_진단항목", `기술 진단 ${audit.findings.length}건 전수 — 상태 · 우선순위 · 영역 · 상세 · 영향 엔진`],
      ["04_크롤러", `AI 크롤러 ${audit.robots.crawlers.length}종 robots.txt 판정 — 검색용/실시간 fetch/학습용 분리`],
      ["05_스키마", "JSON-LD 노드 · Product 필드 체크 · FAQ 문항 · 화면 미표시 값"],
      ["06_온페이지_인용적합도", "title · h1 · h2 · canonical · lang · 인용 적합도 휴리스틱 · 첫 단락"],
      ["07_엔진별처방", "엔진별 준비도 · 우선 액션 · 외부 채널 액션 · 재해석 (AI 진단 결과)"],
      ["08_인용출처", "실측 시 인용 URL 전수 기록 템플릿 — 질문 · 엔진 · 순위 · 출처 유형 · 자사 여부 · 도메인 · URL"],
      ["09_유의사항", "집계 방식과 데이터 한계 — 수치 해석 전 확인"],
      ["10_AEO콘텐츠설계", "여정별 질의 10선 × 질문형 H2 · 첫 100~200자 Direct Answer · FAQ 스니펫 · 요약 표 (AI 진단)"],
      ["11_GEO전략", "Citable Snippet 5선 · Two Paths(Path A/B) 실행안 · 브랜드 엔티티 키워드 매핑 (AI 진단)"],
      ["12_SOV실측가이드", "5대 엔진 테스트 프롬프트 세트 · 실측 기록 체크리스트 5항목 · 노출 미흡 원인 의사결정 트리"],
      ["13_JSON-LD", "업종 판정 근거 · 즉시 삽입 가능한 JSON-LD 스크립트 전문 · 적용 메모"],
    ];
    for (const [a, b] of sheets) body(ws, [a, b], { boldCols: [1] });
  }

  // ---------- 01_질문설계 ----------
  {
    const ws = wb.addWorksheet("01_질문설계");
    widths(ws, [8, 60, 10, 12, 60]);
    titleBlock(ws, "비브랜드 질문 10개 설계 상세", "질문은 대상 페이지의 FAQ · 속성 · 본문 문구에서 직접 추출했습니다(AI 진단). 브랜드명이 들어가지 않은 비브랜드 질문이며, 범용형(카테고리 일반 추천)과 검증형(페이지 고유 조건)을 섞고 여정 구간을 분산했습니다.", 5);
    header(ws, ["No", "질문 전문", "유형", "여정(구매 의도)", "설계 근거 (페이지 원문)"]);
    const qs = diagnosis?.questions ?? [];
    if (qs.length) for (const q of qs) body(ws, [q.no, q.question, q.type, q.intent, q.basis], { colorByCol: { 3: q.type === "검증형" ? SIGNAL : INK } });
    else body(ws, ["—", "AI 진단 미실행. 화면에서 AI 진단을 실행하면 질문 10개가 설계됩니다.", "", "", ""]);
    ws.addRow([]);
    note(ws, "질문풀이 '비교 의도' 한 구간에 몰리면 사이트가 가장 약한 영역만 측정하게 됩니다. 정보 탐색(지식) 질문이 포함되어 있는지 확인하고, 필요하면 사이트가 보유한 지식 자산(연구·전문가 콘텐츠)에서 질문을 추가하세요.", 5);
  }

  // ---------- 02_응답매트릭스 (템플릿) ----------
  {
    const ws = wb.addWorksheet("02_응답매트릭스");
    widths(ws, [6, 44, 10, 12, ...ENGINES.map(() => 16)]);
    titleBlock(ws, "질문 × 엔진 응답 매트릭스 (실측 기록 템플릿)", "각 셀에 응답 내 브랜드 언급 순위를 숫자로, 미언급은 '—'로 기록합니다. 괄호 안에 감성(긍정/중립/부정)을 적습니다. 매 질의는 세션 초기화(대화 이력 없음) 상태로 수행하고 응답 원문은 별도 보관합니다.", 4 + ENGINES.length);
    header(ws, ["No", "질문", "유형", "여정", ...ENGINES]);
    const qs = diagnosis?.questions ?? [];
    const n = qs.length || 10;
    for (let i = 0; i < n; i++) {
      const q = qs[i];
      body(ws, [i + 1, q?.question ?? "", q?.type ?? "", q?.intent ?? "", ...ENGINES.map(() => "")]);
    }
    const first = 5;
    const last = first + n - 1;
    const colLetter = (idx: number) => String.fromCharCode(64 + idx);
    const sumRows: Array<[string, (col: string) => string]> = [
      ["언급 건수", (c) => `=COUNT(${c}${first}:${c}${last})`],
      ["언급률", (c) => `=IF(${n}=0,0,COUNT(${c}${first}:${c}${last})/${n})`],
      ["1순위", (c) => `=COUNTIF(${c}${first}:${c}${last},1)`],
    ];
    for (const [label, f] of sumRows) {
      const r = ws.addRow(["", label, "", "", ...ENGINES.map((_, i) => ({ formula: f(colLetter(5 + i)).slice(1) }))]);
      r.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CANVAS } };
        if (col >= 5 && label === "언급률") c.numFmt = "0.0%";
      });
    }
    const tot = ws.addRow(["", "전체 언급 (총 응답 중)", "", "", { formula: `SUM(E${last + 1}:${colLetter(4 + ENGINES.length)}${last + 1})&" / ${n * ENGINES.length}"` }]);
    tot.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CANVAS } };
    });
    ws.addRow([]);
    note(ws, "언급 집계를 브랜드명 매칭으로 하면 제품명만 등장한 응답을 놓칩니다. 원문과 대조해 '집계 외 실질 노출'을 별도 표기하세요. 실재하지 않는 제품명(환각)이 언급으로 잡힐 수 있으니 표기합니다.", 4 + ENGINES.length);
  }

  // ---------- 03_진단항목 ----------
  {
    const ws = wb.addWorksheet("03_진단항목");
    widths(ws, [7, 8, 9, 12, 44, 90, 30]);
    titleBlock(ws, `기술 진단 항목 ${audit.findings.length}건 전수`, `${m.fetchedAtLabel} · ${m.url} · PASS ${audit.summary.pass} · FIX HIGH ${audit.summary.high} / MID ${audit.summary.mid} / LOW ${audit.summary.low} · INFO ${m.infoItems.length}. 확인된 것만 기재했습니다.`, 7);
    header(ws, ["ID", "상태", "우선순위", "영역", "항목", "상세", "영향 엔진"]);
    const ordered = [...m.fixItems, ...m.passItems, ...m.infoItems];
    for (const f of ordered) {
      body(ws, [f.id, f.status.toUpperCase(), f.severity ?? "", f.area, f.title, f.detail, f.engines.join(" · ")], {
        boldCols: [5],
        colorByCol: { 2: f.status === "pass" ? GOOD : f.status === "info" ? MUTED : sevColor(f.severity), 3: sevColor(f.severity) },
      });
    }
  }

  // ---------- 04_크롤러 ----------
  {
    const ws = wb.addWorksheet("04_크롤러");
    widths(ws, [20, 14, 12, 10, 14, 60, 20]);
    titleBlock(ws, `AI 크롤러 ${audit.robots.crawlers.length}종 robots.txt 판정`, `robots.txt ${audit.robots.found ? "확인" : "없음(기본 허용)"} · 판정 경로 ${new URL(audit.finalUrl).pathname} · 검색용 UA 차단은 인용 불가로 직결되고, 학습용 UA 차단은 인용과 무관합니다. 두 판정을 합쳐 해석하지 않습니다.`, 7);
    header(ws, ["User-Agent", "운영사", "역할", "상태", "적용 그룹", "이 UA가 결정하는 것", "영향 엔진"]);
    const roleLabel: Record<string, string> = { search: "검색용", fetch: "실시간 fetch", training: "학습용" };
    for (const c of [...m.searchCrawlers, ...m.fetchCrawlers, ...m.trainingCrawlers]) {
      body(ws, [c.ua, c.owner, roleLabel[c.role], c.status === "allowed" ? "허용" : "차단", c.matchedGroup, c.governs, c.engines.join(" · ")], { boldCols: [1], colorByCol: { 4: c.status === "allowed" ? GOOD : c.role === "training" ? MUTED : BAD } });
    }
    ws.addRow([]);
    if (audit.robots.sitemaps.length) body(ws, ["Sitemap 선언", audit.robots.sitemaps.join("\n")], { boldCols: [1] });
    note(ws, "Google-Extended 차단은 AI Overviews·AI Mode에 영향이 없습니다(Googlebot 인덱스 기반). nosnippet / data-nosnippet / max-snippet:0 이 실제 제어 수단입니다. IP·CDN(WAF) 단위 차단은 서버 로그 없이는 확인할 수 없습니다.", 7);
  }

  // ---------- 05_스키마 ----------
  {
    const ws = wb.addWorksheet("05_스키마");
    widths(ws, [22, 40, 60, 60]);
    titleBlock(ws, "구조화 데이터 (JSON-LD) 검증", `JSON-LD ${audit.schema.blocks}블록 · 파싱 오류 ${audit.schema.parseErrors}건 · 타입 ${audit.schema.types.join(", ") || "없음"}`, 4);
    header(ws, ["노드 타입", "이름", "확인됨", "과제"]);
    for (const n of audit.schema.nodes) body(ws, [n.type, n.name ?? "", n.ok.join("\n"), n.issues.join("\n")], { boldCols: [1], colorByCol: { 3: GOOD, 4: n.issues.length ? BAD : MUTED } });
    if (!audit.schema.nodes.length) body(ws, ["—", "", "", "감지된 노드 없음"]);

    if (audit.schema.products.length) {
      subTitle(ws, "Product 필드 체크");
      header(ws, ["상품", "가격 / 평점 / 리뷰수", "있는 필드", "없는 필드"]);
      for (const p of audit.schema.products) body(ws, [p.name ?? "", `${p.price ?? "—"} ${p.priceCurrency ?? ""} / ${p.ratingValue ?? "—"} / ${p.reviewCount ?? "—"}`, p.present.join("\n"), p.missing.join("\n")], { boldCols: [1], colorByCol: { 3: GOOD, 4: BAD } });
    }
    subTitle(ws, "정합성 — 구조화 데이터에만 있고 화면에 없는 값");
    body(ws, [audit.schema.hiddenValues.length ? audit.schema.hiddenValues.join(" · ") : "없음 (구조화 값이 화면 텍스트에도 존재)"], { colorByCol: { 1: audit.schema.hiddenValues.length ? BAD : GOOD } });
    if (audit.schema.faqQuestions.length) {
      subTitle(ws, `FAQ 문항 ${audit.schema.faqQuestions.length}개 (질문 설계 원천)`);
      audit.schema.faqQuestions.forEach((q, i) => body(ws, [`Q${i + 1}`, q]));
    }
    if (audit.schema.deprecated.length) {
      subTitle(ws, "지원 종료 타입");
      audit.schema.deprecated.forEach((d) => body(ws, [d.split(" — ")[0], d.split(" — ")[1] ?? ""], { colorByCol: { 1: WARN } }));
    }
  }

  // ---------- 06_온페이지_인용적합도 ----------
  {
    const ws = wb.addWorksheet("06_온페이지_인용적합도");
    widths(ws, [20, 100]);
    titleBlock(ws, "온페이지 기본 · 인용 적합도 (휴리스틱)", "엔진이 단락 단위로 인용한다는 전제에서 본 구조 신호입니다. 수치는 JS 미실행 HTML 기준입니다.", 2);
    header(ws, ["항목", "값"]);
    const rows: Array<[string, string]> = [
      ["URL", audit.finalUrl],
      ["HTTP / 크기 / 응답", `${audit.status} · ${(audit.page.htmlBytes / 1024).toFixed(0)}KB · ${audit.ms}ms`],
      ["title", `${audit.page.title ?? "—"} (${audit.page.titleLength}자)`],
      ["meta description", audit.page.metaDescription ?? "—"],
      ["h1", audit.page.h1.join(" | ") || "—"],
      ["h2", audit.page.h2.length ? `${audit.page.h2.length}개\n${audit.page.h2.join("\n")}` : "0개"],
      ["h3", `${audit.page.h3Count}개`],
      ["canonical", `${audit.page.canonical ?? "—"}${audit.page.canonicalMatches === false ? " (현재 URL과 다름)" : ""}`],
      ["lang / content-language", `${audit.page.lang ?? "—"} / ${audit.page.contentLanguage ?? "—"}`],
      ["robots 지시자", [audit.page.metaRobots, audit.page.xRobotsTag].filter(Boolean).join(" · ") || "—"],
      ["noindex / snippet 차단", `${audit.page.noindex ? "noindex" : "—"} / ${audit.page.snippetBlocked ? "nosnippet" : "—"}`],
      ["hreflang", `${audit.page.hreflangCount}개`],
      ["Open Graph", `og:title ${audit.page.ogTitle ? "있음" : "없음"} · og:description ${audit.page.ogDescription ? "있음" : "없음"}`],
      ["이미지", `${audit.page.imgCount}개 · alt 누락 ${audit.page.imgAltMissing}`],
      ["본문", `${audit.page.textChars.toLocaleString()}자 · ${audit.page.textWords.toLocaleString()}어절 · 단락 ${audit.page.paragraphCount} · 리스트 ${audit.page.listCount} · 표 ${audit.page.tableCount} · 영상 ${audit.page.videoCount}`],
      ["렌더링", audit.page.likelyCsr ? `CSR 추정 (${audit.page.csrHints.join(", ")})` : "SSR — JS 없이 본문·JSON-LD 취득"],
      ["AI 파일", `llms.txt ${audit.files.llmsTxt ? "있음" : "없음"} · llms-full.txt ${audit.files.llmsFullTxt ? "있음" : "없음"} · sitemap.xml ${audit.files.sitemapXml ? "있음" : "없음"}`],
      ["네이버 서치어드바이저 메타", audit.page.hasNaverVerification ? "있음" : "미검출"],
    ];
    for (const [k, v] of rows) body(ws, [k, v], { boldCols: [1] });
    subTitle(ws, "인용 적합도");
    header(ws, ["항목", "값"]);
    const cit: Array<[string, string]> = [
      ["정의문 패턴 (초반 1,200자)", audit.citability.definitionPattern ? "있음" : "없음"],
      ["질문형 헤딩", audit.citability.questionHeadings.length ? audit.citability.questionHeadings.join("\n") : "없음"],
      ["인용 후보 단락 (180~700자)", `${audit.citability.candidatePassages}개`],
      ["수치 문장", `${audit.citability.numericSentences}개`],
      ["날짜 신호", audit.citability.dates.join("\n") || "없음"],
      ["첫 단락", audit.citability.firstParagraph ?? "—"],
    ];
    for (const [k, v] of cit) body(ws, [k, v], { boldCols: [1] });
  }

  // ---------- 07_엔진별처방 ----------
  {
    const ws = wb.addWorksheet("07_엔진별처방");
    widths(ws, [22, 12, 60, 60, 60]);
    titleBlock(ws, "엔진별 준비도 · 우선 액션 · 외부 채널 · 재해석 (AI 진단)", diagnosis ? "기술 진단 데이터를 근거로 Claude가 엔진별로 분리해 작성한 처방입니다. 확인되지 않은 항목은 한계에 표기했습니다." : "AI 진단 미실행 — 화면에서 AI 진단을 실행한 뒤 다시 내려받으면 채워집니다.", 5);
    header(ws, ["엔진", "준비도", "근거", "후보군 진입을 막는 요인", "처방"]);
    for (const e of diagnosis?.engines ?? []) body(ws, [e.engine, e.readiness, e.evidence, e.blockers.map((b) => `· ${b}`).join("\n"), e.actions.map((a) => `· ${a}`).join("\n")], { boldCols: [1], colorByCol: { 2: e.readiness === "양호" ? GOOD : e.readiness === "보통" ? WARN : BAD } });
    subTitle(ws, "우선 액션");
    header(ws, ["순위", "우선순위", "액션", "왜", "영향 엔진"]);
    for (const p of diagnosis?.priorities ?? []) body(ws, [p.rank, p.severity, p.action, p.why, p.engines.join(" · ")], { boldCols: [3], colorByCol: { 2: sevColor(p.severity) } });
    subTitle(ws, "외부 채널 액션 (Path B)");
    for (const o of diagnosis?.offsite ?? []) body(ws, ["", "", o]);
    subTitle(ws, "재해석");
    body(ws, ["", "", diagnosis?.reinterpretation ?? ""]);
    subTitle(ws, "페이지 역할");
    body(ws, ["", "", diagnosis?.siteRole ?? ""]);
  }

  // ---------- 08_인용출처 (템플릿) ----------
  {
    const ws = wb.addWorksheet("08_인용출처");
    widths(ws, [10, 44, 10, 14, 8, 12, 8, 26, 70]);
    titleBlock(ws, "AI 인용 출처 전수 기록 템플릿", "실측 시 응답에 표기된 인용 출처를 질문 단위로 귀속해 전수 기록합니다. 인용 출처를 산출하는 엔진은 주로 Perplexity·Gemini이며 ChatGPT·Claude는 미산출인 경우가 많습니다. 출처 유형: 자사 / 그룹(커머스몰) / 이커머스 / 리뷰 플랫폼 / 블로그 / 영상 / 커뮤니티 / 미디어 / 학술·의료기관 / 기타.", 9);
    header(ws, ["질문 No", "질문", "유형", "엔진", "인용 순위", "출처 유형", "자사 여부", "인용 도메인", "인용 URL"]);
    const qs = diagnosis?.questions ?? [];
    for (let i = 0; i < 5; i++) {
      const q = qs[i];
      body(ws, [q?.no ?? i + 1, q?.question ?? "", q?.type ?? "", "", "", "", "", "", ""]);
    }
    ws.addRow([]);
    note(ws, "집계 지표: 자사 도메인 인용 비중 · 자사 인용 순위 · 상위 도메인 20 · 유형별 분포. 자사 문구가 답변에 등장할 때 출처가 자사인지(직접 인용, 정확하지만 순위 낮음) 외부 채널인지(경유 인용, 순위 높음)를 분리해 보고합니다.", 9);
  }

  // ---------- 09_유의사항 ----------
  {
    const ws = wb.addWorksheet("09_유의사항");
    widths(ws, [6, 24, 110]);
    titleBlock(ws, "집계 방식 및 데이터 한계", "수치를 해석하기 전에 아래 내용을 확인해 주십시오.", 3);
    header(ws, ["No", "구분", "내용"]);
    const items: Array<[string, string]> = [
      ["측정 시점", `본 기록은 ${m.fetchedAtLabel} 단일 회차·단일 페이지입니다. robots.txt·스키마·본문은 배포에 따라 바뀌므로 개선 후 동일 기준으로 재측정해야 합니다.`],
      ["렌더링 기준", "본문·JSON-LD 수치는 JavaScript를 실행하지 않은 원본 HTML 기준입니다. 브라우저 화면과 다를 수 있으며, 그 차이 자체가 AI 크롤러가 보는 것과 사용자가 보는 것의 차이입니다."],
      ["크롤러 판정", "robots.txt의 UA별 규칙만 판정했습니다. IP·CDN(WAF) 차단, 서버 응답 코드 차별은 서버 로그 없이는 확인할 수 없습니다. 검색용 UA와 학습용 UA 판정은 별개입니다."],
      ["사이트 단위 항목", "전 페이지 title 중복, 스키마 적용률(전체 상세 중 적용 수), 페이지 간 노출 격차는 사이트맵 전수 크롤이 필요하며 본 기록에서는 판정하지 않았습니다."],
      ["정합성", "구조화 데이터 값이 화면 텍스트에 있는지만 대조했습니다. 실제 판매 채널(커머스몰) 가격·리뷰 수와의 일치 여부는 별도 확인이 필요합니다."],
      ["인용 적합도", "정의문·질문형 헤딩·후보 단락·수치·날짜는 휴리스틱 지표입니다. 실제 인용 여부는 엔진 실측으로만 확인됩니다."],
      ["AI 진단", diagnosis ? "엔진별 준비도·처방·질문 설계는 기술 진단 데이터를 근거로 Claude가 작성했습니다. 데이터로 확인되지 않은 추론은 caveats에 표기하도록 지시했으나, 실측 전 가설로 취급하십시오." : "AI 진단이 실행되지 않아 01·07 시트가 비어 있습니다."],
      ["실측 미수행", "본 기록은 비브랜드 질문 × 엔진 실측(언급·순위·인용 URL) 전 단계입니다. 02·08 시트 템플릿으로 실측을 수행하면 언급 점유율·1순위·자사 인용 비중·경쟁사 동시 호명을 집계할 수 있습니다."],
      ["집계 원칙", "언급 집계는 브랜드명 매칭 기준이면 제품명 단독 등장을 놓칩니다. 원문 대조로 보정합니다. 단일 회차 수치는 성과 지표로 쓰지 않고 추세로 판정합니다. 네이버 결과는 글로벌 엔진과 합산하지 않습니다."],
    ];
    const caveats = diagnosis?.caveats ?? [];
    items.forEach(([k, v], i) => body(ws, [i + 1, k, v], { boldCols: [2] }));
    if (caveats.length) {
      subTitle(ws, "AI 진단이 명시한 한계");
      caveats.forEach((c, i) => body(ws, [items.length + i + 1, "AI 진단", c]));
    }
    ws.addRow([]);
    body(ws, ["", "작성", `${m.preparedBy} · ${m.dateLabel}`], { boldCols: [2] });
  }

  // ---------- 10_AEO콘텐츠설계 ----------
  {
    const ws = wb.addWorksheet("10_AEO콘텐츠설계");
    widths(ws, [6, 12, 44, 44, 90]);
    titleBlock(ws, "AEO 콘텐츠 구조화 — 여정별 질의 10선 × 질문형 H2 × Direct Answer", "AI 검색엔진이 답변 출처로 바로 추출할 수 있도록, 각 비브랜드 질문에 대해 질문형 H2 제목과 정의문으로 시작하는 첫 100~200자 직접 답변 단락을 설계했습니다. 180~700자 자기완결 단락의 첫 부분으로 그대로 사용합니다. 수치는 확인된 것만 쓰고 없는 값은 [확인 필요]로 남겼습니다.", 5);
    header(ws, ["No", "여정 단계", "비브랜드 질문", "질문형 H2 제목", "Direct Answer (첫 100~200자)"]);
    const items = diagnosis?.aeo?.items ?? [];
    if (items.length) for (const it of items) body(ws, [it.no, it.stage, it.question, it.h2, it.directAnswer], { boldCols: [4], colorByCol: { 2: SIGNAL } });
    else body(ws, ["—", "", "AI 진단 미실행", "", ""]);

    subTitle(ws, "FAQ 스니펫 — 페이지 하단 Q&A 블록 (본문과 FAQPage 스키마에 동일 문장 사용)");
    header(ws, ["No", "", "질문", "", "답변 (2~3문장, 독립 완결)"]);
    const faq = diagnosis?.aeo?.faq ?? [];
    faq.forEach((f, i) => body(ws, [i + 1, "", f.question, "", f.answer], { boldCols: [3] }));
    if (!faq.length) body(ws, ["—", "", "FAQ 없음", "", ""]);

    const st = diagnosis?.aeo?.summaryTable;
    subTitle(ws, `요약 표 (Comparison / Summary Table)${st ? ` — ${st.title}` : ""}`);
    if (st && st.columns.length) {
      header(ws, st.columns);
      for (const r of st.rows) body(ws, r, { boldCols: [1] });
    } else {
      body(ws, ["요약 표 없음"]);
    }
    ws.addRow([]);
    note(ws, "적용 순서: ① H2 제목을 본문 소제목으로 → ② Direct Answer를 그 아래 첫 단락으로 → ③ 필요 시 180~700자로 확장(근거·수치·출처 추가) → ④ FAQ 블록을 페이지 하단에 삽입하고 13_JSON-LD의 FAQPage와 문장을 일치시킴 → ⑤ 요약 표는 HTML <table>로 본문에 배치.", 5);
  }

  // ---------- 11_GEO전략 ----------
  {
    const ws = wb.addWorksheet("11_GEO전략");
    widths(ws, [6, 70, 44, 40, 28, 30]);
    titleBlock(ws, "GEO 전략 — Citable Snippet · Two Paths 실행안 · 브랜드 엔티티 매핑", "AI가 신뢰성 높은 수치·데이터로 인용할 고유 문장을 자사 페이지에 심고(Path A), 그 문장이 외부 채널로 옮겨 적히게 하는(Path B) 연계 전략입니다. [확인 필요] 표기는 실제 값을 채운 뒤 게시합니다.", 6);
    subTitle(ws, "Citable Snippet 5선");
    header(ws, ["No", "Citable Snippet", "근거 (데이터 출처·확인 필요 여부)", "심을 위치", "타깃 엔진", ""]);
    const sn = diagnosis?.geo?.snippets ?? [];
    if (sn.length) for (const s of sn) body(ws, [s.no, s.snippet, s.basis, s.placement, s.targetEngines.join(" · "), ""], { boldCols: [2] });
    else body(ws, ["—", "AI 진단 미실행", "", "", "", ""]);

    subTitle(ws, "Two Paths 실행안 — Path A: 자사 직접 인용 (Gemini · AI Overviews)");
    const pa = diagnosis?.geo?.twoPaths?.pathA ?? [];
    pa.forEach((x, i) => body(ws, [`A${i + 1}`, x]));
    if (!pa.length) body(ws, ["—", "없음"]);
    subTitle(ws, "Two Paths 실행안 — Path B: 외부 채널 경유 (Perplexity · 네이버 · ChatGPT)");
    const pb = diagnosis?.geo?.twoPaths?.pathB ?? [];
    pb.forEach((x, i) => body(ws, [`B${i + 1}`, x]));
    if (!pb.length) body(ws, ["—", "없음"]);

    subTitle(ws, "브랜드 엔티티(Entity) 키워드 매핑 — Knowledge Graph 연동");
    header(ws, ["", "엔티티", "카테고리 / 핵심 키워드", "보조 키워드", "sameAs 후보", "스키마 표현"]);
    const em = diagnosis?.geo?.entityMap ?? [];
    if (em.length) em.forEach((e, i) => body(ws, [i + 1, e.entity, `${e.category}\n핵심: ${e.coreKeywords.join(" · ")}`, e.supportKeywords.join("\n"), e.sameAs.join("\n"), e.schemaHint], { boldCols: [2] }));
    else body(ws, ["—", "없음", "", "", "", ""]);
    ws.addRow([]);
    note(ws, "원본은 하나, 도달 경로는 둘입니다. Path A는 정보가 정확하지만 순위가 2~3위에 머물고, Path B는 자사 도메인 인용이 없어도 1순위를 만듭니다. 두 경로 모두 같은 문장(스니펫)을 써야 시너지가 납니다. 브랜드명+제품명 결합 표기를 외부 채널에서도 통일하세요.", 6);
  }

  // ---------- 12_SOV실측가이드 ----------
  {
    const ws = wb.addWorksheet("12_SOV실측가이드");
    widths(ws, [6, 12, 70, 60, 40]);
    titleBlock(ws, "AI 검색 SOV(Share of Voice) 실측 가이드", "5대 엔진(ChatGPT · Gemini · Perplexity · Claude · 네이버 AI 브리핑)에 동일 조건(세션 초기화·로그아웃·대화 이력 없음)으로 질의하고, 응답 원문과 인용 URL을 전수 보관합니다. 결과는 02_응답매트릭스와 08_인용출처에 기록합니다.", 5);
    subTitle(ws, "① 테스트 프롬프트 세트 (그대로 붙여 넣기)");
    header(ws, ["No", "여정 단계", "입력 프롬프트", "엔진별 기록 주의", ""]);
    const pr = diagnosis?.sov?.prompts ?? [];
    if (pr.length) for (const p of pr) body(ws, [p.no, p.stage, p.prompt, p.note, ""], { boldCols: [3], colorByCol: { 2: SIGNAL } });
    else body(ws, ["—", "", "AI 진단 미실행", "", ""]);

    subTitle(ws, "② 실측 기록 표준 체크리스트 (응답 1건마다 기록)");
    header(ws, ["No", "항목", "기록 방법", "기록 예", ""]);
    for (const c of SOV_CHECKLIST) body(ws, [c.no, c.item, c.howToRecord, c.example, ""], { boldCols: [2] });

    subTitle(ws, "③ 결과 해석 · 개선 의사결정 트리 (기술 차단/SEO 부재 → 인용 적합도 → 엔티티·외부 채널)");
    header(ws, ["단계", "점검 질문", "이 페이지 판정", "미충족 시 조치", "충족 시"]);
    const dt = diagnosis?.sov?.decisionTree ?? [];
    if (dt.length) for (const n of dt) body(ws, [n.step, n.check, n.verdictForThisPage, n.ifFail, n.ifPass], { boldCols: [2], colorByCol: { 3: /^통과|^충족/.test(n.verdictForThisPage) ? GOOD : /^부분/.test(n.verdictForThisPage) ? WARN : BAD } });
    else body(ws, ["—", "AI 진단 미실행", "", "", ""]);
    ws.addRow([]);
    note(ws, "집계: AI 언급 점유율(언급/총 응답 50), 엔진별 1순위 수, 자사 도메인 인용 비중(Perplexity·Gemini 기준), 인용 경로(직접 vs 외부 경유), 경쟁사 동시 호명, 여정 단계별 언급률. 단일 회차 수치는 성과 지표로 쓰지 않고 동일 조건 재측정으로 추세를 봅니다. 네이버는 글로벌 엔진과 합산하지 않습니다.", 5);
  }

  // ---------- 13_JSON-LD ----------
  {
    const ws = wb.addWorksheet("13_JSON-LD");
    widths(ws, [22, 140]);
    const sp = diagnosis?.schemaProposal ?? null;
    titleBlock(ws, "업종 맞춤 JSON-LD 구조화 데이터 제안", sp ? `업종 판정: ${sp.industry} — ${sp.reason}` : "AI 진단 미실행 — 실행 후 다시 내려받으면 채워집니다.", 2);
    header(ws, ["항목", "내용"]);
    body(ws, ["업종", sp?.industry ?? "—"], { boldCols: [1] });
    body(ws, ["판정 근거", sp?.reason ?? "—"], { boldCols: [1] });
    body(ws, ["적용 메모", sp?.notes?.map((n) => `· ${n}`).join("\n") ?? "—"], { boldCols: [1] });
    body(ws, ["기존 JSON-LD", audit.schema.rawJsonLd ? `${audit.schema.blocks}블록 · 타입 ${audit.schema.types.join(", ")}` : "없음"], { boldCols: [1] });
    subTitle(ws, "삽입 코드 — <head> 안 또는 </body> 직전에 그대로 붙여 넣기 ([확인 필요] 값을 채운 뒤)");
    const codeRow = ws.addRow(["JSON-LD", sp?.jsonLd ?? ""]);
    codeRow.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
    codeRow.getCell(2).font = { name: "Consolas", size: 9, color: { argb: INK } };
    codeRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
    codeRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CANVAS } };
    const lines = (sp?.jsonLd ?? "").split("\n").length;
    codeRow.height = Math.min(400, Math.max(60, lines * 13));
    ws.addRow([]);
    note(ws, "검증: Google Rich Results Test(search.google.com/test/rich-results) · Schema Markup Validator(validator.schema.org). 구조화 데이터의 가격·리뷰·평점 값은 화면에도 표시해 정합성을 맞추고, 판매하지 않는 브랜드 사이트라면 가격·재고는 커머스몰 URL로 위임합니다.", 2);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
