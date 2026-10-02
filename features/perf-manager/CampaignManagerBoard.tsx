"use client";

// 캠페인 매니저 — 현재 광고주(프로젝트)의 메일 수집·AI 정리.
// 왼쪽: 내 Gmail 연동 동의(로그인한 본인 계정 1회 — 동의 = 각 프로젝트 조건에 맞는 메일만 내 메일함에서 수집)
// 오른쪽: 이 프로젝트 수집 조건(광고주 · NMG · 키워드 · 하나라도/둘 다). 민감 메일(급여·인사·경영지원 등)은 항상 제외.
// 시장 정보는 접힌 '추가 설정'. (대안) Claude Code Gmail MCP 가져오기 — .claude/skills/ctch-mail-import
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/features/dashboard/ui";
import type { BlockInfo, CampaignOwner, MailboxInfo, MailStats, MemoryItem, MemoryMeta, MemoryRequest, PmMemory, PmSettings, SyncResult } from "./types";

type WorkspaceRes = {
  settings: PmSettings;
  owners: CampaignOwner[];
  mailboxes: MailboxInfo[];
  stats: MailStats;
  memory: PmMemory | null;
  memoryMeta: MemoryMeta | null;
  block: BlockInfo | null; // 관리자에게만 내려옴
  me: string;
  error?: string;
};

const MEDIA_OPTS = [
  { key: "", label: "전 매체" },
  { key: "meta", label: "메타" },
  { key: "naver", label: "네이버 SA" },
  { key: "gfa", label: "GFA" },
  { key: "kakao", label: "카카오" },
];

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const toList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const peopleOf = (s: PmSettings) => [...s.mailAddresses, ...s.mailDomains.map((d) => `@${d}`)].join(", ");
const isAddr = (x: string) => /^[^@\s]+@[^@\s]+$/.test(x);
const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-signal/60 disabled:bg-canvas disabled:text-ink-soft";
// 버튼 — 포인트 색(signal 보라) 하나만: 주 동작은 채움, 보조는 보라 테두리, 철회·삭제는 빨강 테두리, 취소는 회색
const BTN_BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const BTN = {
  primary: `${BTN_BASE} bg-signal px-3 py-1.5 text-white hover:bg-signal-strong`,
  secondary: `${BTN_BASE} border border-signal/40 bg-surface px-3 py-1.5 text-signal hover:bg-signal-soft`,
  danger: `${BTN_BASE} border border-bad/30 bg-surface px-3 py-1.5 text-bad hover:bg-bad/5`,
  ghost: `${BTN_BASE} border border-line bg-surface px-3 py-1.5 text-ink-soft hover:bg-canvas`,
};


type Notice = { kind: "ok" | "error"; text: string };

export function CampaignManagerBoard({ clientId, clientName, onAsk, notice }: { clientId: string; clientName: string; onAsk: (q: string) => void; notice: Notice | null }) {
  const [data, setData] = useState<WorkspaceRes | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "sync" | "analyze" | "save" | "disconnect" | "remove">("");
  const [msg, setMsg] = useState<Notice | null>(notice);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch(`/api/perf-manager/workspace?clientId=${clientId}`);
      const j = (await res.json()) as WorkspaceRes;
      if (!res.ok) throw new Error(j.error || "불러오지 못했어요.");
      setData(j);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, [clientId]);

  useEffect(() => {
    setData(null);
    setSyncResults(null);
    load();
  }, [load]);
  useEffect(() => setMsg(notice), [notice]);

  const call = async (url: string, body: unknown, method = "POST") => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(body) });
    const j = await res.json().catch(() => ({ error: "응답을 읽지 못했어요." }));
    if (!res.ok) throw new Error(j.error || "실패했어요.");
    return j;
  };

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "실패했어요." });
    } finally {
      setBusy("");
    }
  };

  const sync = () =>
    run("sync", async () => {
      const j = await call("/api/perf-manager/mail", { clientId, action: "sync" });
      const results = j.results as SyncResult[];
      setSyncResults(results);
      const added = results.reduce((a, r) => a + r.added, 0);
      const blocked = results.reduce((a, r) => a + (r.blocked ?? 0), 0);
      const failed = results.filter((r) => r.error).length;
      setMsg({
        kind: failed && !added ? "error" : "ok",
        text: `${added ? `새 메일 ${added}건을 모았어요. 'AI로 메일 정리'를 누르면 요청·합의 사항이 갱신돼요.` : "새로 모을 메일이 없어요."}${blocked ? ` (민감 메일 ${blocked}건 제외)` : ""}${failed ? ` (메일함 ${failed}개 오류)` : ""}`,
      });
      load();
    });

  const analyze = () =>
    run("analyze", async () => {
      const j = await call("/api/perf-manager/mail", { clientId, action: "analyze" });
      setData((d) => (d ? { ...d, memory: j.memory, memoryMeta: j.memoryMeta } : d));
      setMsg({ kind: "ok", text: "메일 정리를 갱신했어요." });
    });

  const disconnect = () => {
    if (!confirm("Gmail 연동 동의를 철회할까요? 앞으로 내 메일함에서는 가져오지 않아요. 이미 모은 메일은 남아요('내 메일 지우기'로 지울 수 있어요).")) return;
    run("disconnect", async () => {
      await call("/api/perf-manager/gmail", null, "DELETE");
      await load();
      setMsg({ kind: "ok", text: "Gmail 연동 동의를 철회했어요." });
    });
  };

  const removeMine = (n: number) => {
    if (!confirm(`${clientName}에서 내 메일함으로 들어온 메일 ${n}건을 지울까요? 다른 담당자 메일함에도 있는 메일은 남고 내 표시만 빠져요.`)) return;
    run("remove", async () => {
      const j = await call("/api/perf-manager/mail", { clientId, action: "removeMine" });
      setMsg({ kind: "ok", text: `내 메일 ${j.deleted}건을 지우고, ${j.detached}건에서 내 표시를 뺐어요.` });
      await load();
    });
  };

  const save = (body: { settings?: Partial<PmSettings>; owners?: CampaignOwner[] }, okText: string) =>
    run("save", async () => {
      const j = await call("/api/perf-manager/workspace", { clientId, ...body });
      setData((d) => (d ? { ...d, settings: j.settings, owners: j.owners } : d));
      setMsg({ kind: "ok", text: okText });
    });

  if (loadErr) {
    return (
      <Card title="캠페인 매니저 설정">
        <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[14px] text-bad">{loadErr}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card title="캠페인 매니저 설정">
        <p className="flex items-center gap-2 text-[14px] text-ink-muted">
          <i className="ti ti-loader-2 animate-spin" aria-hidden /> 불러오는 중…
        </p>
      </Card>
    );
  }

  const me = (data.me ?? "").toLowerCase();
  const mine = data.mailboxes.find((m) => m.mine);
  const myCount = data.stats.byMailbox.find((b) => b.email === me)?.count ?? 0;
  const hasRules = data.settings.mailDomains.length + data.settings.mailAddresses.length + data.settings.mailKeywords.length > 0;
  const openReqs = (data.memory?.requests ?? []).filter((r) => r.status !== "완료");
  const newSinceMemory = !!(data.memoryMeta?.lastEmailAt && data.stats.lastAt && data.stats.lastAt > data.memoryMeta.lastEmailAt);

  return (
    <div className="space-y-5">
      {msg && (
        <p className={`rounded-lg border px-3 py-2 text-[14px] ${msg.kind === "ok" ? "border-good/20 bg-good/5 text-good" : "border-bad/20 bg-bad/5 text-bad"}`} role="status">
          {msg.text}
        </p>
      )}

      {/* 상태 요약 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="ti-mail" label="모은 메일" value={`${data.stats.count.toLocaleString("ko-KR")}건`} sub={data.stats.lastAt ? `최근 메일 ${fmtDate(data.stats.lastAt)}` : "아직 없음"} />
        <Stat icon="ti-users" label="연동 동의한 담당자" value={`${data.mailboxes.length}명`} sub={mine ? "나 포함" : "나는 아직 미동의"} />
        <Stat icon="ti-checklist" label="미해결 요청" value={data.memory ? `${openReqs.length}건` : "—"} sub={data.memoryMeta ? `정리 ${fmtDate(data.memoryMeta.builtAt)}` : "AI 정리 전"} />
        <Stat icon="ti-sparkles" label="메일 정리" value={data.memoryMeta ? `${data.memoryMeta.emailCount}건 기준` : "—"} sub={newSinceMemory ? "새 메일 있음 — 다시 정리" : data.memoryMeta ? "최신" : "아직 안 함"} />
      </div>

      {/* 메일 수집 — 왼쪽: 내 연동 동의 / 오른쪽: 이 프로젝트 조건 */}
      <Card
        title="메일 수집"
        right={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sync} disabled={!!busy || !hasRules || !data.mailboxes.length} title={data.mailboxes.length ? `연동 동의한 ${data.mailboxes.length}명의 메일함에서 가져와요` : "연동 동의한 담당자가 없어요"} className={BTN.secondary}>
              <i className={`ti ${busy === "sync" ? "ti-loader-2 animate-spin" : "ti-refresh"}`} aria-hidden />
              메일 동기화
            </button>
            <button type="button" onClick={analyze} disabled={!!busy || !data.stats.count} title="Claude API 호출 — 메일 120건 기준 약 $0.3~0.6" className={BTN.primary}>
              <i className={`ti ${busy === "analyze" ? "ti-loader-2 animate-spin" : "ti-sparkles"}`} aria-hidden />
              AI로 메일 정리
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* 왼쪽: 내 Gmail 연동 동의 */}
          <div className="space-y-3 rounded-lg bg-canvas p-4 text-[14px]">
            <p className="font-semibold text-ink">내 Gmail 연동</p>
            {mine ? (
              <>
                <p className="flex items-center gap-1.5 text-good">
                  <i className="ti ti-circle-check-filled" aria-hidden /> 동의함 · {mine.email}
                </p>
                <p className="text-ink-muted">
                  각 프로젝트 조건에 맞는 메일만 내 메일함에서 가져가요. 읽기 전용(보내기·삭제 없음), 민감 메일 제외.
                  <br />이 프로젝트에 들어온 내 메일 {myCount}건 · 마지막 동기화 {fmtDate(mine.lastSyncedAt)}
                </p>
                {mine.lastError && <p className="text-[13px] text-bad">{mine.lastError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={disconnect} disabled={!!busy} className={BTN.danger}>
                    동의 철회
                  </button>
                  {myCount > 0 && (
                    <button type="button" onClick={() => removeMine(myCount)} disabled={!!busy} className={BTN.danger}>
                      내 메일 지우기
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-ink-muted">
                  로그인한 내 계정({data.me})의 메일함에서, 각 프로젝트에 설정된 특정인·키워드에 맞는 메일만 가져가도록 동의해요. 읽기 전용이고, 급여·인사·경영지원 등 민감 메일은 항상 빠져요.
                </p>
                <a href="/api/perf-manager/gmail/start" className={BTN.primary}>
                  <i className="ti ti-brand-gmail" aria-hidden /> 동의하고 Gmail 연동
                </a>
              </>
            )}
            {data.mailboxes.filter((m) => !m.mine).length > 0 && (
              <p className="border-t border-line pt-2 text-[13px] text-ink-muted">
                함께 동의한 담당자: {data.mailboxes.filter((m) => !m.mine).map((m) => m.name || m.email).join(", ")}
              </p>
            )}
          </div>

          {/* 오른쪽: 이 프로젝트 수집 조건 */}
          <RulesForm key={data.settings.updatedAt ?? "new"} initial={data.settings} busy={busy === "save"} onSave={(settings) => save({ settings, owners: [] }, "수집 조건을 저장했어요. '메일 동기화'를 누르면 이 조건으로 가져와요.")} />
        </div>

        {syncResults && syncResults.some((r) => r.error) && (
          <ul className="mt-4 space-y-1 text-[13px] text-bad">
            {syncResults
              .filter((r) => r.error)
              .map((r) => (
                <li key={r.mailbox}>
                  {r.mailbox}: {r.error}
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* 메일 AI 정리 */}
      <Card title="메일에서 정리한 내용" sub={data.memoryMeta ? `메일 ${data.memoryMeta.emailCount}건 기준 · ${fmtDate(data.memoryMeta.builtAt)} 정리` : "메일을 모은 뒤 'AI로 메일 정리'를 누르세요"}>
        {data.memory ? (
          <MemoryView memory={data.memory} onAsk={onAsk} clientName={clientName} />
        ) : (
          <p className="text-[14px] text-ink-muted">정리된 내용이 없어요. 정리가 없어도 오른쪽 대화창은 매체 성과·시장·메일 검색으로 답해요.</p>
        )}
      </Card>

      {/* 추가 설정(선택) */}
      <details className="rounded-card border border-line bg-surface">
        <summary className="cursor-pointer px-6 py-4 text-[15px] font-semibold text-ink">
          추가 설정 (선택) <span className="ml-1 text-[14px] font-normal text-ink-muted">시장 정보 · Claude Code로 가져오기</span>
        </summary>
        <div className="border-t border-line p-6">
          <ExtraForm initial={data.settings} busy={busy === "save"} onSave={(settings) => save({ settings }, "추가 설정을 저장했어요.")} clientName={clientName} />
        </div>
      </details>

      {data.block && (
        <BlockCard
          clientId={clientId}
          block={data.block}
          onChange={(block, purged) => {
            setData((d) => (d ? { ...d, block } : d));
            setMsg({ kind: "ok", text: purged ? `차단 목록에 추가하고, 이미 모은 메일 중 걸리는 ${purged}건을 지웠어요.` : "차단 목록을 바꿨어요." });
            if (purged) load();
          }}
        />
      )}
    </div>
  );
}

// 이 프로젝트 수집 조건 — 광고주(외부 주소·@도메인) · NMG(내부 주소) · 키워드 · 하나라도/둘 다. 광고주·NMG 모두 '이 사람이 주고받은 메일'을 모으는 대상
const NMG_RE = /@nmg\.co\.kr$/i;

function RulesForm({ initial, busy, onSave }: { initial: PmSettings; busy: boolean; onSave: (s: Partial<PmSettings>) => void }) {
  const initClient = [...initial.mailAddresses.filter((a) => !NMG_RE.test(a)), ...initial.mailDomains.map((d) => `@${d}`)].join(", ");
  const initNmg = initial.mailAddresses.filter((a) => NMG_RE.test(a)).join(", ");
  const initKw = initial.mailKeywords.join(", ");
  const initMatch = initial.mailMatch ?? "any";
  const [client, setClient] = useState(initClient);
  const [nmg, setNmg] = useState(initNmg);
  const [keywords, setKeywords] = useState(initKw);
  const [match, setMatch] = useState<"any" | "all">(initMatch);
  // 처음 설정하는 프로젝트만 바로 입력, 그 외엔 '수정'을 눌러야 칸이 열린다(저장 성공하면 다시 잠김 — 상위에서 key가 바뀌어 새로 그림)
  const [editing, setEditing] = useState(!initClient && !initNmg && !initKw);
  const cancel = () => {
    setClient(initClient);
    setNmg(initNmg);
    setKeywords(initKw);
    setMatch(initMatch);
    setEditing(false);
  };
  return (
    <form
      className="space-y-3 text-[14px]"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (!editing) return;
        const ext = toList(client);
        onSave({
          mailAddresses: [...ext.filter(isAddr), ...toList(nmg).filter(isAddr)],
          mailDomains: ext.filter((x) => !isAddr(x)).map((x) => x.replace(/^@/, "")),
          mailKeywords: toList(keywords),
          mailMatch: match,
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">이 프로젝트 수집 조건</p>
        {editing ? (
          <div className="flex gap-2">
            {(initClient || initNmg || initKw) && (
              <button type="button" onClick={cancel} disabled={busy} className={BTN.ghost}>
                취소
              </button>
            )}
            <button type="submit" disabled={busy} className={BTN.primary}>
              {busy && <i className="ti ti-loader-2 animate-spin" aria-hidden />}
              저장
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={BTN.secondary}>
            <i className="ti ti-pencil" aria-hidden />
            수정
          </button>
        )}
      </div>
      <fieldset disabled={!editing} className="space-y-3">
        <label className="block">
          <span className="text-ink-soft">광고주</span>
          <input className={field} value={client} onChange={(e) => setClient(e.target.value)} placeholder="kim@lemouton.co.kr, @lemouton.co.kr(회사 전체), 파트너 주소" data-lpignore="true" data-1p-ignore />
        </label>
        <label className="block">
          <span className="text-ink-soft">NMG</span>
          <input className={field} value={nmg} onChange={(e) => setNmg(e.target.value)} placeholder="lee@nmg.co.kr, jelee@nmg.co.kr" data-lpignore="true" data-1p-ignore />
        </label>
        <label className="block">
          <span className="text-ink-soft">키워드</span>
          <input className={field} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="르무통, 추석 프로모션" data-lpignore="true" data-1p-ignore />
        </label>
        <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5" role="radiogroup" aria-label="조건">
          {(
            [
              { key: "any", label: "하나라도 맞으면" },
              { key: "all", label: "사람 AND 키워드" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={match === o.key}
              onClick={() => setMatch(o.key)}
              className={`rounded-md px-3 py-1 text-[13px] transition disabled:cursor-not-allowed ${match === o.key ? "bg-signal font-medium text-white" : "text-ink-muted hover:text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-[13px] text-ink-muted">
        {match === "all" ? "광고주·NMG 사람이 주고받은 메일 중 키워드가 들어간 것만" : "광고주·NMG 사람이 주고받은 메일 + 키워드가 들어간 메일 모두"} · 전체 메일함(스팸·휴지통 제외) · 민감 메일은 항상 제외
      </p>
    </form>
  );
}

// 민감 메일 차단 — 기본 목록(끌 수 없음) + 관리자 추가 목록. 관리자 화면에만 보인다
function BlockCard({ clientId, block, onChange }: { clientId: string; block: BlockInfo; onChange: (b: BlockInfo, purged: number) => void }) {
  const [kind, setKind] = useState<"keyword" | "sender">("sender");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (op: "add" | "remove", k: "keyword" | "sender", v: string) => {
    if (op === "add" && !confirm(`'${v}'를 차단 목록에 추가할까요? 이미 모은 메일(전 광고주) 중 걸리는 메일도 지워져요.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/perf-manager/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, block: { op, kind: k, value: v } }) });
      const j = await res.json().catch(() => ({ error: "응답을 읽지 못했어요." }));
      if (!res.ok) throw new Error(j.error || "실패했어요.");
      setValue("");
      onChange(j.block, j.purged ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "실패했어요.");
    } finally {
      setBusy(false);
    }
  };
  const chip = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-[13px]";
  return (
    <Card title="민감 메일 차단 (관리자만 보임)" sub="급여·인사·경영지원 등은 수집 조건과 관계없이 항상 빠져요 — 검색에서 제외하고, 저장 직전에 한 번 더 걸러요(답장 아래 인용된 내용까지)">
      <div className="space-y-4 text-[14px]">
        <div>
          <p className="mb-1.5 font-medium text-ink">기본 차단 (항상 적용)</p>
          <p className="text-ink-muted">단어: {block.defaults.keywords.join(", ")}</p>
          <p className="mt-1 text-ink-muted">보낸 사람·받는 사람 이름/주소에 이 말이 있으면 차단: {block.defaults.senderWords.join(", ")}</p>
        </div>
        <div>
          <p className="mb-1.5 font-medium text-ink">추가 차단</p>
          {block.extra.senders.length + block.extra.keywords.length ? (
            <div className="flex flex-wrap gap-1.5">
              {block.extra.senders.map((v) => (
                <span key={`s${v}`} className={chip}>
                  <i className="ti ti-user-off text-[13px] text-ink-muted" aria-hidden />
                  {v}
                  {block.canEdit && (
                    <button type="button" onClick={() => send("remove", "sender", v)} disabled={busy} className="text-ink-muted hover:text-bad" title="빼기">
                      <i className="ti ti-x text-[12px]" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
              {block.extra.keywords.map((v) => (
                <span key={`k${v}`} className={chip}>
                  <i className="ti ti-forbid text-[13px] text-ink-muted" aria-hidden />
                  {v}
                  {block.canEdit && (
                    <button type="button" onClick={() => send("remove", "keyword", v)} disabled={busy} className="text-ink-muted hover:text-bad" title="빼기">
                      <i className="ti ti-x text-[12px]" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-ink-muted">없음 — 경영지원실·인사 담당자 주소를 여기 넣어 두면 그 사람이 낀 메일은 모두 빠져요.</p>
          )}
          {block.canEdit && (
            <form
              className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim()) send("add", kind, value.trim());
              }}
            >
              <select value={kind} onChange={(e) => setKind(e.target.value as "keyword" | "sender")} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[14px]" aria-label="종류">
                <option value="sender">주소·도메인</option>
                <option value="keyword">단어</option>
              </select>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "sender" ? "support@nmg.co.kr 또는 payroll-company.com" : "예: 법인카드"} className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[14px] outline-none focus:border-ink/40" data-lpignore="true" data-1p-ignore />
              <button type="submit" disabled={busy || !value.trim()} className={BTN.primary}>
                차단 추가
              </button>
            </form>
          )}
          {err && <p className="mt-2 text-[13px] text-bad">{err}</p>}
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        <i className={`ti ${icon} text-[15px]`} aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{value}</p>
      <p className="truncate text-[13px] text-ink-muted">{sub}</p>
    </div>
  );
}

function Row({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-ink">{value || <span className="text-ink-muted">—</span>}</dd>
    </div>
  );
}

function MemoryView({ memory, onAsk, clientName }: { memory: PmMemory; onAsk: (q: string) => void; clientName: string }) {
  const open = memory.requests.filter((r) => r.status !== "완료");
  const done = memory.requests.filter((r) => r.status === "완료");
  return (
    <div className="space-y-5">
      {memory.summary && <p className="text-[15px] leading-relaxed text-ink">{memory.summary}</p>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title={`미해결·확인 필요 요청 ${open.length}`} icon="ti-alert-circle" items={open} empty="미해결 요청이 없어요." request />
        <Section title={`합의 사항 ${memory.agreements.length}`} icon="ti-file-check" items={memory.agreements} empty="정리된 합의 사항이 없어요." />
        <Section title={`일정 ${memory.schedule.length}`} icon="ti-calendar" items={memory.schedule} empty="정리된 일정이 없어요." />
        <Section title={`이슈·리스크 ${memory.issues.length}`} icon="ti-flag" items={memory.issues} empty="정리된 이슈가 없어요." />
      </div>
      {memory.kpis.length > 0 && (
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink">KPI·목표</p>
          <div className="flex flex-wrap gap-2">
            {memory.kpis.map((k, i) => (
              <span key={i} className="rounded-lg border border-line px-2.5 py-1 text-[13px]" title={k.source}>
                <span className="text-ink-muted">{k.item}</span> <span className="font-medium text-ink">{k.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {open.length > 0 && <AskChip onClick={() => onAsk(`${clientName} 미해결 요청을 담당자별로 정리하고, 오늘 처리할 순서와 광고주 회신 초안을 써 줘.`)}>미해결 요청 처리 계획 + 회신 초안</AskChip>}
        <AskChip onClick={() => onAsk(`메일에서 합의한 KPI·예산 기준으로 최근 30일 캠페인 성과가 목표를 지키고 있는지 점검해 줘.`)}>합의 KPI 대비 성과 점검</AskChip>
        {done.length > 0 && <span className="self-center text-[13px] text-ink-muted">완료된 요청 {done.length}건은 숨김</span>}
      </div>
      {memory.contacts.length > 0 && (
        <details className="text-[14px]">
          <summary className="cursor-pointer text-ink-muted">연락처 {memory.contacts.length}명</summary>
          <ul className="mt-2 space-y-0.5">
            {memory.contacts.map((c, i) => (
              <li key={i} className="text-ink">
                {c.name} <span className="text-ink-muted">&lt;{c.email}&gt; · {c.side} · {c.role}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Section({ title, icon, items, empty, request }: { title: string; icon: string; items: (MemoryItem | MemoryRequest)[]; empty: string; request?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
        <i className={`ti ${icon} text-[16px] text-ink-muted`} aria-hidden />
        {title}
      </p>
      {items.length ? (
        <ul className="space-y-2">
          {items.slice(0, 8).map((x, i) => {
            const r = request ? (x as MemoryRequest) : null;
            return (
              <li key={i} className="rounded-lg border border-line px-3 py-2 text-[14px]">
                <p className="leading-snug text-ink">
                  {r && r.status === "확인 필요" && <span className="mr-1 whitespace-nowrap rounded bg-warn/10 px-1.5 py-0.5 text-[12px] text-warn">확인 필요</span>}
                  {x.content}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {[x.date, r?.due && `기한 ${r.due}`, x.campaign, x.owner ? `담당 ${x.owner}` : "담당 미지정", x.source && `출처 ${x.source}`].filter(Boolean).join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-muted">{empty}</p>
      )}
    </div>
  );
}

function AskChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-full border border-signal/30 bg-signal-soft px-3 py-1 text-[13px] text-signal hover:border-signal/60">
      <i className="ti ti-message-chatbot text-[14px]" aria-hidden />
      {children}
    </button>
  );
}


// 추가 설정 — 시장 정보 · Claude Code(MCP) 가져오기 안내
function ExtraForm({
  initial,
  busy,
  onSave,
  clientName,
}: {
  initial: PmSettings;
  busy: boolean;
  onSave: (s: Partial<PmSettings>) => void;
  clientName: string;
}) {
  const [competitors, setCompetitors] = useState(initial.competitors.join(", "));
  const [notes, setNotes] = useState(initial.marketNotes);
  const [copied, setCopied] = useState(false);
  const importPrompt = `${clientName} 메일 가져와 줘`;
  return (
    <form
      className="space-y-6 text-[14px]"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ competitors: toList(competitors), marketNotes: notes });
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold text-ink">시장 정보</legend>
        <label className="block">
          <span className="text-ink-soft">경쟁사</span>
          <input className={field} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="경쟁 브랜드명, 쉼표로" />
        </label>
        <label className="block">
          <span className="text-ink-soft">시장 메모 (시즌성·업계 이슈·광고주 상황)</span>
          <textarea className={`${field} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </fieldset>

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={BTN.primary}>
          {busy && <i className="ti ti-loader-2 animate-spin" aria-hidden />}
          저장
        </button>
      </div>

      <div className="rounded-lg border border-line px-4 py-3 text-ink-soft">
        <p className="font-medium text-ink">Claude Code의 Gmail MCP로 가져오기 (선택)</p>
        <p className="mt-1">
          CTCH 프로젝트 폴더의 Claude Code(claude.ai Gmail 커넥터 켜짐)에{" "}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(importPrompt).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 font-medium text-ink hover:border-ink/30"
            title="복사"
          >
            &ldquo;{importPrompt}&rdquo;
            <i className={`ti ${copied ? "ti-check" : "ti-copy"} text-[13px]`} aria-hidden />
          </button>{" "}
          라고 요청하면 같은 조건으로 가져와요. 겹치는 메일은 1건으로 합쳐져요.
        </p>
      </div>
    </form>
  );
}
