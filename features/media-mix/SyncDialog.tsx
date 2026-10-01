"use client";

// 예산 동기화 확인 — ① 실제 캠페인별 새 일 예산 계획을 보여주고 ② 확인 체크 후 실행 ③ 결과(캠페인별 성공·실패)
// 실제 광고 계정의 예산이 바로 바뀌므로 계획 확인 없이 실행하지 않는다.
import { useEffect, useState } from "react";
import type { MediaSyncPlan, MediaSyncResult } from "./syncTypes";
import { Amount, won } from "./parts";

type Phase = "loading" | "review" | "applying" | "done" | "error";

export function SyncDialog({
  clientId,
  clientName,
  targets,
  context,
  onClose,
}: {
  clientId: string;
  clientName: string;
  targets: Record<string, number>; // 매체 → 일 예산
  context: Record<string, unknown>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [plans, setPlans] = useState<MediaSyncPlan[]>([]);
  const [results, setResults] = useState<MediaSyncResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [logged, setLogged] = useState(true);

  const loadPlan = async () => {
    setPhase("loading");
    setError(null);
    setAgree(false);
    try {
      const res = await fetch("/api/media-mix/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", clientId, targets }),
      });
      const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침 후 다시 시도해 주세요." }));
      if (!res.ok) throw new Error(json.error || "계획을 만들지 못했어요.");
      setPlans(json.plans);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
      setPhase("error");
    }
  };

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase !== "applying" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  const runnable = plans.filter((p) => p.supported && !p.error && p.units.length > 0);
  const unitCount = runnable.reduce((s, p) => s + p.units.length, 0);

  const apply = async () => {
    setPhase("applying");
    setError(null);
    try {
      const expected = Object.fromEntries(runnable.map((p) => [p.key, p.units.map((u) => ({ id: u.id, newDaily: u.newDaily }))]));
      const res = await fetch("/api/media-mix/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", clientId, targets: Object.fromEntries(runnable.map((p) => [p.key, targets[p.key]])), expected, context }),
      });
      const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침 후 다시 시도해 주세요." }));
      if (res.status === 409 && json.plans) {
        setPlans(json.plans);
        setAgree(false);
        setError(json.error);
        setPhase("review");
        return;
      }
      if (!res.ok) throw new Error(json.error || "동기화에 실패했어요.");
      setResults(json.results ?? []);
      setLogged(json.logged !== false);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
      setPhase("review");
    }
  };

  const okCount = results.reduce((s, r) => s + r.results.filter((x) => x.ok).length, 0);
  const failCount = results.reduce((s, r) => s + r.results.filter((x) => !x.ok).length + (r.error ? 1 : 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-surface shadow-[0_20px_60px_rgba(21,24,30,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 id="sync-title" className="text-[16px] font-semibold text-ink">
              예산 동기화 {phase === "done" ? "결과" : "확인"}
            </h3>
            <p className="mt-0.5 text-[13px] text-ink-muted">{clientName} · 매체 안의 캠페인 일 예산을 같은 비율로 조정해요</p>
          </div>
          <button type="button" onClick={onClose} disabled={phase === "applying"} className="rounded-lg p-1 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-40" aria-label="닫기">
            <i className="ti ti-x text-[17px]" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === "loading" && <p className="py-10 text-center text-[15px] text-ink-muted">매체에서 캠페인 예산을 불러오는 중…</p>}
          {phase === "error" && (
            <div className="py-6 text-center">
              <p className="text-[15px] text-bad">{error}</p>
              <button type="button" onClick={loadPlan} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-soft hover:border-ink/30">
                다시 시도
              </button>
            </div>
          )}

          {(phase === "review" || phase === "applying") && (
            <div className="space-y-4">
              {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</p>}
              {plans.map((p) => (
                <section key={p.key} className="rounded-lg border border-line">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/60 px-3.5 py-2.5">
                    <p className="text-[15px] font-semibold text-ink">{p.label}</p>
                    <p className="font-mono text-[13px] tabular-nums text-ink-soft">일 예산 목표 <Amount text={won(p.targetDaily)} /></p>
                  </header>
                  <div className="px-3.5 py-2.5">
                    {p.error ? (
                      <p className="text-[13px] text-bad">{p.error}</p>
                    ) : !p.supported ? (
                      <p className="flex items-start gap-1.5 text-[13px] text-ink-muted">
                        <i className="ti ti-hand-finger mt-[1px] text-[15px]" aria-hidden />
                        {p.note}
                      </p>
                    ) : p.units.length === 0 ? (
                      <p className="text-[13px] text-ink-muted">일 예산을 가진 활성 캠페인이 없어 바꿀 항목이 없어요.</p>
                    ) : (
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="text-left text-[13px] text-ink-muted">
                            <th className="py-1 font-medium">{p.key === "meta" ? "캠페인 / 광고세트" : "캠페인"}</th>
                            <th className="py-1 text-right font-medium">현재 일 예산</th>
                            <th className="py-1 text-right font-medium">변경 후</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.units.map((u) => (
                            <tr key={u.id} className="border-t border-line/60">
                              <td className="max-w-[260px] truncate py-1.5 pr-2 text-ink-soft" title={u.name}>
                                {u.level === "adset" && <span className="mr-1 rounded bg-canvas px-1 text-[12px] text-ink-muted">세트</span>}
                                {u.name}
                              </td>
                              <td className="py-1.5 text-right tabular-nums tabular-nums text-ink-muted"><Amount text={won(u.currentDaily)} /></td>
                              <td className={`py-1.5 text-right tabular-nums font-semibold tabular-nums ${u.newDaily > u.currentDaily ? "text-good" : "text-ink"}`}><Amount text={won(u.newDaily)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {p.skipped.length > 0 && <p className="mt-2 text-[13px] text-ink-muted">그대로 두는 항목 {p.skipped.length}개 — {[...new Set(p.skipped.map((s) => s.reason))].join(", ")}</p>}
                    {p.note && p.supported && <p className="mt-1 text-[13px] text-ink-muted">{p.note}</p>}
                  </div>
                </section>
              ))}
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-3">
              <p className={`rounded-lg px-3.5 py-2.5 text-[15px] ${failCount ? "border border-warn/25 bg-warn/5 text-warn" : "border border-good/20 bg-good/5 text-good"}`}>
                <i className={`ti ${failCount ? "ti-alert-triangle" : "ti-circle-check"} mr-1`} aria-hidden />
                {okCount}개 반영 완료{failCount ? ` · ${failCount}개 실패` : ""}
                {!logged && <span className="ml-1 text-ink-muted">(실행 기록 테이블이 없어 이력은 남지 않았어요 — 0018 마이그레이션 필요)</span>}
              </p>
              {results.map((r) => (
                <section key={r.key} className="rounded-lg border border-line px-3.5 py-2.5">
                  <p className="mb-1.5 text-[15px] font-semibold text-ink">{r.label}</p>
                  {r.error && <p className="text-[13px] text-bad">{r.error}</p>}
                  <ul className="space-y-1 text-[13px]">
                    {r.results.map((x) => (
                      <li key={x.id} className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 items-start gap-1.5 text-ink-soft">
                          <i className={`ti mt-[1px] ${x.ok ? "ti-check text-good" : "ti-x text-bad"}`} aria-hidden />
                          <span className="truncate" title={x.name}>
                            {x.name}
                            {x.error && <span className="block text-[13px] text-bad">{x.error}</span>}
                          </span>
                        </span>
                        <span className="flex-shrink-0 font-mono tabular-nums text-ink-muted">
                          <Amount text={won(x.before)} /> → <b className="text-ink"><Amount text={won(x.after)} /></b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-[13px] text-ink-muted">되돌리려면 위의 변경 전 금액으로 다시 맞춰 주세요. 매체 반영까지 몇 분 걸릴 수 있어요.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          {phase === "review" || phase === "applying" ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={!unitCount || phase === "applying"} className="h-4 w-4 accent-[#15181E]" />
                실제 광고 계정의 일 예산 {unitCount}건이 즉시 바뀌는 것을 확인했어요
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={phase === "applying"} className="rounded-lg border border-line px-3.5 py-2 text-[15px] text-ink-soft hover:border-ink/30 disabled:opacity-40">
                  취소
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!agree || !unitCount || phase === "applying"}
                  className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-white transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className={`ti ${phase === "applying" ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
                  {phase === "applying" ? "반영 중…" : `${unitCount}건 예산 변경`}
                </button>
              </div>
            </>
          ) : (
            <div className="ml-auto">
              <button type="button" onClick={onClose} className="rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-white hover:bg-ink-soft">
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
