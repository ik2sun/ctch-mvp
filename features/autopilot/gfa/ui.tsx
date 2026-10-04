"use client";

// 캠페인 오토파일럿 · GFA 화면 공용 조각
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Card } from "@/features/dashboard/ui";
import type { LogLine, RunResult } from "./runner";

export const INPUT = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] text-ink outline-none focus:border-[#eb6834]";
export const CELL = "rounded-lg border border-line bg-surface px-3 text-ink outline-none focus:border-[#eb6834]";
export const CHIP = "whitespace-nowrap rounded-full border border-line px-3 py-1 text-[13px] text-ink-soft hover:bg-canvas";
export const CHIP_ON = "border-[#eb6834] bg-[#FDF1EC] text-ink";
export const PRIMARY = "rounded-lg bg-[#eb6834] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40";
export const SECONDARY = "rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink-soft hover:bg-canvas disabled:opacity-50";
export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}</p>
      {children}
    </div>
  );
}

export function RunLog({ title, log, result, running }: { title: string; log: LogLine[]; result: RunResult | null; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log]);
  if (!log.length) return null;
  return (
    <Card
      title={running ? `${title} — 진행 중` : title}
      right={
        result && (
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${result.errors.length ? "bg-[#FEF2F2] text-bad" : "bg-[#ECFDF3] text-good"}`}>
            광고그룹 {result.adSets.length} · 소재 {result.creatives.length} · 오류 {result.errors.length}
          </span>
        )
      }
    >
      <div ref={ref} className="max-h-[320px] space-y-1 overflow-y-auto font-mono text-[13px]">
        {log.map((l, i) => (
          <p key={i} className={l.kind === "err" ? "text-bad" : l.kind === "ok" ? "text-ink" : "text-ink-muted"}>
            {l.kind === "ok" ? "✓" : l.kind === "err" ? "✕" : "·"} {l.text}
          </p>
        ))}
      </div>
      {result && (
        <p className="mt-4 text-[14px] text-ink-muted">
          새 소재는 GFA 검수(보통 수 시간)를 거쳐 게재됩니다. 기록은{" "}
          <Link href="/autopilot/logs" className="font-semibold text-ink underline">
            실행 기록
          </Link>
          에서 다시 볼 수 있어요.
        </p>
      )}
    </Card>
  );
}
