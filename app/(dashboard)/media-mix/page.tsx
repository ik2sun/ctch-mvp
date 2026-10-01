"use client";

// 미디어믹스 최적화(Budget Allocator) — 매체 API 학습 데이터 → 반응 곡선 → 목표별 최적 예산 배분 → 예산 동기화
import { useMemo, useState } from "react";
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { Segmented } from "@/features/dashboard/ui";
import { MediaMixView } from "@/features/media-mix/MediaMixView";
import { MIX_MEDIA, useMediaHistory } from "@/features/media-mix/useMediaHistory";
import { buildModel, type MediaModel } from "@/features/media-mix/model";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const LOOKBACK = [
  { key: "30", label: "30일", days: 30 },
  { key: "60", label: "60일", days: 60 },
  { key: "90", label: "90일", days: 90 },
];

export default function MediaMixPage() {
  const { selected } = useClients();
  const [lookback, setLookback] = useState("30");
  const days = LOOKBACK.find((l) => l.key === lookback)?.days ?? 30;
  const since = daysAgo(days);
  const until = daysAgo(1);

  const { inputs, state, loading, reload, statusReady } = useMediaHistory(selected?.id, since, until);
  const models = useMemo(() => inputs.map(buildModel).filter((m): m is MediaModel => m != null), [inputs]);

  const rows = MIX_MEDIA.map((m) => {
    const st = state[m.key];
    const noSpend = st?.status === "ok" && !models.some((x) => x.key === m.key);
    return { ...m, st, noSpend };
  });
  const problems = rows.filter((r) => r.st && (r.st.status === "error" || r.st.status === "loading" || r.noSpend));

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-muted">AI Budget Allocator</p>
          <h2 className="mt-0.5 text-[22px] font-semibold tracking-tight text-ink">{selected ? `${selected.name} 미디어믹스 최적화` : "광고주를 선택해 주세요"}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">총예산과 목표를 넣으면 매체별 효율 한계를 반영해 예산 배분과 예상 성과를 제안해요</p>
        </div>
      </div>

      {!selected ? (
        <div className="rounded-card border border-line bg-surface py-16 text-center text-[15px] text-ink-muted">광고주를 선택하면 연동된 매체 데이터로 계산해요.</div>
      ) : (
        <MediaMixView
          models={models}
          clientId={selected.id}
          clientName={selected.name}
          dataControls={
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink-soft">학습 기간</p>
              <div className="flex items-center gap-2">
                <Segmented value={lookback} options={LOOKBACK.map((l) => ({ key: l.key, label: l.label }))} onChange={setLookback} />
                <button
                  type="button"
                  onClick={reload}
                  disabled={loading}
                  title="매체 데이터 새로 불러오기"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-line text-ink-soft hover:border-ink/30 hover:text-ink disabled:opacity-50"
                >
                  <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
                  <span className="sr-only">새로고침</span>
                </button>
              </div>
              <p className="font-mono text-[13px] tabular-nums text-ink-muted">
                {since} ~ {until}
              </p>
              <ul className="space-y-1 pt-1">
                {rows.map((r) => (
                  <li key={r.key} className="flex items-start gap-1.5 text-[13px]">
                    <i
                      className={`ti mt-[1px] text-[13px] ${
                        r.st?.status === "ok" && !r.noSpend
                          ? "ti-circle-check text-good"
                          : r.st?.status === "loading" || !statusReady
                            ? "ti-loader-2 animate-spin text-ink-muted"
                            : r.st?.status === "error"
                              ? "ti-alert-circle text-bad"
                              : "ti-circle-dashed text-ink-faint"
                      }`}
                      aria-hidden
                    />
                    <span className="w-16 flex-shrink-0 text-ink-soft">{r.label}</span>
                    <span className="min-w-0 text-ink-muted">
                      {!statusReady
                        ? "연동 확인 중…"
                        : r.st?.status === "ok"
                          ? r.noSpend
                            ? "학습 기간 광고비 없음 — 제외"
                            : "학습 완료"
                          : r.st?.status === "loading"
                            ? r.st.note ?? "불러오는 중…"
                            : r.st?.note ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-[13px] text-ink-faint">구글 Ads는 조회 API 준비 중이라 제외돼요</p>
            </div>
          }
          notes={
            problems.some((p) => p.st?.status === "error") ? (
              <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">
                <i className="ti ti-plug-connected-x text-[15px]" aria-hidden />
                {problems
                  .filter((p) => p.st?.status === "error")
                  .map((p) => `${p.label}: ${p.st?.note}`)
                  .join(" · ")}{" "}
                — 이 매체는 빼고 계산했어요.
                <Link href="/clients" className="underline underline-offset-2">
                  광고주 관리
                </Link>
              </p>
            ) : loading && models.length ? (
              <p className="text-[13px] text-ink-muted">일부 매체를 아직 불러오는 중이에요 — 다 오면 다시 계산돼요.</p>
            ) : null
          }
        />
      )}
    </div>
  );
}
