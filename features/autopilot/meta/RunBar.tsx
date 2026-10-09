"use client";

// 메타 빠른 세팅 — 아래 고정 실행 바(요약·점검·검증·실행)와 실행 기록
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MetaAccountCtx, Problem } from "./model";
import type { LogLine, MetaRunResult } from "./run";
import { Toggle } from "./AccountBar";

export function RunBar(p: {
  acc: MetaAccountCtx | null;
  campaignLabel: string;
  adSetCount: number;
  creativeCount: number;
  adCount: number;
  problems: Problem[];
  onJump: (target: string) => void;
  running: "validate" | "run" | null;
  turnOn: boolean;
  setTurnOn: (v: boolean) => void;
  onValidate: () => void;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  const n = p.problems.length;
  const blocked = !p.acc || n > 0 || !!p.running;
  return (
    <div className="sticky bottom-0 z-30 -mx-6 -mb-6 border-t border-[#EAECF0] bg-white/95 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)] backdrop-blur 2xl:-mx-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 2xl:px-8">
        <p className="min-w-0 text-[14px] text-ink-soft">
          <span className="font-semibold text-ink">{p.campaignLabel}</span>
          <span className="mx-2 text-ink-faint">›</span>세트 <b className="tabular-nums text-ink">{p.adSetCount}</b>
          <span className="mx-1.5 text-ink-faint">×</span>소재 <b className="tabular-nums text-ink">{p.creativeCount}</b>
          <span className="mx-1.5 text-ink-faint">=</span>광고 <b className="tabular-nums text-[#C2410C]">{p.adCount}</b>개
        </p>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            disabled={!n}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold ${n ? "bg-[#FFF4EE] text-[#C2410C] ring-1 ring-[#FAD9CB]" : "bg-[#ECFDF3] text-[#067647]"}`}
          >
            <i className={`ti ${n ? "ti-alert-triangle" : "ti-circle-check"} text-[14px]`} aria-hidden />
            {n ? `확인할 것 ${n}` : "점검 통과"}
          </button>
          {open && n > 0 && (
            <ul className="absolute bottom-full left-0 mb-2 max-h-[320px] w-[380px] overflow-y-auto rounded-xl border border-[#EAECF0] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.25)]">
              {p.problems.map((x, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      if (x.target) p.onJump(x.target);
                      setOpen(false);
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-canvas"
                  >
                    <span className="font-semibold text-ink">{x.where}</span> <span className="text-ink-muted">— {x.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Toggle on={p.turnOn} onClick={() => p.setTurnOn(!p.turnOn)} label="바로 켜기" title="끄면 캠페인·새 광고세트를 꺼 둔 채로 만들어 광고 관리자에서 확인 후 켭니다(기본). 켜면 메타 검토가 끝나는 대로 게재" />
          <button
            type="button"
            onClick={p.onValidate}
            disabled={blocked}
            title="메타에 '검증만' 요청 — 실제로 만들지 않고 캠페인·세트·소재 본문이 통과하는지 확인(이미지는 라이브러리에 올라가 실행 때 재사용)"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-3.5 py-2 text-[14px] font-semibold text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-40"
          >
            <i className={`ti ${p.running === "validate" ? "ti-loader-2 animate-spin" : "ti-shield-check"} text-[16px]`} aria-hidden />
            메타 검증
          </button>
          <button type="button" onClick={p.onRun} disabled={blocked} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#eb6834] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40">
            <i className={`ti ${p.running === "run" ? "ti-loader-2 animate-spin" : "ti-rocket"} text-[16px]`} aria-hidden />
            {p.running === "run" ? "만드는 중…" : `광고 ${p.adCount}개 만들기`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MetaRunLog({ log, result, running }: { log: LogLine[]; result: MetaRunResult | null; running: "validate" | "run" | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log]);
  if (!log.length) return null;
  const title = (result?.validateOnly ?? running === "validate") ? "메타 검증" : "실행";
  return (
    <section className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[16px] font-bold text-ink">
          {title}
          {running && " — 진행 중"}
        </h3>
        {result && (
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${result.errors.length ? "bg-[#FEF2F2] text-bad" : "bg-[#ECFDF3] text-good"}`}>
            {result.validateOnly ? `문제 ${result.errors.length}건` : `세트 ${result.adSets.length} · 소재 ${result.creatives.length} · 광고 ${result.ads.length} · 오류 ${result.errors.length}`}
          </span>
        )}
      </div>
      <div ref={ref} className="max-h-[300px] space-y-1 overflow-y-auto font-mono text-[13px]">
        {log.map((l, i) => (
          <p key={i} className={l.kind === "err" ? "text-bad" : l.kind === "ok" ? "text-ink" : "text-ink-muted"}>
            {l.kind === "ok" ? "✓" : l.kind === "err" ? "✕" : "·"} {l.text}
          </p>
        ))}
      </div>
      {result && !result.validateOnly && (
        <p className="mt-3 text-[14px] text-ink-muted">
          새 광고는 메타 검토(보통 24시간 안)를 거쳐 게재됩니다. 기록은{" "}
          <Link href="/autopilot/logs" className="font-semibold text-ink underline">
            실행 기록
          </Link>
          에서 다시 볼 수 있어요.{result.campaignId && " 화면은 방금 캠페인에 이어서 추가할 수 있게 바뀌었어요."}
        </p>
      )}
    </section>
  );
}
