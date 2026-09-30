"use client";

import { useEffect, useState } from "react";
import { normalizeDomain } from "./analyze";
import { saveSettings } from "./geoData";
import {
  API_ENGINES,
  INTERVAL_OPTIONS,
  MEASURE_MODES,
  todayKst,
  type ApiEngine,
  type GeoSettings,
  type IntervalDays,
  type MeasureMode,
} from "./types";
import { EngineName, ErrorBox, Section } from "./ui";

export type EngineStatus = { engine: ApiEngine; ready: boolean; env: string; model: string };

const splitList = (v: string) =>
  v
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function SettingsPanel({
  clientId,
  settings,
  engineStatus,
  onSaved,
}: {
  clientId: string;
  settings: GeoSettings | null;
  engineStatus: EngineStatus[];
  onSaved: () => void;
}) {
  const [domains, setDomains] = useState("");
  const [brands, setBrands] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [engines, setEngines] = useState<ApiEngine[]>([...API_ENGINES]);
  const [mode, setMode] = useState<MeasureMode>("manual");
  const [intervalDays, setIntervalDays] = useState<IntervalDays>(7);
  const [autoStart, setAutoStart] = useState("");
  const [autoEnd, setAutoEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setDomains((settings?.own_domains ?? []).join(", "));
    setBrands((settings?.brand_terms ?? []).join(", "));
    setCompetitors((settings?.competitors ?? []).join(", "));
    setEngines(settings?.engines?.length ? settings.engines : [...API_ENGINES]);
    // 0017 전 행은 measure_mode가 없으니 auto_weekly로 대신 판단
    setMode(settings?.measure_mode ?? (settings?.auto_weekly ? "auto" : "manual"));
    setIntervalDays(settings?.interval_days ?? 7);
    setAutoStart(settings?.auto_start ?? "");
    setAutoEnd(settings?.auto_end ?? "");
    setMsg(null);
  }, [settings, clientId]);

  async function save() {
    const own = [...new Set(splitList(domains).map(normalizeDomain).filter(Boolean))];
    if (own.length === 0) return setMsg({ ok: false, text: "자사 도메인을 하나 이상 입력해 주세요." });
    if (engines.length === 0) return setMsg({ ok: false, text: "측정할 엔진을 하나 이상 골라 주세요." });
    if (mode === "auto" && autoStart && autoEnd && autoEnd < autoStart) return setMsg({ ok: false, text: "종료일이 시작일보다 빨라요." });
    setSaving(true);
    const err = await saveSettings({
      client_id: clientId,
      own_domains: own,
      brand_terms: splitList(brands),
      competitors: splitList(competitors),
      engines,
      measure_mode: mode,
      interval_days: intervalDays,
      auto_start: autoStart || null,
      auto_end: autoEnd || null,
    });
    setSaving(false);
    const text = !err
      ? "저장했어요."
      : /measure_mode|interval_days|auto_start|auto_end/.test(err)
        ? "측정 방식 컬럼이 없어요. 0017_geo_measure_schedule.sql을 SQL Editor에서 실행해 주세요."
        : err.includes("geo_settings")
          ? "geo_settings 테이블이 없어요. 0016_geo_citations.sql을 SQL Editor에서 실행해 주세요."
          : err;
    setMsg({ ok: !err, text });
    if (!err) onSaved();
  }

  const today = todayKst();
  const autoSummary =
    mode !== "auto"
      ? null
      : autoEnd && autoEnd < today
        ? "종료일이 지나 자동 측정이 멈춰 있어요."
        : `${autoStart && autoStart > today ? `${autoStart}부터` : "지금부터"} ${autoEnd ? `${autoEnd}까지` : "종료일 없이"} ${INTERVAL_OPTIONS.find((o) => o.days === intervalDays)?.label} 측정해요.`;

  return (
    <Section title="추적 설정" desc="자사 도메인이 인용되면 '자사 인용', 브랜드 표기가 답변에 나오면 '언급'으로 판정해요">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-ink-soft">자사 도메인 (쉼표 구분)</span>
          <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="brand.com, brandmall.co.kr" className="field h-9 w-full text-[13px]" />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-ink-soft">브랜드 표기 — 언급 판정용 (한글·영문·대표 제품명)</span>
          <input value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="에스트라, AESTURA, 아토베리어" className="field h-9 w-full text-[13px]" />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-[12px] font-medium text-ink-soft">경쟁사 — 동시 호명 집계용 (한 브랜드의 다른 표기는 / 로 묶기)</span>
          <input value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="라로슈포제/La Roche-Posay, 일리윤, 토리든" className="field h-9 w-full text-[13px]" />
        </label>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {engineStatus.map((s) => {
          const on = engines.includes(s.engine);
          return (
            <label key={s.engine} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${on ? "border-signal/40 bg-signal/5" : "border-line bg-canvas"}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => setEngines((prev) => (on ? prev.filter((e) => e !== s.engine) : [...prev, s.engine]))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <EngineName engine={s.engine} className="text-[13px] font-medium text-ink" />
                <span className="block font-mono text-[10px] text-ink-muted">{s.model}</span>
                <span className={`mt-0.5 block text-[11px] ${s.ready ? "text-good" : "text-warn"}`}>
                  <i className={`ti ${s.ready ? "ti-circle-check" : "ti-alert-triangle"} mr-0.5`} aria-hidden />
                  {s.ready ? "키 설정됨" : `${s.env} 미설정 — 측정 시 건너뜀`}
                </span>
              </span>
            </label>
          );
        })}
        {engineStatus.length === 0 && <p className="text-[12px] text-ink-muted">엔진 상태를 불러오는 중…</p>}
      </div>

      {/* 측정 방식 */}
      <div className="mt-5">
        <p className="mb-1.5 text-[12px] font-medium text-ink-soft">측정 방식</p>
        <div className="grid gap-2 md:grid-cols-3" role="radiogroup">
          {MEASURE_MODES.map((m) => {
            const on = mode === m.id;
            return (
              <label key={m.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${on ? "border-signal/40 bg-signal/5" : "border-line bg-canvas"}`}>
                <input type="radio" name="measure_mode" checked={on} onChange={() => setMode(m.id)} className="mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium text-ink">{m.label}</span>
                  <span className="block text-[11px] text-ink-muted">{m.desc}</span>
                </span>
              </label>
            );
          })}
        </div>

        {mode === "auto" && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-canvas p-3">
            <label className="space-y-1">
              <span className="block text-[11px] text-ink-muted">주기</span>
              <select value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value) as IntervalDays)} className="field h-9 text-[13px]">
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] text-ink-muted">시작일 (비우면 바로)</span>
              <input type="date" value={autoStart} onChange={(e) => setAutoStart(e.target.value)} className="field h-9 text-[13px]" />
            </label>
            <span className="pb-2 text-ink-muted">~</span>
            <label className="space-y-1">
              <span className="block text-[11px] text-ink-muted">종료일 (비우면 계속)</span>
              <input type="date" value={autoEnd} min={autoStart || undefined} onChange={(e) => setAutoEnd(e.target.value)} className="field h-9 text-[13px]" />
            </label>
            {(autoStart || autoEnd) && (
              <button
                type="button"
                onClick={() => {
                  setAutoStart("");
                  setAutoEnd("");
                }}
                className="btn-ghost h-9 px-2 text-[12px]"
              >
                기간 지우기
              </button>
            )}
            <p className={`w-full text-[11px] ${autoSummary?.startsWith("종료일이 지나") ? "text-warn" : "text-ink-soft"}`}>
              {autoSummary} 한국 시간 기준, 매시 확인해서 주기가 된 날 한 번 돌아요.
            </p>
          </div>
        )}
        {mode === "off" && (
          <p className="mt-2 text-[11px] text-ink-soft">
            &lsquo;지금 측정&rsquo;과 자동 측정이 모두 멈추고, 진행 중인 회차도 남은 질의를 호출하지 않고 닫혀요. 지난 기록·네이버 수동 입력은 그대로 쓸 수 있어요.
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-signal h-9 px-4 text-[13px]">
          <i className={`ti ${saving ? "ti-loader-2 animate-spin" : "ti-device-floppy"} text-[15px]`} aria-hidden />
          저장
        </button>
      </div>
      {msg && (msg.ok ? <p className="mt-2 text-[12px] text-good">{msg.text}</p> : <div className="mt-2"><ErrorBox>{msg.text}</ErrorBox></div>)}
    </Section>
  );
}
