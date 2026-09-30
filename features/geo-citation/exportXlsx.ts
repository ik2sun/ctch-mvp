// 서버 전용 — 측정 회차 별첨 엑셀 (geo-audit-framework 산출물 템플릿 8시트)
import ExcelJS from "exceljs";
import {
  competitorCoMentions,
  engineStats,
  globalStats,
  sourceTypeOf,
  topDomains,
  unmentionedQueries,
} from "./analyze";
import { ENGINE_LABEL, isMentioned, type GeoAnswer, type GeoEngine, type GeoPrompt, type GeoRun } from "./types";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const FONT = "Malgun Gothic";

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  const head = ws.getRow(1);
  head.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEADER_FILL;
  head.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

function finish(ws: ExcelJS.Worksheet) {
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.font = { name: FONT, size: 10 };
    row.alignment = { vertical: "top", wrapText: true };
  });
}

const rate = (n: number | null) => (n === null ? "-" : `${(n * 100).toFixed(1)}%`);

export async function buildGeoXlsx(input: { run: GeoRun; answers: GeoAnswer[]; prompts: GeoPrompt[]; clientName: string }): Promise<Buffer> {
  const { run, answers, prompts } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NMG CTCH";
  const snap = run.settings_snapshot;
  const engines: GeoEngine[] = [...run.engines, ...(answers.some((a) => a.engine === "naver") ? (["naver"] as const) : [])];
  const g = globalStats(answers);

  // 00_요약
  const s0 = sheet(wb, "00_요약", [
    { header: "항목", key: "k", width: 30 },
    { header: "값", key: "v", width: 80 },
  ]);
  s0.addRows([
    { k: "광고주", v: input.clientName },
    { k: "측정 일시", v: new Date(run.started_at).toLocaleString("ko-KR") },
    { k: "측정 방식", v: run.trigger === "cron" ? "주간 자동" : "수동" },
    { k: "자사 도메인", v: (snap.own_domains ?? []).join(", ") },
    { k: "브랜드 표기", v: (snap.brand_terms ?? []).join(", ") },
    { k: "경쟁사", v: (snap.competitors ?? []).join(", ") },
    { k: "질문 수 × 엔진 수", v: `${new Set(answers.map((a) => a.query)).size} × ${run.engines.length} (네이버 수동 입력 별도)` },
    { k: "AI 언급 점유율 (글로벌 엔진 합계)", v: rate(g.mentionRate) },
    { k: "자사 도메인 인용률 (응답 기준)", v: rate(g.ownCiteRate) },
    { k: "자사 인용 비중 (전체 인용 URL 중)", v: rate(g.ownCitationShare) },
    { k: "API 비용 (Claude만 산출)", v: `$${Number(run.cost_usd).toFixed(2)}` },
    {},
  ]);
  for (const e of engines) {
    const st = engineStats(answers, e);
    s0.addRow({
      k: `${ENGINE_LABEL[e]}`,
      v: `응답 ${st.answered} · 언급 ${st.mentioned} (${rate(st.answered ? st.mentioned / st.answered : null)}) · 자사 최선 등장 ${st.firstMention} · 자사 인용 ${st.ownCited} (${rate(st.answered ? st.ownCited / st.answered : null)}) · 평균 자사 인용 순위 ${st.avgOwnCiteRank?.toFixed(1) ?? "-"} · 인용 없는 응답 ${st.noCitations} · 오류 ${st.errors}`,
    });
  }
  finish(s0);

  // 01_질문설계
  const s1 = sheet(wb, "01_질문설계", [
    { header: "No", key: "no", width: 6 },
    { header: "질문", key: "q", width: 60 },
    { header: "여정 단계", key: "stage", width: 12 },
    { header: "추출 근거(원문)", key: "ev", width: 70 },
  ]);
  const usedQueries = new Set(answers.map((a) => a.query));
  prompts
    .filter((p) => usedQueries.has(p.query))
    .forEach((p, i) => s1.addRow({ no: i + 1, q: p.query, stage: p.stage, ev: p.evidence ?? "" }));
  finish(s1);

  // 02_응답매트릭스
  const queries = [...usedQueries];
  const s2 = sheet(wb, "02_응답매트릭스", [
    { header: "질문", key: "q", width: 50 },
    { header: "단계", key: "stage", width: 10 },
    ...engines.flatMap((e) => [
      { header: `${ENGINE_LABEL[e]} 언급`, key: `${e}_m`, width: 12 },
      { header: `${ENGINE_LABEL[e]} 자사 인용 순위`, key: `${e}_c`, width: 14 },
    ]),
  ]);
  for (const q of queries) {
    const row: Record<string, string> = { q, stage: answers.find((a) => a.query === q)?.stage ?? "" };
    for (const e of engines) {
      const a = answers.find((x) => x.query === q && x.engine === e);
      row[`${e}_m`] = !a ? "-" : a.status !== "done" ? "오류" : isMentioned(a) ? `O${a.mention_order ? ` (${a.mention_order}번째)` : ""}` : "X";
      row[`${e}_c`] = !a || a.status !== "done" ? "-" : a.own_cite_rank ? String(a.own_cite_rank) : "X";
    }
    s2.addRow(row);
  }
  finish(s2);

  // 03_응답원문
  const s3 = sheet(wb, "03_응답원문", [
    { header: "질문", key: "q", width: 40 },
    { header: "엔진", key: "e", width: 12 },
    { header: "모델", key: "m", width: 16 },
    { header: "언급", key: "men", width: 8 },
    { header: "보정", key: "ov", width: 8 },
    { header: "호명 경쟁사", key: "comp", width: 24 },
    { header: "응답 원문", key: "a", width: 100 },
  ]);
  for (const a of answers) {
    s3.addRow({
      q: a.query,
      e: ENGINE_LABEL[a.engine],
      m: a.model ?? "",
      men: a.status === "done" ? (isMentioned(a) ? "O" : "X") : "오류",
      ov: a.mention_override === null ? "" : "수동",
      comp: a.competitors_mentioned.join(", "),
      a: a.status === "done" ? (a.answer ?? "").slice(0, 32000) : a.error ?? "",
    });
  }
  finish(s3);

  // 04_인용출처
  const s4 = sheet(wb, "04_인용출처", [
    { header: "질문", key: "q", width: 40 },
    { header: "엔진", key: "e", width: 12 },
    { header: "순위", key: "r", width: 6 },
    { header: "도메인", key: "d", width: 26 },
    { header: "유형", key: "t", width: 10 },
    { header: "자사", key: "own", width: 6 },
    { header: "제목", key: "title", width: 40 },
    { header: "URL", key: "url", width: 60 },
  ]);
  for (const a of answers) {
    for (const c of a.citations) {
      s4.addRow({ q: a.query, e: ENGINE_LABEL[a.engine], r: c.rank, d: c.domain, t: sourceTypeOf(c), own: c.own ? "O" : "", title: c.title, url: c.url });
    }
  }
  finish(s4);

  // 05_인용도메인집계
  const s5 = sheet(wb, "05_인용도메인집계", [
    { header: "도메인", key: "d", width: 30 },
    { header: "유형", key: "t", width: 10 },
    { header: "인용 수", key: "c", width: 10 },
    { header: "등장 응답 수", key: "a", width: 12 },
    ...engines.map((e) => ({ header: ENGINE_LABEL[e], key: e, width: 12 })),
  ]);
  for (const d of topDomains(answers, 200)) {
    s5.addRow({ d: d.domain, t: d.type, c: d.count, a: d.answers, ...Object.fromEntries(engines.map((e) => [e, d.engines[e] ?? 0])) });
  }
  finish(s5);

  // 06_경쟁사동시언급
  const s6 = sheet(wb, "06_경쟁사동시언급", [
    { header: "경쟁사", key: "n", width: 24 },
    { header: "호명 응답 수", key: "m", width: 12 },
    { header: "자사와 동시 호명", key: "t", width: 14 },
    { header: "자사 없이 호명", key: "w", width: 14 },
  ]);
  for (const c of competitorCoMentions(answers, snap.competitors ?? [])) s6.addRow({ n: c.name, m: c.mentioned, t: c.together, w: c.aloneWithoutUs });
  s6.addRow({});
  s6.addRow({ n: "전 엔진 미언급 질문" });
  for (const u of unmentionedQueries(answers)) s6.addRow({ n: u.query, m: u.stage ?? "", t: u.competitors.join(", "), w: u.topDomains.join(", ") });
  finish(s6);

  // 07_유의사항
  const s7 = sheet(wb, "07_유의사항", [{ header: "유의사항", key: "v", width: 140 }]);
  [
    "API 측정값은 사람이 쓰는 ChatGPT·Gemini·Claude 화면 결과와 같지 않습니다(개인화·로그인 상태·UI 전용 기능 없음). 경향·추이 지표로 해석합니다.",
    "매 질의는 대화 이력 없는 새 요청이며 한국 위치(KR) 기준 웹 검색을 켰습니다. 시스템 프롬프트는 쓰지 않았습니다.",
    "단일 회차입니다. 같은 질문도 호출마다 답이 달라지므로 인과 판단에는 반복 측정이 필요합니다.",
    "언급 판정은 브랜드 표기 문자열 매칭입니다. 제품명 단독 등장은 놓칠 수 있고 실재하지 않는 제품명(환각)이 언급으로 잡힐 수 있어, '보정' 열이 '수동'인 행은 원문 대조 후 사람이 고친 값입니다.",
    "언급 순서는 추적 브랜드(자사+등록 경쟁사) 중 자사가 처음 등장한 순서이며 실제 추천 순위와 다를 수 있습니다.",
    "인용 = 답변 문장에 연결된 출처(Claude citations, ChatGPT url_citation, Gemini groundingSupports). 검색만 하고 인용하지 않은 결과는 제외했습니다.",
    "Gemini 인용 URL은 리다이렉트를 풀어 기록했고, 풀리지 않은 경우 출처 제목(대개 도메인)을 도메인으로 썼습니다.",
    "네이버 AI 브리핑은 공식 API가 없어 담당자가 직접 검색해 붙여 넣은 값이며 글로벌 엔진 합계에 넣지 않았습니다.",
    "출처 유형 분류는 도메인 규칙 기반 자동 분류입니다.",
    "비용은 Claude(토큰·웹 검색 단가)만 산출했습니다. ChatGPT·Gemini는 토큰 사용량만 기록했습니다.",
  ].forEach((v) => s7.addRow({ v }));
  finish(s7);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
