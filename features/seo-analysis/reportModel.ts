// PPT·엑셀 산출물이 공유하는 보고서 모델 — 화면 데이터(AuditResult + SeoDiagnosis)를 문서 서술 단위로 정리한다.
// 구조는 geo-audit-framework 스킬의 "보고서 구조(17p 기준 사례)"와 "산출물 템플릿(별첨 시트)"을 따른다.

import type { AuditResult, CrawlerStatus, Finding, SeoDiagnosis } from "./types";

export type ExportOptions = {
  clientName?: string | null; // 광고주명 (사이드바 선택 광고주)
  preparedBy?: string | null; // 작성자 표기 (이메일 등)
};

export type ReportModel = {
  brand: string;
  domain: string;
  url: string;
  dateLabel: string; // 2026년 9월 16일
  dateCompact: string; // 20260916
  fetchedAtLabel: string; // 2026-09-16 15:20 KST
  clientName: string;
  preparedBy: string;
  headline: string;
  subline: string;
  kpis: Array<{ label: string; value: string; sub: string; tone: "ink" | "good" | "warn" | "bad" }>;
  fixItems: Finding[]; // HIGH → MID → LOW
  passItems: Finding[];
  infoItems: Finding[];
  searchCrawlers: CrawlerStatus[];
  fetchCrawlers: CrawlerStatus[];
  trainingCrawlers: CrawlerStatus[];
  hasDiagnosis: boolean;
  diagnosis: SeoDiagnosis | null;
  unverified: string[]; // 이 진단으로 확인하지 못한 항목 (보고서 필수 표기)
};

const SEV_ORDER: Record<string, number> = { HIGH: 0, MID: 1, LOW: 2 };

export function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// 이전 버전(실행 모듈 없음)으로 만들어진 진단 결과나 일부 필드가 빠진 결과도 안전하게 쓰도록 기본값을 채운다
export function normalizeDiagnosis(d: Partial<SeoDiagnosis> | null | undefined): SeoDiagnosis | null {
  if (!d || typeof d !== "object") return null;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    summary: d.summary ?? "",
    siteRole: d.siteRole ?? "",
    engines: arr(d.engines),
    questions: arr(d.questions),
    offsite: arr(d.offsite),
    priorities: arr(d.priorities),
    reinterpretation: d.reinterpretation ?? "",
    caveats: arr(d.caveats),
    aeo: { items: arr(d.aeo?.items), faq: arr(d.aeo?.faq), summaryTable: d.aeo?.summaryTable && Array.isArray(d.aeo.summaryTable.columns) ? d.aeo.summaryTable : null },
    geo: { snippets: arr(d.geo?.snippets), twoPaths: { pathA: arr(d.geo?.twoPaths?.pathA), pathB: arr(d.geo?.twoPaths?.pathB) }, entityMap: arr(d.geo?.entityMap) },
    sov: { prompts: arr(d.sov?.prompts), decisionTree: arr(d.sov?.decisionTree) },
    schemaProposal: d.schemaProposal && typeof d.schemaProposal.jsonLd === "string" ? d.schemaProposal : null,
  };
}

// 실행 모듈이 실제로 채워져 있는지 (구버전 진단 결과 구분용)
export function hasExecutionModules(d: SeoDiagnosis | null): boolean {
  return !!d && (d.aeo.items.length > 0 || d.geo.snippets.length > 0 || d.sov.prompts.length > 0 || !!d.schemaProposal);
}

function brandFrom(audit: AuditResult, clientName?: string | null): string {
  if (clientName && clientName.trim()) return clientName.trim();
  const t = audit.page.title ?? "";
  // "제품명 | 브랜드" / "제품명 - 브랜드" 형태면 뒤쪽 브랜드를 취한다
  const parts = t.split(/\s[|\-–—:]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  if (t && t.length <= 20) return t;
  try {
    const host = new URL(audit.finalUrl).hostname.replace(/^(www|m)\./, "");
    return host.split(".")[0].toUpperCase();
  } catch {
    return "대상 사이트";
  }
}

export function buildReportModel(audit: AuditResult, rawDiagnosis: SeoDiagnosis | null, opts: ExportOptions = {}): ReportModel {
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const fetched = new Date(audit.fetchedAt);
  const kst = new Date(fetched.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const dateLabel = `${y}년 ${m}월 ${d}일`;
  const dateCompact = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  const fetchedAtLabel = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${hh}:${mm} KST`;

  let domain = "";
  try {
    domain = new URL(audit.finalUrl).hostname;
  } catch {
    domain = audit.finalUrl;
  }

  const fixItems = audit.findings.filter((f) => f.status === "fix").sort((a, b) => SEV_ORDER[a.severity ?? "LOW"] - SEV_ORDER[b.severity ?? "LOW"]);
  const passItems = audit.findings.filter((f) => f.status === "pass");
  const infoItems = audit.findings.filter((f) => f.status === "info");

  const s = audit.summary;
  const allSearchAllowed = s.searchCrawlersAllowed === s.searchCrawlersTotal;

  // 헤드라인 — 진단 데이터에서 자동 도출 (AI 진단이 있으면 그 총평을 우선)
  let headline: string;
  let subline: string;
  if (diagnosis?.summary) {
    headline = diagnosis.summary.split(/(?<=[.다!?])\s+/)[0] ?? diagnosis.summary;
    subline = diagnosis.summary.slice(headline.length).trim();
  } else if (audit.page.likelyCsr) {
    headline = "AI 크롤러는 이 페이지의 본문을 읽지 못합니다.";
    subline = "JS 실행 없이 취득한 본문이 거의 없습니다. 서버사이드 렌더링이 선행 과제입니다.";
  } else if (!allSearchAllowed) {
    headline = "일부 AI 검색 크롤러가 차단되어 있습니다.";
    subline = "차단된 엔진에서는 콘텐츠 품질과 무관하게 인용될 수 없습니다.";
  } else if (audit.schema.blocks === 0) {
    headline = "읽히기는 하지만, 답변 소재로 정형화되어 있지 않습니다.";
    subline = "구조화 데이터가 없어 상품·FAQ·엔티티 정보를 엔진이 확정하기 어렵습니다.";
  } else if (s.high > 0) {
    headline = "기반은 갖춰져 있으나, 후보군 진입을 막는 결함이 남아 있습니다.";
    subline = `HIGH ${s.high}건이 특정 엔진의 인용 가능성과 직접 연결됩니다.`;
  } else {
    headline = "기술 기반은 양호합니다. 이제 어떤 질문의 답이 될지를 정할 단계입니다.";
    subline = "크롤러 접근·렌더링·구조화 데이터가 확인되었습니다. 남은 과제는 콘텐츠 구조와 외부 채널입니다.";
  }

  const kpis: ReportModel["kpis"] = [
    { label: "검색용 AI 크롤러 허용", value: `${s.searchCrawlersAllowed}/${s.searchCrawlersTotal}`, sub: audit.robots.found ? "robots.txt 기준 · 학습용 UA는 별도" : "robots.txt 없음 · 기본 허용", tone: allSearchAllowed ? "good" : "bad" },
    { label: "JS 없이 읽힌 본문", value: `${audit.page.textChars.toLocaleString()}자`, sub: audit.page.likelyCsr ? "CSR 추정 — 본문 미노출" : `단락 ${audit.page.paragraphCount} · h2 ${audit.page.h2.length}`, tone: audit.page.likelyCsr ? "bad" : "ink" },
    { label: "구조화 데이터", value: `${audit.schema.types.length}종`, sub: audit.schema.blocks ? clip(audit.schema.types.join(" · "), 40) : "JSON-LD 없음", tone: audit.schema.blocks ? "ink" : "bad" },
    { label: "고쳐야 할 항목", value: `${s.high + s.mid + s.low}건`, sub: `HIGH ${s.high} · MID ${s.mid} · LOW ${s.low}`, tone: s.high > 0 ? "bad" : s.mid > 0 ? "warn" : "good" },
  ];

  const unverified = [
    "IP·CDN(WAF) 단위 크롤러 차단 여부 — 서버 로그가 필요합니다",
    "사이트 전체 title 중복·스키마 적용률·페이지 간 격차 — 단일 페이지 진단으로는 판정하지 않습니다",
    "구조화 데이터 가격·리뷰 수와 실제 판매 채널(커머스몰) 값의 일치 여부",
    "AI 엔진 실측(비브랜드 질문 × 엔진 질의 → 언급·순위·인용 URL) — 본 문서의 질문 설계를 바탕으로 다음 단계에서 수행합니다",
    "단일 시점 진단 — robots.txt·스키마·본문은 배포에 따라 바뀌므로 개선 후 동일 기준 재측정이 필요합니다",
  ];

  return {
    brand: brandFrom(audit, opts.clientName),
    domain,
    url: audit.finalUrl,
    dateLabel,
    dateCompact,
    fetchedAtLabel,
    clientName: opts.clientName?.trim() || brandFrom(audit, null),
    preparedBy: opts.preparedBy?.trim() || "NMG · CTCH",
    headline,
    subline,
    kpis,
    fixItems,
    passItems,
    infoItems,
    searchCrawlers: audit.robots.crawlers.filter((c) => c.role === "search"),
    fetchCrawlers: audit.robots.crawlers.filter((c) => c.role === "fetch"),
    trainingCrawlers: audit.robots.crawlers.filter((c) => c.role === "training"),
    hasDiagnosis: !!diagnosis,
    diagnosis,
    unverified,
  };
}

export function safeFileStem(model: ReportModel): string {
  const host = model.domain.replace(/^(www|m)\./, "").replace(/[^a-zA-Z0-9.-]/g, "");
  return `seo-geo-audit_${host}_${model.dateCompact}`;
}
