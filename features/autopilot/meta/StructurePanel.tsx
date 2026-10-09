"use client";

// 메타 빠른 세팅 — 왼쪽: 캠페인(기존 고르기 / 새로) + 광고세트 목록(새로 · 기존 세트 설정 복사 · 기존 세트에 광고 추가)
// 광고세트는 한 줄 카드에 핵심 칸(성별·연령·일 예산)만 바로 보이고, 기간·최적화·게재 위치·Advantage+ 타겟은 펼쳐서
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { MoneyInput } from "../gfa/ui";
import { StateFilter, isOn, lockReason, type StateKey } from "./StateFilter";
import {
  ATTRIBUTIONS,
  adSetAutoName,
  defaultAttribution,
  NEW_OBJECTIVES,
  OBJECTIVE_LABEL,
  OPTIMIZATION,
  PLACEMENT_MODES,
  SUPPORTED_OBJECTIVES,
  type AdDraft,
  type AdSetDraft,
  type CampaignDraft,
  type MetaAccountCtx,
  type MetaAdSetLite,
  type MetaAudience,
  type Problem,
} from "./model";

const INP = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-[#eb6834] disabled:bg-canvas";
const SEG = "flex rounded-lg bg-[#F2F4F7] p-0.5";
const segBtn = (on: boolean) => `flex-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition ${on ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "text-ink-muted hover:text-ink"}`;
const AGES = Array.from({ length: 53 }, (_, i) => i + 13);
const STATUS_DOT: Record<string, string> = { ACTIVE: "bg-[#17B26A]", PAUSED: "bg-[#98A2B3]", CAMPAIGN_PAUSED: "bg-[#98A2B3]", IN_PROCESS: "bg-[#F79009]", WITH_ISSUES: "bg-[#F04438]" };
const won = (n: number | null) => (n == null ? "" : `${Math.round(n).toLocaleString("ko-KR")}원`);

type AdSetsState = Record<string, MetaAdSetLite[] | "loading" | { error: string }>;

export function StructurePanel(p: {
  acc: MetaAccountCtx | null;
  campaign: CampaignDraft;
  setCampaign: Dispatch<SetStateAction<CampaignDraft>>;
  objective: string | null;
  cbo: boolean;
  adSets: AdSetDraft[];
  setAdSets: Dispatch<SetStateAction<AdSetDraft[]>>;
  addAdSet: (over?: Partial<AdSetDraft>) => void;
  ads: AdDraft[];
  adSetsByCampaign: AdSetsState;
  loadAdSets: (campaignId: string) => void;
  focus: string | null;
  setFocus: (k: string | null) => void;
  problems: Problem[];
  disabled: boolean;
  audiences: MetaAudience[] | null;
}) {
  const { acc, campaign: c, setCampaign } = p;
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<StateKey>("all");
  const [picker, setPicker] = useState<null | "copy" | "existing">(null);
  const setC = (x: Partial<CampaignDraft>) => setCampaign((v) => ({ ...v, ...x }));
  const campProblems = p.problems.filter((x) => x.target === "campaign");

  const searched = useMemo(() => {
    const n = (t: string) => t.toLowerCase().replace(/\s+/g, "");
    return (acc?.campaigns ?? []).filter((x) => !q || n(x.name).includes(n(q)) || x.id.includes(q));
  }, [acc, q]);
  const counts = { all: searched.length, on: searched.filter((x) => isOn(x.status)).length, off: searched.filter((x) => !isOn(x.status)).length };
  const list = searched.filter((x) => stateFilter === "all" || (stateFilter === "on" ? isOn(x.status) : !isOn(x.status)));
  const current = c.mode === "existing" ? acc?.campaigns.find((x) => x.id === c.existingId) : null;
  const currentSets = current ? p.adSetsByCampaign[current.id] : undefined;

  return (
    <div className="space-y-4 xl:sticky xl:top-4">
      {/* ① 캠페인 */}
      <section id="meta-campaign" className={`rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${campProblems.length ? "border-[#FAD9CB]" : "border-[#EAECF0]"}`}>
        <div className="mb-3 flex items-center gap-2">
          <Step n={1} />
          <h3 className="text-[16px] font-bold text-ink">캠페인</h3>
          <div className={`${SEG} ml-auto w-[180px]`}>
            <button type="button" className={segBtn(c.mode === "existing")} onClick={() => setC({ mode: "existing" })} disabled={p.disabled}>
              기존
            </button>
            <button type="button" className={segBtn(c.mode === "new")} onClick={() => setC({ mode: "new" })} disabled={p.disabled}>
              새로 만들기
            </button>
          </div>
        </div>

        {c.mode === "existing" ? (
          <>
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <i className="ti ti-search pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-faint" aria-hidden />
                <input className={`${INP} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·ID 검색" />
              </label>
              <StateFilter value={stateFilter} onChange={setStateFilter} counts={acc ? counts : undefined} />
            </div>
            <ul className="mt-2 max-h-[220px] space-y-0.5 overflow-y-auto">
              {!acc && [0, 1, 2].map((i) => <li key={i} className="h-9 animate-pulse rounded-lg bg-[#F2F4F7]" />)}
              {acc && !list.length && <li className="py-4 text-center text-[13px] text-ink-muted">{q ? "검색 결과가 없어요" : stateFilter === "on" ? "켜진 캠페인이 없어요" : stateFilter === "off" ? "꺼진 캠페인이 없어요" : "캠페인이 없어요"} — 방금 만들었다면 광고 관리자에서 &apos;게시&apos; 후 새로고침(↻)</li>}
              {list.map((x) => {
                const lock = lockReason(x, SUPPORTED_OBJECTIVES);
                const ok = !lock;
                const on = c.existingId === x.id;
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      disabled={!ok || p.disabled}
                      onClick={() => setC({ existingId: x.id })}
                      title={lock ?? `${x.name} (${x.id})`}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[14px] transition ${on ? "bg-[#FFF4EE] ring-1 ring-[#F6C3AE]" : "hover:bg-canvas"} disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[x.status] ?? "bg-[#98A2B3]"}`} />
                      <span className={`min-w-0 flex-1 truncate ${on ? "font-semibold text-ink" : "text-ink-soft"}`}>{x.name}</span>
                      <span className="shrink-0 rounded bg-[#F2F4F7] px-1.5 text-[12px] text-ink-muted">{OBJECTIVE_LABEL[x.objective] ?? x.objective}</span>
                      {(x.dailyBudget || x.lifetimeBudget) && <span className="shrink-0 rounded bg-[#EEF4FF] px-1.5 text-[12px] text-[#3538CD]" title={`캠페인 예산 ${won(x.dailyBudget ?? x.lifetimeBudget)}`}>CBO</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {current && (
              <p className="mt-2 rounded-lg bg-canvas px-3 py-1.5 text-[13px] text-ink-muted">
                {OBJECTIVE_LABEL[current.objective]} · {current.dailyBudget ? `캠페인 일 예산 ${won(current.dailyBudget)}` : current.lifetimeBudget ? `캠페인 총 예산 ${won(current.lifetimeBudget)}` : "광고세트 예산"} · 기존 세트{" "}
                {currentSets === "loading" ? "…" : Array.isArray(currentSets) ? `${currentSets.length}개` : "—"}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2.5">
            <input className={INP} value={c.name} onChange={(e) => setC({ name: e.target.value })} placeholder="캠페인 이름 (예: promotion_cv_fall_2026)" disabled={p.disabled} />
            <div className="grid grid-cols-2 gap-1.5">
              {NEW_OBJECTIVES.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  disabled={p.disabled}
                  onClick={() => {
                    setC({ objective: o.key });
                    p.setAdSets((l) => l.map((s) => ({ ...s, optimization: 0 })));
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-left transition ${c.objective === o.key ? "border-[#eb6834] bg-[#FFF8F4]" : "border-line hover:bg-canvas"}`}
                >
                  <p className="text-[14px] font-semibold text-ink">{o.label}</p>
                  <p className="text-[12px] text-ink-muted">{o.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className={`${SEG} w-[220px] shrink-0`}>
                <button type="button" className={segBtn(!c.cbo)} onClick={() => setC({ cbo: false })} title="광고세트마다 일 예산">
                  세트 예산
                </button>
                <button type="button" className={segBtn(c.cbo)} onClick={() => setC({ cbo: true, budget: c.budget ?? 100000 })} title="캠페인 예산(Advantage+ 캠페인 예산) — 메타가 세트에 나눔">
                  캠페인 예산
                </button>
              </div>
              {c.cbo && <MoneyInput value={c.budget} onChange={(v) => setC({ budget: v })} placeholder="일 예산" className="min-w-0 flex-1" />}
            </div>
            <p className="text-[12px] text-ink-muted">특수 광고 카테고리 없음 · 경매 · 최저 비용 입찰 · 꺼 둔 상태로 생성</p>
          </div>
        )}
        {campProblems.map((x) => (
          <p key={x.text} className="mt-2 text-[13px] text-[#C2410C]">
            · {x.text}
          </p>
        ))}
      </section>

      {/* ② 광고세트 */}
      <section id="meta-adsets" className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-3 flex items-center gap-2">
          <Step n={2} />
          <h3 className="text-[16px] font-bold text-ink">광고세트</h3>
          <span className="text-[13px] tabular-nums text-ink-muted">{p.adSets.length}개</span>
          {p.cbo && <span className="rounded bg-[#EEF4FF] px-1.5 text-[12px] text-[#3538CD]">캠페인 예산 — 세트 예산 없음</span>}
        </div>

        <div className="space-y-2">
          {p.adSets.map((s) => (
            <AdSetRow key={s.key} s={s} {...p} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <AddBtn icon="plus" label="새 세트" onClick={() => p.addAdSet()} disabled={p.disabled} />
          <AddBtn icon="copy" label="설정 복사" onClick={() => setPicker(picker === "copy" ? null : "copy")} active={picker === "copy"} disabled={p.disabled} title="잘 되는 세트의 타겟·최적화·게재 위치를 그대로 복사해 새 세트로" />
          <AddBtn icon="folder-plus" label="기존 세트에" onClick={() => setPicker(picker === "existing" ? null : "existing")} active={picker === "existing"} disabled={p.disabled || c.mode === "new"} title={c.mode === "new" ? "새 캠페인에는 기존 세트가 없어요" : "이미 있는 광고세트에 광고만 추가"} />
        </div>
        {picker && (
          <SourcePicker
            mode={picker}
            {...p}
            onPick={(src) => {
              const t = { gender: src.genders.filter((g) => g === 1 || g === 2).length === 1 ? (src.genders.includes(1) ? "m" : "f") : "all", ageMin: src.ageMin ?? 18, ageMax: src.ageMax ?? 65 } as const;
              if (picker === "existing") p.addAdSet({ mode: "existing", sourceId: src.id, name: src.name, ...t, budget: null, advantageAudience: src.advantageAudience });
              else p.addAdSet({ mode: "copy", sourceId: src.id, name: `${src.name}_copy`, ...t, budget: p.cbo ? null : src.dailyBudget, advantageAudience: src.advantageAudience, sourceEnd: src.endTime });
              setPicker(null);
            }}
          />
        )}
      </section>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF1EA] text-[13px] font-bold text-[#eb6834]">{n}</span>;
}
function AddBtn({ icon, label, onClick, disabled, active, title }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-dashed px-2 py-2 text-[13px] transition disabled:opacity-40 ${active ? "border-[#eb6834] bg-[#FFF8F4] font-semibold text-ink" : "border-[#D0D5DD] text-ink-soft hover:border-[#F6C3AE] hover:text-ink"}`}>
      <i className={`ti ti-${icon} text-[14px]`} aria-hidden />
      {label}
    </button>
  );
}

// 복사할 세트 / 광고를 넣을 세트 고르기 — 복사는 다른 캠페인의 세트도(같은 목표 권장)
function SourcePicker(p: Parameters<typeof StructurePanel>[0] & { mode: "copy" | "existing"; onPick: (s: MetaAdSetLite) => void }) {
  const cur = p.campaign.mode === "existing" ? p.campaign.existingId : null;
  const [cid, setCid] = useState<string>(cur ?? p.acc?.campaigns.find((x) => x.status === "ACTIVE" && x.objective === p.objective)?.id ?? p.acc?.campaigns[0]?.id ?? "");
  const camp = p.acc?.campaigns.find((x) => x.id === cid);
  const st = cid ? p.adSetsByCampaign[cid] : undefined;
  const { loadAdSets } = p;
  useEffect(() => {
    if (cid && st === undefined) loadAdSets(cid);
  }, [cid, st, loadAdSets]);
  const [q, setQ] = useState("");
  const rows = Array.isArray(st) ? st.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())) : [];
  const used = new Set(p.adSets.filter((s) => s.mode === "existing").map((s) => s.sourceId));
  return (
    <div className="mt-2 rounded-xl border border-[#F6C3AE] bg-[#FFFBF9] p-2.5">
      <p className="mb-1.5 text-[13px] font-semibold text-ink">{p.mode === "copy" ? "설정을 복사할 세트" : "광고를 추가할 세트"}</p>
      <div className="flex gap-1.5">
        {p.mode === "copy" && (
          <select className={`${INP} min-w-0 flex-1`} value={cid} onChange={(e) => setCid(e.target.value)}>
            {p.acc?.campaigns
              .filter((x) => SUPPORTED_OBJECTIVES.includes(x.objective))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.status === "ACTIVE" ? "● " : "○ "}
                  {x.name}
                </option>
              ))}
          </select>
        )}
        <input className={`${INP} ${p.mode === "copy" ? "w-[120px]" : "flex-1"}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="세트 검색" />
      </div>
      {p.mode === "copy" && camp && p.objective && camp.objective !== p.objective && <p className="mt-1 text-[12px] text-[#C2410C]">이 캠페인은 목표가 달라요({OBJECTIVE_LABEL[camp.objective]}) — 최적화가 안 맞으면 메타가 거절할 수 있어요</p>}
      <ul className="mt-1.5 max-h-[220px] space-y-0.5 overflow-y-auto">
        {st === "loading" && <li className="py-3 text-center text-[13px] text-ink-muted">불러오는 중…</li>}
        {st && typeof st === "object" && "error" in st && <li className="py-2 text-[13px] text-bad">{st.error}</li>}
        {Array.isArray(st) && !rows.length && <li className="py-3 text-center text-[13px] text-ink-muted">세트가 없어요</li>}
        {rows.map((s) => (
          <li key={s.id}>
            <button type="button" disabled={p.mode === "existing" && used.has(s.id)} onClick={() => p.onPick(s)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white disabled:opacity-40">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[s.status] ?? "bg-[#98A2B3]"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink">{s.name}</span>
                <span className="block truncate text-[12px] text-ink-muted">
                  {genderLabel(s.genders)} {s.ageMin ?? "?"}–{s.ageMax ?? "?"}세 · {s.pixelEvent ?? s.optimizationGoal} · {s.placements}
                  {s.dailyBudget ? ` · ${won(s.dailyBudget)}/일` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
const genderLabel = (g: number[]) => {
  const x = g.filter((v) => v === 1 || v === 2);
  return x.length === 1 ? (x[0] === 1 ? "남성" : "여성") : "전체";
};

function AdSetRow({ s, ...p }: Parameters<typeof StructurePanel>[0] & { s: AdSetDraft }) {
  const [open, setOpen] = useState(false);
  const set = (x: Partial<AdSetDraft>) =>
    p.setAdSets((l) =>
      l.map((v) => {
        if (v.key !== s.key) return v;
        const n = { ...v, ...x };
        // 이름을 손대지 않았으면 성별·연령에 맞춰 자동 이름 갱신
        if (v.mode === "new" && v.name === adSetAutoName(v) && ("gender" in x || "ageMin" in x || "ageMax" in x)) n.name = adSetAutoName(n);
        return n;
      }),
    );
  const probs = p.problems.filter((x) => x.target === s.key);
  const focused = p.focus === s.key;
  const readOnly = s.mode === "existing";
  const opts = p.objective ? OPTIMIZATION[p.objective] ?? [] : [];
  const linked = s.ads.filter((k) => p.ads.some((a) => a.key === k)).length;
  const MODE = { new: { t: "새로", c: "bg-[#ECFDF3] text-[#067647]" }, copy: { t: "복사", c: "bg-[#EEF4FF] text-[#3538CD]" }, existing: { t: "기존", c: "bg-[#F2F4F7] text-ink-soft" } }[s.mode];
  return (
    <div id={`meta-${s.key}`} onFocus={() => p.setFocus(s.key)} className={`rounded-xl border p-2.5 transition ${focused ? "border-[#F6C3AE] bg-[#FFFBF9]" : probs.length ? "border-[#FAD9CB]" : "border-[#EAECF0]"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`shrink-0 rounded px-1.5 py-px text-[12px] font-semibold ${MODE.c}`}>{MODE.t}</span>
        <input className={`${INP} min-w-0 flex-1 py-1 font-semibold`} value={s.name} onChange={(e) => set({ name: e.target.value })} disabled={readOnly || p.disabled} title={s.name} />
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] tabular-nums ${linked ? "bg-[#FFF1EA] text-[#B93815]" : "bg-[#FEF3F2] text-bad"}`} title="연결된 광고 수 — 오른쪽 표의 이 세트 열에서 바꿉니다">
          광고 {linked}
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas" aria-label="상세 설정" title="기간·최적화·게재 위치">
          <i className={`ti ti-chevron-${open ? "up" : "down"} text-[15px]`} aria-hidden />
        </button>
        <button type="button" onClick={() => p.setAdSets((l) => l.filter((v) => v.key !== s.key))} disabled={p.disabled} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-[#FEF3F2] hover:text-bad" aria-label="세트 빼기">
          <i className="ti ti-x text-[15px]" aria-hidden />
        </button>
      </div>

      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <div className={`${SEG} w-[132px]`}>
            {(["all", "f", "m"] as const).map((g) => (
              <button key={g} type="button" className={segBtn(s.gender === g)} onClick={() => set({ gender: g })} disabled={p.disabled}>
                {{ all: "전체", f: "여", m: "남" }[g]}
              </button>
            ))}
          </div>
          <select className={`${INP} w-[64px] px-1.5`} value={s.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} aria-label="최소 연령">
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span className="text-ink-faint">–</span>
          <select className={`${INP} w-[70px] px-1.5`} value={s.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} aria-label="최대 연령">
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a === 65 ? "65+" : a}
              </option>
            ))}
          </select>
          {!p.cbo && <MoneyInput value={s.budget} onChange={(v) => set({ budget: v })} placeholder={s.mode === "copy" ? "원본 유지" : "일 예산"} className="min-w-[120px] flex-1" />}
        </div>
      )}
      {readOnly && <p className="mt-1 text-[12px] text-ink-muted">이 세트 설정은 그대로 두고 광고만 추가합니다</p>}

      {open && !readOnly && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-2">
          <label className="text-[12px] text-ink-muted">
            시작일 <span className="text-ink-faint">(비우면 바로)</span>
            <input type="date" className={INP} value={s.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
          <label className="text-[12px] text-ink-muted">
            종료일 <span className="text-ink-faint">(비우면 계속)</span>
            <input type="date" className={INP} value={s.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </label>
          {s.mode === "new" && (
            <>
              <label className="text-[12px] text-ink-muted">
                최적화
                <select className={INP} value={s.optimization} onChange={(e) => set({ optimization: Number(e.target.value) })}>
                  {opts.map((o, i) => (
                    <option key={`${o.goal}${o.event}`} value={i}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] text-ink-muted">
                게재 위치
                <select className={INP} value={s.placement} onChange={(e) => set({ placement: e.target.value as AdSetDraft["placement"] })}>
                  {PLACEMENT_MODES.map((m) => (
                    <option key={m.key} value={m.key} title={m.desc}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex items-center gap-2 text-[13px] text-ink-soft" title="메타가 설정한 연령·성별 밖으로도 넓혀 찾습니다(제안으로 취급). 끄면 정한 범위만">
                <input type="checkbox" className="accent-[#eb6834]" checked={s.advantageAudience} onChange={(e) => set({ advantageAudience: e.target.checked })} />
                Advantage+ 타겟(범위 밖 확장) — 지역 대한민국
              </label>
            </>
          )}
          {s.mode === "new" && (
          <label className="col-span-2 text-[12px] text-ink-muted">
            기여 설정
            <select className={INP} value={s.attribution ?? ""} onChange={(e) => set({ attribution: (e.target.value || null) as AdSetDraft["attribution"] })}>
              <option value="">{`목표 기본 — ${ATTRIBUTIONS.find((a) => a.key === defaultAttribution(p.objective ?? ""))?.label}`}</option>
              {ATTRIBUTIONS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          )}
          <AudiencePicker label="포함 타겟" list={p.audiences} value={s.includeAudiences} onChange={(v) => set({ includeAudiences: v })} copy={s.mode === "copy"} />
          <AudiencePicker label="제외 타겟" list={p.audiences} value={s.excludeAudiences} onChange={(v) => set({ excludeAudiences: v })} copy={s.mode === "copy"} />
          {s.mode === "copy" && <p className="col-span-2 text-[12px] text-ink-muted">관심사·최적화·입찰·게재 위치·기여 설정은 원본 그대로 복사하고(기여 설정은 메타가 생성 뒤 변경을 막음), 이름·예산·기간·성별·연령과 위에서 바꾼 맞춤 타겟만 반영합니다.</p>}
        </div>
      )}
      {probs.map((x) => (
        <p key={x.text} className="mt-1 text-[12px] text-[#C2410C]">
          · {x.text}
        </p>
      ))}
    </div>
  );
}

// 맞춤·유사 타겟 고르기 — 검색 + 체크(모두 선택·해제). 복사 세트는 '원본 그대로'(null)가 기본
function AudiencePicker({ label, list, value, onChange, copy }: { label: string; list: MetaAudience[] | null; value: string[] | null; onChange: (v: string[] | null) => void; copy: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const picked = value ?? [];
  const shown = (list ?? []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  const summary = value === null ? (copy ? "원본 그대로" : "없음") : picked.length ? picked.map((id) => list?.find((a) => a.id === id)?.name ?? id).join(", ") : "없음";
  return (
    <div className="col-span-2 text-[12px] text-ink-muted">
      {label}
      <button type="button" onClick={() => setOpen(!open)} className={`${INP} flex items-center justify-between gap-2 text-left`}>
        <span className={`truncate ${picked.length ? "text-ink" : "text-ink-muted"}`}>{summary}</span>
        <i className={`ti ti-chevron-${open ? "up" : "down"} shrink-0 text-[14px]`} aria-hidden />
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-line bg-white p-2">
          <div className="mb-1 flex items-center gap-2">
            <input className={`${INP} py-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="타겟 이름 검색" />
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px]">
              <button type="button" className="font-semibold text-[#C2410C]" onClick={() => onChange([...new Set([...picked, ...shown.map((a) => a.id)])])}>
                모두 선택
              </button>
              <span className="text-ink-faint">·</span>
              <button type="button" className="text-ink-soft" onClick={() => onChange([])}>
                모두 해제
              </button>
              {copy && (
                <>
                  <span className="text-ink-faint">·</span>
                  <button type="button" className="text-ink-soft" onClick={() => onChange(null)}>
                    원본 그대로
                  </button>
                </>
              )}
            </span>
          </div>
          <ul className="max-h-[180px] space-y-0.5 overflow-y-auto">
            {!list && <li className="py-2 text-center text-ink-muted">불러오는 중…</li>}
            {shown.map((a) => (
              <li key={a.id}>
                <label className={`flex items-center gap-2 rounded px-1.5 py-1 hover:bg-canvas ${a.ok ? "" : "opacity-50"}`} title={a.ok ? undefined : "메타가 지금 사용할 수 없는 타겟"}>
                  <input type="checkbox" className="accent-[#eb6834]" checked={picked.includes(a.id)} onChange={(e) => onChange(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.name}</span>
                  {a.size && <span className="shrink-0 tabular-nums text-ink-faint">{a.size.toLocaleString("ko-KR")}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
