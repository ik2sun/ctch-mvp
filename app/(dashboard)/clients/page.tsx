"use client";

import { useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import {
  createClientRow,
  updateClientRow,
  deleteClientRow,
  fmtBudget,
  type Client,
  type ClientInput,
} from "@/features/clients/clientData";

const EMPTY: ClientInput = {
  name: "",
  industry: "",
  monthly_budget: "",
  manager: "",
  memo: "",
  meta_account_id: "",
};

export default function ClientsPage() {
  const { clients, refresh, selected, selectClient, loading } = useClients();
  const [form, setForm] = useState<ClientInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ClientInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      industry: c.industry ?? "",
      monthly_budget: c.monthly_budget?.toString() ?? "",
      manager: c.manager ?? "",
      memo: c.memo ?? "",
      meta_account_id: c.meta_account_id ?? "",
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("광고주명은 필수예요.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = editingId
      ? await updateClientRow(editingId, form)
      : await createClientRow(form);
    setSaving(false);
    if (error) {
      setError("저장에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    cancelEdit();
    refresh();
  }

  async function handleDelete(c: Client) {
    if (!confirm(`'${c.name}' 광고주를 삭제할까요? 연결된 데이터도 함께 삭제돼요.`)) return;
    await deleteClientRow(c.id);
    if (selected?.id === c.id) selectClient(null);
    refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-card border border-line bg-surface p-5">
        <h3 className="mb-4 text-[15px] font-semibold text-ink">
          {editingId ? "광고주 정보 수정" : "새 광고주 등록"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="광고주명 *" value={form.name} onChange={(v) => set("name", v)} placeholder="르무통" />
            <Field label="업종" value={form.industry} onChange={(v) => set("industry", v)} placeholder="패션/뷰티" />
            <Field label="월예산 (원)" value={form.monthly_budget} onChange={(v) => set("monthly_budget", v.replace(/[^0-9]/g, ""))} placeholder="50000000" mono />
            <Field label="담당자" value={form.manager} onChange={(v) => set("manager", v)} placeholder="담당 AE" />
          </div>

          {/* 매체 연동 */}
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="mb-2 text-[12px] font-medium text-ink-soft">매체 연동</p>
            <Field
              label="메타 광고계정 ID"
              value={form.meta_account_id}
              onChange={(v) => set("meta_account_id", v)}
              placeholder="act_123456789012345"
              mono
            />
            <p className="mt-1.5 text-[11px] text-ink-muted">
              메타 비즈니스 관리자에서 확인할 수 있어요. act_ 없이 숫자만 넣어도 자동으로 붙습니다.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">메모</label>
            <textarea
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
              rows={2}
              placeholder="특이사항, 계약 조건 등"
              className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-[14px] outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{error}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-signal">
              {saving ? "저장 중…" : editingId ? "수정 저장" : "광고주 등록"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="btn-ghost">취소</button>
            )}
          </div>
        </form>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">광고주 목록</h3>
          <span className="text-[13px] text-ink-muted">{clients.length}곳</span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-[14px] text-ink-muted">불러오는 중…</p>
        ) : clients.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface py-10 text-center">
            <p className="text-[14px] text-ink-muted">아직 등록된 광고주가 없어요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => {
              const isSelected = selected?.id === c.id;
              return (
                <div key={c.id} className={`rounded-card border bg-surface p-4 transition ${isSelected ? "border-signal" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                        {c.industry && (
                          <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">{c.industry}</span>
                        )}
                        {c.meta_account_id && (
                          <span className="rounded bg-signal-soft px-1.5 py-0.5 text-[11px] text-signal">메타 연동</span>
                        )}
                        {isSelected && (
                          <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-medium text-signal">현재 선택됨</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-ink-muted">
                        <span>월예산 {fmtBudget(c.monthly_budget)}</span>
                        {c.manager && <span>담당 {c.manager}</span>}
                        {c.meta_account_id && (
                          <span className="font-mono text-[12px]">{c.meta_account_id}</span>
                        )}
                      </div>
                      {c.memo && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.memo}</p>}
                    </div>
                    <div className="flex flex-shrink-0 gap-1.5">
                      {!isSelected && (
                        <button
                          onClick={() => selectClient(c.id)}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal"
                        >
                          선택
                        </button>
                      )}
                      <button onClick={() => startEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-ink-faint" title="수정">
                        <i className="ti ti-pencil text-[15px]" aria-hidden />
                      </button>
                      <button onClick={() => handleDelete(c)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-bad hover:text-bad" title="삭제">
                        <i className="ti ti-trash text-[15px]" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, mono,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`field h-10 text-[14px] ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
