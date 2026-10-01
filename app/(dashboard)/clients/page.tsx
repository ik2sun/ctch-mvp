"use client";

// 광고주 관리 — 상단 리스트 박스에서 광고주를 고르면 기본 정보·매체 연동·삭제를 한 화면에서 관리한다.
// 신규 등록은 상단 버튼(또는 ?new=1). 카카오 OAuth 콜백은 ?kakao=linked|error&clientId= 로 돌아온다.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClients } from "@/features/clients/ClientContext";
import { clientLabel, deleteClientRow, fmtBudget, normalizeMetaAccountId, type Client } from "@/features/clients/clientData";
import { ClientInfoForm } from "@/features/clients/ClientInfoForm";
import { MediaConnections } from "@/features/clients/MediaConnections";
import type { MediaChannel } from "@/features/clients/mediaKeys";

export default function ClientsPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-[15px] text-ink-muted">불러오는 중…</p>}>
      <ClientsManager />
    </Suspense>
  );
}

function ClientsManager() {
  const router = useRouter();
  const params = useSearchParams();
  const { clients, selected, selectClient, refresh, loading } = useClients();

  const [mode, setMode] = useState<"edit" | "new">("edit");
  const [managedId, setManagedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [initialChannel, setInitialChannel] = useState<MediaChannel>("meta");
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [kakaoNotice, setKakaoNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const managed = clients.find((c) => c.id === managedId) ?? null;

  // 관리 대상 = 현재 광고주 (리스트 박스·우측 상단 어느 쪽에서 바꿔도 같이 움직인다)
  useEffect(() => {
    if (selected) setManagedId(selected.id);
  }, [selected]);

  // ?new=1 → 신규 등록, ?kakao=… → 카카오 연결 결과 표시 후 해당 광고주의 카카오 탭
  useEffect(() => {
    if (params.get("new")) {
      setMode("new");
      router.replace("/clients");
      return;
    }
    const k = params.get("kakao");
    if (!k || clients.length === 0) return;
    const target = clients.find((c) => c.id === params.get("clientId"));
    if (k === "linked") {
      const n = params.get("accounts") ?? "0";
      const sel = params.get("selected");
      setKakaoNotice({
        tone: "good",
        text: `카카오 계정이 연결됐어요. 접근 가능한 광고계정 ${n}개${sel ? ` · 광고계정 ${sel} 자동 선택됨` : " · 아래에서 광고계정을 선택하세요"}`,
      });
    } else {
      setKakaoNotice({ tone: "bad", text: params.get("msg") ?? "카카오 연결에 실패했어요." });
    }
    if (target) {
      setMode("edit");
      setManagedId(target.id);
      selectClient(target.id);
      setInitialChannel("kakao");
    }
    router.replace("/clients");
  }, [params, clients, router, selectClient]);

  function guard(): boolean {
    if (dirty && !confirm("저장하지 않은 변경 사항이 있어요. 이동할까요?")) return false;
    setDirty(false);
    return true;
  }

  function pick(id: string) {
    if (id === managedId && mode === "edit") return;
    if (!guard()) return;
    setMode("edit");
    setManagedId(id);
    selectClient(id); // 리스트 박스에서 고르면 바로 현재 광고주로 전환
    setInitialChannel("meta");
    setNotice(null);
    setKakaoNotice(null);
  }

  function startNew() {
    if (!guard()) return;
    setMode("new");
    setNotice(null);
  }

  // 정리가 필요한 광고주 — 이름 중복, 메타 계정 ID 형식 오류, 같은 메타 계정 중복 연결
  const issues: { client: Client; text: string }[] = [];
  for (const c of sorted) {
    if (sorted.filter((x) => x.name.trim() === c.name.trim()).length > 1) issues.push({ client: c, text: "같은 이름의 광고주가 있어요" });
    if (c.meta_account_id && !normalizeMetaAccountId(c.meta_account_id).ok)
      issues.push({ client: c, text: `메타 광고계정 ID 형식 오류 (${c.meta_account_id})` });
    else if (c.meta_account_id && sorted.some((x) => x.id !== c.id && x.meta_account_id === c.meta_account_id))
      issues.push({ client: c, text: `메타 광고계정 ${c.meta_account_id}을 다른 광고주와 같이 쓰고 있어요` });
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* 상단: 광고주 리스트 박스 + 신규 등록 */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="client-pick" className="mb-1.5 block text-[13px] font-medium text-ink-soft">
              광고주 선택 <span className="font-normal text-ink-faint">· {clients.length}곳 · 고르면 현재 광고주로 바뀌어요</span>
            </label>
            <div className="relative">
              <select
                id="client-pick"
                value={mode === "edit" ? (managedId ?? "") : ""}
                onChange={(e) => e.target.value && pick(e.target.value)}
                disabled={loading || clients.length === 0}
                className="field h-10 appearance-none pr-9 text-[15px]"
              >
                {(mode === "new" || !managedId) && <option value="">{mode === "new" ? "신규 광고주 등록 중…" : "광고주 선택"}</option>}
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientLabel(c, clients)}
                  </option>
                ))}
              </select>
              <i className="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-ink-muted" aria-hidden />
            </div>
          </div>
          <button type="button" onClick={startNew} className={`h-10 px-4 text-[15px] ${mode === "new" ? "btn-ghost" : "btn-signal"}`} disabled={mode === "new"}>
            <i className="ti ti-plus text-[17px]" aria-hidden />
            신규 광고주 등록
          </button>
        </div>

        {issues.length > 0 && (
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3.5 py-2.5">
            <p className="text-[13px] font-medium text-warn">
              <i className="ti ti-alert-triangle mr-1" aria-hidden />
              정리가 필요한 광고주 {new Set(issues.map((i) => i.client.id)).size}곳
            </p>
            <ul className="mt-1 space-y-0.5">
              {issues.map((i, n) => (
                <li key={n} className="text-[13px] text-ink-soft">
                  <button type="button" onClick={() => pick(i.client.id)} className="font-medium text-ink hover:text-signal hover:underline">
                    {clientLabel(i.client, clients)}
                  </button>{" "}
                  — {i.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {notice && (
        <p className={`rounded-lg border px-3.5 py-2.5 text-[15px] ${notice.tone === "good" ? "border-good/30 bg-good/5 text-good" : "border-bad/20 bg-bad/5 text-bad"}`}>
          {notice.text}
        </p>
      )}

      {mode === "new" ? (
        <Section title="신규 광고주 등록" desc="기본 정보를 먼저 등록하면, 이어서 매체 연동을 설정할 수 있어요.">
          <ClientInfoForm
            client={null}
            onDirtyChange={setDirty}
            onCancel={() => {
              setDirty(false);
              setMode("edit");
            }}
            onSaved={async (id) => {
              setDirty(false);
              await refresh();
              setMode("edit");
              setManagedId(id);
              selectClient(id);
              setInitialChannel("meta");
              setNotice({ tone: "good", text: "광고주를 등록했어요. 아래 매체 연동에서 광고계정을 연결하세요." });
            }}
          />
        </Section>
      ) : loading ? (
        <p className="py-8 text-center text-[15px] text-ink-muted">불러오는 중…</p>
      ) : !managed ? (
        <div className="rounded-card border border-dashed border-line bg-surface py-12 text-center">
          <p className="text-[15px] text-ink-muted">{clients.length ? "위에서 관리할 광고주를 선택하세요." : "아직 등록된 광고주가 없어요."}</p>
          {!clients.length && (
            <button type="button" onClick={startNew} className="btn-signal mt-3 h-10 px-4 text-[15px]">
              첫 광고주 등록하기
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[17px] font-semibold text-ink">{managed.name}</h2>
                {managed.id === selected?.id && (
                  <span className="whitespace-nowrap rounded-full bg-signal-soft px-2 py-0.5 text-[13px] font-medium text-signal">현재 광고주</span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {[managed.industry, `월예산 ${fmtBudget(managed.monthly_budget)}`, managed.manager ? `담당 ${managed.manager}` : null, `${new Date(managed.created_at).toLocaleDateString("ko-KR")} 등록`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <Section title="기본 정보" desc="광고주명·업종·월예산·담당자·메모">
            <ClientInfoForm client={managed} onDirtyChange={setDirty} onSaved={() => refresh()} />
          </Section>

          <Section title="매체 연동" desc="매체별 연동 상태를 점검하고, 계정·키는 매체별로 따로 저장해요.">
            <MediaConnections client={managed} initialChannel={initialChannel} notice={kakaoNotice} />
          </Section>

          <DeleteZone
            client={managed}
            onDeleted={async () => {
              setDirty(false);
              setManagedId(null);
              await refresh();
              setNotice({ tone: "good", text: `'${managed.name}' 광고주를 삭제했어요.` });
            }}
          />
        </>
      )}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
      {desc && <p className="mb-4 mt-0.5 text-[13px] text-ink-muted">{desc}</p>}
      {children}
    </section>
  );
}

// 삭제 — 광고주명을 그대로 입력해야 삭제 버튼이 활성화된다(비슷한 이름 오삭제 방지)
function DeleteZone({ client, onDeleted }: { client: Client; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setTyped("");
    setError(null);
  }, [client.id]);

  async function remove() {
    setBusy(true);
    const { error } = await deleteClientRow(client.id);
    setBusy(false);
    if (error) {
      setError("삭제에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    onDeleted();
  }

  return (
    <section className="rounded-card border border-bad/25 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-bad">광고주 삭제</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">매체 연동 정보와 이 광고주에 저장된 리포트·설정이 함께 삭제되고 되돌릴 수 없어요.</p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost h-9 px-3 text-[15px] hover:border-bad hover:text-bad">
            <i className="ti ti-trash text-[16px]" aria-hidden />
            삭제하기
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`확인을 위해 '${client.name}' 입력`}
            autoComplete="off"
            className="field h-9 max-w-xs text-[15px]"
          />
          <button
            type="button"
            onClick={remove}
            disabled={busy || typed.trim() !== client.name.trim()}
            className="inline-flex h-9 items-center rounded-lg bg-bad px-4 text-[15px] font-medium text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {busy ? "삭제 중…" : "영구 삭제"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-9 px-3 text-[15px]">
            취소
          </button>
          {error && <p className="w-full text-[13px] text-bad">{error}</p>}
        </div>
      )}
    </section>
  );
}
