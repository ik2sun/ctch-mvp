"use client";

import { useEffect, useState } from "react";
import { listClients, type Client } from "@/features/clients/clientData";
import {
  INDUSTRIES,
  KPI_OPTIONS,
  PROPOSAL_GOALS,
  type BasicInfo,
} from "@/features/proposal/types";

const inputCls =
  "w-full rounded-card border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-signal";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-ink";

export default function Step1BasicInfo({
  value,
  onChange,
  onNext,
}: {
  value: BasicInfo;
  onChange: (v: BasicInfo) => void;
  onNext: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [manualEntry, setManualEntry] = useState(!value.clientId);

  useEffect(() => {
    listClients().then(setClients);
  }, []);

  function set<K extends keyof BasicInfo>(key: K, v: BasicInfo[K]) {
    onChange({ ...value, [key]: v });
  }

  function setCompetitorUrl(i: number, url: string) {
    const next = [...value.competitorUrls];
    next[i] = url;
    set("competitorUrls", next);
  }

  const canNext = value.clientName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <label className={labelCls}>광고주명</label>
        {!manualEntry ? (
          <div className="flex gap-2">
            <select
              className={inputCls}
              value={value.clientId ?? ""}
              onChange={(e) => {
                const c = clients.find((c) => c.id === e.target.value);
                onChange({
                  ...value,
                  clientId: c?.id ?? null,
                  clientName: c?.name ?? "",
                });
              }}
            >
              <option value="">광고주 선택</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="shrink-0 rounded-card border border-line px-3 py-2 text-[13px] text-ink-soft hover:bg-canvas"
              onClick={() => setManualEntry(true)}
            >
              직접 입력
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="광고주명을 입력하세요"
              value={value.clientName}
              onChange={(e) => onChange({ ...value, clientId: null, clientName: e.target.value })}
            />
            {clients.length > 0 && (
              <button
                type="button"
                className="shrink-0 rounded-card border border-line px-3 py-2 text-[13px] text-ink-soft hover:bg-canvas"
                onClick={() => setManualEntry(false)}
              >
                목록에서 선택
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>업종</label>
          <select
            className={inputCls}
            value={value.industry}
            onChange={(e) => set("industry", e.target.value as BasicInfo["industry"])}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>제안 목적</label>
          <select
            className={inputCls}
            value={value.goal}
            onChange={(e) => set("goal", e.target.value as BasicInfo["goal"])}
          >
            {PROPOSAL_GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>핵심 KPI</label>
          <select
            className={inputCls}
            value={value.kpi}
            onChange={(e) => set("kpi", e.target.value as BasicInfo["kpi"])}
          >
            {KPI_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>월 예산 규모 (원)</label>
        <input
          className={inputCls}
          placeholder="예: 30,000,000"
          value={value.monthlyBudget}
          onChange={(e) => set("monthlyBudget", e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>경쟁사 URL (최대 3개)</label>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className={inputCls}
              placeholder={`https://competitor${i + 1}.com`}
              value={value.competitorUrls[i] ?? ""}
              onChange={(e) => setCompetitorUrl(i, e.target.value)}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="rounded-card bg-signal px-5 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음 단계
        </button>
      </div>
    </div>
  );
}
