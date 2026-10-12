"use client";

// 자동 리포트 화면 — ① 예시 리포트로 학습 → ② 구성 확인·수정 → ③ 기간·일정·받는 사람 → 미리보기·발송. 목록은 광고주별
import { useCallback, useEffect, useMemo, useState } from "react";
import { MEDIA_LABEL } from "@/features/correlation/types";
import { SelectAllLinks } from "@/features/autopilot/gfa/ui";
import { extractFile, extractGoogle, type Extracted } from "./extract";
import { scheduleText } from "./period";
import {
  COMPARES,
  DEFAULT_SCHEDULE,
  DEFAULT_SPEC,
  FREQUENCIES,
  METRIC_KEYS,
  METRICS,
  PERIODS,
  SECTION_TYPES,
  sectionId,
  type AutoReport,
  type MetricKey,
  type ReportRun,
  type ReportSection,
  type SectionType,
} from "./types";

const BTN = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-50";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1baf7a] px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-[#159467] disabled:opacity-40";
const INP = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-[#1baf7a]";
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

const blank = (clientId: string): AutoReport => ({
  clientId,
  name: "주간 리포트",
  enabled: true,
  spec: structuredClone(DEFAULT_SPEC),
  source: null,
  schedule: { ...DEFAULT_SCHEDULE },
  recipients: [],
  options: { attachXlsx: true, media: [] },
});

type Preview = { subject: string; html: string; warnings: string[]; period: ReportRun["period"] };

export function AutoReportView({ client }: { client: { id: string; name: string } | null }) {
  const [reports, setReports] = useState<AutoReport[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AutoReport | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "learn" | "save" | "preview" | "test" | "send" | "delete">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [gUrl, setGUrl] = useState("");
  const [learnNote, setLearnNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/auto-report?clientId=${client.id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "불러오지 못했어요");
      setReports(j.reports ?? []);
      setRuns(j.runs ?? []);
      setConnected(j.connected ?? []);
      setSetupError(j.setupError ?? null);
      return j.reports as AutoReport[];
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setDraft(null);
    setPreview(null);
    setMsg(null);
    load().then((list) => {
      if (list?.length) setDraft(structuredClone(list[0]));
    });
  }, [load]);

  const edit = (fn: (d: AutoReport) => AutoReport) => {
    setDraft((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  };
  const setSection = (id: string, patch: Partial<ReportSection>) => edit((d) => ({ ...d, spec: { ...d.spec, sections: d.spec.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) } }));

  if (!client) return <div className="mx-auto max-w-[1600px] rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">먼저 오른쪽 위에서 광고주를 선택해 주세요.</div>;

  async function learn(src: Promise<Extracted>) {
    if (!draft || !client) return;
    setBusy("learn");
    setMsg(null);
    setLearnNote(null);
    try {
      const ex = await src;
      const res = await fetch("/api/auto-report/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, sourceName: ex.name, text: ex.text, pdfBase64: ex.pdfBase64 }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "학습 실패");
      edit((d) => ({
        ...d,
        name: d.id ? d.name : j.name,
        spec: j.spec,
        schedule: { ...d.schedule, ...j.schedule },
        source: { kind: ex.kind, name: ex.name, excerpt: ex.text.slice(0, 2000) },
      }));
      setLearnNote(`'${ex.name}'에서 섹션 ${j.spec.sections.length}개를 읽었어요. 아래 구성을 확인하고 미리보기로 원본과 비교해 보세요.`);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/auto-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: draft }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "저장 실패");
      setDraft(j.report);
      setDirty(false);
      setMsg({ kind: "ok", text: "저장했어요." });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function run(mode: "preview" | "test" | "send") {
    if (!draft || !client) return;
    if (mode === "send" && !window.confirm(`${draft.recipients.join(", ")}에게 지금 발송할까요?`)) return;
    setBusy(mode);
    setMsg(null);
    try {
      const res = await fetch("/api/auto-report/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, report: draft, send: mode !== "preview", to: mode === "test" ? ["__me__"] : undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "실패");
      setPreview({ subject: j.subject, html: j.html, warnings: j.warnings ?? [], period: j.period });
      if (mode !== "preview") {
        setMsg({ kind: "ok", text: `${(j.sentTo ?? []).join(", ")}에게 보냈어요.` });
        await load();
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!draft?.id || !client || !window.confirm(`'${draft.name}' 자동 리포트를 지울까요? 발송 기록도 함께 지워져요.`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/auto-report?clientId=${client.id}&id=${draft.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "삭제 실패");
      setDraft(null);
      setPreview(null);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const d = draft;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div>
        <p className="text-[15px] text-ink-muted">AI 리포트 · 자동 리포트</p>
        <h2 className="mt-1 text-[26px] font-bold tracking-tight text-ink">{client.name} 자동 리포트</h2>
        <p className="mt-1 text-[14px] text-ink-muted">평소 보내던 리포트를 올리면 AI가 양식을 학습해, 정해진 날 매체 API 수치로 같은 리포트를 만들어 메일로 보내요.</p>
      </div>

      {setupError && <p className="rounded-lg bg-[#FEF3F2] px-4 py-3 text-[14px] text-bad">{setupError}</p>}

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* 목록 */}
        <aside className="space-y-3">
          <button type="button" onClick={() => { setDraft(blank(client.id)); setPreview(null); setDirty(true); setLearnNote(null); }} className={`${BTN_PRIMARY} w-full justify-center`}>
            <i className="ti ti-plus text-[16px]" aria-hidden />새 자동 리포트
          </button>
          {loading && !reports.length && <p className="text-[13px] text-ink-muted">불러오는 중…</p>}
          {!loading && !reports.length && !d && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-muted">아직 없어요. 새 자동 리포트를 만들어 보세요.</p>}
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { if (dirty && !window.confirm("저장하지 않은 수정이 있어요. 버리고 이동할까요?")) return; setDraft(structuredClone(r)); setPreview(null); setDirty(false); setLearnNote(null); }}
              className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${d?.id === r.id ? "border-[#1baf7a] bg-[#ECFDF3]" : "border-line bg-white hover:bg-canvas"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.enabled ? "bg-[#17B26A]" : "bg-[#98A2B3]"}`} />
                <span className="truncate text-[15px] font-semibold text-ink">{r.name}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-muted">{scheduleText(r.schedule)} · {PERIODS[r.schedule.period]} · 받는 사람 {r.recipients.length}명</p>
              {r.lastStatus && <p className={`mt-0.5 truncate text-[12px] ${r.lastStatus.startsWith("오류") ? "text-bad" : "text-ink-muted"}`}>최근 {r.lastRunAt?.slice(0, 10)} {r.lastStatus}</p>}
            </button>
          ))}
        </aside>

        {/* 편집 */}
        {d ? (
          <div className="min-w-0 space-y-6">
            {/* ① 학습 */}
            <section className="rounded-card border border-line bg-surface p-6">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Step n={1} />예시 리포트로 학습</h3>
              <p className="mt-1 text-[14px] text-ink-muted">지금까지 이 광고주에게 보내던 리포트 하나를 올리면 섹션·표·지표·말투를 읽어 아래 구성을 채워요. 학습 없이 기본 구성으로 시작해도 돼요.</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line px-4 py-6 text-center hover:bg-canvas ${busy === "learn" ? "pointer-events-none opacity-60" : ""}`}>
                  <i className="ti ti-file-upload text-[24px] text-[#1baf7a]" aria-hidden />
                  <span className="text-[14px] font-semibold text-ink">파일 올리기</span>
                  <span className="text-[12px] text-ink-muted">엑셀·CSV·워드·파워포인트·PDF(2.3MB까지)</span>
                  <input type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.csv,.docx,.pptx,.pdf,.txt,.md" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) learn(extractFile(f)); }} />
                </label>
                <div className="flex flex-col justify-center gap-2 rounded-xl border border-line px-4 py-4">
                  <span className="text-[14px] font-semibold text-ink">구글 문서·시트·슬라이드 주소</span>
                  <input className={INP} value={gUrl} onChange={(e) => setGUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
                  <button type="button" disabled={!gUrl.trim() || busy === "learn"} onClick={() => learn(extractGoogle(gUrl))} className={BTN}>
                    <i className="ti ti-brand-google-drive text-[16px]" aria-hidden />불러와서 학습
                  </button>
                  <span className="text-[12px] text-ink-muted">처음 한 번 구글 로그인 창이 떠요(보기 권한만).</span>
                </div>
              </div>
              {busy === "learn" && <p className="mt-3 text-[14px] text-ink-muted"><i className="ti ti-loader-2 animate-spin" aria-hidden /> 리포트를 읽고 구조를 정리하는 중… (30초~1분)</p>}
              {learnNote && <p className="mt-3 rounded-lg bg-[#ECFDF3] px-3 py-2 text-[14px] text-good">{learnNote}</p>}
              {d.source && <p className="mt-2 text-[13px] text-ink-muted">학습 원본: {d.source.name}</p>}
              {d.spec.learnedFrom && <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{d.spec.learnedFrom}</p>}
              {!!d.spec.unsupported?.length && (
                <div className="mt-3 rounded-lg bg-[#FFFAEB] px-3 py-2 text-[13px] text-[#B54708]">
                  원본에는 있지만 자동으로 못 만드는 항목 — 메일을 받은 뒤 직접 덧붙여 주세요: {d.spec.unsupported.join(" · ")}
                </div>
              )}
            </section>

            {/* ② 구성 */}
            <section className="rounded-card border border-line bg-surface p-6">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Step n={2} />리포트 구성</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="리포트 이름(목록용)"><input className={INP} value={d.name} onChange={(e) => edit((x) => ({ ...x, name: e.target.value }))} /></Field>
                <Field label="메일 제목 — {광고주} {기간} 자동 치환"><input className={INP} value={d.spec.subject} onChange={(e) => edit((x) => ({ ...x, spec: { ...x.spec, subject: e.target.value } }))} /></Field>
                <Field label="첫 문단(선택)"><textarea rows={2} className={`${INP} resize-y`} value={d.spec.intro ?? ""} onChange={(e) => edit((x) => ({ ...x, spec: { ...x.spec, intro: e.target.value } }))} /></Field>
                <Field label="AI 코멘트 말투·길이"><textarea rows={2} className={`${INP} resize-y`} value={d.spec.tone} onChange={(e) => edit((x) => ({ ...x, spec: { ...x.spec, tone: e.target.value } }))} /></Field>
              </div>
              <div className="mt-5 space-y-3">
                {d.spec.sections.map((s, i) => (
                  <SectionEditor
                    key={s.id}
                    s={s}
                    first={i === 0}
                    last={i === d.spec.sections.length - 1}
                    onChange={(p) => setSection(s.id, p)}
                    onMove={(dir) => edit((x) => { const a = x.spec.sections; const j = i + dir; [a[i], a[j]] = [a[j], a[i]]; return x; })}
                    onRemove={() => edit((x) => ({ ...x, spec: { ...x.spec, sections: x.spec.sections.filter((y) => y.id !== s.id) } }))}
                  />
                ))}
                <button type="button" onClick={() => edit((x) => ({ ...x, spec: { ...x.spec, sections: [...x.spec.sections, { id: sectionId(), type: "media_table", title: "매체별 성과", metrics: ["cost", "conversions", "roas"], showCompare: true }] } }))} className={BTN}>
                  <i className="ti ti-plus text-[16px]" aria-hidden />섹션 추가
                </button>
              </div>
            </section>

            {/* ③ 기간·일정·받는 사람 */}
            <section className="rounded-card border border-line bg-surface p-6">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink"><Step n={3} />기간 · 일정 · 받는 사람</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="리포트 기간">
                  <select className={INP} value={d.schedule.period} onChange={(e) => edit((x) => ({ ...x, schedule: { ...x.schedule, period: e.target.value as AutoReport["schedule"]["period"] } }))}>
                    {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="비교 기준">
                  <select className={INP} value={d.schedule.compare} onChange={(e) => edit((x) => ({ ...x, schedule: { ...x.schedule, compare: e.target.value as AutoReport["schedule"]["compare"] } }))}>
                    {Object.entries(COMPARES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="보내는 주기">
                  <select className={INP} value={d.schedule.frequency} onChange={(e) => edit((x) => ({ ...x, schedule: { ...x.schedule, frequency: e.target.value as AutoReport["schedule"]["frequency"] } }))}>
                    {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {d.schedule.frequency === "weekly" && (
                  <Field label="요일">
                    <select className={INP} value={d.schedule.weekday} onChange={(e) => edit((x) => ({ ...x, schedule: { ...x.schedule, weekday: Number(e.target.value) } }))}>
                      {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}요일</option>)}
                    </select>
                  </Field>
                )}
                {d.schedule.frequency === "monthly" && (
                  <Field label="날짜">
                    <select className={INP} value={d.schedule.monthDay} onChange={(e) => edit((x) => ({ ...x, schedule: { ...x.schedule, monthDay: Number(e.target.value) } }))}>
                      {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">발송: <b className="text-ink">{scheduleText(d.schedule)}</b> · 그날 기준 {PERIODS[d.schedule.period]} 수치</p>

              <div className="mt-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                  포함할 매체(아무것도 안 고르면 연동된 전부)
                  <SelectAllLinks onAll={() => edit((x) => ({ ...x, options: { ...x.options, media: [...connected] } }))} onNone={() => edit((x) => ({ ...x, options: { ...x.options, media: [] } }))} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {connected.length ? connected.map((m) => {
                    const on = d.options.media.includes(m);
                    return (
                      <button key={m} type="button" onClick={() => edit((x) => ({ ...x, options: { ...x.options, media: on ? x.options.media.filter((y) => y !== m) : [...x.options.media, m] } }))} className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-[#1baf7a] bg-[#ECFDF3] font-semibold text-[#067647]" : "border-line bg-white text-ink-soft"}`}>
                        {on && "✓ "}{MEDIA_LABEL[m] ?? m}
                      </button>
                    );
                  }) : <span className="text-[13px] text-bad">연동된 매체가 없어요 — 광고주 관리에서 매체 연동을 먼저 해 주세요.</span>}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <Field label="받는 사람(이메일, 쉼표·줄바꿈으로 여러 명)">
                  <textarea rows={2} className={`${INP} resize-y`} value={d.recipients.join(", ")} onChange={(e) => edit((x) => ({ ...x, recipients: e.target.value.split(/[,;\n]+/).map((v) => v.trim()).filter(Boolean) }))} placeholder="client@example.com, am@nmg.co.kr" />
                </Field>
                <div className="flex flex-col justify-end gap-2 pb-1 text-[14px] text-ink-soft">
                  <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#1baf7a]" checked={d.options.attachXlsx} onChange={(e) => edit((x) => ({ ...x, options: { ...x.options, attachXlsx: e.target.checked } }))} />엑셀 첨부</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#1baf7a]" checked={d.enabled} onChange={(e) => edit((x) => ({ ...x, enabled: e.target.checked }))} />자동 발송 켜기</label>
                </div>
              </div>
            </section>

            {/* 실행 줄 */}
            <div className="sticky bottom-0 z-20 -mx-6 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-6 py-3 backdrop-blur 2xl:-mx-8 2xl:px-8">
              <button type="button" onClick={save} disabled={!!busy} className={BTN_PRIMARY}><i className={`ti ${busy === "save" ? "ti-loader-2 animate-spin" : "ti-device-floppy"} text-[16px]`} aria-hidden />저장{dirty ? " *" : ""}</button>
              <button type="button" onClick={() => run("preview")} disabled={!!busy} className={BTN}><i className={`ti ${busy === "preview" ? "ti-loader-2 animate-spin" : "ti-eye"} text-[16px]`} aria-hidden />미리보기 생성</button>
              <button type="button" onClick={() => run("test")} disabled={!!busy || !d.id || dirty} title={!d.id || dirty ? "저장한 뒤 보낼 수 있어요" : "로그인한 내 메일로 한 번 보내 보기"} className={BTN}><i className={`ti ${busy === "test" ? "ti-loader-2 animate-spin" : "ti-mail"} text-[16px]`} aria-hidden />나에게 테스트 발송</button>
              <button type="button" onClick={() => run("send")} disabled={!!busy || !d.id || dirty || !d.recipients.length} title={!d.recipients.length ? "받는 사람을 넣어 주세요" : undefined} className={BTN}><i className={`ti ${busy === "send" ? "ti-loader-2 animate-spin" : "ti-send"} text-[16px]`} aria-hidden />지금 발송</button>
              {d.id && <button type="button" onClick={remove} disabled={!!busy} className={`${BTN} ml-auto text-bad`}><i className="ti ti-trash text-[16px]" aria-hidden />삭제</button>}
              {(busy === "preview" || busy === "test" || busy === "send") && <span className="basis-full text-[13px] text-ink-muted">매체 데이터를 불러와 코멘트를 쓰는 중… (매체 수에 따라 30초~2분)</span>}
              {msg && <span className={`basis-full text-[14px] ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</span>}
            </div>

            {preview && (
              <section className="rounded-card border border-line bg-surface p-6">
                <h3 className="text-[17px] font-semibold text-ink">미리보기 — {preview.subject}</h3>
                {preview.period && <p className="mt-0.5 text-[13px] text-ink-muted">기간 {preview.period.since} ~ {preview.period.until}{preview.period.compareSince ? ` · 비교 ${preview.period.compareSince} ~ ${preview.period.compareUntil}` : ""}</p>}
                {!!preview.warnings.length && <p className="mt-2 text-[13px] text-bad">{preview.warnings.join(" / ")}</p>}
                <iframe title="리포트 미리보기" srcDoc={`<meta charset="utf-8">${preview.html}`} className="mt-4 h-[720px] w-full rounded-lg border border-line bg-white" />
              </section>
            )}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-line py-16 text-center text-[15px] text-ink-muted">왼쪽에서 리포트를 고르거나 새로 만들어 주세요.</div>
        )}
      </div>

      <RunHistory runs={runs} reports={reports} />
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ECFDF3] text-[13px] font-bold text-[#067647]">{n}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function SectionEditor({ s, first, last, onChange, onMove, onRemove }: { s: ReportSection; first: boolean; last: boolean; onChange: (p: Partial<ReportSection>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const table = s.type === "kpi" || s.type === "media_table" || s.type === "campaign_table" || s.type === "daily_table";
  const toggle = (k: MetricKey) => onChange({ metrics: s.metrics.includes(k) ? s.metrics.filter((x) => x !== k) : [...s.metrics, k] });
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${INP} w-auto`} value={s.type} onChange={(e) => onChange({ type: e.target.value as SectionType })}>
          {Object.entries(SECTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className={`${INP} min-w-[200px] flex-1`} value={s.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="섹션 제목" />
        <span className="ml-auto flex gap-1">
          <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded-md border border-line px-2 py-1 text-ink-soft disabled:opacity-30" aria-label="위로"><i className="ti ti-arrow-up" aria-hidden /></button>
          <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded-md border border-line px-2 py-1 text-ink-soft disabled:opacity-30" aria-label="아래로"><i className="ti ti-arrow-down" aria-hidden /></button>
          <button type="button" onClick={onRemove} className="rounded-md border border-line px-2 py-1 text-bad" aria-label="섹션 빼기"><i className="ti ti-x" aria-hidden /></button>
        </span>
      </div>
      <p className="mt-1 text-[12px] text-ink-muted">{SECTION_TYPES[s.type].desc}</p>
      {table && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-[13px] text-ink-muted">지표(누른 순서대로 열) <SelectAllLinks onAll={() => onChange({ metrics: [...METRIC_KEYS] })} onNone={() => onChange({ metrics: [] })} /></div>
          <div className="flex flex-wrap gap-1.5">
            {METRIC_KEYS.map((k) => {
              const on = s.metrics.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-full border px-2.5 py-0.5 text-[13px] ${on ? "border-[#1baf7a] bg-[#ECFDF3] font-semibold text-[#067647]" : "border-line bg-white text-ink-soft"}`}>
                  {on ? `${s.metrics.indexOf(k) + 1}. ` : ""}{METRICS[k].label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px] text-ink-soft">
            {s.type !== "daily_table" && <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#1baf7a]" checked={!!s.showCompare} onChange={(e) => onChange({ showCompare: e.target.checked })} />비교 기간 대비 증감</label>}
            {s.type === "campaign_table" && (
              <>
                <label className="flex items-center gap-1.5">상위<input type="number" min={1} max={50} className={`${INP} w-16`} value={s.limit ?? 10} onChange={(e) => onChange({ limit: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })} />개</label>
                <label className="flex items-center gap-1.5">정렬
                  <select className={`${INP} w-auto`} value={s.sortBy ?? "cost"} onChange={(e) => onChange({ sortBy: e.target.value as MetricKey })}>
                    {METRIC_KEYS.map((k) => <option key={k} value={k}>{METRICS[k].label} 높은 순</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>
      )}
      {(s.type === "insights" || s.type === "text") && (
        <textarea rows={s.type === "text" ? 3 : 2} className={`${INP} mt-3 resize-y`} value={s.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} placeholder={s.type === "insights" ? "무엇을 중심으로 쓸지(예: 증감이 큰 매체의 원인 후보와 다음 주 액션)" : "그대로 넣을 문구 — {광고주} {기간} 사용 가능"} />
      )}
    </div>
  );
}

function RunHistory({ runs, reports }: { runs: ReportRun[]; reports: AutoReport[] }) {
  const name = useMemo(() => new Map(reports.map((r) => [r.id, r.name])), [reports]);
  if (!runs.length) return null;
  const T = { preview: "미리보기", manual: "수동 발송", cron: "자동 발송" } as const;
  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <h3 className="text-[17px] font-semibold text-ink">발송 기록</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead><tr className="border-b border-line text-left text-[12px] text-ink-muted"><th className="py-2 pr-3 font-medium">시각</th><th className="py-2 pr-3 font-medium">리포트</th><th className="py-2 pr-3 font-medium">방식</th><th className="py-2 pr-3 font-medium">기간</th><th className="py-2 pr-3 font-medium">받는 사람</th><th className="py-2 font-medium">결과</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-[#F2F4F7] align-top">
                <td className="py-2 pr-3 tabular-nums text-ink-soft">{new Date(r.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-2 pr-3">{name.get(r.reportId) ?? "(삭제됨)"}</td>
                <td className="py-2 pr-3 text-ink-soft">{T[r.trigger]}{r.createdBy && r.trigger !== "cron" ? ` · ${r.createdBy.split("@")[0]}` : ""}</td>
                <td className="py-2 pr-3 tabular-nums text-ink-soft">{r.period ? `${r.period.since.slice(5)}~${r.period.until.slice(5)}` : "—"}</td>
                <td className="max-w-[240px] truncate py-2 pr-3 text-ink-soft" title={(r.sentTo ?? []).join(", ")}>{(r.sentTo ?? []).join(", ") || "—"}</td>
                <td className="py-2">{r.status === "error" ? <span className="text-bad" title={r.error ?? ""}>실패 — {(r.error ?? "").slice(0, 60)}</span> : <span className="text-good">보냄</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
