"use client";

// 캠페인 오토파일럿 — 하위 메뉴 골격. 기능이 붙기 전까지 화면별 설계(흐름·연결 엔진·준비 상태)를 보여준다
import Link from "next/link";
import { useClients } from "@/features/clients/ClientContext";
import { Card } from "@/features/dashboard/ui";

// 2026-10-04 결정: 첫 매체 GFA, 실행은 승인 후 실행(완성도가 확인되면 완전 자동으로 전환)
export const AUTOPILOT_MEDIA = { key: "gfa", label: "GFA", full: "네이버 성과형 디스플레이" } as const;
export const AUTOPILOT_MODE = "승인 후 실행";

export type PlanStep = { title: string; detail: string };
export type PlanLink = { label: string; href: string; note: string };

export function PlannedSection({
  intro,
  steps,
  reuse = [],
  open = [],
}: {
  intro: string;
  steps: PlanStep[];
  reuse?: PlanLink[];   // 이미 있는 기능 중 이 화면이 엔진으로 쓸 것
  open?: string[];      // 정해야 할 것·확인 필요
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <AutopilotHeader intro={intro} status="준비 중" />
      <p className="rounded-lg bg-canvas px-4 py-3 text-[14px] text-ink-muted">이 화면은 아직 설계만 있어 실행 버튼이 없습니다. 지금 쓸 수 있는 기능은 <b className="text-ink">자동 세팅</b>(엑셀 벌크 업로드·AI 자동 세팅)과 <b className="text-ink">실행 기록</b>입니다.</p>

      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <Card title="흐름" sub="이 화면에서 하게 될 일">
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal-soft text-[14px] font-semibold text-ink">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-[15px] leading-relaxed text-ink-muted">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          {reuse.length > 0 && (
            <Card title="이어 쓰는 기존 기능">
              <ul className="space-y-3">
                {reuse.map((r) => (
                  <li key={r.label}>
                    <Link href={r.href} className="text-[15px] font-semibold text-ink underline-offset-2 hover:underline">
                      {r.label} ›
                    </Link>
                    <p className="mt-0.5 text-[14px] text-ink-muted">{r.note}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {open.length > 0 && (
            <Card title="정해야 할 것">
              <ul className="list-disc space-y-2 pl-5 text-[15px] text-ink-muted">
                {open.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// 오토파일럿 화면 공통 머리 — 상태·설명·매체·실행 방식·현재 광고주
export function AutopilotHeader({ intro, status }: { intro: string; status?: string }) {
  const { selected } = useClients();
  return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-6 py-4">
        {status && <span className="whitespace-nowrap rounded-full bg-[#FDEEE8] px-2.5 py-0.5 text-[13px] font-semibold text-[#C2410C]">{status}</span>}
        <p className="min-w-0 flex-1 text-[15px] text-ink-soft">{intro}</p>
        <span className="whitespace-nowrap rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[13px] text-ink-soft" title={AUTOPILOT_MEDIA.full}>
          매체 · <b className="font-semibold text-ink">{AUTOPILOT_MEDIA.label}</b>
        </span>
        <span
          className="cursor-help whitespace-nowrap rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[13px] text-ink-soft"
          title="AI·엑셀이 만든 세팅안은 화면에만 있고, 담당자가 실행 버튼 → 확인을 눌러야 GFA에 반영됩니다(관리자만). 완전 자동(버튼 없이 주기 실행)은 결과가 검증되면 운영 규칙에서 조치별로 켤 예정입니다."
        >
          실행 · <b className="font-semibold text-ink">{AUTOPILOT_MODE}</b> ⓘ
        </span>
        {selected && <span className="whitespace-nowrap text-[14px] text-ink-muted">현재 광고주 · {selected.name}</span>}
      </div>
  );
}
