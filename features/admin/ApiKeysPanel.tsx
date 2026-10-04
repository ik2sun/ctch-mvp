"use client";

// API 공용 키 관리 — 대행사 계정에서 발급한 매체 키를 한 번 등록. 광고주에는 광고계정 ID만 넣는다.
import { useCallback, useEffect, useState } from "react";
import { TextField } from "@/features/clients/ClientInfoForm";
import { SHARED_DEFS, type SharedChannelDef } from "./sharedKeyDefs";

type ChannelStatus = { configured: boolean; linked?: boolean; source: "db" | "env" | null; updatedAt: string | null; display: Record<string, string> };
type Status = { tableReady: boolean; kakaoConfigured: boolean; gfaRedirectUri?: string; ga4RedirectUri?: string; googleAdsRedirectUri?: string; channels: Record<string, ChannelStatus> };
type ClientCheck = { clientName: string; accountId: string; ownKey: boolean; ok: boolean; detail: string };
type TestResult = { ok: boolean; message: string; clients: ClientCheck[]; saved?: boolean };

export function ApiKeysPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [active, setActive] = useState(SHARED_DEFS[0].channel);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/api-keys");
    setStatus(res.ok ? await res.json() : null);
  }, []);

  useEffect(() => {
    load();
    // 공용 카카오 계정 연결 후 돌아온 경우
    const sp = new URLSearchParams(window.location.search);
    const k = sp.get("kakao");
    if (k) {
      setActive("kakao");
      setNotice(
        k === "linked"
          ? { ok: true, text: `공용 카카오 계정을 연결했어요. 접근 가능한 광고계정 ${sp.get("accounts") ?? "0"}개.` }
          : { ok: false, text: sp.get("msg") ?? "카카오 연결에 실패했어요." },
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
    // GFA 네이버 계정 연결 후 돌아온 경우
    const g = sp.get("gfa");
    if (g) {
      setActive("gfa");
      setNotice(
        g === "linked"
          ? { ok: true, text: `GFA 네이버 계정을 연결했어요. 멤버인 관리 계정 ${sp.get("managers") ?? "0"}개. '광고주별 접근 점검'으로 확인하세요.` }
          : { ok: false, text: sp.get("msg") ?? "GFA 연결에 실패했어요." },
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
    // GA4 구글 계정 연결 후 돌아온 경우
    const ga = sp.get("ga4");
    if (ga) {
      setActive("ga4");
      const props = Number(sp.get("properties") ?? "-1");
      setNotice(
        ga === "linked"
          ? {
              ok: true,
              text: `구글 계정${sp.get("email") ? `(${sp.get("email")})` : ""}을 연결했어요.${props >= 0 ? ` 접근 가능한 GA4 속성 ${props}개.` : ""} '광고주별 접근 점검'으로 확인하세요.`,
            }
          : { ok: false, text: sp.get("msg") ?? "GA4 연결에 실패했어요." },
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
    // 구글 Ads 구글 계정 연결 후 돌아온 경우
    const gads = sp.get("gads");
    if (gads) {
      setActive("google_ads");
      const accounts = Number(sp.get("accounts") ?? "-1");
      const warn = sp.get("warn");
      setNotice(
        gads === "linked"
          ? {
              ok: !warn,
              text: `구글 계정${sp.get("email") ? `(${sp.get("email")})` : ""}을 연결했어요.${accounts >= 0 ? ` 직접 접근 가능한 계정 ${accounts}개.` : ""}${warn ? ` 다만 API 호출 확인에 실패했어요 — ${warn}` : " '광고주별 접근 점검'으로 확인하세요."}`,
            }
          : { ok: false, text: sp.get("msg") ?? "구글 Ads 연결에 실패했어요." },
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [load]);

  const def = SHARED_DEFS.find((d) => d.channel === active)!;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div>
        <h2 className="font-display text-[23px] font-semibold text-ink">API 공용 키 관리</h2>
        <p className="mt-1 text-[15px] text-ink-muted">
          대행사(관리) 계정에서 발급한 키를 매체별로 한 번 등록하면, 광고주 관리에서는 <b className="text-ink-soft">광고계정 ID만</b> 넣어 연동해요. 공용 키로 권한이 없는 광고주만 광고주 관리에서 개별 키를 넣어요.
        </p>
      </div>

      {status && !status.tableReady && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3.5 py-2.5 text-[15px] text-warn">
          <i className="ti ti-alert-triangle mr-1" aria-hidden />
          Supabase SQL Editor에서 <span className="font-mono">supabase/migrations/0015_shared_media_keys.sql</span>을 먼저 실행하세요. 실행 전에는 저장이 안 되고, 메타·네이버는 .env.local 값만 쓰여요.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
        {/* 매체 목록 */}
        <nav className="space-y-1">
          {SHARED_DEFS.map((d) => {
            const st = status?.channels[d.channel];
            return (
              <button
                key={d.channel}
                type="button"
                onClick={() => {
                  setActive(d.channel);
                  setNotice(null);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
                  active === d.channel ? "border-signal bg-signal-soft/60" : "border-line bg-surface hover:border-ink-faint"
                }`}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${!st ? "bg-line" : st.configured ? (st.source === "env" ? "bg-warn" : "bg-good") : "bg-ink-faint"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] ${active === d.channel ? "font-medium text-signal" : "text-ink"}`}>{d.label}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {!st ? "확인 중…" : st.configured ? (st.source === "env" ? ".env.local 값 사용 중" : d.connect && !st.linked ? "키 등록됨 · 계정 연결 전" : "등록됨") : "미등록"}
                    {!d.live && " · 조회 준비 중"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <ChannelCard key={def.channel} def={def} status={status} notice={notice} onChanged={load} />
      </div>
    </div>
  );
}

function ChannelCard({
  def,
  status,
  notice,
  onChanged,
}: {
  def: SharedChannelDef;
  status: Status | null;
  notice: { ok: boolean; text: string } | null;
  onChanged: () => void;
}) {
  const st = status?.channels[def.channel];
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"test" | "save" | "recheck" | "delete" | "import" | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const requiredFilled = def.fields.every((f) => f.optional || (form[f.key] ?? "").trim());

  async function call(action: "test" | "save" | "recheck" | "import") {
    setBusy(action);
    setResult(null);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "recheck" ? { channel: def.channel, action: "test" } : action === "import" ? { channel: def.channel, action } : { channel: def.channel, action, config: form },
      ),
    });
    const j = (await res.json()) as TestResult & { error?: string };
    setBusy(null);
    setResult(j.error ? { ok: false, message: j.error, clients: [] } : j);
    if (j.saved) {
      setForm({});
      onChanged();
    }
  }

  async function remove() {
    if (!confirm(`${def.label} 공용 키를 삭제할까요? 이 키로 조회하던 광고주는 개별 키가 없으면 연동이 끊겨요.`)) return;
    setBusy("delete");
    await fetch(`/api/admin/api-keys?channel=${def.channel}`, { method: "DELETE" });
    setBusy(null);
    setResult(null);
    onChanged();
  }

  return (
    <section className="space-y-4 rounded-card border border-line bg-surface p-6" data-lpignore="true" data-1p-ignore>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-ink">{def.label} 공용 키</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            광고주별로는 <b className="text-ink-soft">{def.accountLabel}</b>만 넣어요.
            {!def.live && (def.connect ? " 연결 점검은 되지만 대시보드 표시는 준비 중이에요." : " 이 매체는 아직 대시보드 조회를 지원하지 않아 키 보관만 해요.")}
          </p>
        </div>
        {st?.configured && def.testable && (
          <button type="button" onClick={() => call("recheck")} disabled={busy !== null} className="btn-ghost h-8 px-3 text-[13px]">
            <i className={`ti ${busy === "recheck" ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
            광고주별 접근 점검
          </button>
        )}
      </div>

      {notice && <p className={`rounded-lg border px-3.5 py-2.5 text-[15px] ${notice.ok ? "border-good/30 bg-good/5 text-good" : "border-bad/20 bg-bad/5 text-bad"}`}>{notice.text}</p>}

      {/* 현재 상태 */}
      <div className="rounded-lg border border-line bg-canvas px-4 py-3">
        {!st ? (
          <p className="text-[15px] text-ink-muted">확인 중…</p>
        ) : !st.configured ? (
          <p className="text-[15px] text-ink-muted">등록된 공용 키가 없어요.</p>
        ) : (
          <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-[15px]">
            <dt className="text-ink-muted">저장 위치</dt>
            <dd className="text-ink">
              {st.source === "db" ? "DB (이 화면에서 등록)" : ".env.local 환경변수"}
              {st.source === "env" && <span className="ml-1.5 text-[13px] text-warn">— 대행사 계정 키로 등록을 권장해요</span>}
            </dd>
            {st.source === "env" && (
              <dd className="col-span-2 mt-1.5">
                <button type="button" onClick={() => call("import")} disabled={busy !== null || !status?.tableReady} className="btn-signal h-8 px-3 text-[13px]">
                  <i className={`ti ${busy === "import" ? "ti-loader-2 animate-spin" : "ti-database-import"} text-[15px]`} aria-hidden />
                  {busy === "import" ? "테스트 후 옮기는 중…" : "이 값을 공용 키로 등록 (DB로 옮기기)"}
                </button>
              </dd>
            )}
            {def.fields.map((f) =>
              st.display[f.key] ? (
                <Row key={f.key} label={f.label} value={st.display[f.key]} mono />
              ) : null,
            )}
            {def.connect && (
              <Row label={def.connect.account} value={st.linked ? `연결됨${st.display.linked_email ? ` · ${st.display.linked_email}` : ""}` : `연결 전 — 아래 '${def.connect.label}'`} />
            )}
            {st.display.linked_at && <Row label="연결일" value={new Date(st.display.linked_at).toLocaleString("ko-KR")} />}
            {st.updatedAt && <Row label="수정일" value={new Date(st.updatedAt).toLocaleString("ko-KR")} />}
          </dl>
        )}
      </div>

      {/* 등록/교체 */}
      <div>
        <p className="mb-1.5 text-[15px] font-semibold text-ink">{st?.configured ? "교체" : "등록"} 방법</p>
        <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-[13px] text-ink-muted">
          {def.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {def.channel === "gfa" && status?.gfaRedirectUri && (
          <p className="mb-3 text-[13px] text-ink-muted">
            Callback URL: <span className="select-all font-mono text-ink-soft">{status.gfaRedirectUri}</span>
          </p>
        )}
        {def.channel === "ga4" && status?.ga4RedirectUri && (
          <p className="mb-3 text-[13px] text-ink-muted">
            승인된 리디렉션 URI: <span className="select-all font-mono text-ink-soft">{status.ga4RedirectUri}</span>
          </p>
        )}

        {def.channel === "google_ads" && status?.googleAdsRedirectUri && (
          <p className="mb-3 text-[13px] text-ink-muted">
            승인된 리디렉션 URI: <span className="select-all font-mono text-ink-soft">{status.googleAdsRedirectUri}</span>
          </p>
        )}

        {def.oauth ? (
          <div className="flex flex-wrap items-center gap-2">
            {status && !status.kakaoConfigured ? (
              <p className="text-[13px] text-warn">서버에 KAKAO_REST_API_KEY가 없어 연결할 수 없어요.</p>
            ) : (
              <a href="/api/kakao-moment/oauth/start?shared=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#FEE500] px-4 text-[15px] font-medium text-[#191919] hover:brightness-95">
                <i className="ti ti-message-circle text-[16px]" aria-hidden />
                {st?.configured ? "공용 카카오 계정 다시 연결" : "공용 카카오 계정 연결"}
              </a>
            )}
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 gap-3 ${def.fields.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {def.fields.map((f) =>
                f.textarea ? (
                  <div key={f.key} className="sm:col-span-2">
                    <label className="mb-1.5 block text-[15px] font-medium text-ink-soft">{f.label}</label>
                    <textarea
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                      rows={5}
                      spellCheck={false}
                      placeholder={st?.configured ? "저장됨 — 교체하려면 새로 붙여넣기" : '{"type":"service_account", …}'}
                      className="field w-full resize-y py-2 font-mono text-[13px]"
                    />
                  </div>
                ) : (
                  <TextField
                    key={f.key}
                    label={`${f.label}${f.optional ? " (선택)" : ""}`}
                    value={form[f.key] ?? ""}
                    onChange={(v) => setForm((s) => ({ ...s, [f.key]: f.digits ? v.replace(/[^0-9]/g, "") : v }))}
                    secret={f.secret}
                    mono={f.digits}
                    placeholder={st?.configured && f.secret ? "저장됨 — 교체하려면 새로 입력" : undefined}
                  />
                ),
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {def.testable && (
                <button type="button" onClick={() => call("test")} disabled={!requiredFilled || busy !== null} className="btn-ghost h-9 px-4 text-[15px]">
                  {busy === "test" ? "테스트 중…" : "연결 테스트"}
                </button>
              )}
              <button type="button" onClick={() => call("save")} disabled={!requiredFilled || busy !== null || !status?.tableReady} className="btn-signal h-9 px-4 text-[15px]">
                {busy === "save" ? "저장 중…" : def.testable ? "테스트 후 저장" : "저장"}
              </button>
              {def.connect && st?.source === "db" && (
                <a
                  href={def.connect.href}
                  style={{ backgroundColor: def.connect.color }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[15px] font-medium text-white hover:brightness-95"
                >
                  <i className="ti ti-login-2 text-[16px]" aria-hidden />
                  {st.linked ? `${def.connect.label} 다시 하기` : def.connect.label}
                </a>
              )}
            </div>
            {def.connect && st?.configured && (
              <p className="mt-2 text-[13px] text-ink-muted">저장된 값을 바꾸지 않고 연결만 하려면 '{def.connect.label}'만 누르면 돼요. Client ID를 바꿔 저장하면 기존 연결은 풀려요.
                {(def.channel === "ga4" || def.channel === "google_ads") && " 저장된 값은 비워 둔 칸은 그대로 유지돼요."}</p>
            )}
          </>
        )}
      </div>

      {result && (
        <div className="space-y-2">
          <p className={`rounded-lg border px-3.5 py-2.5 text-[15px] ${result.ok ? "border-good/30 bg-good/5 text-good" : "border-bad/20 bg-bad/5 text-bad"}`}>{result.message}</p>
          {def.testable && result.clients.length > 0 && <ClientTable def={def} clients={result.clients} />}
        </div>
      )}

      {st?.source === "db" && (
        <div className="border-t border-line pt-3">
          <button type="button" onClick={remove} disabled={busy !== null} className="btn-ghost h-8 px-3 text-[13px] hover:border-bad hover:text-bad">
            {def.oauth ? "공용 카카오 연결 해제" : "공용 키 삭제"}
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`break-all text-ink ${mono ? "font-mono text-[13px]" : ""}`}>{value}</dd>
    </>
  );
}

function ClientTable({ def, clients }: { def: SharedChannelDef; clients: ClientCheck[] }) {
  if (clients.length === 0) {
    return <p className="text-[13px] text-ink-muted">{def.accountLabel}가 등록된 광고주가 아직 없어요. 광고주 관리 &gt; 매체 연동에서 넣으면 여기서 접근 여부를 점검해요.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-canvas text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">광고주</th>
            <th className="px-3 py-2 text-left font-medium">{def.accountLabel}</th>
            <th className="px-3 py-2 text-left font-medium">공용 키로 접근</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {clients.map((c, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-ink">
                {c.clientName}
                {c.ownKey && <span className="whitespace-nowrap ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink-muted">개별 키 사용 중</span>}
              </td>
              <td className="px-3 py-2 font-mono text-ink-soft">{c.accountId}</td>
              <td className={`px-3 py-2 ${c.ok ? "text-good" : "text-bad"}`}>{c.ok ? `가능 · ${c.detail}` : `불가 — ${c.detail}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
