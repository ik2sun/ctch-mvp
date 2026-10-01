"use client";

import { useEffect, useMemo, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { DiagnosisModules } from "@/features/seo-analysis/DiagnosisModules";
import { hasExecutionModules, normalizeDiagnosis } from "@/features/seo-analysis/reportModel";
import type { AuditResult, BusinessBrief, CrawlerStatus, Finding, SeoDiagnosis, Severity } from "@/features/seo-analysis/types";

// ---------- 작은 표시 컴포넌트 ----------

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-display text-[22px] font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function SeverityBadge({ severity, status }: { severity?: Severity; status: Finding["status"] }) {
  if (status === "pass") return <span className="whitespace-nowrap rounded bg-good/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-good">PASS</span>;
  if (status === "info") return <span className="whitespace-nowrap rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ink-muted">INFO</span>;
  const cls = severity === "HIGH" ? "bg-bad/10 text-bad" : severity === "MID" ? "bg-warn/10 text-warn" : "bg-canvas text-ink-muted";
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[12px] font-semibold ${cls}`}>{severity}</span>;
}

function EngineChips({ engines }: { engines: string[] }) {
  if (!engines.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {engines.map((e) => (
        <span key={e} className="rounded-full border border-line bg-surface px-1.5 py-px text-[12px] text-ink-soft">
          {e}
        </span>
      ))}
    </span>
  );
}

function Section({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-[15px] font-medium text-ink-soft">{title}</span>
          {desc && <p className="text-[13px] text-ink-muted">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const SEV_ORDER: Record<string, number> = { HIGH: 0, MID: 1, LOW: 2 };

// ---------- 페이지 ----------

export default function SeoAnalysisPage() {
  const [input, setInput] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [diagnosis, setDiagnosis] = useState<SeoDiagnosis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 브랜드 정보 — 비워 두면 페이지에서 추정
  const [brief, setBrief] = useState<BusinessBrief>({});
  const briefFilled = Object.values(brief).some((v) => v && v.trim());
  function setBriefField(k: keyof BusinessBrief, v: string) {
    setBrief((b) => ({ ...b, [k]: v }));
  }

  // 마지막 결과를 브라우저에 보존 — 새로고침·코드 반영(HMR)으로 상태가 사라져 AI 진단 없이 내려받는 일을 막는다
  const STORAGE_KEY = "ctch_seo_analysis_last";
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { input?: string; audit?: AuditResult | null; diagnosis?: SeoDiagnosis | null; brief?: BusinessBrief };
        if (saved.input) setInput(saved.input);
        if (saved.audit) setAudit(saved.audit);
        if (saved.diagnosis) setDiagnosis(normalizeDiagnosis(saved.diagnosis));
        if (saved.brief) setBrief(saved.brief);
      }
    } catch {
      /* 저장소 사용 불가 — 무시 */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      if (audit) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ input, audit, diagnosis, brief }));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 용량 초과 등 — 무시 */
    }
  }, [restored, input, audit, diagnosis, brief]);

  const modulesReady = hasExecutionModules(diagnosis);
  const [askDiagnosisFor, setAskDiagnosisFor] = useState<"pptx" | "xlsx" | null>(null);

  const [filter, setFilter] = useState<"all" | "fix" | "pass">("fix");

  const { selected: selectedClient } = useClients();
  const [exporting, setExporting] = useState<"pptx" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // AI 진단(실행 모듈) 없이 내려받으려 하면 먼저 확인한다. force=true면 그대로 내려받는다.
  async function download(type: "pptx" | "xlsx", override?: SeoDiagnosis | null, force = false) {
    if (!audit) return;
    const diag = override === undefined ? diagnosis : override;
    if (!force && !hasExecutionModules(diag)) {
      setAskDiagnosisFor(type);
      return;
    }
    setAskDiagnosisFor(null);
    setExporting(type);
    setExportError(null);
    try {
      const res = await fetch("/api/seo-analysis/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, audit, diagnosis: diag, clientName: selectedClient?.name ?? null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "문서 생성에 실패했어요.");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const star = cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plain = cd.match(/filename="([^"]+)"/i)?.[1];
      const name = star ? decodeURIComponent(star) : plain ?? `seo-analysis.${type}`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setExporting(null);
    }
  }

  const fixes = useMemo(
    () => (audit ? audit.findings.filter((f) => f.status === "fix").sort((a, b) => SEV_ORDER[a.severity ?? "LOW"] - SEV_ORDER[b.severity ?? "LOW"]) : []),
    [audit],
  );
  const shown = useMemo(() => {
    if (!audit) return [];
    if (filter === "fix") return fixes;
    if (filter === "pass") return audit.findings.filter((f) => f.status !== "fix");
    return [...fixes, ...audit.findings.filter((f) => f.status !== "fix")];
  }, [audit, fixes, filter]);

  async function runAuditRequest() {
    if (!input.trim()) {
      setError("진단할 페이지 URL을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setAudit(null);
    setDiagnosis(null);
    setAiError(null);
    setAskDiagnosisFor(null);
    setFilter("fix");
    try {
      const res = await fetch("/api/seo-analysis/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "진단에 실패했어요.");
      setAudit(json as AuditResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function runDiagnosis(): Promise<SeoDiagnosis | null> {
    if (!audit) return null;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/seo-analysis/ai-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit, brief: briefFilled ? brief : null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI 진단에 실패했어요.");
      const d = normalizeDiagnosis(json as SeoDiagnosis);
      setDiagnosis(d);
      return d;
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "오류가 발생했어요.");
      return null;
    } finally {
      setAiLoading(false);
    }
  }

  const searchCrawlers = audit?.robots.crawlers.filter((c) => c.role === "search") ?? [];
  const otherCrawlers = audit?.robots.crawlers.filter((c) => c.role !== "search") ?? [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* URL 입력 */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <i className="ti ti-seo text-[18px] text-signal" aria-hidden />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runAuditRequest()}
            placeholder="진단할 페이지 URL (예: https://www.brand.com/product/123)"
            className="field h-10 min-w-[280px] flex-1"
          />
          <button onClick={runAuditRequest} disabled={loading} className="btn-signal h-10">
            <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-search"} text-[17px]`} aria-hidden />
            {loading ? "진단 중…" : "진단 시작"}
          </button>
        </div>
        <p className="mt-2 text-[13px] text-ink-muted">
          AI 크롤러가 보는 방식(JS 미실행)으로 페이지를 읽어 크롤러 접근 · 렌더링 · JSON-LD · 정합성 · 온페이지 · 인용 적합도를 점검하고, 엔진별(ChatGPT · Gemini/AI Overviews · Claude · Perplexity · 네이버) 처방을 나눕니다.
        </p>
        <details className="mt-3 rounded-lg border border-line bg-canvas px-3.5 py-2.5" open={briefFilled}>
          <summary className="cursor-pointer text-[13px] font-medium text-ink-soft">
            브랜드 정보 (선택) — 입력하면 AI 진단의 질의 설계 · Citable Snippet · 엔티티 매핑 · JSON-LD가 더 정확해져요{briefFilled ? " · 입력됨" : ""}
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input value={brief.brandName ?? ""} onChange={(e) => setBriefField("brandName", e.target.value)} placeholder="브랜드명 (예: 에스트라)" className="field h-9 text-[15px]" />
            <input value={brief.industry ?? ""} onChange={(e) => setBriefField("industry", e.target.value)} placeholder="타깃 업종/카테고리 (예: 더마 코스메틱 · 민감성 스킨케어)" className="field h-9 text-[15px]" />
            <input value={brief.products ?? ""} onChange={(e) => setBriefField("products", e.target.value)} placeholder="주요 제품/서비스 2~3개 (예: 아토베리어365 크림, 세라-히알 앰플)" className="field h-9 text-[15px]" />
            <input value={brief.competitors ?? ""} onChange={(e) => setBriefField("competitors", e.target.value)} placeholder="경쟁사/비교 대상 (예: 일리윤, 라로슈포제, 토리든)" className="field h-9 text-[15px]" />
            <textarea
              value={brief.strengths ?? ""}
              onChange={(e) => setBriefField("strengths", e.target.value)}
              placeholder="핵심 강점/데이터 — 수치 · 특허 · 수상 · 누적 실적 · 임상 결과 (예: 논문 470건, 특허 240건, 120시간 보습 임상)"
              className="field h-20 resize-none py-2 text-[15px] md:col-span-2"
            />
          </div>
        </details>
        {error && <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}
      </div>

      {audit && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="검색용 AI 크롤러 허용"
              value={`${audit.summary.searchCrawlersAllowed}/${audit.summary.searchCrawlersTotal}`}
              sub={audit.robots.found ? "robots.txt 기준" : "robots.txt 없음 · 기본 허용"}
              tone={audit.summary.searchCrawlersAllowed === audit.summary.searchCrawlersTotal ? "good" : "bad"}
            />
            <KpiCard label="JS 없이 읽힌 본문" value={`${audit.page.textChars.toLocaleString()}자`} sub={audit.page.likelyCsr ? "CSR 추정 — 본문 미노출" : `단락 ${audit.page.paragraphCount} · h2 ${audit.page.h2.length}`} tone={audit.page.likelyCsr ? "bad" : undefined} />
            <KpiCard label="JSON-LD 타입" value={`${audit.schema.types.length}종`} sub={audit.schema.blocks ? audit.schema.types.slice(0, 3).join(" · ") : "구조화 데이터 없음"} tone={audit.schema.blocks ? undefined : "bad"} />
            <KpiCard label="FIX · HIGH" value={String(audit.summary.high)} sub={`MID ${audit.summary.mid} · LOW ${audit.summary.low}`} tone={audit.summary.high > 0 ? "bad" : "good"} />
            <KpiCard label="PASS" value={String(audit.summary.pass)} sub="확인된 양호 항목" tone="good" />
            <KpiCard label="인용 후보 단락" value={String(audit.citability.candidatePassages)} sub={`질문형 헤딩 ${audit.citability.questionHeadings.length} · 수치 문장 ${audit.citability.numericSentences}`} tone={audit.citability.candidatePassages === 0 ? "warn" : undefined} />
          </div>
          {/* 메타 + 산출물 다운로드 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
            <p className="text-[13px] text-ink-muted">
              {audit.finalUrl} · HTTP {audit.status} · {(audit.page.htmlBytes / 1024).toFixed(0)}KB · {audit.ms}ms · {new Date(audit.fetchedAt).toLocaleString("ko-KR")}
              {selectedClient && <> · 광고주 {selectedClient.name}</>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[13px] ${modulesReady ? "text-good" : "text-warn"}`}>
                {modulesReady ? "AI 진단 포함 — 실행 모듈 4종 반영" : diagnosis ? "이전 버전 진단 — 실행 모듈이 없어요. 다시 진단하세요" : "AI 진단 전 — 실행 모듈(AEO·GEO·SOV·JSON-LD) 없이 나가요"}
              </span>
              <button onClick={() => download("xlsx")} disabled={exporting !== null || aiLoading} className="btn-ghost h-9 px-3 text-[15px]">
                <i className={`ti ${exporting === "xlsx" ? "ti-loader-2 animate-spin" : "ti-file-spreadsheet"} text-[16px] text-good`} aria-hidden />
                별첨 엑셀 · 14시트
              </button>
              <button onClick={() => download("pptx")} disabled={exporting !== null || aiLoading} className="btn-ghost h-9 px-3 text-[15px]">
                <i className={`ti ${exporting === "pptx" ? "ti-loader-2 animate-spin" : "ti-presentation"} text-[16px] text-signal`} aria-hidden />
                리포트 PPT · {modulesReady ? "25장" : "17장"}
              </button>
            </div>
          </div>
          {askDiagnosisFor && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
              <p className="text-[15px] text-ink">
                <i className="ti ti-alert-triangle mr-1 text-warn" aria-hidden />
                AI 진단을 아직 실행하지 않았어요. 지금 내려받으면 {askDiagnosisFor === "pptx" ? "17장짜리 리포트" : "10~13번 시트가 비어 있는 별첨"}이 나가요. AI 진단(2~4분)을 먼저 실행하면 AEO 콘텐츠 설계 · Citable Snippet · 엔티티 매핑 · SOV 프롬프트 · 의사결정 트리 · JSON-LD가 채워져요.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const type = askDiagnosisFor;
                    setAskDiagnosisFor(null);
                    const d = await runDiagnosis();
                    if (d) await download(type, d, true);
                  }}
                  className="btn-signal h-9 px-3 text-[15px]"
                >
                  <i className="ti ti-sparkles text-[16px]" aria-hidden />
                  AI 진단 후 내려받기
                </button>
                <button onClick={() => download(askDiagnosisFor, diagnosis, true)} className="btn-ghost h-9 px-3 text-[15px]">
                  그대로 내려받기
                </button>
                <button onClick={() => setAskDiagnosisFor(null)} className="btn-ghost h-9 px-3 text-[15px]">
                  취소
                </button>
              </div>
            </div>
          )}
          {exportError && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{exportError}</p>}

          {/* AI 진단 */}
          <Section
            title="AI 진단 — 엔진별 처방 · 비브랜드 질문 설계"
            desc="기술 진단 결과를 바탕으로 엔진별 후보군 진입 가능성, 이 페이지에서 뽑을 수 있는 비브랜드 질문 10개, 우선 액션과 재해석을 정리해요"
            right={
              <button onClick={runDiagnosis} disabled={aiLoading} className="btn-signal h-9 px-3 text-[15px]">
                <i className={`ti ${aiLoading ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[16px]`} aria-hidden />
                {aiLoading ? "진단 중…" : diagnosis ? "다시 진단" : "AI 진단 실행"}
              </button>
            }
          >
            {aiError && <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{aiError}</p>}
            {diagnosis ? (
              <div className="space-y-4">
                <p className="text-[15px] leading-relaxed text-ink">{diagnosis.summary}</p>
                <div className="rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[13px] text-ink-soft">
                  <span className="font-semibold text-ink">이 페이지의 역할</span> · {diagnosis.siteRole}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {diagnosis.engines.map((e) => {
                    const tone = e.readiness === "양호" ? "border-good/30 bg-good/5" : e.readiness === "보통" ? "border-warn/30 bg-warn/5" : "border-bad/30 bg-bad/5";
                    const tcolor = e.readiness === "양호" ? "text-good" : e.readiness === "보통" ? "text-warn" : "text-bad";
                    return (
                      <div key={e.engine} className={`rounded-lg border p-3.5 ${tone}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[15px] font-semibold text-ink">{e.engine}</span>
                          <span className={`font-mono text-[13px] font-semibold ${tcolor}`}>{e.readiness}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-ink-soft">{e.evidence}</p>
                        {e.blockers.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-[13px] text-bad">
                            {e.blockers.map((b, i) => (
                              <li key={i}>· {b}</li>
                            ))}
                          </ul>
                        )}
                        {e.actions.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-[13px] text-ink">
                            {e.actions.map((a, i) => (
                              <li key={i} className="flex gap-1.5">
                                <i className="ti ti-arrow-right mt-0.5 text-[13px] text-signal" aria-hidden />
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-lg border border-line bg-canvas p-3.5">
                    <p className="mb-1.5 text-[13px] font-semibold text-ink">우선 액션</p>
                    <ol className="space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
                      {diagnosis.priorities.map((p) => (
                        <li key={p.rank} className="flex gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[13px] font-semibold text-signal">{p.rank}</span>
                          <span>
                            <span className="text-ink">{p.action}</span> <span className="text-ink-muted">— {p.why}</span>
                            <span className="ml-1 inline-flex gap-1 align-middle">
                              <SeverityBadge severity={p.severity} status="fix" />
                              <EngineChips engines={p.engines} />
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-line bg-canvas p-3.5">
                      <p className="mb-1.5 text-[13px] font-semibold text-ink">
                        <i className="ti ti-share mr-1 text-signal" aria-hidden />
                        외부 채널(Path B)
                      </p>
                      <ul className="space-y-1 text-[13px] leading-relaxed text-ink-soft">
                        {diagnosis.offsite.map((o, i) => (
                          <li key={i}>· {o}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-signal/20 bg-signal-soft/40 p-3.5">
                      <p className="mb-1 text-[13px] font-semibold text-signal-strong">재해석</p>
                      <p className="text-[13px] leading-relaxed text-ink-soft">{diagnosis.reinterpretation}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="bg-canvas text-left text-ink-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">비브랜드 질문 후보</th>
                        <th className="px-3 py-2 font-medium">유형</th>
                        <th className="px-3 py-2 font-medium">여정</th>
                        <th className="px-3 py-2 font-medium">설계 근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnosis.questions.map((q) => (
                        <tr key={q.no} className="border-t border-line">
                          <td className="px-3 py-2 font-mono text-ink-muted">{q.no}</td>
                          <td className="px-3 py-2 text-ink">{q.question}</td>
                          <td className="px-3 py-2 text-ink-soft">{q.type}</td>
                          <td className="px-3 py-2 text-ink-soft">{q.intent}</td>
                          <td className="px-3 py-2 text-ink-muted">{q.basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[13px] text-ink-muted">
                  위 질문을 ChatGPT · Gemini · Perplexity · Claude · 네이버 AI 브리핑에 세션 초기화 상태로 던져 언급 여부·순위·인용 URL을 기록하면 실측 단계가 됩니다. 아래 ③ 실측 가이드에 프롬프트와 기록 체크리스트가 있어요.
                </p>

                <DiagnosisModules diagnosis={diagnosis} />

                {diagnosis.caveats.length > 0 && (
                  <div className="rounded-lg border border-dashed border-line p-3.5">
                    <p className="mb-1 text-[13px] font-semibold text-ink-muted">이 진단의 한계</p>
                    <ul className="space-y-0.5 text-[13px] text-ink-muted">
                      {diagnosis.caveats.map((c, i) => (
                        <li key={i}>· {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-canvas p-4 text-[15px] text-ink-muted">
                아래 기술 진단은 이미 끝났어요. AI 진단을 실행하면 엔진별로 &quot;왜 후보군에 못 드는가&quot;와 처방을 나누고, 다음 네 모듈을 만들어요. 2~4분 걸려요.
                <ul className="mt-2 space-y-0.5 text-[13px]">
                  <li>① AEO 콘텐츠 구조화 — 여정 4단계 비브랜드 질의 10선, 질문형 H2 + 첫 100~200자 Direct Answer, FAQ 스니펫 · 요약 표</li>
                  <li>② GEO 전략 — Citable Snippet 5선, Two Paths(Path A/B) 실행안, 브랜드 엔티티 키워드 매핑</li>
                  <li>③ SOV 실측 가이드 — 5대 엔진 프롬프트 세트, 기록 체크리스트 5항목, 노출 미흡 원인 의사결정 트리</li>
                  <li>④ 업종 맞춤 JSON-LD — 커머스/B2B/기업/아티클/병원 판정 후 즉시 삽입 가능한 스크립트</li>
                </ul>
              </div>
            )}
          </Section>

          {/* 진단 항목 */}
          <Section
            title="기술 진단 항목"
            desc="확인된 것만 기재해요. 사이트 단위 항목(전 페이지 title 중복, 스키마 적용률, IP 차단)은 단일 페이지 진단으로는 판정하지 않아요"
            right={
              <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-[13px]">
                {(["fix", "pass", "all"] as const).map((k) => (
                  <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-2.5 py-1 ${filter === k ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-muted"}`}>
                    {k === "fix" ? `FIX ${fixes.length}` : k === "pass" ? `PASS·INFO ${audit.findings.length - fixes.length}` : "전체"}
                  </button>
                ))}
              </div>
            }
          >
            <ul className="divide-y divide-line">
              {shown.map((f) => (
                <li key={f.id} className="flex gap-3 py-2.5">
                  <div className="w-14 shrink-0 pt-0.5">
                    <SeverityBadge severity={f.severity} status={f.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium text-ink">{f.title}</span>
                      <span className="rounded bg-canvas px-1.5 py-px text-[12px] text-ink-muted">{f.area}</span>
                    </div>
                    <p className="mt-0.5 break-words text-[13px] leading-relaxed text-ink-soft">{f.detail}</p>
                    <div className="mt-1">
                      <EngineChips engines={f.engines} />
                    </div>
                  </div>
                </li>
              ))}
              {shown.length === 0 && <li className="py-3 text-[15px] text-ink-muted">해당 항목이 없어요.</li>}
            </ul>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 크롤러 */}
            <Section title="AI 크롤러 접근 (robots.txt)" desc="검색용 UA와 학습용 UA를 분리해서 봐요. 학습용 차단은 인용과 무관해요">
              <CrawlerTable title="검색용 · 실시간 fetch" rows={[...searchCrawlers, ...otherCrawlers.filter((c) => c.role === "fetch")]} />
              <div className="mt-3">
                <CrawlerTable title="학습용 (인용과 무관)" rows={otherCrawlers.filter((c) => c.role === "training")} muted />
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                IP 단위 차단·CDN(WAF) 차단은 서버 로그 없이는 확인할 수 없어요. robots.txt 판정만 반영돼 있어요.
                {audit.robots.sitemaps.length > 0 && <> Sitemap 선언: {audit.robots.sitemaps.length}건</>}
              </p>
            </Section>

            {/* 스키마 */}
            <Section title="구조화 데이터 (JSON-LD)" desc={`${audit.schema.blocks}블록 · 파싱 오류 ${audit.schema.parseErrors}건`}>
              {audit.schema.nodes.length === 0 ? (
                <p className="text-[15px] text-ink-muted">감지된 노드가 없어요.</p>
              ) : (
                <ul className="space-y-2">
                  {audit.schema.nodes.map((n, i) => (
                    <li key={i} className="rounded-lg border border-line bg-canvas p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-ink">{n.type}</span>
                        {n.name && <span className="truncate text-[13px] text-ink-muted">{n.name}</span>}
                      </div>
                      {n.ok.length > 0 && <p className="mt-1 text-[13px] text-good">✓ {n.ok.join(" · ")}</p>}
                      {n.issues.length > 0 && <p className="mt-0.5 text-[13px] text-bad">✕ {n.issues.join(" · ")}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {audit.schema.faqQuestions.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] text-ink-soft">FAQ 문항 {audit.schema.faqQuestions.length}개 보기</summary>
                  <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-muted">
                    {audit.schema.faqQuestions.map((q, i) => (
                      <li key={i}>· {q}</li>
                    ))}
                  </ul>
                </details>
              )}
            </Section>

            {/* 온페이지 */}
            <Section title="온페이지 기본">
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
                <Row k="title" v={audit.page.title ?? "—"} />
                <Row k="description" v={audit.page.metaDescription ?? "—"} />
                <Row k="h1" v={audit.page.h1.join(" | ") || "—"} />
                <Row k="h2" v={audit.page.h2.length ? `${audit.page.h2.length}개 · ${audit.page.h2.slice(0, 4).join(" / ")}` : "0개"} />
                <Row k="canonical" v={audit.page.canonical ? `${audit.page.canonical}${audit.page.canonicalMatches === false ? " (현재 URL과 다름)" : ""}` : "—"} />
                <Row k="lang / header" v={`${audit.page.lang ?? "—"} / ${audit.page.contentLanguage ?? "—"}`} />
                <Row k="robots" v={[audit.page.metaRobots, audit.page.xRobotsTag].filter(Boolean).join(" · ") || "—"} />
                <Row k="hreflang" v={`${audit.page.hreflangCount}개`} />
                <Row k="이미지" v={`${audit.page.imgCount}개 · alt 누락 ${audit.page.imgAltMissing}`} />
                <Row k="구조" v={`리스트 ${audit.page.listCount} · 표 ${audit.page.tableCount} · 영상 ${audit.page.videoCount}`} />
                <Row k="AI 파일" v={`llms.txt ${audit.files.llmsTxt ? "있음" : "없음"} · sitemap.xml ${audit.files.sitemapXml ? "있음" : "없음"}`} />
              </dl>
            </Section>

            {/* 인용 적합도 */}
            <Section title="인용 적합도 (휴리스틱)" desc="엔진이 단락 단위로 인용한다는 전제에서 본 구조 신호예요">
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
                <Row k="정의문 패턴" v={audit.citability.definitionPattern ? "초반 1,200자 안에 있음" : "없음"} />
                <Row k="질문형 헤딩" v={audit.citability.questionHeadings.length ? audit.citability.questionHeadings.slice(0, 5).join(" / ") : "없음"} />
                <Row k="후보 단락" v={`${audit.citability.candidatePassages}개 (180~700자)`} />
                <Row k="수치 문장" v={`${audit.citability.numericSentences}개`} />
                <Row k="날짜 신호" v={audit.citability.dates.length ? audit.citability.dates.join(" · ") : "없음"} />
              </dl>
              {audit.citability.firstParagraph && (
                <div className="mt-3 rounded-lg border border-line bg-canvas p-3">
                  <p className="mb-1 text-[13px] font-medium text-ink-muted">첫 단락 (AI가 가장 먼저 읽는 부분)</p>
                  <p className="text-[13px] leading-relaxed text-ink-soft">{audit.citability.firstParagraph}</p>
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="break-words text-ink">{v}</dd>
    </>
  );
}

function CrawlerTable({ title, rows, muted }: { title: string; rows: CrawlerStatus[]; muted?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-ink-muted">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[15px]">
          <tbody>
            {rows.map((c) => (
              <tr key={c.ua} className="border-t border-line first:border-t-0">
                <td className={`whitespace-nowrap px-3 py-2 font-mono ${muted ? "text-ink-muted" : "text-ink"}`}>{c.ua}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{c.owner}</td>
                <td className="w-px px-3 py-2">
                  <span className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[12px] font-semibold ${c.status === "allowed" ? "bg-good/10 text-good" : muted ? "bg-canvas text-ink-muted" : "bg-bad/10 text-bad"}`}>
                    {c.status === "allowed" ? "허용" : "차단"}
                  </span>
                </td>
                <td className="hidden min-w-[260px] px-3 py-2 text-ink-muted md:table-cell">{c.governs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
