"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 카카오 > 수동 세팅(한 화면)
// ① 캠페인 하나 → ② 광고그룹(기존에 추가 · 설정 복사 · 새로, 여러 개) → ③ 소재 파일을 놓으면 소재 카드(형식은 캠페인 유형) → 아래 고정 바에서 실행
// 소재마다 넣을 광고그룹을 체크(기본 전부). 실행 엔진은 엑셀 벌크와 같은 run.ts runKakao
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoneyInput, SelectAllLinks } from "../gfa/ui";
import { Toggle } from "../meta/AccountBar";
import { agesLabel, parseBid, bidText } from "./bulkSheet";
import { CommonCopy, Counted } from "./KakaoBulk";
import { AccountError, BTN, CARD, CampaignPicker, INP, KakaoAccountBar, KakaoRunBar, KakaoRunLog, Step, Thumb, typeBadge, useApplyAccountDefaults, useKakaoAccount } from "./KakaoParts";
import { readMedia, VIDEO_MAX, type LocalMedia } from "./media";
import {
  ACTION_BUTTONS,
  AGE_BUCKETS,
  EMPTY_COPY,
  FORMAT_LABEL,
  ageBucketLabel,
  bidLabel,
  copyAdGroupBody,
  copyOf,
  copyProblems,
  formatOfCampaign,
  freqLabel,
  mediaFit,
  newAdGroupBody,
  todayKst,
  uid,
  type AdGroupDraft,
  type CreativeDraft,
  type Defaults,
  type Freq,
  type Gender,
  type KakaoAdGroupLite,
  type KakaoCampaignLite,
  type Problem,
} from "./model";
import { cleanupFiles, newCache, postKakao, runKakao, type KakaoRunResult, type LogLine } from "./run";

const newGroup = (mode: AdGroupDraft["mode"] = "new", budget: number | null = 100000): AdGroupDraft => ({ key: uid("g"), mode, sourceId: null, name: "", gender: null, ages: null, budget: mode === "new" ? budget : null, beginDate: "", endDate: "", bid: null, creatives: [] });

export function KakaoQuick({ clientId }: { clientId: string }) {
  const { acc, err: accErr, loading: accLoading, defs, reload } = useKakaoAccount(clientId);
  const [defaults, setDefaults] = useState<Defaults>({ copy: { ...EMPTY_COPY }, freq: { type: "AUTO" }, profile: null, turnOn: false });
  useApplyAccountDefaults(defs, setDefaults);
  const [profileFile, setProfileFile] = useState<LocalMedia | null>(null);

  // ── ① 캠페인 ──
  const [picked, setPicked] = useState<string[]>([]);
  const campaign = acc?.campaigns.find((c) => c.id === picked[0]) ?? null;
  const format = campaign ? formatOfCampaign(campaign) : null;
  const [existing, setExisting] = useState<KakaoAdGroupLite[] | "loading" | { error: string } | null>(null);
  const loadGroups = useCallback(
    async (id: string, fresh = false) => {
      setExisting("loading");
      try {
        setExisting((await postKakao<{ adGroups: KakaoAdGroupLite[] }>({ action: "adgroups", clientId, campaignId: id, fresh })).adGroups);
      } catch (e) {
        setExisting({ error: (e as Error).message });
      }
    },
    [clientId],
  );
  useEffect(() => {
    if (campaign) loadGroups(campaign.id);
    else setExisting(null);
  }, [campaign?.id, loadGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = Array.isArray(existing) ? existing : [];

  // ── ② 광고그룹 ──
  const [groups, setGroups] = useState<AdGroupDraft[]>([newGroup()]);
  const patchGroup = (key: string, p: Partial<AdGroupDraft>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));
  useEffect(() => {
    // 캠페인을 바꾸면 광고그룹 초안을 새로(다른 캠페인의 광고그룹을 가리키지 않게)
    setGroups([newGroup()]);
  }, [campaign?.id]);

  // ── ③ 소재 ──
  const [media, setMedia] = useState<Map<string, LocalMedia>>(new Map());
  const [creatives, setCreatives] = useState<(CreativeDraft & { groups: string[] })[]>([]);
  const [fileErr, setFileErr] = useState<string[]>([]);
  const patchCr = (key: string, p: Partial<CreativeDraft & { groups: string[] }>) => setCreatives((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  async function addFiles(files: File[]) {
    const errs: string[] = [];
    const out: LocalMedia[] = [];
    for (const f of files.filter((x) => /^(image|video)\//.test(x.type) || /\.(jpe?g|png|webp|mp4|mov)$/i.test(x.name)).slice(0, 60)) {
      if (f.type.startsWith("video/") && f.size > VIDEO_MAX) {
        errs.push(`${f.name}: 영상은 200MB까지`);
        continue;
      }
      try {
        out.push(await readMedia(f));
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    setFileErr(errs);
    if (!out.length) return;
    setMedia((m) => new Map([...m, ...out.map((x) => [x.id, x] as const)]));
    setCreatives((cs) => [...cs, ...out.map((m) => ({ key: uid("c"), name: m.name.replace(/\.[^.]+$/, "").slice(0, 50), file: m.id, thumb: null, copy: {}, freq: null, opinion: "", aiLabel: false, groups: groups.map((g) => g.key) }))]);
  }
  function removeCreative(key: string) {
    setCreatives((cs) => cs.filter((c) => c.key !== key));
  }

  // ── 점검 ──
  const today = todayKst();
  const groupProblems = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!campaign) return out;
    const ctx = { campaignId: campaign.id, campaignType: campaign.type, campaignGoal: campaign.goal, campaignBudget: campaign.dailyBudget, today };
    const names = groups.map((g) => (g.mode === "existing" ? list.find((x) => x.id === g.sourceId)?.name ?? "" : g.name.trim()));
    groups.forEach((g, i) => {
      const p: string[] = [];
      if (g.mode === "existing") {
        if (!g.sourceId) p.push("광고그룹을 고르세요");
      } else {
        if (!g.name.trim()) p.push("이름을 적으세요");
        else if ([...g.name.trim()].length > 50) p.push("이름 50자 이하");
        else if (list.some((x) => x.name.trim() === g.name.trim())) p.push("같은 이름 광고그룹이 이미 있어요 — '기존에 추가'를 쓰세요");
        if (g.mode === "copy") {
          const src = list.find((x) => x.id === g.sourceId);
          if (!src) p.push("복사할 원본을 고르세요");
          else p.push(...copyAdGroupBody(liteToRaw(src), g, ctx).problems);
        } else p.push(...newAdGroupBody(g, ctx).problems);
      }
      if (names[i] && names.indexOf(names[i]) !== i) p.push("위 광고그룹과 같아요");
      if (!creatives.some((c) => c.groups.includes(g.key))) p.push("넣을 소재가 없어요");
      out.set(g.key, p);
    });
    return out;
  }, [campaign, groups, list, creatives, today]);
  const crProblems = useMemo(() => {
    const out = new Map<string, { problems: string[]; notes: string[] }>();
    if (!format) return out;
    for (const c of creatives) {
      const m = c.file ? media.get(c.file) : null;
      const fit = m ? mediaFit(m, format) : { problems: ["파일 없음"], notes: [] };
      const p = [...fit.problems, ...copyProblems(format, copyOf(c, defaults), defaults.profile)];
      if (!c.name.trim()) p.push("소재 이름 없음");
      if (!c.groups.length) p.push("넣을 광고그룹을 고르세요");
      out.set(c.key, { problems: p, notes: fit.notes });
    }
    return out;
  }, [creatives, media, format, defaults]);

  const problems: Problem[] = [];
  if (!acc) problems.push({ where: "계정", text: "카카오 광고계정을 불러오는 중" });
  if (!campaign) problems.push({ where: "① 캠페인", text: "캠페인을 고르세요", target: "campaign" });
  else if (existing === "loading") problems.push({ where: "① 캠페인", text: "광고그룹 목록을 불러오는 중" });
  groups.forEach((g, i) => groupProblems.get(g.key)?.forEach((t) => problems.push({ where: `② 광고그룹 ${i + 1}`, text: t, target: `g-${g.key}` })));
  if (campaign && !creatives.length) problems.push({ where: "③ 소재", text: "소재 파일을 놓으세요", target: "creatives" });
  creatives.forEach((c) => crProblems.get(c.key)?.problems.forEach((t) => problems.push({ where: `③ ${c.name || "소재"}`, text: t, target: `c-${c.key}` })));
  const pairCount = creatives.reduce((n, c) => n + c.groups.filter((k) => groups.some((g) => g.key === k)).length, 0);

  // ── 실행 ──
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<KakaoRunResult | null>(null);
  const cache = useRef(newCache());
  async function run() {
    if (!campaign || running || problems.length) return;
    const nNew = groups.filter((g) => g.mode !== "existing").length;
    if (!window.confirm([`카카오모먼트 광고계정 ${acc?.adAccountId}에 실제로 만듭니다(카카오는 사전 검증 API가 없어요).`, "", `· ${campaign.name} (${typeBadge(campaign)})`, `· 새 광고그룹 ${nNew}개 · 소재 ${pairCount}개`, "", defaults.turnOn ? "상태: 바로 켜기" : "상태: 꺼 둔 채로", "", "진행할까요?"].join("\n"))) return;
    setRunning(true);
    setResult(null);
    const mediaAll = new Map(media);
    if (profileFile) mediaAll.set(profileFile.id, profileFile);
    try {
      const drafts = groups.map((g) => ({ ...g, name: g.mode === "existing" ? list.find((x) => x.id === g.sourceId)?.name ?? g.name : g.name.trim(), creatives: creatives.filter((c) => c.groups.includes(g.key)).map((c) => c.key) }));
      const r = await runKakao({ clientId, campaign, adGroups: drafts, creatives, media: mediaAll, defaults, cache: cache.current, mode: "quick", onLog: setLog });
      setResult(r);
      // 만든 광고그룹은 '기존에 추가'로 바꿔 두고(다시 실행해도 새로 만들지 않게) 만든 소재 카드는 뺀다
      const madeCr = new Set(r.creatives.map((c) => c.key));
      setGroups((gs) => gs.map((g) => {
        const hit = r.adGroups.find((x) => x.key === g.key);
        return hit ? { ...g, mode: "existing", sourceId: hit.id } : g;
      }));
      setCreatives((cs) => cs.filter((c) => !madeCr.has(c.key)));
      await loadGroups(campaign.id, true);
    } finally {
      await cleanupFiles(clientId, cache.current);
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!creatives.length) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [creatives.length]);

  if (accErr && !acc) return <AccountError err={accErr} onRetry={() => reload(true)} />;

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length || !campaign) return;
        e.preventDefault();
        addFiles([...e.dataTransfer.files]);
      }}
    >
      <KakaoAccountBar acc={acc} loading={accLoading} defaults={defaults} setDefaults={setDefaults} defs={defs} profileFile={profileFile} setProfileFile={setProfileFile} onRefresh={() => { reload(true); if (campaign) loadGroups(campaign.id, true); }} />

      <section id="kakao-campaign" className={CARD}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Step n={1} />
          <h3 className="text-[16px] font-bold text-ink">캠페인</h3>
          {campaign && format ? <span className="rounded-full bg-[#FFF8D6] px-2.5 py-0.5 text-[13px] font-semibold text-[#7A5B00]">{typeBadge(campaign)}</span> : <span className="text-[13px] text-ink-muted">하나 고르세요 — 소재 형식은 캠페인 유형이 정해요</span>}
        </div>
        <CampaignPicker acc={acc} picked={picked} setPicked={setPicked} multi={false} disabled={running} />
      </section>

      {campaign && (
        <section className={CARD}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Step n={2} />
            <h3 className="text-[16px] font-bold text-ink">광고그룹</h3>
            <span className="text-[13px] text-ink-muted">기존 광고그룹 {existing === "loading" ? "불러오는 중…" : `${list.length}개`} · 새 광고그룹은 꺼 둔 채로 만들어요</span>
            <div className="ml-auto flex gap-2">
              <button type="button" className={BTN} onClick={() => setGroups((gs) => [...gs, newGroup("copy")])} disabled={!list.length}>
                <i className="ti ti-copy text-[15px]" aria-hidden />
                설정 복사
              </button>
              <button type="button" className={BTN} onClick={() => setGroups((gs) => [...gs, newGroup("new")])}>
                <i className="ti ti-plus text-[15px]" aria-hidden />새 광고그룹
              </button>
              <button type="button" className={BTN} onClick={() => setGroups((gs) => [...gs, newGroup("existing")])} disabled={!list.length}>
                <i className="ti ti-folder-plus text-[15px]" aria-hidden />
                기존에 추가
              </button>
            </div>
          </div>
          {existing && typeof existing === "object" && "error" in existing && <p className="mb-2 text-[14px] text-bad">{existing.error}</p>}
          <div className="grid gap-3 xl:grid-cols-2">
            {groups.map((g, i) => (
              <GroupCard key={g.key} n={i + 1} g={g} campaign={campaign} list={list} problems={groupProblems.get(g.key) ?? []} onChange={(p) => patchGroup(g.key, p)} onRemove={groups.length > 1 ? () => { setGroups((gs) => gs.filter((x) => x.key !== g.key)); setCreatives((cs) => cs.map((c) => ({ ...c, groups: c.groups.filter((k) => k !== g.key) }))); } : undefined} />
            ))}
          </div>
        </section>
      )}

      {campaign && format && (
        <section id="kakao-creatives" className={CARD}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Step n={3} />
            <h3 className="text-[16px] font-bold text-ink">소재 · {FORMAT_LABEL[format]}</h3>
            <span className="text-[13px] text-ink-muted">{format === "IMAGE_BANNER" ? "1029×258 PNG 300KB · 소재 설명(30자) · 랜딩 URL" : format === "IMAGE_NATIVE" ? "1:1·2:1·9:16·4:5(가까운 비율로 잘라 500KB) · 타이틀 25 · 홍보문구 45 · 버튼" : "MP4 9:16·16:9·1:1 · 타이틀 25 · 홍보문구 45 · 버튼 · 썸네일(선택)"}</span>
            <label className={`${BTN} ml-auto cursor-pointer`}>
              <i className="ti ti-photo-plus text-[15px]" aria-hidden />
              파일 추가
              <input type="file" multiple accept={format === "VIDEO_NATIVE" ? "video/mp4" : "image/jpeg,image/png,image/webp"} className="hidden" onChange={(e) => addFiles([...(e.target.files ?? [])]).then(() => (e.target.value = ""))} />
            </label>
          </div>
          <div className="mb-3 rounded-xl bg-canvas p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">공통 값 — 소재 카드에서 비운 칸에 들어가요</p>
            <CommonCopy defaults={defaults} setDefaults={setDefaults} />
          </div>
          {fileErr.map((e) => (
            <p key={e} className="text-[13px] text-warn">
              {e}
            </p>
          ))}
          {!creatives.length ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line py-10 text-center">
              <i className="ti ti-drag-drop text-[28px] text-ink-faint" aria-hidden />
              <p className="text-[15px] text-ink-muted">소재 파일을 화면에 끌어 놓거나 &apos;파일 추가&apos;를 누르세요 — 파일 1개 = 소재 1개</p>
            </div>
          ) : (
            <div className="space-y-2">
              {creatives.map((c) => (
                <CreativeCard key={c.key} c={c} format={format} media={media} defaults={defaults} groups={groups} list={list} check={crProblems.get(c.key)} onChange={(p) => patchCr(c.key, p)} onRemove={() => removeCreative(c.key)} onThumb={async (f) => {
                  const m = await readMedia(f);
                  setMedia((mm) => new Map([...mm, [m.id, m]]));
                  patchCr(c.key, { thumb: m.id });
                }} />
              ))}
            </div>
          )}
        </section>
      )}

      <KakaoRunLog log={log} result={result} running={running} />

      <KakaoRunBar
        ready={!!acc && !!campaign}
        summary={
          <>
            <span className="font-semibold text-ink">{campaign?.name ?? "캠페인 미선택"}</span>
            <span className="mx-2 text-ink-faint">›</span>광고그룹 <b className="tabular-nums text-ink">{groups.length}</b>
            <span className="mx-1.5 text-ink-faint">×</span>소재 = <b className="tabular-nums text-[#C2410C]">{pairCount}</b>개
          </>
        }
        problems={problems}
        onJump={(t) => document.getElementById(t.startsWith("g-") || t.startsWith("c-") ? t : `kakao-${t}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
        running={running}
        turnOn={defaults.turnOn}
        setTurnOn={(v) => setDefaults((d) => ({ ...d, turnOn: v }))}
        onRun={run}
        runLabel={pairCount ? `소재 ${pairCount}개 만들기` : "만들 소재 없음"}
      />
    </div>
  );
}

function liteToRaw(g: KakaoAdGroupLite): Record<string, unknown> {
  return {
    dailyBudgetAmount: g.dailyBudget,
    bidStrategy: g.bidStrategy,
    pricingType: g.pricingType,
    bidAmount: g.bidAmount,
    bidStrategyTarget: g.bidTarget,
    adult: g.adult,
    targeting: { type: g.audience.some((a) => a.startsWith("오디언스")) ? "DISPLAY" : "NORMAL" },
    schedule: { beginDate: g.beginDate, endDate: g.endDate },
  };
}

const CHIP = "whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] transition";
const chip = (on: boolean) => `${CHIP} ${on ? "border-[#eb6834] bg-[#FDF1EC] font-semibold text-ink" : "border-line text-ink-soft hover:bg-canvas"}`;

function GroupCard({ n, g, campaign, list, problems, onChange, onRemove }: { n: number; g: AdGroupDraft; campaign: KakaoCampaignLite; list: KakaoAdGroupLite[]; problems: string[]; onChange: (p: Partial<AdGroupDraft>) => void; onRemove?: () => void }) {
  const src = list.find((x) => x.id === g.sourceId);
  const [bidRaw, setBidRaw] = useState(g.bid ? bidText(g.bid) : "");
  const bidBad = bidRaw.trim() !== "" && parseBid(bidRaw) === undefined;
  const ages = g.ages ?? (g.mode === "copy" && src ? src.ages : []);
  const gender: Gender = g.gender ?? (g.mode === "copy" && src ? (src.genders.length === 1 ? (src.genders[0] === "F" ? "f" : "m") : "all") : "all");
  return (
    <div id={`g-${g.key}`} className={`rounded-xl border p-3 ${problems.length ? "border-[#FAD9CB]" : "border-[#EAECF0]"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-bold text-ink-muted">#{n}</span>
        <div className="inline-flex rounded-full bg-[#F2F4F7] p-0.5">
          {(
            [
              ["new", "새로"],
              ["copy", "설정 복사"],
              ["existing", "기존에 추가"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" disabled={k !== "new" && !list.length} onClick={() => onChange({ mode: k, sourceId: k === "new" ? null : g.sourceId, budget: k === "new" ? g.budget ?? 100000 : null })} className={`rounded-full px-3 py-0.5 text-[13px] ${g.mode === k ? "bg-white font-semibold text-ink shadow-sm" : "text-ink-muted disabled:opacity-40"}`}>
              {l}
            </button>
          ))}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-ink-faint hover:text-bad" title="빼기">
            <i className="ti ti-x text-[16px]" aria-hidden />
          </button>
        )}
      </div>
      {g.mode !== "new" && (
        <select className={`${INP} mb-2`} value={g.sourceId ?? ""} onChange={(e) => onChange({ sourceId: e.target.value || null })}>
          <option value="">{g.mode === "copy" ? "복사할 원본 광고그룹" : "소재를 넣을 광고그룹"}</option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.on ? "● " : "○ "}
              {x.name} · {x.dailyBudget ? `${x.dailyBudget.toLocaleString("ko-KR")}원` : "예산?"} · {bidLabel(x, campaign.goal)}
            </option>
          ))}
        </select>
      )}
      {g.mode === "existing" && src && <p className="text-[12px] text-ink-muted">{[src.statusText, agesLabel(src.ages), src.locations, src.audience.join(", ") || "맞춤타겟 없음", `소재 ${src.creativeCount}`].filter(Boolean).join(" · ")}</p>}
      {g.mode !== "existing" && (
        <div className="space-y-2">
          <input className={INP} value={g.name} maxLength={50} onChange={(e) => onChange({ name: e.target.value })} placeholder="광고그룹 이름 (예 1015_cv_cozy3_nb_f2554)" />
          {g.mode === "copy" && src && <p className="text-[12px] text-ink-muted">원본 그대로: 지면 {src.placements.join("·") || "자동"} · 기기 {src.deviceTypes.join("·")} · {src.locations}{src.audience.length ? ` · ${src.audience.join(", ")}` : ""} · {bidLabel(src, campaign.goal)} — 아래에서 바꾼 것만 덮어요</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 text-[13px] text-ink-muted">성별</span>
            {(["all", "f", "m"] as const).map((k) => (
              <button key={k} type="button" className={chip(gender === k)} onClick={() => onChange({ gender: k })}>
                {k === "all" ? "전체" : k === "f" ? "여성" : "남성"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 text-[13px] text-ink-muted">연령</span>
            {AGE_BUCKETS.map((a) => {
              const on = !ages.length || ages.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  className={chip(on && ages.length > 0)}
                  onClick={() => {
                    const cur = ages.length ? ages : [];
                    const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a].sort((x, y) => Number(x) - Number(y));
                    onChange({ ages: next.length === AGE_BUCKETS.length ? [] : next });
                  }}
                >
                  {ageBucketLabel(a)}
                </button>
              );
            })}
            <SelectAllLinks onAll={() => onChange({ ages: [] })} allLabel="전체 연령" />
            <span className="text-[12px] text-ink-muted">{ages.length ? agesLabel(ages) : "전체"}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[13px] text-ink-muted">
              일 예산{g.mode === "copy" && src?.dailyBudget ? ` (원본 ${src.dailyBudget.toLocaleString("ko-KR")}원)` : ""}
              <MoneyInput value={g.budget} onChange={(v) => onChange({ budget: v })} placeholder={g.mode === "copy" ? "원본 그대로" : "1만 원 이상"} />
            </label>
            <label className="text-[13px] text-ink-muted">
              입찰{g.mode === "copy" ? " (비우면 원본)" : campaign.type === "VIDEO" ? " (수동 CPV)" : " (비우면 자동)"}
              <input
                className={`${INP} ${bidBad ? "border-bad" : ""}`}
                value={bidRaw}
                onChange={(e) => {
                  setBidRaw(e.target.value);
                  const b = parseBid(e.target.value);
                  if (b !== undefined) onChange({ bid: b });
                }}
                placeholder={campaign.type === "VIDEO" ? "수동 20" : "자동 · 수동 300 · CPA 목표 15000 · ROAS 목표 500%"}
              />
            </label>
            <label className="text-[13px] text-ink-muted">
              시작일
              <input type="date" className={INP} value={g.beginDate} min={todayKst()} onChange={(e) => onChange({ beginDate: e.target.value })} />
            </label>
            <label className="text-[13px] text-ink-muted">
              종료일
              <span className="flex gap-1.5">
                <input type="date" className={INP} value={g.endDate === "none" ? "" : g.endDate} onChange={(e) => onChange({ endDate: e.target.value })} disabled={g.endDate === "none"} />
                <button type="button" className={chip(g.endDate === "none")} onClick={() => onChange({ endDate: g.endDate === "none" ? "" : "none" })}>
                  없음
                </button>
              </span>
            </label>
          </div>
        </div>
      )}
      {problems.map((p) => (
        <p key={p} className="mt-1 text-[12px] text-bad">
          · {p}
        </p>
      ))}
    </div>
  );
}

const FREQ_OPTIONS: (Freq | null)[] = [null, { type: "AUTO" }, ...[1, 2, 3, 4, 5].map((cap) => ({ type: "DAY_IMP" as const, cap, hours: 24 }))];

function CreativeCard({ c, format, media, defaults, groups, list, check, onChange, onRemove, onThumb }: { c: CreativeDraft & { groups: string[] }; format: ReturnType<typeof formatOfCampaign> & string; media: Map<string, LocalMedia>; defaults: Defaults; groups: AdGroupDraft[]; list: KakaoAdGroupLite[]; check?: { problems: string[]; notes: string[] }; onChange: (p: Partial<CreativeDraft & { groups: string[] }>) => void; onRemove: () => void; onThumb: (f: File) => void }) {
  const m = c.file ? media.get(c.file) : null;
  const th = c.thumb ? media.get(c.thumb) : null;
  const eff = copyOf(c, defaults);
  const setCopy = (k: keyof CreativeDraft["copy"], v: string) => onChange({ copy: { ...c.copy, [k]: v } });
  const gName = (g: AdGroupDraft, i: number) => (g.mode === "existing" ? list.find((x) => x.id === g.sourceId)?.name : g.name) || `광고그룹 ${i + 1}`;
  const bad = !!check?.problems.length;
  return (
    <div id={`c-${c.key}`} className={`flex flex-wrap gap-3 rounded-xl border p-3 ${bad ? "border-[#FAD9CB] bg-[#FFFBFA]" : "border-[#EAECF0]"}`}>
      <div className="w-[170px] shrink-0">
        {m && <Thumb m={m} h={format === "IMAGE_BANNER" ? 40 : 96} />}
        <p className="mt-1 truncate text-[12px] text-ink-muted" title={m?.name}>
          {m ? `${m.width}×${m.height}` : "파일 없음"}
        </p>
        {format === "VIDEO_NATIVE" && (
          <label className="mt-1 flex cursor-pointer items-center gap-1 text-[12px] text-ink-soft">
            {th ? <Thumb m={th} h={28} /> : <i className="ti ti-photo text-[14px]" aria-hidden />}
            {th ? "썸네일 바꾸기" : "썸네일(선택)"}
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && onThumb(e.target.files[0])} />
          </label>
        )}
      </div>
      <div className="min-w-[320px] flex-1 space-y-2">
        <div className="flex gap-2">
          <input className={`${INP} font-mono`} value={c.name} maxLength={50} onChange={(e) => onChange({ name: e.target.value })} placeholder="소재 이름(50자)" />
          <button type="button" onClick={onRemove} className="shrink-0 px-1 text-ink-faint hover:text-bad" title="빼기">
            <i className="ti ti-trash text-[16px]" aria-hidden />
          </button>
        </div>
        {format !== "IMAGE_BANNER" && (
          <div className="grid gap-2 md:grid-cols-[1fr_1.6fr]">
            <Counted value={c.copy.title ?? ""} max={25} onChange={(v) => setCopy("title", v)} placeholder={eff.title || "타이틀(공통)"} />
            <Counted value={c.copy.description ?? ""} max={45} onChange={(v) => setCopy("description", v)} placeholder={eff.description || "홍보문구(공통)"} />
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_auto_auto]">
          <input className={INP} value={c.copy.url ?? ""} onChange={(e) => setCopy("url", e.target.value.trim())} placeholder={eff.url || "랜딩 URL(공통)"} />
          {format !== "VIDEO_NATIVE" ? <Counted value={c.copy.altText ?? ""} max={30} onChange={(v) => setCopy("altText", v)} placeholder={eff.altText || "소재 설명(공통)"} /> : <span />}
          {format !== "IMAGE_BANNER" ? (
            <select className={INP} value={c.copy.actionButton ?? ""} onChange={(e) => setCopy("actionButton", e.target.value)}>
              <option value="">버튼: 공통</option>
              {ACTION_BUTTONS.filter((a) => !a.video || format === "VIDEO_NATIVE").map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          ) : (
            <Toggle on={c.aiLabel} onClick={() => onChange({ aiLabel: !c.aiLabel })} label="AI 표기" title="생성형 AI로 만든 소재면 켜기(비즈보드만, 소재에 AI 활용 표시)" />
          )}
          <select className={INP} value={c.freq ? (c.freq.type === "AUTO" ? "auto" : String(c.freq.cap)) : ""} onChange={(e) => onChange({ freq: FREQ_OPTIONS.find((f) => (f ? (f.type === "AUTO" ? "auto" : String(f.cap)) : "") === e.target.value) ?? null })} title="게재빈도">
            {FREQ_OPTIONS.map((f) => (
              <option key={f ? (f.type === "AUTO" ? "auto" : f.cap) : ""} value={f ? (f.type === "AUTO" ? "auto" : String(f.cap)) : ""}>
                {f ? freqLabel(f) : `빈도: 기본(${freqLabel(defaults.freq)})`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-ink-muted">넣을 광고그룹</span>
          {groups.map((g, i) => {
            const on = c.groups.includes(g.key);
            return (
              <button key={g.key} type="button" className={chip(on)} onClick={() => onChange({ groups: on ? c.groups.filter((k) => k !== g.key) : [...c.groups, g.key] })}>
                {on && <i className="ti ti-check mr-0.5 text-[12px]" aria-hidden />}
                {gName(g, i)}
              </button>
            );
          })}
          {groups.length > 1 && <SelectAllLinks onAll={() => onChange({ groups: groups.map((g) => g.key) })} onNone={() => onChange({ groups: [] })} />}
        </div>
        <input className={`${INP} text-[13px]`} value={c.opinion} maxLength={1000} onChange={(e) => onChange({ opinion: e.target.value })} placeholder="심사 의견(선택) — 예: 랜딩 페이지 10/20 14:00 오픈 예정" />
        {check?.problems.map((p) => (
          <p key={p} className="text-[12px] text-bad">
            · {p}
          </p>
        ))}
        {check?.notes.map((p) => (
          <p key={p} className="text-[12px] text-ink-muted">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
