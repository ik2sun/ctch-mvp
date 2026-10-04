"use client";

// 광고주 매체 연동 — 위: 매체별 연동 상태 점검표, 아래: 선택한 매체의 계정·키 입력(매체별로 따로 저장)
// 광고주 관리 화면과 현재 광고주 팝업에서 함께 쓴다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useClients } from "./ClientContext";
import { clientLabel, normalizeMetaAccountId, type Client } from "./clientData";
import { fetchMediaStatus, saveMediaKeys, type MediaChannel, type MediaStatusItem } from "./mediaKeys";
import { KakaoConnectPanel } from "./KakaoConnectPanel";
import { TextField } from "./ClientInfoForm";

type FieldDef = { key: string; label: string; type?: "secret" | "text" | "digits" | "textarea"; placeholder?: string; advanced?: boolean };

// 광고주별로는 광고계정 ID(고객 ID)만 넣고, 키는 API 공용 키 관리(/admin/api-keys)의 공용 키를 쓴다.
// advanced 항목은 공용 키로 권한이 없는 광고주만 넣는 개별 키(예외).
const CHANNELS: { key: MediaChannel; label: string; fields: FieldDef[]; hint: string; advancedNote: string }[] = [
  {
    key: "meta",
    label: "메타",
    fields: [{ key: "meta_access_token", label: "개별 액세스 토큰", advanced: true }],
    hint: "광고계정 ID만 넣으면 공용 토큰으로 조회해요.",
    advancedNote: "공용 토큰의 시스템 사용자에 이 광고계정 권한이 없을 때만 넣어요. 넣으면 이 광고주는 공용 토큰 대신 이 토큰을 써요.",
  },
  {
    key: "naver",
    label: "네이버 SA",
    fields: [
      { key: "naver_ad_customer_id", label: "고객 ID", type: "digits" },
      { key: "naver_ad_api_key", label: "엑세스라이선스 (API 키)", advanced: true },
      { key: "naver_ad_secret", label: "비밀키 (Secret)", advanced: true },
    ],
    hint: "고객 ID만 넣으면 대행사 계정 공용 키로 조회해요. 고객 ID는 검색광고 관리자센터에서 광고주 계정을 열었을 때 우측 상단 계정 번호예요.",
    advancedNote: "대행사 계정에 관리 권한이 없는 광고주는 그 광고주 계정의 도구 → API 사용 관리에서 발급한 키를 넣어요.",
  },
  {
    key: "gfa",
    label: "GFA",
    fields: [{ key: "gfa_customer_id", label: "광고계정 번호", type: "digits" }],
    hint: "광고계정 번호만 넣으면 NMG 관리 계정의 공용 네이버 연결로 조회해요. 광고계정 번호는 GFA 광고 관리 화면 주소·계정 선택 목록의 숫자예요.",
    advancedNote: "",
  },
  {
    key: "kakao",
    label: "카카오모먼트",
    fields: [{ key: "kakao_ad_account_id", label: "광고계정 ID", type: "digits" }],
    hint: "광고계정 ID만 넣으면 공용 카카오 계정으로 조회해요. 광고계정 ID는 카카오모먼트 관리자 주소의 숫자예요.",
    advancedNote: "공용 카카오 계정이 이 광고계정의 멤버가 아닐 때, 멤버인 다른 카카오 계정으로 이 광고주만 따로 연결해요.",
  },
  {
    key: "google_ads",
    label: "구글 Ads",
    fields: [{ key: "google_ads_customer_id", label: "Customer ID", type: "digits" }],
    hint: "Customer ID(10자리, 하이픈 없이)만 넣으면 공용 구글 계정으로 조회해요. 구글 Ads 화면 우측 상단 계정 번호예요. 이 계정이 NMG MCC 하위에 있어야 해요.",
    advancedNote: "",
  },
  {
    key: "ga4",
    label: "GA4",
    fields: [
      { key: "ga4_property_id", label: "GA4 속성 ID", type: "digits" },
      { key: "ga4_service_account_json", label: "서비스 계정 JSON", type: "textarea", advanced: true },
    ],
    hint: "속성 ID만 넣으면 공용 서비스 계정을 써요. 아직 실시간 데이터 조회는 지원하지 않아요.",
    advancedNote: "공용 서비스 계정을 이 속성에 추가할 수 없을 때만 넣어요.",
  },
];

const STATUS_STYLE: Record<MediaStatusItem["status"], { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-good", text: "text-good", label: "정상" },
  expired: { dot: "bg-bad", text: "text-bad", label: "만료" },
  error: { dot: "bg-bad", text: "text-bad", label: "오류" },
  none: { dot: "bg-ink-faint", text: "text-ink-muted", label: "미연동" },
};

export function MediaConnections({
  client,
  initialChannel = "meta",
  notice,
}: {
  client: Client;
  initialChannel?: MediaChannel;
  notice?: { tone: "good" | "bad"; text: string } | null;
}) {
  const { clients, refresh } = useClients();
  const [channel, setChannel] = useState<MediaChannel>(initialChannel);
  const [status, setStatus] = useState<MediaStatusItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const [metaId, setMetaId] = useState(client.meta_account_id?.replace(/^act_/, "") ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [verify, setVerify] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });

  // 광고주를 빠르게 바꾸면 이전 광고주의 점검 응답이 늦게 도착해 덮어쓸 수 있다 → 마지막 요청 응답만 반영
  const currentId = useRef(client.id);
  currentId.current = client.id;
  const reqSeq = useRef(0);
  const check = useCallback(async () => {
    const id = client.id;
    const seq = ++reqSeq.current;
    setChecking(true);
    const result = await fetchMediaStatus(id);
    if (seq !== reqSeq.current || id !== currentId.current) return;
    setStatus(result);
    setCheckedAt(new Date());
    setChecking(false);
  }, [client.id]);

  // 광고주가 바뀌면 입력값 초기화 후 상태 재점검
  useEffect(() => {
    setChannel(initialChannel);
    setValues({});
    setMsg(null);
    setVerify({ busy: false });
    setStatus(null);
    check();
  }, [client.id, initialChannel, check]);

  useEffect(() => {
    setMetaId(client.meta_account_id?.replace(/^act_/, "") ?? "");
  }, [client.meta_account_id]);

  const def = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0];
  const st = status?.find((s) => s.key === channel);

  // 같은 메타 광고계정을 쓰는 다른 광고주
  const metaNorm = normalizeMetaAccountId(metaId);
  const metaDupes =
    metaNorm.ok && metaNorm.value
      ? clients.filter((c) => c.id !== client.id && c.meta_account_id === metaNorm.value)
      : [];
  const metaIdChanged = (metaNorm.ok ? metaNorm.value : metaId) !== (client.meta_account_id ?? null);

  const filled = Object.fromEntries(
    def.fields.map((f) => [f.key, (values[f.key] ?? "").trim()]).filter(([, v]) => v),
  ) as Record<string, string>;
  const canSave = Object.keys(filled).length > 0 || (channel === "meta" && metaIdChanged && metaNorm.ok);

  async function save() {
    const keys = { ...filled };
    const clear: string[] = [];
    if (channel === "meta" && metaIdChanged) {
      if (!metaNorm.ok) {
        setMsg({ tone: "bad", text: metaNorm.error });
        return;
      }
      if (metaNorm.value) keys.meta_account_id = metaNorm.value;
      else clear.push("meta_account_id");
    }
    setSaving(true);
    setMsg(null);
    const r = await saveMediaKeys(client.id, channel, keys, clear);
    setSaving(false);
    if (!r.ok) {
      setMsg({ tone: "bad", text: r.error ?? "저장에 실패했어요." });
      return;
    }
    setValues({});
    setMsg({ tone: "good", text: "저장했어요. 연동 상태를 다시 점검했어요." });
    await Promise.all([refresh(), check()]);
  }

  // 네이버 고객 ID 확인 — 저장 전에 공용 키(또는 이 광고주 전용 키)로 조회되는지
  async function verifyNaver() {
    const customerId = (values.naver_ad_customer_id ?? "").trim();
    if (!customerId) return;
    setVerify({ busy: true });
    const res = await fetch("/api/naver-ad/verify-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: client.id, customerId }),
    });
    const j = await res.json();
    if (j.ok) {
      setVerify({
        busy: false,
        ok: true,
        text: `조회돼요 · 캠페인 ${j.campaigns}개${j.sample?.length ? ` (${j.sample.join(", ")})` : ""} · ${j.sharedKey ? "공용 키" : "이 광고주 전용 키"}. 맞는 계정이면 저장하세요.`,
      });
    } else {
      setVerify({
        busy: false,
        ok: false,
        text: j.sharedKey
          ? `공용 키로 이 고객 ID에 접근할 수 없어요 — 대행사 계정에 이 광고주 관리 권한이 연결돼 있는지 확인하거나, 아래 '광고주 전용 키'를 넣으세요. (${j.error ?? j.message ?? "오류"})`
          : `조회 실패 — ${j.error ?? "오류"}`,
      });
    }
  }

  async function clearKeys(cols: string[], question: string) {
    if (!confirm(question)) return;
    setSaving(true);
    const r = await saveMediaKeys(client.id, channel, {}, cols);
    setSaving(false);
    setMsg(r.ok ? { tone: "good", text: "삭제했어요." } : { tone: "bad", text: r.error ?? "삭제에 실패했어요." });
    await Promise.all([refresh(), check()]);
  }

  function renderField(f: FieldDef) {
    return f.type === "textarea" ? (
      <div key={f.key}>
        <label className="mb-1.5 block text-[15px] font-medium text-ink-soft">{f.label}</label>
        <textarea
          value={values[f.key] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          placeholder={st?.connected ? "저장됨 — 변경하려면 새로 입력" : undefined}
          rows={4}
          spellCheck={false}
          className="field w-full resize-y py-2 font-mono text-[13px]"
        />
      </div>
    ) : (
      <TextField
        key={f.key}
        label={f.label}
        value={values[f.key] ?? ""}
        onChange={(v) => {
          setValues((s) => ({ ...s, [f.key]: f.type === "digits" ? v.replace(/[^0-9]/g, "") : v }));
          if (f.key === "naver_ad_customer_id") setVerify({ busy: false });
        }}
        secret={!f.type || f.type === "secret"}
        mono={f.type === "digits"}
        placeholder={
          f.key === "meta_access_token"
            ? st?.ownToken
              ? "전용 토큰 저장됨 — 바꾸려면 새로 입력"
              : "비워두면 공용 토큰 사용"
            : !f.advanced
              ? st && st.status !== "none"
                ? "저장됨 — 바꾸려면 새로 입력 (현재 값은 위 연동 상태에 표시)"
                : "예: 1234567"
              : f.advanced
                ? "비워두면 공용 키 사용"
                : st && st.status !== "none"
                  ? "저장됨 — 변경하려면 새로 입력"
                  : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 연동 상태 점검표 */}
      <div className="rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
          <span className="text-[13px] font-medium text-ink-soft">
            연동 상태
            {checkedAt && !checking && (
              <span className="ml-1.5 font-normal text-ink-faint">{checkedAt.toLocaleTimeString("ko-KR")} 점검</span>
            )}
          </span>
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[13px] text-ink-soft transition hover:border-ink-faint disabled:opacity-60"
          >
            <i className={`ti ${checking ? "ti-loader-2 animate-spin" : "ti-refresh"} text-[15px]`} aria-hidden />
            {checking ? "점검 중…" : "다시 점검"}
          </button>
        </div>
        <ul className="divide-y divide-line">
          {CHANNELS.map((ch) => {
            const s = status?.find((m) => m.key === ch.key);
            const style = s ? STATUS_STYLE[s.status] : null;
            const active = ch.key === channel;
            return (
              <li key={ch.key}>
                <button
                  type="button"
                  onClick={() => {
                    setChannel(ch.key);
                    setMsg(null);
                  }}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition ${active ? "bg-signal-soft/60" : "hover:bg-canvas"}`}
                >
                  <span className={`mt-[7px] h-2 w-2 flex-shrink-0 rounded-full ${style?.dot ?? "animate-pulse bg-line"}`} aria-hidden />
                  <span className={`w-24 flex-shrink-0 text-[15px] ${active ? "font-medium text-signal" : "text-ink"}`}>{ch.label}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-5">
                    {s ? (
                      <>
                        <span className={`mr-1.5 font-medium ${style!.text}`}>{style!.label}</span>
                        <span className="break-all text-ink-muted">{s.detail}</span>
                        {s.warning && (
                          <span className="block text-warn">
                            <i className="ti ti-alert-triangle mr-0.5" aria-hidden />
                            {s.warning}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-faint">확인 중…</span>
                    )}
                  </span>
                  <i className="ti ti-chevron-right mt-1 text-[15px] text-ink-faint" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 선택한 매체 설정 */}
      <div className="rounded-lg border border-line bg-canvas p-4" data-lpignore="true" data-1p-ignore>
        <p className="mb-3 text-[15px] font-semibold text-ink">{def.label} 설정</p>

        {notice && channel === "kakao" && (
          <p className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[13px] ${notice.tone === "good" ? "border-good/30 bg-good/5 text-good" : "border-bad/20 bg-bad/5 text-bad"}`}>
            {notice.text}
          </p>
        )}

        {(
          <div className="space-y-3">
            {channel === "meta" && (
              <div>
                <TextField
                  label="메타 광고계정 ID"
                  value={metaId}
                  onChange={setMetaId}
                  placeholder="392814645784312"
                  mono
                  hint="광고 관리자 주소의 act= 뒤 숫자예요. 주소를 통째로 붙여넣어도 숫자만 뽑아요."
                />
                {!metaNorm.ok && <p className="mt-1 text-[13px] text-bad">{metaNorm.error}</p>}
                {metaDupes.length > 0 && (
                  <p className="mt-1 text-[13px] text-warn">
                    <i className="ti ti-alert-triangle mr-0.5" aria-hidden />
                    이 광고계정은 {metaDupes.map((c) => `'${clientLabel(c, clients)}'`).join(", ")}에도 연결돼 있어요.
                  </p>
                )}
              </div>
            )}

            {def.fields.filter((f) => !f.advanced).map(renderField)}

            {channel === "naver" && (
              <div>
                <button
                  type="button"
                  onClick={verifyNaver}
                  disabled={verify.busy || !(values.naver_ad_customer_id ?? "").trim()}
                  className="btn-ghost h-8 px-3 text-[13px]"
                >
                  <i className={`ti ${verify.busy ? "ti-loader-2 animate-spin" : "ti-search"} text-[15px]`} aria-hidden />
                  {verify.busy ? "확인 중…" : "이 고객 ID로 조회되는지 확인"}
                </button>
                {verify.text && <p className={`mt-1.5 text-[13px] ${verify.ok ? "text-good" : "text-bad"}`}>{verify.text}</p>}
              </div>
            )}

            {channel === "kakao" && (
              <KakaoAccountPicker
                clientId={client.id}
                onPick={(id) => setValues((v) => ({ ...v, kakao_ad_account_id: id }))}
              />
            )}

            {channel === "gfa" && <GfaAccountPicker clientId={client.id} onPick={(id) => setValues((v) => ({ ...v, gfa_customer_id: id }))} />}

            {(def.fields.some((f) => f.advanced) || channel === "kakao") && (
              <details className="rounded-lg border border-line bg-surface px-3.5 py-2.5" open={st?.status === "error" && st.detail.includes("공용") ? true : undefined}>
                <summary className="cursor-pointer text-[13px] font-medium text-ink-soft">
                  {channel === "kakao" ? "개별 카카오 계정 연결 (예외)" : "개별 키 (예외)"} — 공용 키로 접근이 안 될 때만
                </summary>
                <div className="mt-2.5 space-y-2.5">
                  <p className="text-[13px] text-ink-muted">{def.advancedNote}</p>
                  {channel === "kakao" ? (
                    <KakaoConnectPanel clientId={client.id} onChanged={check} />
                  ) : (
                    def.fields.filter((f) => f.advanced).map(renderField)
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={save} disabled={saving || !canSave} className="btn-signal h-9 px-4 text-[15px]">
                {saving ? "저장 중…" : `${def.label} 저장`}
              </button>
              {channel === "meta" && st?.ownToken && (
                <button
                  type="button"
                  onClick={() => clearKeys(["meta_access_token"], "개별 토큰을 지우고 공용 토큰으로 조회할까요?")}
                  disabled={saving}
                  className="btn-ghost h-9 px-3 text-[15px]"
                >
                  개별 토큰 삭제 (공용 토큰 사용)
                </button>
              )}
              {channel !== "meta" && channel !== "kakao" && def.fields.some((f) => f.advanced) && st && st.status !== "none" && (
                <button
                  type="button"
                  onClick={() => clearKeys(def.fields.filter((f) => f.advanced).map((f) => f.key), `${def.label} 개별 키를 지우고 공용 키로 조회할까요?`)}
                  disabled={saving}
                  className="btn-ghost h-9 px-3 text-[15px]"
                >
                  개별 키 삭제 (공용 키 사용)
                </button>
              )}
              {channel !== "meta" && st && st.status !== "none" && (
                <button
                  type="button"
                  onClick={() => clearKeys(def.fields.filter((f) => f.key !== "kakao_access_token").map((f) => f.key), `${def.label} 연동을 해제할까요? ${def.fields[0].label}${channel === "kakao" ? "" : "와 개별 키"}가 지워져요.`)}
                  disabled={saving}
                  className="btn-ghost h-9 px-3 text-[15px] hover:border-bad hover:text-bad"
                >
                  연동 해제
                </button>
              )}
            </div>
          </div>
        )}

        {msg && <p className={`mt-2.5 text-[13px] ${msg.tone === "good" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
        <p className="mt-2.5 text-[13px] text-ink-muted">{def.hint}</p>
      </div>
    </div>
  );
}

// 카카오 — 공용(또는 개별) 카카오 계정으로 접근 가능한 광고계정 목록에서 골라 광고계정 ID 칸에 넣는다
function KakaoAccountPicker({ clientId, onPick }: { clientId: string; onPick: (id: string) => void }) {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccounts(null);
    setNote(null);
  }, [clientId]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/kakao-moment/ad-accounts?clientId=${clientId}`);
    const j = await res.json();
    setLoading(false);
    if (!j.linked && !j.sharedLinked) {
      setNote("공용 카카오 계정이 아직 연결되지 않았어요. 관리자에게 API 공용 키 관리에서 연결을 요청하세요. 광고계정 ID는 직접 입력해도 돼요.");
      return;
    }
    if (j.error) {
      setNote(j.error);
      return;
    }
    setAccounts(j.accounts ?? []);
    if (!j.accounts?.length) setNote("접근 가능한 광고계정이 없어요. 연결된 카카오 계정을 광고계정 멤버로 초대하세요.");
  }

  return (
    <div>
      {accounts && accounts.length > 0 ? (
        <select defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)} className="field h-9 text-[15px]">
          <option value="">접근 가능한 광고계정에서 고르기 ({accounts.length}개)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.id}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={load} disabled={loading} className="btn-ghost h-8 px-3 text-[13px]">
          <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-list-search"} text-[15px]`} aria-hidden />
          {loading ? "불러오는 중…" : "접근 가능한 광고계정 목록에서 고르기"}
        </button>
      )}
      {note && <p className="mt-1.5 text-[13px] text-ink-muted">{note}</p>}
    </div>
  );
}

// GFA — 공용 네이버 연결(관리 계정 하위 + 직접 멤버)로 접근 가능한 광고계정에서 골라 광고계정 번호 칸에 넣는다
function GfaAccountPicker({ clientId, onPick }: { clientId: string; onPick: (id: string) => void }) {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccounts(null);
    setNote(null);
  }, [clientId]);

  async function load() {
    setLoading(true);
    const j = await (await fetch("/api/gfa/ad-accounts")).json();
    setLoading(false);
    if (!j.linked) {
      setNote("GFA 공용 네이버 계정이 아직 연결되지 않았어요. 관리자에게 API 공용 키 관리 > GFA 연결을 요청하세요. 광고계정 번호는 직접 입력해도 돼요.");
      return;
    }
    if (j.error) {
      setNote(j.error);
      return;
    }
    setAccounts(j.accounts ?? []);
    if (!j.accounts?.length) setNote("접근 가능한 광고계정이 없어요. 관리 계정 번호와 광고계정 연결 상태를 확인하세요.");
  }

  return (
    <div>
      {accounts && accounts.length > 0 ? (
        <select defaultValue="" onChange={(e) => e.target.value && onPick(e.target.value)} className="field h-9 text-[15px]">
          <option value="">접근 가능한 광고계정에서 고르기 ({accounts.length}개)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.id}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={load} disabled={loading} className="btn-ghost h-8 px-3 text-[13px]">
          <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-list-search"} text-[15px]`} aria-hidden />
          {loading ? "불러오는 중…" : "접근 가능한 광고계정 목록에서 고르기"}
        </button>
      )}
      {note && <p className="mt-1.5 text-[13px] text-ink-muted">{note}</p>}
    </div>
  );
}
