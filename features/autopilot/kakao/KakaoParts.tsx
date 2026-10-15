"use client";

// 카카오 자동 대량 세팅 — 엑셀 벌크·수동 세팅 공용 조각: 광고계정 불러오기 훅, 계정 줄(프로필·게재빈도), 캠페인 카드 목록, 실행 바, 실행 기록
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toggle } from "../meta/AccountBar";
import { StateFilter, type StateKey } from "../meta/StateFilter";
import type { AccountDefaults, KakaoAccountCtx } from "./kakaoOps";
import { readMedia, type LocalMedia } from "./media";
import { FORMAT_LABEL, GOAL_LABEL, OBJECTIVE_DETAIL_LABEL, PROFILE_SPEC, TYPE_LABEL, formatOfCampaign, freqLabel, lockReason, type Defaults, type Freq, type KakaoCampaignLite, type Problem } from "./model";
import { postKakao, type KakaoRunResult, type LogLine } from "./run";

export const BTN = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-50";
export const BTN_PRIMARY = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#eb6834] px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40";
export const INP = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-[#eb6834]";
export const CARD = "rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
export const KAKAO_YELLOW = "#FEE500";

export function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF1EA] text-[13px] font-bold text-[#eb6834]">{n}</span>;
}

// 광고계정(캠페인 + 유형) · 프로필·게재빈도 기본값
export function useKakaoAccount(clientId: string) {
  const [acc, setAcc] = useState<KakaoAccountCtx | null>(null);
  const [err, setErr] = useState<{ msg: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [defs, setDefs] = useState<AccountDefaults | null>(null);
  const load = useCallback(
    async (fresh = false) => {
      setLoading(true);
      setErr(null);
      try {
        setAcc(await postKakao<KakaoAccountCtx>({ action: "account", clientId, fresh }));
        postKakao<AccountDefaults>({ action: "defaults", clientId })
          .then(setDefs)
          .catch(() => setDefs({ profile: null, freq: null, from: null }));
      } catch (e) {
        setErr({ msg: (e as Error).message, code: (e as { code?: string }).code });
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { acc, err, loading, defs, reload: load };
}

// 처음 받은 계정 기본값(프로필·게재빈도)을 초안 기본값에 한 번 넣는다 — 사용자가 바꾼 뒤엔 덮지 않음
export function useApplyAccountDefaults(defs: AccountDefaults | null, setDefaults: (fn: (d: Defaults) => Defaults) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!defs || done.current) return;
    done.current = true;
    setDefaults((d) => ({ ...d, profile: d.profile ?? defs.profile, freq: defs.freq ?? d.freq, copy: { ...d.copy, profileName: d.copy.profileName || defs.profile?.name || "" } }));
  }, [defs, setDefaults]);
}

export function AccountError({ err, onRetry }: { err: { msg: string; code?: string }; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[14px] text-bad">
      <i className="ti ti-alert-circle text-[16px]" aria-hidden />
      {err.msg}
      {(err.code === "NO_AD_ACCOUNT" || err.code === "NOT_LINKED" || err.code === "UNAUTHORIZED") && (
        <span className="flex basis-full flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <Link href="/clients" className="font-semibold underline">
            광고주 관리 &gt; 매체 연동(카카오 광고계정·개별 연결)
          </Link>
          {err.code === "NOT_LINKED" && (
            <Link href="/admin/api-keys" className="font-semibold underline">
              API 공용 키 관리 &gt; 카카오(공용 연결 — 관리자)
            </Link>
          )}
        </span>
      )}
      <button type="button" onClick={onRetry} className="ml-auto rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink-soft">
        다시 시도
      </button>
    </div>
  );
}

const FREQS: Freq[] = [{ type: "AUTO" }, ...[1, 2, 3, 4, 5].map((cap) => ({ type: "DAY_IMP" as const, cap, hours: 24 }))];

// 계정 줄 — 광고계정 · 프로필(네이티브·동영상 소재) · 기본 게재빈도 · 새로고침
export function KakaoAccountBar({ acc, loading, defaults, setDefaults, defs, profileFile, setProfileFile, onRefresh }: { acc: KakaoAccountCtx | null; loading: boolean; defaults: Defaults; setDefaults: (fn: (d: Defaults) => Defaults) => void; defs: AccountDefaults | null; profileFile: LocalMedia | null; setProfileFile: (m: LocalMedia | null) => void; onRefresh: () => void }) {
  const [perr, setPerr] = useState<string | null>(null);
  const p = defaults.profile;
  const img = profileFile?.url ?? p?.imageUrl ?? null;
  const freqKey = (f: Freq) => (f.type === "AUTO" ? "auto" : `${f.cap}/${f.hours}`);
  async function pickProfile(file: File | undefined) {
    if (!file) return;
    setPerr(null);
    try {
      const m = await readMedia(file);
      if (m.kind !== "image") throw new Error("프로필은 이미지(JPG·PNG)만");
      if (Math.min(m.width, m.height) < PROFILE_SPEC.minW) throw new Error(`프로필은 ${PROFILE_SPEC.minW}×${PROFILE_SPEC.minH} 이상(지금 ${m.width}×${m.height})`);
      if (profileFile) URL.revokeObjectURL(profileFile.url);
      setProfileFile(m);
      setDefaults((d) => ({ ...d, profile: { name: d.profile?.name || d.copy.profileName, imageUrl: null, fileId: m.id } }));
    } catch (e) {
      setPerr((e as Error).message);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#EAECF0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="flex items-center gap-2 text-[14px]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-black text-[#191919]" style={{ background: KAKAO_YELLOW }}>
          K
        </span>
        <span className="font-semibold text-ink">광고계정 {acc?.adAccountId ?? "…"}</span>
        {acc && <span className="text-[12px] text-ink-muted">{acc.shared ? "공용 카카오 연결" : "광고주 개별 연결"}</span>}
      </span>

      <span className="flex items-center gap-2 text-[14px]" title="네이티브 이미지·동영상 소재의 프로필(이미지 300×300 이상 + 이름 20자). 기본값은 이 계정 기존 소재에서 가져와요">
        <span className="text-[13px] text-ink-muted">프로필</span>
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#F2F4F7] ring-1 ring-[#EAECF0]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <i className="ti ti-user absolute inset-0 m-auto h-fit w-fit text-[15px] text-ink-faint" aria-hidden />
          )}
        </span>
        <input
          className="w-[130px] rounded-lg border border-line bg-white px-2 py-1 text-[13px] text-ink outline-none focus:border-[#eb6834]"
          value={defaults.copy.profileName}
          maxLength={20}
          onChange={(e) => {
            const v = e.target.value;
            setDefaults((d) => ({ ...d, copy: { ...d.copy, profileName: v }, profile: d.profile ? { ...d.profile, name: v } : d.profile }));
          }}
          placeholder="프로필 이름"
        />
        <label className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:bg-canvas">
          이미지 바꾸기
          <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => pickProfile(e.target.files?.[0]).then(() => (e.target.value = ""))} />
        </label>
        {profileFile && defs?.profile?.imageUrl && (
          <button
            type="button"
            className="text-[12px] text-ink-muted underline"
            onClick={() => {
              setProfileFile(null);
              setDefaults((d) => ({ ...d, profile: defs.profile }));
            }}
          >
            기존 것 쓰기
          </button>
        )}
        {!defs && <span className="text-[12px] text-ink-faint">기존 소재에서 찾는 중…</span>}
        {defs && !defs.profile && !profileFile && <span className="text-[12px] text-warn">기존 프로필 없음 — 이미지를 올리세요(네이티브·동영상)</span>}
      </span>

      <label className="flex items-center gap-2 text-[13px] text-ink-muted" title="소재 게재빈도 기본값 — 행에 적으면 그 값. 기본은 이 계정 기존 소재 설정">
        게재빈도
        <select
          className="rounded-lg border border-line bg-white px-2 py-1 text-[13px] text-ink outline-none focus:border-[#eb6834]"
          value={freqKey(defaults.freq)}
          onChange={(e) => setDefaults((d) => ({ ...d, freq: FREQS.find((f) => freqKey(f) === e.target.value) ?? d.freq }))}
        >
          {[...FREQS, ...(FREQS.some((f) => freqKey(f) === freqKey(defaults.freq)) ? [] : [defaults.freq])].map((f) => (
            <option key={freqKey(f)} value={freqKey(f)}>
              {freqLabel(f)}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={onRefresh} disabled={loading} title="캠페인·광고그룹 새로고침" className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-50">
        <i className={`ti ti-refresh text-[15px] ${loading ? "animate-spin" : ""}`} aria-hidden />
      </button>
      {perr && <p className="basis-full text-[13px] text-bad">{perr}</p>}
    </div>
  );
}

export const typeBadge = (c: KakaoCampaignLite) => {
  const f = formatOfCampaign(c);
  return `${TYPE_LABEL[c.type] ?? (c.type || "유형 ?")}${c.goal ? ` × ${GOAL_LABEL[c.goal] ?? c.goal}` : ""}${c.objectiveDetail ? `(${OBJECTIVE_DETAIL_LABEL[c.objectiveDetail] ?? c.objectiveDetail})` : ""}${f ? ` · ${FORMAT_LABEL[f]}` : ""}`;
};
const TYPE_DOT: Record<string, string> = { TALK_BIZ_BOARD: "#F79009", DISPLAY: "#2E90FA", VIDEO: "#7A5AF8" };

// 캠페인 카드 목록 — multi = 여러 개(엑셀 벌크) / 하나(수동 세팅). 지원 안 하는 유형은 자물쇠
export function CampaignPicker({ acc, picked, setPicked, multi, disabled, extra }: { acc: KakaoAccountCtx | null; picked: string[]; setPicked: (fn: (p: string[]) => string[]) => void; multi: boolean; disabled?: boolean; extra?: (c: KakaoCampaignLite) => React.ReactNode }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<StateKey>("on");
  const searched = useMemo(() => {
    const n = (t: string) => t.toLowerCase().replace(/\s+/g, "");
    return (acc?.campaigns ?? []).filter((c) => !q || n(c.name).includes(n(q)) || c.id.includes(q));
  }, [acc, q]);
  const shownAll = searched.filter((c) => state === "all" || (state === "on" ? c.on : !c.on));
  const shown = shownAll.filter((c) => !lockReason(c));
  const counts = { all: searched.length, on: searched.filter((c) => c.on).length, off: searched.filter((c) => !c.on).length };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <i className="ti ti-search pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-faint" aria-hidden />
          <input className={`${INP} w-[220px] pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·ID 검색" />
        </label>
        <StateFilter value={state} onChange={setState} counts={acc ? counts : undefined} />
        {multi && (
          <span className="inline-flex items-center gap-1 text-[13px]">
            <button type="button" onClick={() => setPicked((p) => [...p, ...shown.map((c) => c.id).filter((id) => !p.includes(id))])} disabled={disabled || !shown.length} className="rounded px-1.5 py-0.5 font-semibold text-[#C2410C] hover:bg-[#FFF4EE] disabled:font-normal disabled:text-ink-faint">
              {q || state !== "all" ? "보이는 것 모두 선택" : "모두 선택"}
            </button>
            <span className="text-ink-faint">·</span>
            <button type="button" onClick={() => setPicked(() => [])} disabled={disabled || !picked.length} className="rounded px-1.5 py-0.5 text-ink-soft hover:bg-canvas disabled:text-ink-faint">
              모두 해제
            </button>
          </span>
        )}
      </div>
      <div className="-mx-1 mt-3 grid max-h-[240px] gap-1.5 overflow-y-auto px-1 py-0.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {!acc && [0, 1, 2, 3].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-[#F2F4F7]" />)}
        {acc && !shownAll.length && <p className="col-span-full py-4 text-center text-[14px] text-ink-muted">{q ? `'${q}'에 맞는 캠페인이 없어요` : state === "on" ? "켜진 캠페인이 없어요 — OFF·전체를 눌러 보세요" : "캠페인이 없어요"}</p>}
        {shownAll.map((c) => {
          const on = picked.includes(c.id);
          const lock = lockReason(c);
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled || !!lock}
              title={lock ?? `${c.name} (${c.id})`}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : multi ? [...p, c.id] : [c.id]))}
              aria-pressed={on}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${lock ? "cursor-not-allowed border-dashed border-[#D0D5DD] bg-[#FAFAFB]" : on ? "border-[#eb6834] bg-[#FFF8F4]" : "border-[#EAECF0] hover:border-[#F6C3AE]"}`}
            >
              {lock ? (
                <i className="ti ti-lock mt-0.5 shrink-0 text-[14px] text-ink-faint" aria-hidden />
              ) : (
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${multi ? "rounded" : "rounded-full"} ${on ? "bg-[#eb6834] text-white" : "border-2 border-[#D0D5DD]"}`}>{on && <i className="ti ti-check text-[11px]" aria-hidden />}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] font-semibold ${lock ? "text-ink-muted" : "text-ink"}`} title={c.name}>
                  {c.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.on ? "bg-[#17B26A]" : "bg-[#98A2B3]"}`} />
                  <span className={c.on ? "font-semibold text-[#067647]" : ""}>{c.on ? "ON" : "OFF"}</span>
                  <span className="inline-flex items-center gap-1">
                    {TYPE_DOT[c.type] && <span className="h-1.5 w-1.5 rounded-sm" style={{ background: TYPE_DOT[c.type] }} />}
                    {TYPE_LABEL[c.type] ?? c.type}
                    {c.goal && ` × ${GOAL_LABEL[c.goal] ?? c.goal}`}
                  </span>
                  {lock && <span>· 미지원</span>}
                  {c.dailyBudget && <span className="rounded bg-[#EEF4FF] px-1 text-[#3538CD]">캠페인 예산 {Math.round(c.dailyBudget / 10000)}만</span>}
                  {on && extra?.(c)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {acc && acc.hiddenOff > 0 && <p className="mt-1.5 text-[12px] text-ink-muted">오래된 꺼진 캠페인 {acc.hiddenOff}개는 목록에서 뺐어요(최근 꺼진 30개만)</p>}
    </>
  );
}

export function KakaoRunBar(p: { ready: boolean; summary: React.ReactNode; problems: Problem[]; onJump: (t: string) => void; running: boolean; turnOn: boolean; setTurnOn: (v: boolean) => void; onRun: () => void; runLabel: string }) {
  const [open, setOpen] = useState(false);
  const n = p.problems.length;
  const blocked = !p.ready || n > 0 || p.running;
  return (
    <div className="sticky bottom-0 z-30 -mx-6 -mb-6 border-t border-[#EAECF0] bg-white/95 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)] backdrop-blur 2xl:-mx-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 2xl:px-8">
        <p className="min-w-0 text-[14px] text-ink-soft">{p.summary}</p>
        <div className="relative">
          <button type="button" onClick={() => setOpen(!open)} disabled={!n} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold ${n ? "bg-[#FFF4EE] text-[#C2410C] ring-1 ring-[#FAD9CB]" : "bg-[#ECFDF3] text-[#067647]"}`}>
            <i className={`ti ${n ? "ti-alert-triangle" : "ti-circle-check"} text-[14px]`} aria-hidden />
            {n ? `확인할 것 ${n}` : "점검 통과"}
          </button>
          {open && n > 0 && (
            <ul className="absolute bottom-full left-0 mb-2 max-h-[320px] w-[380px] overflow-y-auto rounded-xl border border-[#EAECF0] bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.25)]">
              {p.problems.map((x, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      if (x.target) p.onJump(x.target);
                      setOpen(false);
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-canvas"
                  >
                    <span className="font-semibold text-ink">{x.where}</span> <span className="text-ink-muted">— {x.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[12px] text-ink-muted xl:inline" title="카카오모먼트 API에는 검증 전용 호출이 없어요">
            카카오는 사전 검증 API가 없어 화면 점검 후 바로 만들어요
          </span>
          <Toggle on={p.turnOn} onClick={() => p.setTurnOn(!p.turnOn)} label="바로 켜기" title="끄면 새 광고그룹을 꺼 둔 채로 만들고(기본) 기존 광고그룹에 넣는 소재도 꺼 둡니다. 켜면 심사 승인 뒤 바로 게재" />
          <button type="button" onClick={p.onRun} disabled={blocked} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#eb6834] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40">
            <i className={`ti ${p.running ? "ti-loader-2 animate-spin" : "ti-rocket"} text-[16px]`} aria-hidden />
            {p.running ? "만드는 중…" : p.runLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KakaoRunLog({ log, result, running }: { log: LogLine[]; result: KakaoRunResult | null; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log]);
  if (!log.length) return null;
  return (
    <section className={CARD}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[16px] font-bold text-ink">실행{running && " — 진행 중"}</h3>
        {result && (
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${result.errors.length ? "bg-[#FEF2F2] text-bad" : "bg-[#ECFDF3] text-good"}`}>
            광고그룹 {result.adGroups.length} · 소재 {result.creatives.length} · 오류 {result.errors.length}
          </span>
        )}
      </div>
      <div ref={ref} className="max-h-[300px] space-y-1 overflow-y-auto font-mono text-[13px]">
        {log.map((l, i) => (
          <p key={i} className={l.kind === "err" ? "text-bad" : l.kind === "ok" ? "text-ink" : "text-ink-muted"}>
            {l.kind === "ok" ? "✓" : l.kind === "err" ? "✕" : "·"} {l.text}
          </p>
        ))}
      </div>
      {result && (
        <p className="mt-3 text-[14px] text-ink-muted">
          새 소재는 카카오 심사(심사중 → 승인)를 거쳐 게재됩니다. 기록은{" "}
          <Link href="/autopilot/logs" className="font-semibold text-ink underline">
            실행 기록
          </Link>
          에서 다시 볼 수 있어요.
        </p>
      )}
    </section>
  );
}

export function Thumb({ m, h = 48 }: { m: LocalMedia; h?: number }) {
  const w = Math.max(24, Math.min(160, Math.round((h * m.width) / m.height)));
  return (
    <div className="relative shrink-0 overflow-hidden rounded bg-[#F2F4F7] ring-1 ring-[#EAECF0]" style={{ width: w, height: h }} title={`${m.name} · ${m.width}×${m.height}`}>
      {m.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <video src={m.url} muted className="h-full w-full object-cover" />
      )}
      {m.kind === "video" && <i className="ti ti-player-play-filled absolute bottom-0.5 left-0.5 text-[10px] text-white drop-shadow" aria-hidden />}
    </div>
  );
}
