"use client";

// AI 매니저 자료실 — 상품소개서·기능 안내를 올리면 AI가 전체를 읽어 정리하고, 대화에서 근거로 검색해 쓴다.
// 범위: 이 광고주 전용 / 모든 광고주 공용(매체 상품소개서 등). 원본은 비공개 버킷 pm-docs에 보관
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/features/dashboard/ui";
import { createClient } from "@/lib/supabase/client";
import { extractForLibrary, extractGoogle } from "@/features/auto-report/extract";
import type { DocMeta } from "./docs";

const BTN = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const KIND_LABEL: Record<string, string> = { pdf: "PDF", pptx: "PPT", docx: "워드", xlsx: "엑셀", google: "구글", text: "텍스트" };

type Job = { name: string; state: "wait" | "work" | "done" | "error"; note?: string };

export function DocsCard({ clientId, clientName, onAsk }: { clientId: string; clientName: string; onAsk: (q: string) => void }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [scope, setScope] = useState<"client" | "global">("client");
  const [gUrl, setGUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const busy = jobs.some((j) => j.state === "wait" || j.state === "work");

  const load = useCallback(async () => {
    const res = await fetch(`/api/perf-manager/docs?clientId=${clientId}`);
    const j = await res.json().catch(() => ({}));
    setDocs(j.docs ?? []);
    setSetupError(j.setupError ?? null);
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  const setJob = (i: number, p: Partial<Job>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...p } : j)));

  async function ingest(body: Record<string, unknown>) {
    const res = await fetch("/api/perf-manager/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, scope, action: "ingest", ...body }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "학습 실패");
    return j.doc as DocMeta;
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    const start = jobs.length;
    setJobs((js) => [...js, ...files.map((f) => ({ name: f.name, state: "wait" as const }))]);
    for (const [k, f] of files.entries()) {
      const i = start + k;
      setJob(i, { state: "work", note: "읽는 중" });
      try {
        if (f.size > 50 * 1024 * 1024) throw new Error("50MB를 넘어요");
        const ex = await extractForLibrary(f);
        // 원본 보관(PDF는 서버가 이 원본을 Claude에게 보냄)
        setJob(i, { note: "원본 올리는 중" });
        const ext = f.name.split(".").pop() ?? "bin";
        const up = await fetch("/api/perf-manager/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, action: "uploadUrl", ext }) }).then((r) => r.json());
        if (!up.path) throw new Error(up.error || "업로드 주소를 받지 못했어요");
        const { error } = await createClient().storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, f, { contentType: f.type || undefined });
        if (error) throw new Error(`원본 업로드 실패 — ${error.message}`);
        setJob(i, { note: "AI가 전체를 읽고 정리하는 중(1~3분)" });
        const doc = await ingest({ fileName: f.name, kind: ex.kind, text: ex.text || undefined, filePath: up.path });
        setJob(i, { state: "done", note: `${doc.title} — 핵심 ${doc.keyPoints.length}개` });
        await load();
      } catch (e) {
        setJob(i, { state: "error", note: (e as Error).message });
      }
    }
  }

  async function fromGoogle() {
    const url = gUrl.trim();
    if (!url) return;
    const i = jobs.length;
    setJobs((js) => [...js, { name: url, state: "work", note: "구글 문서 불러오는 중" }]);
    try {
      const ex = await extractGoogle(url, 500_000);
      setJob(i, { name: ex.name, note: "AI가 전체를 읽고 정리하는 중(1~3분)" });
      const doc = await ingest({ fileName: ex.name, kind: "google", text: ex.text });
      setJob(i, { state: "done", note: `${doc.title} — 핵심 ${doc.keyPoints.length}개` });
      setGUrl("");
      await load();
    } catch (e) {
      setJob(i, { state: "error", note: (e as Error).message });
    }
  }

  async function remove(d: DocMeta) {
    if (!window.confirm(`'${d.title}'을(를) 자료실에서 지울까요?${d.clientId ? "" : " 공용 문서라 모든 광고주의 AI 매니저에서 빠져요."}`)) return;
    const res = await fetch(`/api/perf-manager/docs?clientId=${clientId}&id=${d.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  const mine = docs.filter((d) => d.clientId);
  const shared = docs.filter((d) => !d.clientId);

  return (
    <Card title="자료실 — 상품소개서·기능 문서 학습" sub={`올린 문서를 AI가 전체 읽고 정리해, 대화에서 근거로 찾아 써요 · ${clientName} 전용 ${mine.length}개 · 공용 ${shared.length}개`}>
      {setupError && <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[14px] text-bad">{setupError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-[13px]">
          {([
            ["client", `${clientName} 전용`],
            ["global", "모든 광고주 공용"],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-2.5 py-1 ${scope === k ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-ink-muted">{scope === "global" ? "매체 상품소개서·신기능 안내처럼 모든 광고주에 해당하는 문서" : "이 광고주의 상품소개서·브랜드 가이드·제안서"}</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr]">
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line px-4 py-5 text-center hover:bg-canvas ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <i className="ti ti-file-upload text-[22px] text-signal" aria-hidden />
          <span className="text-[14px] font-semibold text-ink">파일 올리기(여러 개 가능)</span>
          <span className="text-[12px] text-ink-muted">PDF·PPT(pptx)·워드(docx)·엑셀·텍스트, 50MB까지</span>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.pptx,.docx,.xlsx,.xlsm,.xls,.csv,.txt,.md"
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              e.target.value = "";
              uploadFiles(fs);
            }}
          />
        </label>
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-line px-4 py-3">
          <span className="text-[14px] font-semibold text-ink">구글 문서·시트·슬라이드 주소</span>
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[14px] outline-none focus:border-signal/60" value={gUrl} onChange={(e) => setGUrl(e.target.value)} placeholder="https://docs.google.com/…" />
            <button type="button" onClick={fromGoogle} disabled={busy || !gUrl.trim()} className={`${BTN} border border-signal/40 bg-surface text-signal hover:bg-signal-soft`}>
              학습
            </button>
          </div>
        </div>
      </div>
      {!!jobs.length && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {jobs.map((j, i) => (
            <li key={i} className={j.state === "error" ? "text-bad" : j.state === "done" ? "text-good" : "text-ink-soft"}>
              <i className={`ti ${j.state === "work" ? "ti-loader-2 animate-spin" : j.state === "done" ? "ti-circle-check" : j.state === "error" ? "ti-alert-circle" : "ti-clock"} mr-1`} aria-hidden />
              {j.name} — {j.note ?? "대기"}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        {!docs.length && !setupError && <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-[13px] text-ink-muted">아직 올린 문서가 없어요. 최신 상품소개서·기능 안내를 올리면 AI 매니저가 답할 때 근거로 써요.</p>}
        {docs.map((d) => (
          <div key={d.id} className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-start gap-2">
              <span className={`mt-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${d.clientId ? "bg-signal-soft text-signal" : "bg-[#ECFDF3] text-[#067647]"}`}>{d.clientId ? "이 광고주" : "공용"}</span>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="text-left text-[15px] font-semibold text-ink hover:underline">
                  {d.title}
                </button>
                <p className="text-[12px] text-ink-muted">
                  {[d.docType, d.publisher, d.effectiveDate && `기준 ${d.effectiveDate}`, KIND_LABEL[d.kind] ?? d.kind, d.uploadedBy?.split("@")[0], d.createdAt.slice(0, 10)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button type="button" onClick={() => onAsk(`자료실의 '${d.title}' 기준으로 핵심 상품·기능과 ${d.clientId ? "우리 캠페인에 적용할 점" : "우리 광고주들에게 쓸 만한 점"}을 정리해 줘`)} className={`${BTN} border border-signal/40 bg-surface text-signal hover:bg-signal-soft`}>
                AI에게 묻기
              </button>
              <button type="button" onClick={() => remove(d)} className={`${BTN} border border-line bg-surface text-ink-soft hover:text-bad`} aria-label="삭제">
                <i className="ti ti-trash" aria-hidden />
              </button>
            </div>
            {d.summary && <p className={`mt-1.5 text-[13px] leading-relaxed text-ink-soft ${open === d.id ? "" : "line-clamp-2"}`}>{d.summary}</p>}
            {open === d.id && !!d.keyPoints.length && (
              <ul className="mt-2 space-y-0.5 text-[13px] text-ink">
                {d.keyPoints.map((k, i) => (
                  <li key={i}>· {k}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
