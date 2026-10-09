"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 메타 — 탭 2개: 엑셀 벌크 업로드(기본, MetaBulk.tsx) / 빠른 세팅(이 파일 MetaQuickSetup, 한 화면)
// 두 화면 모두 띄워 두고 숨겨서 탭을 바꿔도 작업 내용이 남는다
// 빠른 세팅:
// 위 = 광고계정 바(페이지·인스타·픽셀 자동 선택, 옵션 3개) / 왼쪽 = 캠페인 + 광고세트 / 오른쪽 = 소재 파일·문구 표(광고세트 연결 열) / 아래 고정 = 점검·검증·실행
// 화면 전환·모달 없이 한 번에: 파일을 놓으면 광고가 생기고, 광고세트는 기본으로 모든 광고와 연결된다. 실행 전에는 메타에 아무것도 만들지 않는다.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { adsFromMedia, DEFAULT_URL_TAGS, EMPTY_COPY, newAdSet, problemsOf, type AdDraft, type AdSetDraft, type CampaignDraft, type Defaults, type MetaAccountCtx, type MetaAdSetLite, type MetaAudience } from "./model";
import { readMedia, type LocalMedia } from "./media";
import { newCache, postMeta, runMeta, type LogLine, type MetaRunResult } from "./run";
import { AccountBar } from "./AccountBar";
import { StructurePanel } from "./StructurePanel";
import { AdTable } from "./AdTable";
import { RunBar, MetaRunLog } from "./RunBar";
import { MetaBulk } from "./MetaBulk";

const LS_KEY = (clientId: string) => `ctch_meta_setup_${clientId}`;
type Saved = Pick<Defaults, "copy" | "urlTags" | "useUtm" | "aiEnhance">;

export function MetaSetup() {
  const { selected } = useClients();
  const clientId = selected?.id ?? null;
  const [tab, setTab] = useState<"bulk" | "quick">("bulk");
  const [quickSeen, setQuickSeen] = useState(false); // 빠른 세팅은 처음 열 때 띄운다(계정 조회 중복 방지)
  if (!clientId) return <p className="text-[15px] text-ink-muted">광고주를 먼저 고르세요.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-[#EAECF0]">
          {(
            [
              { key: "bulk", label: "엑셀 벌크 업로드", icon: "file-spreadsheet" },
              { key: "quick", label: "빠른 세팅(화면)", icon: "bolt" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setTab(o.key);
                if (o.key === "quick") setQuickSeen(true);
              }}
              aria-pressed={tab === o.key}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-5 py-2 text-[15px] transition ${tab === o.key ? "bg-[#eb6834] font-semibold text-white shadow-[0_1px_3px_rgba(235,104,52,0.4)]" : "text-ink-muted hover:text-ink"}`}
            >
              <i className={`ti ti-${o.icon} text-[16px]`} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-[14px] text-ink-muted">
          {tab === "bulk" ? "기존 캠페인을 골라(여러 개 가능) 엑셀 한 장 + 소재 파일로 광고세트·광고를 한 번에" : "엑셀 없이 한 화면에서 — 파일을 놓고 문구·세트만 채우기(새 캠페인도 가능)"}
        </span>
      </div>
      <div hidden={tab !== "bulk"}>
        <MetaBulk key={clientId} clientId={clientId} />
      </div>
      <div hidden={tab !== "quick"}>
        {quickSeen && <MetaQuickSetup key={clientId} clientId={clientId} />}
      </div>
    </div>
  );
}

function MetaQuickSetup({ clientId }: { clientId: string }) {
  // ── 광고계정 ──
  const [acc, setAcc] = useState<MetaAccountCtx | null>(null);
  const [accErr, setAccErr] = useState<{ msg: string; code?: string } | null>(null);
  const [accLoading, setAccLoading] = useState(false);
  const [adSetsByCampaign, setAdSetsByCampaign] = useState<Record<string, MetaAdSetLite[] | "loading" | { error: string }>>({});

  // ── 초안 ──
  const [campaign, setCampaign] = useState<CampaignDraft>({ mode: "existing", existingId: null, name: "", objective: "OUTCOME_SALES", cbo: false, budget: null });
  const [adSets, setAdSets] = useState<AdSetDraft[]>([]);
  const [media, setMedia] = useState<Map<string, LocalMedia>>(new Map());
  const [ads, setAds] = useState<AdDraft[]>([]);
  const [defaults, setDefaults] = useState<Defaults>(() => {
    const base: Defaults = { pageId: "", igId: "", pixelId: "", copy: { ...EMPTY_COPY, cta: "LEARN_MORE" }, urlTags: DEFAULT_URL_TAGS, useUtm: false, turnOn: false, aiEnhance: false };
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY(clientId)) ?? "null") as Saved | null;
      if (s) return { ...base, ...s, copy: { ...base.copy, ...s.copy } };
    } catch {
      /* 저장값 없음 */
    }
    return base;
  });
  const [focus, setFocus] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<MetaAudience[] | null>(null);
  useEffect(() => {
    postMeta<{ audiences: MetaAudience[] }>({ action: "audiences", clientId })
      .then((r) => setAudiences(r.audiences))
      .catch(() => setAudiences([]));
  }, [clientId]);

  // ── 실행 ──
  const [running, setRunning] = useState<"validate" | "run" | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<MetaRunResult | null>(null);
  const cache = useRef(newCache());
  const [readErr, setReadErr] = useState<string[]>([]);

  // 공통 문구·옵션은 광고주별로 기억(다음에 같은 광고주면 그대로)
  useEffect(() => {
    try {
      const s: Saved = { copy: defaults.copy, urlTags: defaults.urlTags, useUtm: defaults.useUtm, aiEnhance: defaults.aiEnhance };
      localStorage.setItem(LS_KEY(clientId), JSON.stringify(s));
    } catch {
      /* 저장 못 해도 동작 */
    }
  }, [clientId, defaults.copy, defaults.urlTags, defaults.useUtm, defaults.aiEnhance]);

  const loadAccount = useCallback(
    async (fresh = false) => {
      setAccLoading(true);
      setAccErr(null);
      try {
        const a = await postMeta<MetaAccountCtx>({ action: "account", clientId, fresh });
        setAcc(a);
        if (fresh) setAdSetsByCampaign({});
        // 페이지·인스타·픽셀 자동 선택 — 하나뿐이거나 최근 발화 픽셀
        setDefaults((d) => {
          const page = a.pages.find((p) => p.id === d.pageId) ?? a.pages[0];
          return { ...d, pageId: page?.id ?? "", igId: page?.igId ?? "", pixelId: a.pixels.some((p) => p.id === d.pixelId) ? d.pixelId : a.pixels[0]?.id ?? "" };
        });
      } catch (e) {
        setAccErr({ msg: (e as Error).message, code: (e as { code?: string }).code });
      } finally {
        setAccLoading(false);
      }
    },
    [clientId],
  );
  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const loadAdSets = useCallback(
    async (campaignId: string) => {
      if (!campaignId || (adSetsByCampaign[campaignId] && !(typeof adSetsByCampaign[campaignId] === "object" && "error" in (adSetsByCampaign[campaignId] as object)))) return;
      setAdSetsByCampaign((m) => ({ ...m, [campaignId]: "loading" }));
      try {
        const r = await postMeta<{ adSets: MetaAdSetLite[] }>({ action: "adsets", clientId, campaignId });
        setAdSetsByCampaign((m) => ({ ...m, [campaignId]: r.adSets }));
      } catch (e) {
        setAdSetsByCampaign((m) => ({ ...m, [campaignId]: { error: (e as Error).message } }));
      }
    },
    [clientId, adSetsByCampaign],
  );

  const existingCampaign = campaign.mode === "existing" ? acc?.campaigns.find((c) => c.id === campaign.existingId) ?? null : null;
  const objective = campaign.mode === "new" ? campaign.objective : existingCampaign?.objective ?? null;
  const cbo = campaign.mode === "new" ? campaign.cbo : !!(existingCampaign && (existingCampaign.dailyBudget || existingCampaign.lifetimeBudget));
  const campaignName = campaign.mode === "new" ? campaign.name : existingCampaign?.name ?? "";

  useEffect(() => {
    if (existingCampaign) loadAdSets(existingCampaign.id);
  }, [existingCampaign, loadAdSets]);

  // ── 파일 ──
  async function addFiles(files: File[]) {
    const ok: LocalMedia[] = [];
    const errs: string[] = [];
    await Promise.all(
      files.map(async (f) => {
        if (!/^(image|video)\//.test(f.type)) return errs.push(`${f.name}: 이미지·영상 파일만`);
        try {
          ok.push(await readMedia(f));
        } catch (e) {
          errs.push((e as Error).message);
        }
      }),
    );
    setReadErr(errs);
    if (!ok.length) return;
    ok.sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
    const next = new Map(media);
    ok.forEach((m) => next.set(m.id, m));
    setMedia(next);
    const created = adsFromMedia(ok, new Set(ads.map((a) => a.name)));
    setAds((list) => [...list, ...created]);
    // 새 광고는 모든 광고세트에 연결(기본) — 필요 없는 칸만 빼는 흐름
    setAdSets((list) => list.map((s) => ({ ...s, ads: [...s.ads, ...created.map((a) => a.key)] })));
  }
  function removeAd(key: string) {
    const ad = ads.find((a) => a.key === key);
    setAds((l) => l.filter((a) => a.key !== key));
    setAdSets((l) => l.map((s) => ({ ...s, ads: s.ads.filter((k) => k !== key) })));
    // 다른 광고가 안 쓰는 파일은 정리
    const still = new Set(ads.filter((a) => a.key !== key).flatMap((a) => [a.feed, a.vertical]));
    const next = new Map(media);
    for (const id of [ad?.feed, ad?.vertical]) if (id && !still.has(id)) {
      URL.revokeObjectURL(next.get(id)?.url ?? "");
      next.delete(id);
    }
    setMedia(next);
  }
  // 짝지은 광고(피드 + 세로)를 둘로
  function splitAd(key: string) {
    const ad = ads.find((a) => a.key === key);
    if (!ad?.feed || !ad.vertical) return;
    const vName = media.get(ad.vertical)?.name.replace(/\.[^.]+$/, "") ?? `${ad.name}_v`;
    const second: AdDraft = { key: `${ad.key}v`, name: vName, feed: null, vertical: ad.vertical, copy: { ...ad.copy } };
    setAds((l) => l.flatMap((a) => (a.key === key ? [{ ...a, vertical: null, name: media.get(a.feed!)?.name.replace(/\.[^.]+$/, "") ?? a.name }, second] : [a])));
    setAdSets((l) => l.map((s) => (s.ads.includes(key) ? { ...s, ads: [...s.ads, second.key] } : s)));
  }
  // 세로 소재 하나를 다른 광고(피드만)에 합치기
  function mergeInto(targetKey: string, verticalAdKey: string) {
    const v = ads.find((a) => a.key === verticalAdKey);
    if (!v?.vertical || v.feed) return;
    setAds((l) => l.filter((a) => a.key !== verticalAdKey).map((a) => (a.key === targetKey ? { ...a, vertical: v.vertical } : a)));
    setAdSets((l) => l.map((s) => ({ ...s, ads: s.ads.filter((k) => k !== verticalAdKey) })));
  }

  // ── 광고세트 ──
  const addAdSet = (over: Partial<AdSetDraft> = {}) => {
    const s = newAdSet({ ads: ads.map((a) => a.key), budget: cbo ? null : 50000, ...over });
    setAdSets((l) => [...l, s]);
    setFocus(s.key);
  };

  const problems = useMemo(
    () => (acc ? problemsOf({ campaign, campaignObjective: objective, campaignCbo: cbo, adSets, ads, defaults, media, minDailyBudget: acc.minDailyBudget }) : []),
    [acc, campaign, objective, cbo, adSets, ads, defaults, media],
  );
  const adCount = adSets.reduce((n, s) => n + s.ads.filter((k) => ads.some((a) => a.key === k)).length, 0);

  async function run(validateOnly: boolean) {
    if (!acc || running) return;
    if (!validateOnly) {
      const newSets = adSets.filter((s) => s.mode !== "existing").length;
      const msg = [
        `메타 광고계정 ${acc.name}에 만듭니다.`,
        "",
        `캠페인: ${campaign.mode === "new" ? `새로 만들기 — ${campaign.name}` : campaignName}`,
        `광고세트: 새로 ${adSets.filter((s) => s.mode === "new").length} · 복사 ${adSets.filter((s) => s.mode === "copy").length} · 기존 ${adSets.filter((s) => s.mode === "existing").length}`,
        `광고: ${adCount}개 (소재 ${ads.filter((a) => adSets.some((s) => s.ads.includes(a.key))).length}개)`,
        defaults.turnOn ? `상태: 바로 켜기 — 메타 검토 후 게재${newSets ? "" : " (기존 세트에 넣는 광고도 켜짐)"}` : "상태: 꺼 둔 채로 만들기",
        "",
        "진행할까요?",
      ].join("\n");
      if (!window.confirm(msg)) return;
    }
    setRunning(validateOnly ? "validate" : "run");
    setResult(null);
    setLog([]);
    try {
      const r = await runMeta({ clientId, campaign, campaignName, adSets, ads, media, defaults, validateOnly, cache: cache.current, onLog: setLog });
      setResult(r);
      if (!validateOnly && r.campaignId) {
        // 다음 실행은 방금 만든(또는 쓴) 캠페인에 이어서 — 같은 세트를 두 번 만들지 않게 초안의 새 세트를 기존 세트로 바꾼다
        // 만들어진 소재의 광고는 초안에서 빼고, 실패한 것만 남겨 다시 실행할 수 있게
        const made = new Map(r.adSets.map((s) => [s.key, s.id]));
        const doneAds = new Set(r.creatives.map((c) => c.key));
        setCampaign((c) => ({ ...c, mode: "existing", existingId: r.campaignId }));
        setAds((l) => l.filter((a) => !doneAds.has(a.key)));
        setAdSets((l) => l.map((s) => ({ ...(made.has(s.key) ? { ...s, mode: "existing" as const, sourceId: made.get(s.key)! } : s), ads: s.ads.filter((k) => !doneAds.has(k)) })));
        setAdSetsByCampaign((m) => {
          const n = { ...m };
          delete n[r.campaignId!];
          return n;
        });
        loadAccount(true);
      }
    } finally {
      setRunning(null);
    }
  }

  // 페이지 떠날 때 경고(초안이 있으면)
  useEffect(() => {
    if (!ads.length && !adSets.length) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [ads.length, adSets.length]);

  if (accErr && !acc) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[14px] text-bad">
        <i className="ti ti-alert-circle text-[16px]" aria-hidden />
        {accErr.msg}
        {accErr.code === "NO_AD_ACCOUNT" && (
          <Link href="/clients" className="ml-1 font-semibold underline">
            광고주 관리로 가기
          </Link>
        )}
        <button type="button" onClick={() => loadAccount(true)} className="ml-auto rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink-soft">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        addFiles([...e.dataTransfer.files]);
      }}
    >
      <AccountBar acc={acc} loading={accLoading} defaults={defaults} setDefaults={setDefaults} onRefresh={() => loadAccount(true)} />

      <div className="grid items-start gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <StructurePanel
          acc={acc}
          campaign={campaign}
          setCampaign={setCampaign}
          objective={objective}
          cbo={cbo}
          adSets={adSets}
          setAdSets={setAdSets}
          addAdSet={addAdSet}
          ads={ads}
          adSetsByCampaign={adSetsByCampaign}
          audiences={audiences}
          loadAdSets={loadAdSets}
          focus={focus}
          setFocus={setFocus}
          problems={problems}
          disabled={!!running}
        />
        <AdTable
          ads={ads}
          setAds={setAds}
          media={media}
          adSets={adSets}
          setAdSets={setAdSets}
          defaults={defaults}
          setDefaults={setDefaults}
          addFiles={addFiles}
          readErr={readErr}
          removeAd={removeAd}
          splitAd={splitAd}
          mergeInto={mergeInto}
          problems={problems}
          focus={focus}
          disabled={!!running}
        />
      </div>

      <MetaRunLog log={log} result={result} running={running} />

      <RunBar
        acc={acc}
        campaignLabel={campaign.mode === "new" ? `새 캠페인 ${campaign.name || "(이름 없음)"}` : existingCampaign?.name ?? "캠페인 미선택"}
        adSetCount={adSets.length}
        creativeCount={ads.length}
        adCount={adCount}
        problems={problems}
        onJump={(t) => {
          setFocus(t);
          document.getElementById(`meta-${t}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        running={running}
        turnOn={defaults.turnOn}
        setTurnOn={(v) => setDefaults((d) => ({ ...d, turnOn: v }))}
        onValidate={() => run(true)}
        onRun={() => run(false)}
      />
    </div>
  );
}
