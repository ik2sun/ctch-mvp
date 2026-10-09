"use client";

// 캠페인 오토파일럿 — 하위 메뉴 골격. 기능이 붙기 전까지 화면별 설계(흐름·연결 엔진·준비 상태)를 보여준다
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/layout/nav";
import { useClients } from "@/features/clients/ClientContext";
import { Card } from "@/features/dashboard/ui";

// 2026-10-04 결정: 첫 매체 GFA, 실행은 승인 후 실행(완성도가 확인되면 완전 자동으로 전환). 2026-10-09 메타 추가
export type AutopilotMediaKey = "gfa" | "meta";
export const AUTOPILOT_MEDIAS: Record<AutopilotMediaKey, { key: AutopilotMediaKey; label: string; full: string }> = {
  gfa: { key: "gfa", label: "GFA", full: "네이버 성과형 디스플레이" },
  meta: { key: "meta", label: "메타", full: "메타(페이스북·인스타그램) 광고" },
};
export const AUTOPILOT_MEDIA = AUTOPILOT_MEDIAS.gfa;
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
      <p className="rounded-lg bg-canvas px-4 py-3 text-[14px] text-ink-muted">이 화면은 아직 설계만 있어 실행 버튼이 없습니다. 지금 쓸 수 있는 기능은 <b className="text-ink">자동 대량 세팅</b>(수동 세팅·엑셀 벌크 업로드)과 <b className="text-ink">실행 기록</b>입니다.</p>

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

// 오토파일럿 화면 공통 머리 — 이동 경로 + 파스텔 안내 배너(설명·매체·실행 방식·현재 광고주)
export function AutopilotHeader({ intro, status, media = "gfa" }: { intro: string; status?: string; media?: AutopilotMediaKey | "all" }) {
  const m = media === "all" ? { label: "GFA · 메타", full: "GFA · 메타" } : AUTOPILOT_MEDIAS[media];
  const { selected } = useClients();
  const pathname = usePathname();
  const group = NAV.find((n) => n.children?.some((c) => c.href === pathname));
  const page = group?.children?.find((c) => c.href === pathname);
  return (
    <div className="space-y-4">
      <nav aria-label="이동 경로" className="flex items-center gap-1.5 text-[14px] text-ink-muted">
        <i className="ti ti-rocket text-[15px] text-[#eb6834]" aria-hidden />
        <span>{group?.label ?? "캠페인 오토파일럿"}</span>
        {page && (
          <>
            <i className="ti ti-chevron-right text-[13px] text-ink-faint" aria-hidden />
            <span className="font-semibold text-ink">{page.label}</span>
          </>
        )}
        {status && <span className="ml-1 whitespace-nowrap rounded-full bg-[#FDEEE8] px-2.5 py-0.5 text-[13px] font-semibold text-[#C2410C]">{status}</span>}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-[#FAD9CB] bg-gradient-to-r from-[#FFF4EE] to-[#FDF7F4] px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#eb6834] shadow-[0_1px_3px_rgba(235,104,52,0.25)]">
          <i className="ti ti-sparkles text-[20px]" aria-hidden />
        </span>
        <p className="min-w-[240px] flex-1 text-[15px] leading-relaxed text-ink-soft">{intro}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[13px] text-ink-soft ring-1 ring-[#FAD9CB]" title={m.full}>
            매체 · <b className="font-semibold text-ink">{m.label}</b>
          </span>
          <span
            className="cursor-help whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[13px] text-ink-soft ring-1 ring-[#FAD9CB]"
            title="화면·엑셀에서 만든 세팅안은 화면에만 있고, 담당자가 실행 버튼 → 확인을 눌러야 매체에 반영됩니다. 완전 자동(버튼 없이 주기 실행)은 결과가 검증되면 운영 규칙에서 조치별로 켤 예정입니다."
          >
            실행 · <b className="font-semibold text-ink">{AUTOPILOT_MODE}</b> ⓘ
          </span>
          {selected && (
            <span className="whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[13px] text-ink-soft ring-1 ring-[#FAD9CB]">
              광고주 · <b className="font-semibold text-ink">{selected.name}</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
