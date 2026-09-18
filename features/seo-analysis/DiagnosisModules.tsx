"use client";

// AI 진단의 실행 모듈 4종 표시 — ① AEO 콘텐츠 구조화 ② GEO 전략(Citable Snippet·Two Paths·엔티티) ③ SOV 실측 가이드 ④ JSON-LD 제안
import { useState } from "react";
import { SOV_CHECKLIST, type SeoDiagnosis, type Severity } from "./types";

function Block({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          {desc && <p className="text-[11px] text-ink-muted">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* 클립보드 권한 없음 — 무시 */
    }
  }
  return (
    <button onClick={copy} className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11px] text-ink-soft hover:border-ink-faint">
      <i className={`ti ${done ? "ti-check text-good" : "ti-copy"} text-[13px]`} aria-hidden />
      {done ? "복사됨" : label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function sevClass(s: Severity | string) {
  return s === "HIGH" ? "text-bad" : s === "MID" ? "text-warn" : "text-ink-muted";
}

export function DiagnosisModules({ diagnosis }: { diagnosis: SeoDiagnosis }) {
  const { aeo, geo, sov, schemaProposal } = diagnosis;
  const faqText = aeo.faq.map((f) => `Q. ${f.question}\nA. ${f.answer}`).join("\n\n");
  const promptsText = sov.prompts.map((p) => `${p.no}. ${p.prompt}`).join("\n");

  return (
    <div className="space-y-4">
      {/* ① AEO */}
      <Block title="① AEO 콘텐츠 구조화 — 질문형 H2 + Direct Answer" desc="각 비브랜드 질문에 대해 AI가 최상단 답변으로 추출하기 좋은 H2 제목과 정의문으로 시작하는 첫 100~200자 단락. 180~700자 확장 단락의 첫 부분으로 그대로 사용해요">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <Th>#</Th>
                <Th>단계</Th>
                <Th>질문형 H2</Th>
                <Th>Direct Answer (첫 100~200자)</Th>
              </tr>
            </thead>
            <tbody>
              {aeo.items.map((it) => (
                <tr key={it.no} className="border-t border-line">
                  <Td className="font-mono text-ink-muted">{it.no}</Td>
                  <Td className="whitespace-nowrap text-signal">{it.stage}</Td>
                  <Td className="font-medium text-ink">{it.h2}</Td>
                  <Td className="leading-relaxed text-ink-soft">{it.directAnswer}</Td>
                </tr>
              ))}
              {aeo.items.length === 0 && (
                <tr>
                  <Td className="text-ink-muted">AEO 항목이 생성되지 않았어요.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-line bg-surface p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-ink">FAQ 스니펫 — 페이지 하단 Q&A 블록</p>
              <CopyButton text={faqText} label="텍스트 복사" />
            </div>
            <dl className="space-y-2 text-[12px]">
              {aeo.faq.map((f, i) => (
                <div key={i}>
                  <dt className="font-medium text-ink">Q. {f.question}</dt>
                  <dd className="text-ink-soft">A. {f.answer}</dd>
                </div>
              ))}
              {aeo.faq.length === 0 && <p className="text-ink-muted">FAQ가 생성되지 않았어요.</p>}
            </dl>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3.5">
            <p className="mb-2 text-[12px] font-semibold text-ink">요약 표 {aeo.summaryTable ? `— ${aeo.summaryTable.title}` : ""}</p>
            {aeo.summaryTable && aeo.summaryTable.columns.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-canvas text-ink-muted">
                    <tr>
                      {aeo.summaryTable.columns.map((c, i) => (
                        <Th key={i}>{c}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aeo.summaryTable.rows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {r.map((v, j) => (
                          <Td key={j} className={j === 0 ? "font-medium text-ink" : "text-ink-soft"}>
                            {v}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[12px] text-ink-muted">요약 표가 생성되지 않았어요.</p>
            )}
          </div>
        </div>
      </Block>

      {/* ② GEO */}
      <Block title="② GEO 전략 — Citable Snippet · Two Paths · 엔티티 매핑" desc="AI가 그대로 옮겨 적을 고유 수치 문장을 자사에 심고(Path A), 외부 채널로 확산시켜(Path B) 인용되게 하는 연계 전략. [확인 필요]는 실제 값을 채운 뒤 게시해요">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <Th>#</Th>
                <Th>Citable Snippet</Th>
                <Th>근거</Th>
                <Th>심을 위치</Th>
                <Th>엔진</Th>
              </tr>
            </thead>
            <tbody>
              {geo.snippets.map((s) => (
                <tr key={s.no} className="border-t border-line">
                  <Td className="font-mono text-ink-muted">{s.no}</Td>
                  <Td className="font-medium leading-relaxed text-ink">{s.snippet}</Td>
                  <Td className="text-ink-soft">{s.basis}</Td>
                  <Td className="text-ink-soft">{s.placement}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">{s.targetEngines.join(" · ")}</Td>
                </tr>
              ))}
              {geo.snippets.length === 0 && (
                <tr>
                  <Td className="text-ink-muted">스니펫이 생성되지 않았어요.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-good/30 bg-good/5 p-3.5">
            <p className="mb-1.5 text-[12px] font-semibold text-good">Path A · 자사 직접 인용 (Gemini · AI Overviews)</p>
            <ol className="space-y-1 text-[12px] text-ink-soft">
              {geo.twoPaths.pathA.map((x, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="font-mono text-good">A{i + 1}</span>
                  <span>{x}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-lg border border-signal/30 bg-signal-soft/50 p-3.5">
            <p className="mb-1.5 text-[12px] font-semibold text-signal-strong">Path B · 외부 채널 경유 (Perplexity · 네이버 · ChatGPT)</p>
            <ol className="space-y-1 text-[12px] text-ink-soft">
              {geo.twoPaths.pathB.map((x, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="font-mono text-signal">B{i + 1}</span>
                  <span>{x}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <Th>엔티티</Th>
                <Th>카테고리</Th>
                <Th>핵심 키워드</Th>
                <Th>보조 키워드</Th>
                <Th>sameAs 후보</Th>
                <Th>스키마 표현</Th>
              </tr>
            </thead>
            <tbody>
              {geo.entityMap.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <Td className="font-medium text-ink">{e.entity}</Td>
                  <Td className="text-ink-soft">{e.category}</Td>
                  <Td className="text-ink-soft">{e.coreKeywords.join(" · ")}</Td>
                  <Td className="text-ink-muted">{e.supportKeywords.join(" · ")}</Td>
                  <Td className="text-ink-muted">{e.sameAs.join(" · ")}</Td>
                  <Td className="font-mono text-[11px] text-signal">{e.schemaHint}</Td>
                </tr>
              ))}
              {geo.entityMap.length === 0 && (
                <tr>
                  <Td className="text-ink-muted">엔티티 매핑이 생성되지 않았어요.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Block>

      {/* ③ SOV */}
      <Block
        title="③ AI 검색 SOV 실측 가이드 — 프롬프트 세트 · 기록 체크리스트 · 의사결정 트리"
        desc="ChatGPT · Gemini · Perplexity · Claude · 네이버 AI 브리핑에 세션 초기화 상태로 동일 질문을 던지고 5가지 항목을 기록해요. 결과는 별첨 엑셀 02·08 시트에 적어요"
        right={<CopyButton text={promptsText} label="프롬프트 10개 복사" />}
      >
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <Th>#</Th>
                <Th>단계</Th>
                <Th>입력 프롬프트</Th>
                <Th>엔진별 기록 주의</Th>
              </tr>
            </thead>
            <tbody>
              {sov.prompts.map((p) => (
                <tr key={p.no} className="border-t border-line">
                  <Td className="font-mono text-ink-muted">{p.no}</Td>
                  <Td className="whitespace-nowrap text-signal">{p.stage}</Td>
                  <Td className="font-medium text-ink">{p.prompt}</Td>
                  <Td className="text-ink-muted">{p.note}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="rounded-lg border border-line bg-surface p-3.5">
            <p className="mb-2 text-[12px] font-semibold text-ink">실측 기록 체크리스트 (응답 1건마다)</p>
            <ol className="space-y-1.5 text-[12px]">
              {SOV_CHECKLIST.map((c) => (
                <li key={c.no}>
                  <span className="font-medium text-ink">
                    {c.no}. {c.item}
                  </span>
                  <span className="text-ink-soft"> — {c.howToRecord}</span>
                  <span className="text-ink-muted"> (예: {c.example})</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-[12px]">
              <thead className="bg-canvas text-ink-muted">
                <tr>
                  <Th>단계</Th>
                  <Th>점검</Th>
                  <Th>이 페이지 판정</Th>
                  <Th>미충족 시</Th>
                  <Th>충족 시</Th>
                </tr>
              </thead>
              <tbody>
                {sov.decisionTree.map((n) => {
                  const ok = /^통과|^충족/.test(n.verdictForThisPage);
                  const partial = /^부분/.test(n.verdictForThisPage);
                  return (
                    <tr key={n.step} className="border-t border-line">
                      <Td className="font-mono text-signal">{n.step}</Td>
                      <Td className="font-medium text-ink">{n.check}</Td>
                      <Td className={ok ? "text-good" : partial ? "text-warn" : "text-bad"}>{n.verdictForThisPage}</Td>
                      <Td className="text-ink-soft">{n.ifFail}</Td>
                      <Td className="text-ink-muted">{n.ifPass}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      {/* ④ JSON-LD */}
      <Block
        title={`④ 업종 맞춤 JSON-LD 제안${schemaProposal ? ` — ${schemaProposal.industry}` : ""}`}
        desc={schemaProposal ? schemaProposal.reason : "스키마 제안이 생성되지 않았어요."}
        right={schemaProposal ? <CopyButton text={schemaProposal.jsonLd} label="코드 복사" /> : undefined}
      >
        {schemaProposal && (
          <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="rounded-lg border border-line bg-surface p-3.5">
              <p className="mb-1.5 text-[12px] font-semibold text-ink">적용 메모</p>
              <ul className="space-y-1 text-[12px] text-ink-soft">
                {schemaProposal.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-ink-muted">검증: Google Rich Results Test · Schema Markup Validator. [확인 필요] 값을 채운 뒤 삽입하세요.</p>
            </div>
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-ink p-4 font-mono text-[11px] leading-relaxed text-canvas">{schemaProposal.jsonLd}</pre>
          </div>
        )}
      </Block>

      <p className="text-[11px] text-ink-muted">
        위 네 모듈은 AI 진단 결과이며 확인되지 않은 수치는 [확인 필요]로 남겨 두었어요. 판정에 쓰인 근거는 우선순위 · 엔진별 카드 · 한계 항목을 함께 보세요.
      </p>
    </div>
  );
}

export function severityClass(s: Severity) {
  return sevClass(s);
}
