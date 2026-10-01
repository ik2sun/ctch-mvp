"use client";

import { useEffect, useState } from "react";
import {
  CHANNEL_OPTIONS,
  KPI_OPTIONS,
  TONE_OPTIONS,
  defaultReportConfig,
  getReportConfig,
  upsertReportConfig,
  type PrimaryKpi,
  type ReportChannel,
  type ReportConfig,
  type ReportTone,
} from "../reportConfig";

type Props = {
  clientId: string;
  clientName: string;
  /** 설정을 불러오거나 저장했을 때 상위 페이지(리포트 생성 호출부)에 전달 */
  onChange?: (config: ReportConfig) => void;
};

export function ReportConfigPanel({ clientId, clientName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [channels, setChannels] = useState<ReportChannel[]>(defaultReportConfig.active_channels);
  const [kpi, setKpi] = useState<PrimaryKpi>(defaultReportConfig.primary_kpi);
  const [tone, setTone] = useState<ReportTone>(defaultReportConfig.report_tone);
  const [notes, setNotes] = useState(defaultReportConfig.custom_prompt_notes);

  // 광고주 전환 시 저장된 설정 로드 (없으면 르무통 기본값)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMsg(null);

    getReportConfig(clientId)
      .then((saved) => {
        if (!alive) return;
        const next: ReportConfig = saved
          ? {
              client_id: clientId,
              active_channels: saved.active_channels,
              primary_kpi: saved.primary_kpi,
              report_tone: saved.report_tone,
              custom_prompt_notes: saved.custom_prompt_notes || defaultReportConfig.custom_prompt_notes,
            }
          : { client_id: clientId, ...defaultReportConfig };
        setChannels(next.active_channels);
        setKpi(next.primary_kpi);
        setTone(next.report_tone);
        setNotes(next.custom_prompt_notes);
        onChange?.(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // onChange는 호출부에서 매 렌더 새로 만들어질 수 있어 의존성에서 제외한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function toggleChannel(value: ReportChannel) {
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const config: ReportConfig = {
      client_id: clientId,
      active_channels: channels.length ? channels : defaultReportConfig.active_channels,
      primary_kpi: kpi,
      report_tone: tone,
      custom_prompt_notes: notes,
    };
    try {
      const { error } = await upsertReportConfig(config);
      if (error) throw new Error(error.message);
      onChange?.(config);
      setMsg("설정을 저장했어요. 다음 AI 분석부터 반영됩니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }

  const summary = `${channels.map((c) => CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c).join(" · ") || "매체 미선택"} · ${kpi} · ${
    TONE_OPTIONS.find((t) => t.value === tone)?.label ?? tone
  }`;

  return (
    <div className="rounded-card border border-line bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left"
      >
        <i className="ti ti-adjustments text-[18px] text-signal" aria-hidden />
        <span className="text-[15px] font-medium text-ink-soft">리포트 설정</span>
        <span className="truncate text-[13px] text-ink-muted">
          {loading ? "불러오는 중…" : `${clientName} · ${summary}`}
        </span>
        <i
          className={`ti ti-chevron-down ml-auto text-[17px] text-ink-muted transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4">
          {/* 활성 매체 */}
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">활성 매체 (다중 선택)</p>
            <div className="flex flex-wrap gap-4">
              {CHANNEL_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-1.5 text-[15px] text-ink-soft"
                >
                  <input
                    type="checkbox"
                    checked={channels.includes(o.value)}
                    onChange={() => toggleChannel(o.value)}
                    className="h-4 w-4 accent-signal"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {/* 주요 KPI */}
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">주요 KPI</p>
            <div className="flex flex-wrap gap-4">
              {KPI_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-1.5 text-[15px] text-ink-soft"
                >
                  <input
                    type="radio"
                    name="primary_kpi"
                    checked={kpi === o.value}
                    onChange={() => setKpi(o.value)}
                    className="h-4 w-4 accent-signal"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {/* 리포트 톤 */}
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">리포트 톤</p>
            <div className="flex flex-wrap gap-4">
              {TONE_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-1.5 text-[15px] text-ink-soft"
                >
                  <input
                    type="radio"
                    name="report_tone"
                    checked={tone === o.value}
                    onChange={() => setTone(o.value)}
                    className="h-4 w-4 accent-signal"
                  />
                  {o.label}
                  <span className="text-[13px] text-ink-muted">— {o.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 고유 규칙 / 특이사항 */}
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">광고주 고유 규칙 · 특이사항</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="네이밍 규칙, 특이사항 등"
              className="w-full resize-y rounded-lg border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
            />
            <p className="mt-1 text-[13px] text-ink-muted">
              여기 적은 내용은 AI 진단·심층 리포트의 system prompt에 그대로 주입돼요.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || loading} className="btn-signal h-9 px-3 text-[15px]">
              <i className={`ti ${saving ? "ti-loader-2 animate-spin" : "ti-device-floppy"} text-[16px]`} aria-hidden />
              {saving ? "저장 중…" : "설정 저장"}
            </button>
            <button
              onClick={() => {
                setChannels(defaultReportConfig.active_channels);
                setKpi(defaultReportConfig.primary_kpi);
                setTone(defaultReportConfig.report_tone);
                setNotes(defaultReportConfig.custom_prompt_notes);
              }}
              className="text-[13px] text-ink-muted underline-offset-2 hover:text-ink-soft hover:underline"
            >
              기본값으로 되돌리기
            </button>
            {msg && <span className="text-[13px] text-signal">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
