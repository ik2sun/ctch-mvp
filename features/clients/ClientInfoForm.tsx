"use client";

// 광고주 기본 정보(이름·업종·월예산·담당자·메모) 등록/수정 폼 — 광고주 관리 화면과 현재 광고주 팝업에서 함께 쓴다.
// 매체 연동(계정 ID·토큰)은 MediaConnections에서 따로 저장한다.
import { useEffect, useState } from "react";
import { useClients } from "./ClientContext";
import {
  createClientRow,
  updateClientRow,
  formatBudgetInput,
  toClientInput,
  brandColorOf,
  onColor,
  BRAND_SWATCHES,
  HEX_RE,
  type Client,
  type ClientInput,
} from "./clientData";

export function ClientInfoForm({
  client,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  client: Client | null; // null이면 신규 등록
  onSaved: (id: string) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { clients } = useClients();
  const [form, setForm] = useState<ClientInput>(() => toClientInput(client));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setForm(toClientInput(client));
    setError(null);
    setSavedAt(null);
  }, [client]);

  const initial = toClientInput(client);
  const dirty = (Object.keys(form) as (keyof ClientInput)[]).some((k) => form[k].trim() !== initial[k].trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 같은 이름의 다른 광고주 — 중복 등록 방지
  const sameName = form.name.trim()
    ? clients.filter((c) => c.id !== client?.id && c.name.trim() === form.name.trim())
    : [];

  function set<K extends keyof ClientInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("광고주명은 필수예요.");
      return;
    }
    if (!client && sameName.length > 0 && !confirm(`'${form.name.trim()}' 이름의 광고주가 이미 ${sameName.length}개 있어요. 그래도 새로 등록할까요?`)) {
      return;
    }
    setSaving(true);
    setError(null);
    const result = client ? await updateClientRow(client.id, form) : await createClientRow(form);
    setSaving(false);
    if (result.error) {
      setError("저장에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    const id = client?.id ?? (result.data as { id: string } | null)?.id;
    if (id) {
      setSavedAt(Date.now());
      onSaved(id);
    }
  }

  return (
    // autoComplete=off + data-*-ignore: 브라우저·비밀번호 관리자가 로그인 정보를 채워 넣지 않게 한다
    <form onSubmit={submit} autoComplete="off" data-lpignore="true" data-1p-ignore className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="광고주명 *" value={form.name} onChange={(v) => set("name", v)} placeholder="르무통" />
        <TextField label="업종" value={form.industry} onChange={(v) => set("industry", v)} placeholder="패션/뷰티" />
        <TextField
          label="월예산 (원)"
          value={form.monthly_budget}
          onChange={(v) => set("monthly_budget", formatBudgetInput(v))}
          placeholder="5,000,000"
          mono
        />
        <TextField label="담당자" value={form.manager} onChange={(v) => set("manager", v)} placeholder="담당 AE" />
      </div>

      <BrandColorField name={form.name} value={form.brand_color} onChange={(v) => set("brand_color", v)} />

      {sameName.length > 0 && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-[13px] text-warn">
          <i className="ti ti-alert-triangle mr-1" aria-hidden />
          같은 이름의 광고주가 {sameName.length}개 더 있어요. 대시보드에서 헷갈리지 않게 이름을 구분하거나(예: 르무통_부스터즈) 중복 광고주를 정리하세요.
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-[15px] font-medium text-ink-soft">메모</label>
        <textarea
          value={form.memo}
          onChange={(e) => set("memo", e.target.value)}
          rows={2}
          placeholder="특이사항, 계약 조건 등"
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-[15px] outline-none focus:border-signal focus:ring-4 focus:ring-signal/10"
        />
      </div>

      {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || (!!client && !dirty)} className="btn-signal h-10 px-4 text-[15px]">
          {saving ? "저장 중…" : client ? "기본 정보 저장" : "광고주 등록"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost h-10 px-4 text-[15px]">
            취소
          </button>
        )}
        {client && dirty && !saving && <span className="text-[13px] text-warn">저장하지 않은 변경 사항이 있어요</span>}
        {client && !dirty && savedAt && <span className="text-[13px] text-good">저장했어요</span>}
      </div>
    </form>
  );
}

// 브랜드 색 — 견본 + 직접 입력(#RRGGBB) + 미리보기(사이드바 이니셜 박스와 같은 모양). 비우면 자동 색.
function BrandColorField({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const valid = !value.trim() || HEX_RE.test(value.trim());
  const color = brandColorOf({ name: name || "광고주", brand_color: valid ? value.trim() : null });
  return (
    <div>
      <label className="mb-1.5 block text-[15px] font-medium text-ink-soft">브랜드 색</label>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[17px] font-bold" style={{ background: color, color: onColor(color) }} aria-hidden>
          {(name || "광").slice(0, 1)}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {BRAND_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              aria-label={`브랜드 색 ${c}`}
              className={`h-7 w-7 rounded-md ring-offset-2 transition ${value.toUpperCase() === c.toUpperCase() ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <input
          type="color"
          value={valid && value ? value : color}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 cursor-pointer rounded-md border border-line bg-surface p-0.5"
          aria-label="색 직접 고르기"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          spellCheck={false}
          className={`field h-10 w-40 font-mono text-[15px] ${valid ? "" : "border-bad"}`}
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-[13px] text-ink-muted hover:text-ink">
            자동으로
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-muted">사이드바·광고주 전환 목록의 이니셜 박스에 쓰여요. 밝은 색이면 글자는 자동으로 어둡게 바뀌어요.</p>
      {!valid && <p className="mt-1 text-[13px] text-bad">#RRGGBB 형식으로 넣어 주세요 (예: #2A78D6).</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  secret,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  secret?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[15px] font-medium text-ink-soft">{label}</label>
      <input
        type={secret ? "password" : "text"}
        // password 칸에 "off"를 주면 브라우저가 무시하고 저장된 비밀번호를 채운다 → new-password
        autoComplete={secret ? "new-password" : "off"}
        data-lpignore="true"
        data-1p-ignore
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`field h-10 text-[15px] ${mono ? "font-mono" : ""}`}
      />
      {hint && <p className="mt-1 text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );
}
