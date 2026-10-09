"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 수동 세팅(GFA) — 한 화면에서 캠페인·광고그룹·소재를 모두 만든다.
// 왼쪽 = 구조(캠페인 → 광고그룹 → 소재, 추가·복제·삭제), 오른쪽 = 고른 항목의 GFA 설정, 아래 = 점검 + 실행(확인 창 = 승인).
// 실행 전에는 GFA에 아무것도 보내지 않는다. 기존 캠페인·광고그룹을 골라 그 아래에만 추가할 수도 있다.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GfaCodeBook } from "../adSetSheet";
import type { CampaignOptions } from "../gfaOps";
import { OBJECTIVE_LABEL, SUPPORTED_OBJECTIVES, type GfaCampaignLite, type GfaContext } from "../types";
import { postAutopilot as post, type LogLine } from "../runner";
import { CHIP, RunLog, won } from "../ui";
import { AdSetEditor } from "./AdSetEditor";
import { CampaignEditor } from "./CampaignEditor";
import { CreativeEditor } from "./CreativeEditor";
import {
  CREATIVE_KINDS,
  allProblems,
  cboOn,
  cloneAdSet,
  cloneCreative,
  creativeUnits,
  existingAdSet,
  existingCampaign,
  newAdSet,
  newCampaign,
  newCreative,
  type AdSetDraft,
  type CampaignDraft,
  type CreativeDraft,
  type Objective,
} from "./model";
import { runManual, type ManualResult } from "./run";

type Sel = { c: string; a?: string; k?: string } | null;

export function ManualSetup({ clientId, clientName }: { clientId: string; clientName: string }) {
  // GFA 읽기 — 기존 캠페인 목록 · 코드표(타겟) · 새 캠페인 선택지(목적별) · 기존 캠페인 정보
  const [campaigns, setCampaigns] = useState<GfaCampaignLite[] | null>(null);
  const [accountNo, setAccountNo] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [book, setBook] = useState<GfaCodeBook | null>(null);
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [options, setOptions] = useState<Partial<Record<Objective, CampaignOptions>>>({});
  const [optionsErr, setOptionsErr] = useState<string | null>(null);
  const [ctxs, setCtxs] = useState<Record<number, GfaContext>>({});

  // 초안
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [picker, setPicker] = useState(false);
  const [pickQ, setPickQ] = useState("");

  // 실행
  const [turnOn, setTurnOn] = useState(false);
  const [useUtm, setUseUtm] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ManualResult | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await post<{ adAccountNo: string; campaigns: GfaCampaignLite[] }>({ action: "campaigns", clientId });
      setCampaigns(r.campaigns);
      setAccountNo(r.adAccountNo);
    } catch (e) {
      setLoadErr((e as Error).message);
    }
    post<GfaCodeBook>({ action: "codebook", clientId })
      .then(setBook)
      .catch((e) => setBookErr(`타겟 목록(지역·관심사 등)을 못 불러왔어요 — ${(e as Error).message}`));
  }, [clientId]);

  // 광고주가 바뀌면 처음부터
  useEffect(() => {
    setCampaigns(null);
    setBook(null);
    setOptions({});
    setCtxs({});
    setDrafts([]);
    setSel(null);
    setLog([]);
    setResult(null);
    setRanOnce(false);
    load();
  }, [load]);

  // 새 캠페인 목적의 선택지(브랜드·대표 URL·전환 추적 대상)
  const needObjectives = [...new Set(drafts.filter((d) => !d.existing).map((d) => d.objective))];
  useEffect(() => {
    for (const o of needObjectives) {
      if (options[o]) continue;
      post<CampaignOptions>({ action: "campaignOptions", clientId, objective: o })
        .then((r) => setOptions((m) => ({ ...m, [o]: r })))
        .catch((e) => setOptionsErr(`브랜드·대표 URL을 못 불러왔어요 — ${(e as Error).message}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needObjectives.join(","), clientId]);

  // 브랜드가 비어 있으면 광고주 이름과 같은 브랜드로 채운다(하나일 때만)
  useEffect(() => {
    const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
    const patch = drafts.map((d) => {
      if (d.existing || d.brandNo) return d;
      const list = options[d.objective]?.brands ?? [];
      const hit = list.filter((b) => norm(clientName).includes(norm(b.name)) || norm(b.name).includes(norm(clientName)));
      return hit.length === 1 ? { ...d, brandNo: hit[0].no } : d;
    });
    if (patch.some((d, i) => d !== drafts[i])) setDrafts(patch);
  }, [options, drafts, clientName]);

  // 페이지를 떠나면 초안(이미지 포함)이 사라진다
  useEffect(() => {
    if (!drafts.length || ranOnce) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [drafts.length, ranOnce]);

  // ── 초안 편집 ──
  const patchCampaign = (c: string, p: Partial<CampaignDraft>) => setDrafts((ds) => ds.map((d) => (d.key === c ? { ...d, ...p } : d)));
  const patchAdSet = (c: string, a: string, p: Partial<AdSetDraft>) => setDrafts((ds) => ds.map((d) => (d.key === c ? { ...d, adSets: d.adSets.map((x) => (x.key === a ? { ...x, ...p } : x)) } : d)));
  const patchCreative = (c: string, a: string, k: string, p: Partial<CreativeDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === c ? { ...d, adSets: d.adSets.map((x) => (x.key === a ? { ...x, creatives: x.creatives.map((y) => (y.key === k ? { ...y, ...p } : y)) } : x)) } : d)));

  function addNewCampaign() {
    const c = newCampaign();
    const a = newAdSet(c, null, 0);
    c.adSets = [a];
    setDrafts((ds) => [...ds, c]);
    setSel({ c: c.key });
  }

  async function addExistingCampaign(x: GfaCampaignLite) {
    setPicker(false);
    setPickQ("");
    const c = existingCampaign({ no: x.no, name: x.name, objective: x.objective, cbo: x.cbo });
    setDrafts((ds) => [...ds, c]);
    setSel({ c: c.key });
    if (!ctxs[x.no]) {
      try {
        const ctx = await post<GfaContext>({ action: "context", clientId, campaignNo: x.no });
        setCtxs((m) => ({ ...m, [x.no]: ctx }));
      } catch (e) {
        setLoadErr(`캠페인 #${x.no} 정보를 못 불러왔어요 — ${(e as Error).message}`);
      }
    }
  }

  function addAdSet(c: CampaignDraft) {
    const ctx = c.existing ? ctxs[c.existing.no] ?? null : null;
    const prev = [...c.adSets].reverse().find((x) => !x.existingNo);
    // 앞 광고그룹이 있으면 설정을 이어받고(소재는 빼고) 이름만 새로
    const a = prev ? { ...cloneAdSet(prev), creatives: [], name: newAdSet(c, ctx, c.adSets.length).name } : newAdSet(c, ctx, c.adSets.length);
    patchCampaign(c.key, { adSets: [...c.adSets, a] });
    setSel({ c: c.key, a: a.key });
  }

  function addExistingAdSet(c: CampaignDraft, no: number) {
    const s = c.existing && ctxs[c.existing.no]?.existingAdSets.find((x) => x.no === no);
    if (!s) return;
    const a = existingAdSet(s.no, s.name);
    patchCampaign(c.key, { adSets: [...c.adSets, a] });
    setSel({ c: c.key, a: a.key });
  }

  function addCreative(c: CampaignDraft, a: AdSetDraft, kind: CreativeDraft["kind"] = "SINGLE_IMAGE") {
    const prev = a.creatives[a.creatives.length - 1];
    const k = newCreative(prev?.kind ?? kind, a.name.trim(), a.creatives.length);
    // 앞 소재의 랜딩·CTA·규격은 이어받는다(같은 광고그룹은 보통 같은 랜딩)
    if (prev) Object.assign(k, { landingUrl: prev.landingUrl, templates: [...prev.templates], copy: { ...k.copy, cta: prev.copy.cta } });
    patchAdSet(c.key, a.key, { creatives: [...a.creatives, k] });
    setSel({ c: c.key, a: a.key, k: k.key });
  }

  function remove(s: NonNullable<Sel>) {
    if (s.k) {
      setDrafts((ds) => ds.map((d) => (d.key === s.c ? { ...d, adSets: d.adSets.map((x) => (x.key === s.a ? { ...x, creatives: x.creatives.filter((y) => y.key !== s.k) } : x)) } : d)));
      setSel({ c: s.c, a: s.a });
    } else if (s.a) {
      setDrafts((ds) => ds.map((d) => (d.key === s.c ? { ...d, adSets: d.adSets.filter((x) => x.key !== s.a) } : d)));
      setSel({ c: s.c });
    } else {
      setDrafts((ds) => ds.filter((d) => d.key !== s.c));
      setSel(null);
    }
  }

  function duplicate(s: NonNullable<Sel>) {
    const c = drafts.find((d) => d.key === s.c);
    const a = c?.adSets.find((x) => x.key === s.a);
    if (!c) return;
    if (s.k && a) {
      const k = a.creatives.find((y) => y.key === s.k);
      if (!k) return;
      const n = cloneCreative(k);
      patchAdSet(c.key, a.key, { creatives: [...a.creatives, n] });
      setSel({ c: c.key, a: a.key, k: n.key });
    } else if (a) {
      const n = cloneAdSet(a);
      patchCampaign(c.key, { adSets: [...c.adSets, n] });
      setSel({ c: c.key, a: n.key });
    } else if (!c.existing) {
      const n: CampaignDraft = { ...c, key: `${c.key}x${Date.now().toString(36)}`, name: `${c.name}_복사`, adSets: c.adSets.filter((x) => !x.existingNo).map(cloneAdSet) };
      setDrafts((ds) => [...ds, n]);
      setSel({ c: n.key });
    }
  }

  // ── 점검·요약 ──
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
  const problems = useMemo(() => allProblems(drafts, now), [drafts, now]);
  const badKeys = new Set(problems.map((p) => p.key));
  const summary = useMemo(() => {
    const newCamps = drafts.filter((d) => !d.existing).length;
    const adSets = drafts.flatMap((d) => d.adSets.map((a) => ({ a, cbo: cboOn(d) })));
    const fresh = adSets.filter((x) => !x.a.existingNo);
    return {
      newCamps,
      oldCamps: drafts.length - newCamps,
      newAdSets: fresh.length,
      oldAdSets: adSets.length - fresh.length,
      creatives: adSets.reduce((s, x) => s + x.a.creatives.reduce((n, k) => n + creativeUnits(k), 0), 0),
      daily: fresh.filter((x) => !x.cbo && x.a.budgetType === "DAILY").reduce((s, x) => s + x.a.budgetAmount, 0),
    };
  }, [drafts]);

  const cur = sel ? drafts.find((d) => d.key === sel.c) ?? null : null;
  const curA = cur && sel?.a ? cur.adSets.find((x) => x.key === sel.a) ?? null : null;
  const curK = curA && sel?.k ? curA.creatives.find((x) => x.key === sel.k) ?? null : null;

  async function run() {
    if (problems.length || !drafts.length) return;
    const lines = [
      `GFA 광고계정 ${accountNo}에 아래 내용을 만듭니다.`,
      summary.newCamps ? `· 새 캠페인 ${summary.newCamps}개` : "",
      summary.oldCamps ? `· 기존 캠페인 ${summary.oldCamps}개에 추가` : "",
      `· 새 광고그룹 ${summary.newAdSets}개${summary.oldAdSets ? ` + 기존 광고그룹 ${summary.oldAdSets}개에 소재 추가` : ""}`,
      `· 소재 ${summary.creatives}개`,
      summary.daily ? `· 새 광고그룹 일 예산 합계 ${won(summary.daily)}` : "",
      turnOn ? "· 만든 뒤 바로 켭니다(검수 후 게재 — 광고비가 나갑니다)." : "· 꺼진 상태로 만듭니다.",
      ranOnce ? "\n이미 한 번 실행했어요. 다시 실행하면 같은 캠페인·광고그룹이 또 만들어집니다." : "",
      "\n실행할까요?",
    ];
    if (!window.confirm(lines.filter(Boolean).join("\n"))) return;
    setRunning(true);
    setResult(null);
    setLog([]);
    const out = await runManual({ clientId, campaigns: drafts, turnOn, useUtm, onLog: setLog });
    setResult(out);
    setRunning(false);
    setRanOnce(true);
  }

  // ── 화면 ──
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, "");
  const pickable = (campaigns ?? []).filter((x) => SUPPORTED_OBJECTIVES.includes(x.objective) && (!pickQ || norm(x.name).includes(norm(pickQ)) || String(x.no).includes(pickQ)));

  return (
    <div className="space-y-6">
      {loadErr && <p className="rounded-xl bg-[#FEF3F2] px-4 py-3 text-[14px] text-bad">{loadErr}</p>}

      {!drafts.length ? (
        <section className="rounded-2xl border border-[#EAECF0] bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <h3 className="text-[20px] font-bold text-ink">무엇을 만들까요?</h3>
          <p className="mt-1 text-[15px] text-ink-muted">캠페인 → 광고그룹 → 소재를 한 화면에서 차례로 채우고, 마지막에 한 번 확인하면 GFA에 만들어집니다.{accountNo && ` (GFA 광고계정 ${accountNo})`}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <button type="button" onClick={addNewCampaign} className="group rounded-2xl border border-[#EAECF0] p-6 text-left transition hover:-translate-y-0.5 hover:border-[#F6C3AE] hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,0.18)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1EA] text-[22px] text-[#eb6834]">
                <i className="ti ti-folder-plus" aria-hidden />
              </span>
              <p className="mt-4 text-[17px] font-bold text-ink">새 캠페인부터 만들기</p>
              <p className="mt-1 text-[14px] text-ink-muted">목적·브랜드·대표 URL부터 광고그룹 타겟·예산, 소재까지 전부</p>
            </button>
            <button
              type="button"
              onClick={() => setPicker(true)}
              disabled={!campaigns}
              className="group rounded-2xl border border-[#EAECF0] p-6 text-left transition hover:-translate-y-0.5 hover:border-[#F6C3AE] hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,0.18)] disabled:opacity-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2F4F7] text-[22px] text-ink-soft">
                <i className="ti ti-folder-open" aria-hidden />
              </span>
              <p className="mt-4 text-[17px] font-bold text-ink">기존 캠페인에 추가하기</p>
              <p className="mt-1 text-[14px] text-ink-muted">GFA에 있는 캠페인을 골라 광고그룹·소재만 추가{!campaigns && " (불러오는 중…)"}</p>
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* 구조 */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="flex items-center justify-between border-b border-[#F2F4F7] px-4 py-3">
                <p className="text-[15px] font-bold text-ink">세팅 구조</p>
                <span className="text-[12px] text-ink-muted">{accountNo && `광고계정 ${accountNo}`}</span>
              </div>
              <div className="max-h-[calc(100vh-260px)] space-y-1 overflow-y-auto p-2">
                {drafts.map((c) => (
                  <div key={c.key}>
                    <TreeRow
                      depth={0}
                      icon={c.existing ? "ti-folder" : "ti-folder-plus"}
                      label={c.existing?.name ?? (c.name.trim() || "새 캠페인")}
                      sub={`${c.existing ? "기존" : "새 캠페인"} · ${OBJECTIVE_LABEL[c.existing?.objective ?? c.objective] ?? ""}`}
                      tag={c.existing ? undefined : "새"}
                      active={sel?.c === c.key && !sel.a}
                      bad={badKeys.has(c.key)}
                      onClick={() => setSel({ c: c.key })}
                    />
                    {c.adSets.map((a) => (
                      <div key={a.key}>
                        <TreeRow
                          depth={1}
                          icon={a.existingNo ? "ti-users" : "ti-users-plus"}
                          label={a.name || "광고그룹"}
                          sub={a.existingNo ? "기존 광고그룹" : cboOn(c) ? "CBO" : `${a.budgetType === "DAILY" ? "일" : "총"} ${won(a.budgetAmount)}`}
                          tag={a.existingNo ? undefined : "새"}
                          active={sel?.a === a.key && !sel.k}
                          bad={badKeys.has(a.key)}
                          onClick={() => setSel({ c: c.key, a: a.key })}
                        />
                        {a.creatives.map((k) => (
                          <TreeRow
                            key={k.key}
                            depth={2}
                            icon={k.kind === "MULTIPLE_IMAGE" ? "ti-layout-cards" : k.kind === "IMAGE_BANNER" ? "ti-rectangle" : "ti-photo"}
                            thumb={k.image?.url ?? k.cards.find((x) => x.image)?.image?.url}
                            label={k.name || "소재"}
                            sub={`${CREATIVE_KINDS.find((x) => x.key === k.kind)?.label}${creativeUnits(k) > 1 ? ` · ${creativeUnits(k)}개 규격` : ""}`}
                            active={sel?.k === k.key}
                            bad={badKeys.has(k.key)}
                            onClick={() => setSel({ c: c.key, a: a.key, k: k.key })}
                          />
                        ))}
                        <AddButton depth={2} label="소재 추가" onClick={() => addCreative(c, a)} />
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center">
                      <AddButton depth={1} label="광고그룹 추가" onClick={() => addAdSet(c)} />
                      {c.existing && (ctxs[c.existing.no]?.existingAdSets.length ?? 0) > 0 && (
                        <select
                          className="ml-1 max-w-[150px] rounded-md border border-line bg-white px-2 py-1 text-[12px] text-ink-soft"
                          value=""
                          onChange={(e) => e.target.value && addExistingAdSet(c, Number(e.target.value))}
                        >
                          <option value="">+ 기존 광고그룹에</option>
                          {ctxs[c.existing.no].existingAdSets
                            .filter((s) => !c.adSets.some((x) => x.existingNo === s.no))
                            .map((s) => (
                              <option key={s.no} value={s.no}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#F2F4F7] p-3">
                <button type="button" onClick={addNewCampaign} className={CHIP}>
                  + 새 캠페인
                </button>
                <button type="button" onClick={() => setPicker(true)} disabled={!campaigns} className={`${CHIP} disabled:opacity-40`}>
                  + 기존 캠페인
                </button>
              </div>
            </div>
          </aside>

          {/* 편집 */}
          <section className="min-w-0 rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {cur ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F2F4F7] px-6 py-4">
                  <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-[14px]">
                    <button type="button" onClick={() => setSel({ c: cur.key })} className={`truncate ${curA ? "text-ink-muted hover:text-ink" : "font-bold text-ink"}`}>
                      {cur.existing?.name ?? (cur.name.trim() || "새 캠페인")}
                    </button>
                    {curA && (
                      <>
                        <i className="ti ti-chevron-right text-ink-faint" aria-hidden />
                        <button type="button" onClick={() => setSel({ c: cur.key, a: curA.key })} className={`truncate ${curK ? "text-ink-muted hover:text-ink" : "font-bold text-ink"}`}>
                          {curA.name}
                        </button>
                      </>
                    )}
                    {curK && (
                      <>
                        <i className="ti ti-chevron-right text-ink-faint" aria-hidden />
                        <span className="truncate font-bold text-ink">{curK.name}</span>
                      </>
                    )}
                  </nav>
                  <div className="flex items-center gap-1.5">
                    {(curK || (curA && !curA.existingNo) || (!curA && !cur.existing)) && (
                      <button type="button" onClick={() => sel && duplicate(sel)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] text-ink-soft hover:bg-canvas hover:text-ink">
                        <i className="ti ti-copy" aria-hidden /> 복제
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => sel && window.confirm(curK ? "이 소재를 뺄까요?" : curA ? "이 광고그룹과 아래 소재를 뺄까요?" : "이 캠페인과 아래 광고그룹·소재를 뺄까요?") && remove(sel)}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] text-ink-soft hover:bg-[#FEF3F2] hover:text-bad"
                    >
                      <i className="ti ti-trash" aria-hidden /> 빼기
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {curK && curA ? (
                    <CreativeEditor k={curK} onChange={(p) => patchCreative(cur.key, curA.key, curK.key, p)} />
                  ) : curA ? (
                    <>
                      <AdSetEditor campaign={cur} a={curA} ctx={cur.existing ? ctxs[cur.existing.no] ?? null : null} book={book} bookErr={bookErr} onChange={(p) => patchAdSet(cur.key, curA.key, p)} />
                      <NextStep label={curA.creatives.length ? "다음: 소재 확인" : "다음: 소재 추가"} onClick={() => (curA.creatives.length ? setSel({ c: cur.key, a: curA.key, k: curA.creatives[0].key }) : addCreative(cur, curA))} />
                    </>
                  ) : (
                    <>
                      <CampaignEditor c={cur} options={options[cur.objective] ?? null} optionsErr={cur.existing ? null : optionsErr} onChange={(p) => patchCampaign(cur.key, p)} />
                      <NextStep label={cur.adSets.length ? "다음: 광고그룹 설정" : "다음: 광고그룹 추가"} onClick={() => (cur.adSets.length ? setSel({ c: cur.key, a: cur.adSets[0].key }) : addAdSet(cur))} />
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="p-10 text-center text-[15px] text-ink-muted">왼쪽에서 캠페인·광고그룹·소재를 눌러 설정하세요.</p>
            )}
          </section>
        </div>
      )}

      {/* 실행 */}
      {drafts.length > 0 && (
        <section className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 space-y-3">
              <h3 className="text-[18px] font-bold text-ink">확인·실행</h3>
              <div className="flex flex-wrap gap-2 text-[14px]">
                {[
                  summary.newCamps ? `새 캠페인 ${summary.newCamps}` : "",
                  summary.oldCamps ? `기존 캠페인 ${summary.oldCamps}` : "",
                  `새 광고그룹 ${summary.newAdSets}`,
                  summary.oldAdSets ? `기존 광고그룹 ${summary.oldAdSets}` : "",
                  `소재 ${summary.creatives}`,
                  summary.daily ? `일 예산 합계 ${won(summary.daily)}` : "",
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-[#F2F4F7] px-3 py-1 tabular-nums text-ink">
                      {t}
                    </span>
                  ))}
              </div>
              <label className="flex items-start gap-2 text-[14px] text-ink-soft">
                <input type="checkbox" className="mt-1" checked={useUtm} onChange={(e) => setUseUtm(e.target.checked)} />
                <span>
                  랜딩 URL에 UTM 자동 추가 <span className="text-ink-muted">(source=naver · medium=gfa · campaign=캠페인명 · content=소재명, 이미 UTM이 있으면 그대로)</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[14px] text-ink-soft">
                <input type="checkbox" className="mt-1" checked={turnOn} onChange={(e) => setTurnOn(e.target.checked)} />
                <span>
                  만든 뒤 바로 켜기 <span className="text-ink-muted">(새 캠페인·새 광고그룹만, 기존 것은 그대로 — 끄면 GFA에서 확인 후 켭니다)</span>
                </span>
              </label>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button type="button" onClick={run} disabled={running || problems.length > 0} className="rounded-xl bg-[#eb6834] px-6 py-3 text-[16px] font-bold text-white shadow-[0_1px_3px_rgba(235,104,52,0.4)] hover:bg-[#d95926] disabled:opacity-40">
                {running ? "세팅 중…" : `🚀 GFA에 세팅 실행 (소재 ${summary.creatives}개)`}
              </button>
              <span className="text-[13px] text-ink-muted">버튼을 누르고 확인 창에서 [확인]을 누르는 것이 승인입니다</span>
            </div>
          </div>
          {problems.length > 0 && (
            <div className="mt-5 rounded-xl bg-[#FFFAEB] px-4 py-3 ring-1 ring-[#FEDF89]">
              <p className="text-[14px] font-semibold text-[#B54708]">실행 전에 채워야 할 항목 {problems.length}개 — 누르면 그 항목으로 이동</p>
              <ul className="mt-2 space-y-1">
                {problems.slice(0, 12).map((p, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setSel(findSel(drafts, p.key))} className="text-left text-[14px] text-ink-soft underline-offset-2 hover:text-ink hover:underline">
                      {p.text}
                    </button>
                  </li>
                ))}
                {problems.length > 12 && <li className="text-[13px] text-ink-muted">… 외 {problems.length - 12}개</li>}
              </ul>
            </div>
          )}
        </section>
      )}

      <RunLog title="세팅 결과" log={log} result={result} running={running} />

      {/* 기존 캠페인 고르기 */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onClick={() => setPicker(false)}>
          <div className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-line p-4">
              <p className="text-[16px] font-bold text-ink">기존 캠페인 고르기</p>
              <input autoFocus className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-[15px] outline-none focus:border-[#eb6834]" placeholder="캠페인 이름·ID 검색" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {!pickable.length && <p className="p-4 text-[14px] text-ink-muted">맞는 캠페인이 없어요(전환·웹사이트 트래픽·참여 유도 캠페인만 고를 수 있어요)</p>}
              {pickable.map((x) => (
                <button key={x.no} type="button" onClick={() => addExistingCampaign(x)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-canvas">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${x.activated ? "bg-[#17B26A]" : "bg-[#98A2B3]"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{x.name}</span>
                    <span className="text-[12px] text-ink-muted">
                      ID {x.no} · {OBJECTIVE_LABEL[x.objective] ?? x.objective}
                      {x.cbo && " · CBO"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function findSel(drafts: CampaignDraft[], key: string): Sel {
  for (const c of drafts) {
    if (c.key === key) return { c: c.key };
    for (const a of c.adSets) {
      if (a.key === key) return { c: c.key, a: a.key };
      for (const k of a.creatives) if (k.key === key) return { c: c.key, a: a.key, k: k.key };
    }
  }
  return null;
}

function TreeRow({ depth, icon, thumb, label, sub, tag, active, bad, onClick }: { depth: number; icon: string; thumb?: string; label: string; sub?: string; tag?: string; active: boolean; bad: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 18 }}
      className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left transition ${active ? "bg-[#FFF1EA] ring-1 ring-[#FAD9CB]" : "hover:bg-canvas"}`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
      ) : (
        <i className={`ti ${icon} shrink-0 text-[17px] ${active ? "text-[#eb6834]" : "text-ink-muted"}`} aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] ${active ? "font-semibold text-ink" : "text-ink"}`}>{label}</span>
        {sub && <span className="block truncate text-[12px] text-ink-muted">{sub}</span>}
      </span>
      {tag && <span className="shrink-0 rounded bg-[#FFF1EA] px-1.5 text-[11px] font-semibold text-[#C2410C]">{tag}</span>}
      {bad && <span className="h-2 w-2 shrink-0 rounded-full bg-[#F79009]" title="채워야 할 항목이 있어요" />}
    </button>
  );
}

function AddButton({ depth, label, onClick }: { depth: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ paddingLeft: 8 + depth * 18 }} className="flex items-center gap-1.5 rounded-lg py-1 pr-2 text-[13px] text-[#C2410C] hover:bg-[#FFF8F4]">
      <i className="ti ti-plus text-[14px]" aria-hidden />
      {label}
    </button>
  );
}

function NextStep({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-8 flex justify-end border-t border-[#F2F4F7] pt-5">
      <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-white hover:bg-ink-soft">
        {label}
        <i className="ti ti-arrow-right" aria-hidden />
      </button>
    </div>
  );
}
