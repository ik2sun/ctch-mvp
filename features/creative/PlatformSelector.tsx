"use client";

import { PLATFORMS, type PlatformId } from "./platforms";

// AI 플랫폼 선택 — 라디오 카드. 선택 시 ring-2 ring-signal + bg-signal-soft.
export function PlatformSelector({
  value,
  onChange,
  compact,
}: {
  value: PlatformId;
  onChange: (id: PlatformId) => void;
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" className={`grid gap-3 ${compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
      {PLATFORMS.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.id)}
            className={`group relative flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-200 ${
              on
                ? "border-transparent bg-signal-soft ring-2 ring-signal shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  on ? p.tone.on : `${p.tone.idle} group-hover:brightness-95`
                }`}
              >
                <i className={`ti ti-${p.icon} text-[18px]`} aria-hidden />
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  on ? "border-signal bg-signal" : "border-gray-300 bg-white"
                }`}
                aria-hidden
              >
                {on && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
            </div>
            <p className={`mt-3 text-[15px] font-semibold ${on ? "text-signal-strong" : "text-gray-900"}`}>{p.name}</p>
            <p className={`mt-0.5 text-[13px] ${on ? "text-signal" : "text-gray-500"}`}>{p.tagline}</p>
            {!compact && (
              <span
                className={`whitespace-nowrap mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                  p.mode === "api" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                <i className={`ti ${p.mode === "api" ? "ti-plug-connected" : "ti-upload"}`} aria-hidden />
                {p.mode === "api" ? "API 연동" : "클립 업로드"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
