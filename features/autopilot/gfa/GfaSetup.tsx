"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅(GFA) — 캠페인 선택(여러 개 가능) → [엑셀 벌크 업로드(캠페인 여러 개) | AI 자동 세팅(캠페인 1개)]
// AI: 브리프·이미지 → AI 세팅안(수정 가능) → [세팅 실행] / 벌크: BulkUpload.tsx. 실행은 둘 다 runner.ts
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { useCanEdit } from "@/features/workspace/WorkspaceContext";
import { Card, Segmented } from "@/features/dashboard/ui";
import {
  AGE_BANDS,
  CTA_OPTIONS,
  DEFAULT_TEMPLATES,
  OBJECTIVE_LABEL,
  SINGLE_IMAGE_TEMPLATES,
  isFeedTemplate,
  SUPPORTED_OBJECTIVES,
  adSetName,
  copyProblems,
  creativeName,
  demoCode,
  roundBudget,
  startTimeFor,
  type AgeKey,
  type GfaCampaignLite,
  type GfaContext,
  type PlanAdSet,
  type PlanCopy,
  type SetupBrief,
  type SetupPlan,
} from "./types";
import { readImage, upscaleRatio, type SourceImage } from "./imageFit";
import { postAutopilot as post, runSetup, type LogLine, type RunResult } from "./runner";
import { BulkUpload } from "./BulkUpload";
import { CELL, CHIP, CHIP_ON, Field, INPUT, RunLog, todayKst as today, won } from "./ui";

const MAX_IMAGES = 6;
// 이미지 단일 소재로 세팅할 수 없는 목적 — 카드에 자물쇠와 함께 보여 준다
const UNSUPPORTED_REASON = "ADVoost 쇼핑·쇼핑 프로모션·카탈로그는 상품 피드로, 동영상 조회는 영상 소재로, 앱 설치는 앱 정보로 만드는 캠페인이라 이미지 소재 자동 세팅을 지원하지 않아요.";

const EMPTY_BRIEF: SetupBrief = { product: "", offer: "", audience: "", landingUrl: "", dailyBudget: 100000, adSetCount: 0, copyCount: 2, startDate: "", notes: "" };

export function GfaSetup() {
  const { selected } = useClients();
  const canEdit = useCanEdit();
  const clientId = selected?.id ?? null;

  // 1. 캠페인
  const [campaigns, setCampaigns] = useState<GfaCampaignLite[] | null>(null);
  const [accountNo, setAccountNo] = useState("");
  const [campErr, setCampErr] = useState<{ msg: string; code?: string } | null>(null);
  const [campLoading, setCampLoading] = useState(false);
  const [onlyActive, setOnlyActive] = useState<"all" | "on" | "off">("all");
  const [query, setQuery] = useState("");
  // 여러 캠페인 선택(고른 순서 유지) — 벌크 업로드는 전부, AI 자동 세팅은 1개일 때만
  const [picked, setPicked] = useState<number[]>([]);
  const [ctxs, setCtxs] = useState<Record<number, GfaContext>>({});
  const [ctxLoading, setCtxLoading] = useState<number[]>([]);

  const [modeChoice, setMode] = useState<"ai" | "bulk">("bulk");
  const mode = picked.length > 1 ? "bulk" : modeChoice;
  const campaignNo = picked.length === 1 ? picked[0] : null;
  const ctx = campaignNo ? ctxs[campaignNo] ?? null : null;
  const pickedCtxs = picked.map((n) => ctxs[n]).filter((c): c is GfaContext => !!c && SUPPORTED_OBJECTIVES.includes(c.campaign.objective));
  const allLoaded = picked.length > 0 && picked.every((n) => ctxs[n]);

  // 2. 브리프·이미지
  const [brief, setBrief] = useState<SetupBrief>(EMPTY_BRIEF);
  const [images, setImages] = useState<SourceImage[]>([]);
  const [formats, setFormats] = useState<string[]>(DEFAULT_TEMPLATES);
  const [useUtm, setUseUtm] = useState(false); // UTM 자동 추가는 기본 꺼짐(광고주 UTM 규칙 우선)
  const [turnOn, setTurnOn] = useState(false);

  // 3. 세팅안
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);

  // 4. 실행
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (!clientId) return;
    setCampLoading(true);
    setCampErr(null);
    try {
      const r = await post<{ adAccountNo: string; campaigns: GfaCampaignLite[] }>({ action: "campaigns", clientId });
      setCampaigns(r.campaigns);
      setAccountNo(r.adAccountNo);
    } catch (e) {
      setCampaigns(null);
      setCampErr({ msg: (e as Error).message, code: (e as { code?: string }).code });
    } finally {
      setCampLoading(false);
    }
  }, [clientId]);

  // 광고주가 바뀌면 처음부터
  useEffect(() => {
    setCampaigns(null);
    setPicked([]);
    setCtxs({});
    setPlan(null);
    setResult(null);
    setLog([]);
    loadCampaigns();
  }, [loadCampaigns]);

  // 선택이 바뀌면 AI 세팅안·결과는 비운다(세팅안은 캠페인 1개 기준)
  function changePicked(next: number[]) {
    setPicked(next);
    setPlan(null);
    setResult(null);
    setLog([]);
  }

  async function loadContexts(nos: number[]) {
    if (!clientId) return;
    const need = nos.filter((n) => !ctxs[n]);
    if (!need.length) return;
    setCtxLoading((s) => [...s, ...need]);
    await Promise.all(
      need.map(async (no) => {
        try {
          const c = await post<GfaContext>({ action: "context", clientId, campaignNo: no });
          setCtxs((m) => ({ ...m, [no]: c }));
        } catch (e) {
          setCampErr({ msg: `캠페인 #${no} 정보를 못 불러왔어요 — ${(e as Error).message}` });
          setPicked((p) => p.filter((x) => x !== no));
        } finally {
          setCtxLoading((s) => s.filter((x) => x !== no));
        }
      }),
    );
  }

  function toggleCampaign(no: number) {
    if (!clientId || running) return;
    if (picked.includes(no)) return changePicked(picked.filter((x) => x !== no));
    changePicked([...picked, no]);
    loadContexts([no]);
  }

  // 지금 보이는(검색·필터 결과) 캠페인 중 세팅 가능한 것 전부 선택 / 선택 해제
  function selectShown(nos: number[]) {
    if (running) return;
    const add = nos.filter((n) => !picked.includes(n));
    if (!add.length) return;
    changePicked([...picked, ...add]);
    loadContexts(add);
  }

  async function addImages(files: FileList | null) {
    if (!files) return;
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - images.length);
    const read = await Promise.all(list.map((f) => readImage(f).catch(() => null)));
    setImages((prev) => [...prev, ...read.filter((x): x is SourceImage => !!x)]);
  }

  async function makePlan() {
    if (!clientId || !campaignNo) return;
    setPlanLoading(true);
    setPlanErr(null);
    setResult(null);
    try {
      const r = await post<{ plan: SetupPlan; context: GfaContext }>({ action: "plan", clientId, campaignNo, brief, imageCount: images.length });
      setPlan(r.plan);
      setCtxs((m) => ({ ...m, [campaignNo]: r.context }));
    } catch (e) {
      setPlanErr((e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  const startDate = brief.startDate || ctx?.sample.startTime?.slice(0, 10) || today();
  const chosenTemplates = SINGLE_IMAGE_TEMPLATES.filter((t) => formats.includes(t.code));
  const creativeCount = plan ? plan.adSets.length * images.length * chosenTemplates.length * plan.copies.length : 0;
  const totalBudget = plan?.adSets.reduce((s, a) => s + a.budget, 0) ?? 0;
  const copyIssues = plan?.copies.flatMap((c, i) => copyProblems(c).map((p) => `카피 ${i + 1}: ${p}`)) ?? [];
  const blurry = images.flatMap((img, i) => chosenTemplates.filter((t) => upscaleRatio(img, t) > 1.5).map((t) => `이미지 ${i + 1} → ${t.label}`));

  const unsupported = ctx && !SUPPORTED_OBJECTIVES.includes(ctx.campaign.objective);
  const briefReady = !!brief.product.trim() && /^https?:\/\//.test(brief.landingUrl.trim()) && brief.dailyBudget > 0;
  const runReady = !!plan && images.length > 0 && chosenTemplates.length > 0 && copyIssues.length === 0 && canEdit && !running;

  async function run() {
    if (!plan || !ctx || !clientId || !campaignNo) return;
    const msg = `GFA 광고계정 ${accountNo} · 캠페인 "${ctx.campaign.name}"에
광고그룹 ${plan.adSets.length}개, 소재 ${creativeCount}개를 만듭니다.
일 예산 합계 ${won(totalBudget)} · ${turnOn ? "만든 뒤 바로 켭니다(검수 후 게재)." : "꺼진 상태로 만듭니다."}

실행할까요?`;
    if (!window.confirm(msg)) return;
    setRunning(true);
    setResult(null);
    const adSets = plan.adSets.map((a) => ({ name: adSetName(a, startDate), target: a }));
    const creatives = adSets.flatMap((a) =>
      images.flatMap((img, i) =>
        plan.copies.map((copy, k) => ({
          adSetName: a.name,
          image: img,
          templates: formats,
          copy,
          landingUrl: brief.landingUrl,
          name: (t: (typeof SINGLE_IMAGE_TEMPLATES)[number]) => creativeName(a.name, i, t, k),
        })),
      ),
    );
    const out = await runSetup({
      clientId,
      campaignNo,
      campaignName: ctx.campaign.name,
      startTime: startTimeFor(brief.startDate, ctx.sample.startTime),
      adSets,
      creatives,
      useUtm,
      turnOn,
      kind: "ai",
      logExtra: { plan, brief: { ...brief }, formats, images: images.map((x) => x.file.name) },
      onLog: setLog,
    });
    setResult(out);
    setRunning(false);
  }

  // ── 화면 ──────────────────────────────────────────
  // 검색 — 이름·캠페인 ID, 대소문자·공백 무시. 상태 칩 개수는 검색 결과 기준
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  const searched = (campaigns ?? []).filter((c) => !q || norm(c.name).includes(q) || String(c.no).includes(q));
  const shownCampaigns = searched.filter((c) => onlyActive === "all" || (onlyActive === "on" ? c.activated : !c.activated));

  return (
    <div className="space-y-6">
      {/* 진행 단계 */}
      <ol className="flex flex-wrap items-center gap-2">
        {[
          "캠페인 선택",
          mode === "bulk" ? "엑셀·이미지 불러오기" : "브리프·이미지 → AI 세팅안",
          "확인·수정",
          "실행 + 확인 = 승인",
        ].map((t, i, a) => {
          const done = i === 0 && allLoaded;
          const current = i === 0 ? !allLoaded : i === 1 && allLoaded;
          return (
            <li key={t} className="flex items-center gap-2">
              <span
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[14px] ${
                  current ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(16,24,40,0.08)] ring-1 ring-[#F6C3AE]" : done ? "bg-white/70 text-ink-soft ring-1 ring-line" : "text-ink-muted"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold ${
                    done ? "bg-[#12B76A] text-white" : current ? "bg-[#eb6834] text-white" : "bg-[#E4E7EC] text-ink-muted"
                  }`}
                >
                  {done ? <i className="ti ti-check text-[13px]" aria-hidden /> : i + 1}
                </span>
                {t}
              </span>
              {i < a.length - 1 && <i className="ti ti-chevron-right text-[14px] text-ink-faint" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {/* 1. 캠페인 */}
      <section className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1EA] text-[16px] font-bold text-[#eb6834]">1</span>
            <div className="min-w-0">
              <h3 className="text-[18px] font-bold text-ink">캠페인 선택</h3>
              <p className="mt-0.5 text-[14px] text-ink-muted">
                {accountNo ? (
                  <>
                    GFA 광고계정 <span className="tabular-nums">{accountNo}</span> · GFA에서 만들어 둔 캠페인을 고르세요(여러 개 선택 가능) — 나머지는 자동으로 세팅합니다
                  </>
                ) : (
                  "GFA에서 만들어 둔 캠페인을 고르세요"
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex items-center">
              <i className="ti ti-search pointer-events-none absolute left-3.5 text-[16px] text-ink-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="캠페인 이름·ID 검색"
                aria-label="캠페인 검색"
                className="w-[240px] rounded-full border border-line bg-white py-2 pl-10 pr-4 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-[#eb6834] focus:shadow-[0_0_0_3px_rgba(235,104,52,0.12)]"
              />
            </label>
            <div className="inline-flex rounded-full bg-[#F2F4F7] p-1">
              {(
                [
                  { key: "all", label: "전체", n: campaigns ? searched.length : undefined },
                  { key: "on", label: "ON", n: campaigns ? searched.filter((c) => c.activated).length : undefined },
                  { key: "off", label: "OFF", n: campaigns ? searched.filter((c) => !c.activated).length : undefined },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOnlyActive(o.key)}
                  aria-pressed={onlyActive === o.key}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] transition ${
                    onlyActive === o.key ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {o.label}
                  {o.n !== undefined && <span className={`text-[12px] tabular-nums ${onlyActive === o.key ? "text-[#eb6834]" : "text-ink-faint"}`}>{o.n}</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadCampaigns}
              disabled={campLoading}
              title="캠페인 목록 새로고침"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-4 py-2 text-[14px] text-ink-soft transition hover:border-[#F6C3AE] hover:text-ink disabled:opacity-50"
            >
              <i className={`ti ti-refresh text-[15px] ${campLoading ? "animate-spin" : ""}`} aria-hidden />
              {campLoading ? "불러오는 중" : "새로고침"}
            </button>
          </div>
        </div>

        {/* 선택 바 — 선택 개수·선택한 캠페인 칩·모두 선택/해제 */}
        {campaigns && campaigns.length > 0 && (
          <div
            className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 transition ${
              picked.length ? "bg-[#FFF4EE] ring-1 ring-[#FAD9CB]" : "bg-[#F9FAFB] ring-1 ring-[#F2F4F7]"
            }`}
          >
            {picked.length ? (
              <span className="flex items-center gap-2 whitespace-nowrap text-[15px] text-ink">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#eb6834] px-1.5 text-[13px] font-bold tabular-nums text-white">{picked.length}</span>
                <b>개 캠페인 선택됨</b>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-[14px] text-ink-muted">
                <i className="ti ti-hand-click text-[16px]" aria-hidden />
                캠페인을 눌러 고르세요 — 여러 개를 골라 한 번에 벌크 업로드할 수 있어요
              </span>
            )}
            {picked.length > 0 && (
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {picked.map((no) => {
                  const c = campaigns.find((x) => x.no === no);
                  return (
                    <span key={no} className="inline-flex max-w-[260px] items-center gap-1 rounded-full bg-white py-0.5 pl-3 pr-1 text-[13px] text-ink ring-1 ring-[#FAD9CB]">
                      <span className="truncate" title={c ? `${c.name} (#${no})` : `#${no}`}>
                        {c?.name ?? `#${no}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCampaign(no)}
                        disabled={running}
                        aria-label={`${c?.name ?? no} 선택 해제`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-[#FDEEE8] hover:text-ink disabled:opacity-40"
                      >
                        <i className="ti ti-x text-[12px]" aria-hidden />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {(() => {
                const selectable = shownCampaigns.filter((c) => SUPPORTED_OBJECTIVES.includes(c.objective)).map((c) => c.no);
                const rest = selectable.filter((n) => !picked.includes(n)).length;
                return (
                  <button
                    type="button"
                    onClick={() => selectShown(selectable)}
                    disabled={running || !rest}
                    className="whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold text-[#C2410C] hover:bg-white disabled:font-normal disabled:text-ink-faint disabled:hover:bg-transparent"
                  >
                    {q || onlyActive !== "all" ? "보이는 캠페인 모두 선택" : "모두 선택"}
                    {rest > 0 && <span className="ml-1 tabular-nums">+{rest}</span>}
                  </button>
                );
              })()}
              {picked.length > 0 && (
                <button type="button" onClick={() => !running && changePicked([])} disabled={running} className="whitespace-nowrap rounded-full px-3 py-1 text-[13px] text-ink-soft hover:bg-white hover:text-ink disabled:opacity-40">
                  선택 해제
                </button>
              )}
            </div>
          </div>
        )}

        {campErr && (
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[14px] text-bad">
            <i className="ti ti-alert-circle text-[16px]" aria-hidden />
            {campErr.msg}
            {campErr.code === "NO_AD_ACCOUNT" && (
              <Link href="/clients" className="ml-1 font-semibold underline">
                광고주 관리로 가기
              </Link>
            )}
          </p>
        )}
        {campLoading && !campaigns && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-xl bg-[#F2F4F7]" />
            ))}
          </div>
        )}
        {campaigns && !shownCampaigns.length && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
            <i className={`ti ${q ? "ti-search-off" : "ti-folder-off"} text-[28px] text-ink-faint`} aria-hidden />
            <p className="text-[15px] text-ink-muted">{q
                ? `'${query.trim()}'에 맞는 ${onlyActive === "on" ? "켜진 " : onlyActive === "off" ? "꺼진 " : ""}캠페인이 없어요.`
                : onlyActive === "on"
                  ? "켜진 캠페인이 없어요."
                  : onlyActive === "off"
                    ? "꺼진 캠페인이 없어요."
                    : "캠페인이 없어요. GFA에서 캠페인을 먼저 만들고 새로고침하세요."}
            </p>
            {q && (
              <button type="button" onClick={() => setQuery("")} className="mt-1 rounded-full border border-line bg-white px-4 py-1.5 text-[14px] text-ink-soft hover:text-ink">
                검색 지우기
              </button>
            )}
          </div>
        )}

        {shownCampaigns.length > 0 && (
          // 카드가 떠오를 때 그림자가 잘리지 않게 안쪽 여백을 둔다
          <div className="-mx-2 mt-3 grid max-h-[580px] gap-4 overflow-y-auto px-2 pb-2 pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownCampaigns.map((c) => {
              const ok = SUPPORTED_OBJECTIVES.includes(c.objective);
              const active = picked.includes(c.no);
              const loading = ctxLoading.includes(c.no);
              return (
                <button
                  key={c.no}
                  type="button"
                  disabled={!ok || running}
                  onClick={() => toggleCampaign(c.no)}
                  aria-pressed={active}
                  title={ok ? undefined : UNSUPPORTED_REASON}
                  className={`group relative flex flex-col rounded-xl border p-5 text-left transition duration-200 ${
                    !ok
                      ? "cursor-not-allowed border-dashed border-[#D0D5DD] bg-[#FAFAFB]"
                      : active
                      ? "border-[#eb6834] shadow-[0_0_0_3px_rgba(235,104,52,0.14),0_8px_20px_-8px_rgba(235,104,52,0.35)]"
                      : "border-[#EAECF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] enabled:hover:-translate-y-0.5 enabled:hover:border-[#F6C3AE] enabled:hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,0.18)]"
                  } disabled:cursor-not-allowed ${ok ? "disabled:opacity-55" : ""}`}
                >
                  {/* 선택 체크(여러 개 선택 가능) — 미지원 목적은 자물쇠 */}
                  {!ok ? (
                    <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-md bg-[#F2F4F7] text-ink-faint" aria-hidden>
                      <i className="ti ti-lock text-[14px]" />
                    </span>
                  ) : (
                  <span
                    className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-md transition ${
                      active ? "bg-[#eb6834] text-white" : "border-2 border-[#D0D5DD] bg-white text-transparent group-hover:border-[#F6C3AE]"
                    }`}
                    aria-hidden
                  >
                    <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-check"} text-[14px]`} />
                  </span>
                  )}

                  {/* 상태 뱃지 */}
                  {c.activated ? (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[12px] font-semibold text-[#067647] ring-1 ring-[#ABEFC6]">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#17B26A] opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#17B26A]" />
                      </span>
                      활성
                    </span>
                  ) : (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F2F4F7] px-2.5 py-0.5 text-[12px] font-semibold text-ink-muted ring-1 ring-[#E4E7EC]">
                      <span className="h-2 w-2 rounded-full bg-[#98A2B3]" />
                      비활성
                    </span>
                  )}

                  <p className={`mt-3 truncate pr-8 text-[16px] font-bold ${ok ? "text-ink" : "text-ink-muted"}`} title={c.name}>
                    {c.name}
                  </p>
                  <p className="mt-1 text-[13px] tabular-nums text-ink-muted">ID {c.no}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[#F2F4F7] pt-3 text-[12px]">
                    <span className={`rounded-md px-2 py-0.5 font-medium ${ok ? "bg-[#FFF1EA] text-[#B93815]" : "bg-[#F2F4F7] text-ink-muted"}`}>{OBJECTIVE_LABEL[c.objective] ?? c.objective}</span>
                    {c.cbo && <span className="rounded-md bg-[#F2F4F7] px-2 py-0.5 font-medium text-ink-soft">CBO</span>}
                    {!ok && (
                      <span className="flex items-center gap-1 text-ink-muted">
                        <i className="ti ti-info-circle text-[13px]" aria-hidden />
                        {c.objective === "WATCH_VIDEO" ? "영상 소재형" : c.objective === "INSTALL_APP" ? "앱 설치형" : "상품 피드형"}이라 자동 세팅 미지원
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {ctxLoading.length > 0 && (
          <p className="mt-5 flex items-center gap-2 text-[14px] text-ink-muted">
            <i className="ti ti-loader-2 animate-spin" aria-hidden />
            캠페인 정보를 불러오는 중… ({ctxLoading.length}개)
          </p>
        )}
        {picked.length === 1 && ctx && (
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-[#F9FAFB] px-4 py-3 text-[14px] text-ink-soft ring-1 ring-[#F2F4F7]">
            <span>
              목적 <b className="text-ink">{OBJECTIVE_LABEL[ctx.campaign.objective] ?? ctx.campaign.objective}</b>
            </span>
            <span>
              입찰 <b className="text-ink">{ctx.sample.bidGoal ?? "—"} · {ctx.sample.bidType ?? "—"} · {ctx.sample.bidStrategy ?? "—"}</b>
              <span className="text-ink-muted"> (GFA 캠페인 기본값 그대로)</span>
            </span>
            <span>
              이미 있는 광고그룹 <b className="text-ink">{ctx.existingAdSets.length}개</b>
            </span>
            {unsupported && <span className="text-bad">이 목적은 아직 자동 세팅을 지원하지 않아요.</span>}
          </div>
        )}
        {picked.length > 1 && pickedCtxs.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl ring-1 ring-[#F2F4F7]">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="bg-[#F9FAFB] text-left text-[13px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">선택한 캠페인</th>
                  <th className="px-4 py-2 font-medium">목적</th>
                  <th className="px-4 py-2 font-medium">입찰 (GFA 기본값 그대로)</th>
                  <th className="px-4 py-2 text-right font-medium">기존 광고그룹</th>
                </tr>
              </thead>
              <tbody>
                {pickedCtxs.map((c) => (
                  <tr key={c.campaign.no} className="border-t border-[#F2F4F7]">
                    <td className="max-w-[320px] px-4 py-2">
                      <p className="truncate font-semibold text-ink" title={c.campaign.name}>
                        {c.campaign.name}
                      </p>
                      <p className="text-[12px] tabular-nums text-ink-muted">ID {c.campaign.no}</p>
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{OBJECTIVE_LABEL[c.campaign.objective] ?? c.campaign.objective}</td>
                    <td className="px-4 py-2 text-ink-soft">
                      {c.sample.bidGoal ?? "—"} · {c.sample.bidType ?? "—"} · {c.sample.bidStrategy ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{c.existingAdSets.length}개</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {allLoaded && pickedCtxs.length > 0 && clientId && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-[#EAECF0]">
            {(
              [
                { key: "bulk", label: "엑셀 벌크 업로드", icon: "file-spreadsheet" },
                { key: "ai", label: "AI 자동 세팅", icon: "sparkles" },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => !running && setMode(o.key)}
                disabled={o.key === "ai" && picked.length > 1}
                title={o.key === "ai" && picked.length > 1 ? "AI 자동 세팅은 캠페인 1개를 골랐을 때만 쓸 수 있어요" : undefined}
                aria-pressed={mode === o.key}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === o.key ? "bg-[#eb6834] font-semibold text-white shadow-[0_1px_3px_rgba(235,104,52,0.4)]" : "text-ink-muted enabled:hover:text-ink"
                }`}
              >
                <i className={`ti ti-${o.icon} text-[15px]`} aria-hidden />
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-[14px] text-ink-muted">
            {mode === "bulk"
              ? picked.length > 1
                ? `캠페인 ${picked.length}개에 엑셀 한 장으로 한 번에 — AI 자동 세팅은 캠페인 1개일 때만`
                : "엑셀 한 장 + 이미지 폴더로 소재를 한 번에 — 이미지는 파일명의 상품명으로 자동 매칭"
              : "브리프만 넣으면 AI가 광고그룹·타겟·예산·카피를 설계"}
          </span>
        </div>
      )}

      {/* 선택을 바꿔도 엑셀·이미지는 유지(key 없음) */}
      {allLoaded && pickedCtxs.length > 0 && clientId && mode === "bulk" && <BulkUpload clientId={clientId} ctxs={pickedCtxs} accountNo={accountNo} canEdit={canEdit} />}

      {/* 2. 브리프 */}
      {ctx && !unsupported && mode === "ai" && (
        <Card title="2. 브리프·소재 이미지" sub="상품·랜딩·예산과 이미지만 넣으면 타겟 분리·예산 배분·카피·네이밍·UTM은 AI와 규칙이 채웁니다">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <Field label="상품·서비스 *">
                <input className={INPUT} value={brief.product} onChange={(e) => setBrief({ ...brief, product: e.target.value })} placeholder="예: 르무통 메이트 워킹화(통기성 니트, 남녀 공용)" />
              </Field>
              <Field label="프로모션·혜택">
                <input className={INPUT} value={brief.offer} onChange={(e) => setBrief({ ...brief, offer: e.target.value })} placeholder="예: 10/10까지 추석 선물 15% 할인 + 무료 포장 (없으면 비움)" />
              </Field>
              <Field label="타겟 메모">
                <input className={INPUT} value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} placeholder="예: 부모님 선물 찾는 3040, 오래 서 있는 직장인 (비우면 AI가 판단)" />
              </Field>
              <Field label="랜딩 URL *">
                <input className={INPUT} value={brief.landingUrl} onChange={(e) => setBrief({ ...brief, landingUrl: e.target.value })} placeholder="https://" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="일 예산 합계 *">
                  <input type="number" min={10000} step={10000} className={INPUT} value={brief.dailyBudget || ""} onChange={(e) => setBrief({ ...brief, dailyBudget: Number(e.target.value) })} />
                </Field>
                <Field label="시작일">
                  <input type="date" min={today()} className={INPUT} value={brief.startDate} onChange={(e) => setBrief({ ...brief, startDate: e.target.value })} />
                  <p className="mt-1 text-[12px] text-ink-muted">비우면 GFA 기본({ctx.sample.startTime?.replace("T", " ") ?? "—"})</p>
                </Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <Field label="광고그룹 개수">
                  <Segmented
                    value={String(brief.adSetCount)}
                    options={[{ key: "0", label: "AI 판단" }, { key: "1", label: "1" }, { key: "2", label: "2" }, { key: "3", label: "3" }, { key: "4", label: "4" }]}
                    onChange={(v) => setBrief({ ...brief, adSetCount: Number(v) })}
                  />
                </Field>
                <Field label="카피 변형">
                  <Segmented value={String(brief.copyCount)} options={[{ key: "1", label: "1" }, { key: "2", label: "2" }, { key: "3", label: "3" }]} onChange={(v) => setBrief({ ...brief, copyCount: Number(v) })} />
                </Field>
              </div>
              <Field label="참고 메모">
                <textarea rows={2} className={INPUT} value={brief.notes} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} placeholder="금지어, 톤, 꼭 넣을 문구 등" />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label={`소재 이미지 * (최대 ${MAX_IMAGES}장 — 규격별로 자동으로 잘라 올립니다)`}>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-canvas px-4 py-6 text-[14px] text-ink-muted hover:bg-signal-soft">
                  <i className="ti ti-photo-plus text-[22px]" />
                  <span className="mt-1">이미지 선택 (JPG·PNG, 1200px 이상 권장)</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files).then(() => (e.target.value = ""))} />
                </label>
                {images.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-3">
                    {images.map((img, i) => (
                      <div key={img.url} className="group relative overflow-hidden rounded-lg border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[12px] text-white">
                          {i + 1} · {img.width}×{img.height}
                        </span>
                        <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-[12px] text-white" aria-label="이미지 빼기">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="소재 규격 (단일 이미지)">
                <div className="flex flex-wrap gap-2">
                  {SINGLE_IMAGE_TEMPLATES.filter((t) => isFeedTemplate(t.code)).map((t) => {
                    const on = formats.includes(t.code);
                    return (
                      <button key={t.code} type="button" onClick={() => setFormats(on ? formats.filter((f) => f !== t.code) : [...formats, t.code])} className={`${CHIP} ${on ? CHIP_ON : ""}`}>
                        {on && "✓ "}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {blurry.length > 0 && <p className="mt-2 text-[13px] text-warn">원본보다 1.5배 넘게 키워져 흐려질 수 있어요: {blurry.join(", ")}</p>}
              </Field>
              <label className="flex items-start gap-2 text-[14px] text-ink-soft">
                <input type="checkbox" className="mt-1" checked={useUtm} onChange={(e) => setUseUtm(e.target.checked)} />
                <span>
                  랜딩 URL에 UTM 자동 추가 <span className="text-ink-muted">(source=naver · medium=gfa · campaign=캠페인명 · content=소재명, 이미 UTM이 있으면 그대로 둠)</span>
                </span>
              </label>
              <button
                type="button"
                onClick={makePlan}
                disabled={!briefReady || planLoading || running}
                className="w-full rounded-lg bg-[#eb6834] px-4 py-3 text-[16px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40"
              >
                {planLoading ? "AI가 세팅안을 만드는 중… (20~40초)" : plan ? "세팅안 다시 만들기" : "✨ AI 세팅안 만들기"}
              </button>
              {!briefReady && <p className="text-[13px] text-ink-muted">상품, http로 시작하는 랜딩 URL, 일 예산을 넣으면 만들 수 있어요.</p>}
              {planErr && <p className="text-[14px] text-bad">{planErr}</p>}
            </div>
          </div>
        </Card>
      )}

      {/* 3. 세팅안 */}
      {plan && ctx && mode === "ai" && (
        <Card
          title="3. 세팅안 확인·수정"
          sub={plan.summary}
          right={
            <span className="whitespace-nowrap text-[14px] text-ink-muted">
              광고그룹 {plan.adSets.length} · 소재 {creativeCount} · 일 {won(totalBudget)}
            </span>
          }
        >
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                    <th className="py-2 pr-3 font-medium">광고그룹 이름(자동)</th>
                    <th className="py-2 pr-3 font-medium">타겟 이름</th>
                    <th className="py-2 pr-3 font-medium">성별</th>
                    <th className="py-2 pr-3 font-medium">연령</th>
                    <th className="py-2 pr-3 font-medium">기기</th>
                    <th className="py-2 pr-3 text-right font-medium">일 예산</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {plan.adSets.map((a, i) => (
                    <AdSetRow
                      key={i}
                      a={a}
                      name={adSetName(a, startDate)}
                      onChange={(n) => setPlan({ ...plan, adSets: plan.adSets.map((x, j) => (j === i ? n : x)) })}
                      onRemove={plan.adSets.length > 1 ? () => setPlan({ ...plan, adSets: plan.adSets.filter((_, j) => j !== i) }) : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {plan.copies.map((c, i) => (
                <CopyCard key={i} idx={i} c={c} onChange={(n) => setPlan({ ...plan, copies: plan.copies.map((x, j) => (j === i ? n : x)) })} />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-canvas px-4 py-3">
              <label className="flex items-center gap-2 text-[15px] text-ink">
                <input type="checkbox" checked={turnOn} onChange={(e) => setTurnOn(e.target.checked)} />
                만든 뒤 바로 켜기 <span className="text-[13px] text-ink-muted">(끄면 꺼진 상태로 만들고, GFA에서 확인 후 켭니다)</span>
              </label>
              <div className="ml-auto flex items-center gap-3">
                {!canEdit && <span className="text-[13px] text-ink-muted">보기 전용 계정 — 승인(실행)은 관리자(k2s)만</span>}
                {images.length === 0 && <span className="text-[13px] text-warn">이미지를 넣어 주세요</span>}
                {copyIssues.length > 0 && <span className="text-[13px] text-bad">{copyIssues[0]}</span>}
                <button type="button" onClick={run} disabled={!runReady} className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-ink-soft disabled:opacity-40">
                  {running ? "세팅 중…" : `🚀 GFA에 세팅 실행 (소재 ${creativeCount}개)`}
                </button>
              </div>
            </div>
            {creativeCount > 40 && <p className="text-[13px] text-warn">소재가 많아요({creativeCount}개). 이미지·규격·카피 수를 줄이면 검수와 학습이 빨라집니다.</p>}
          </div>
        </Card>
      )}

      {mode === "ai" && <RunLog title="4. 세팅 결과" log={log} result={result} running={running} />}
    </div>
  );
}

function AdSetRow({ a, name, onChange, onRemove }: { a: PlanAdSet; name: string; onChange: (a: PlanAdSet) => void; onRemove?: () => void }) {
  const toggleAge = (k: AgeKey) => {
    const set = a.ages.length ? a.ages : [];
    onChange({ ...a, ages: set.includes(k) ? set.filter((x) => x !== k) : [...set, k] });
  };
  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-3">
        <p className="font-mono text-[13px] text-ink">{name}</p>
        <p className="mt-1 max-w-[260px] text-[12px] text-ink-muted">{a.rationale}</p>
      </td>
      <td className="py-3 pr-3">
        <input className={`${CELL} w-[120px] py-1 text-[14px]`} value={a.label} onChange={(e) => onChange({ ...a, label: e.target.value.replace(/\s+/g, "") })} />
      </td>
      <td className="py-3 pr-3">
        <select
          className={`${CELL} w-[90px] py-1 text-[14px]`}
          value={a.genders.length === 1 ? a.genders[0] : "ALL"}
          onChange={(e) => onChange({ ...a, genders: e.target.value === "ALL" ? [] : [e.target.value as "M" | "F"] })}
        >
          <option value="ALL">전체</option>
          <option value="F">여성</option>
          <option value="M">남성</option>
        </select>
      </td>
      <td className="py-3 pr-3">
        <div className="flex max-w-[320px] flex-wrap gap-1">
          <button type="button" onClick={() => onChange({ ...a, ages: [] })} className={`${CHIP} px-2 py-0.5 text-[12px] ${a.ages.length === 0 ? CHIP_ON : ""}`}>
            전체
          </button>
          {AGE_BANDS.map((b) => (
            <button key={b.key} type="button" onClick={() => toggleAge(b.key)} className={`${CHIP} px-2 py-0.5 text-[12px] ${a.ages.includes(b.key) ? CHIP_ON : ""}`}>
              {b.key}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-ink-muted">코드 {demoCode(a)}</p>
      </td>
      <td className="py-3 pr-3">
        <select className={`${CELL} w-[100px] py-1 text-[14px]`} value={a.device} onChange={(e) => onChange({ ...a, device: e.target.value as PlanAdSet["device"] })}>
          <option value="ALL">전체</option>
          <option value="MOBILE">모바일</option>
        </select>
      </td>
      <td className="py-3 pr-3 text-right">
        <input
          type="number"
          step={1000}
          className={`${CELL} w-[120px] py-1 text-right text-[14px] tabular-nums`}
          value={a.budget}
          onChange={(e) => onChange({ ...a, budget: Number(e.target.value) })}
          onBlur={() => onChange({ ...a, budget: roundBudget(a.budget) })}
        />
      </td>
      <td className="py-3">
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-[13px] text-ink-muted hover:text-bad" aria-label="광고그룹 빼기">
            빼기
          </button>
        )}
      </td>
    </tr>
  );
}

function CopyCard({ idx, c, onChange }: { idx: number; c: PlanCopy; onChange: (c: PlanCopy) => void }) {
  const fields: { k: "message" | "linkTitle" | "linkDescription"; label: string; max: number }[] = [
    { k: "message", label: "광고 문구", max: 65 },
    { k: "linkTitle", label: "제목", max: 25 },
    { k: "linkDescription", label: "설명", max: 45 },
  ];
  const set = (k: "message" | "linkTitle" | "linkDescription" | "cta", v: string) => onChange({ ...c, [k]: v.slice(0, fields.find((f) => f.k === k)?.max ?? 65) });
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="mb-3 text-[14px] font-semibold text-ink">카피 {idx + 1}</p>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.k}>
            <div className="mb-1 flex justify-between text-[12px] text-ink-muted">
              <span>{f.label}</span>
              <span className="tabular-nums">
                {c[f.k].length}/{f.max}
              </span>
            </div>
            {f.k === "message" ? (
              <textarea rows={2} className={`${INPUT} text-[14px]`} value={c[f.k]} onChange={(e) => set(f.k, e.target.value)} />
            ) : (
              <input className={`${INPUT} text-[14px]`} value={c[f.k]} onChange={(e) => set(f.k, e.target.value)} />
            )}
          </div>
        ))}
        <div>
          <p className="mb-1 text-[12px] text-ink-muted">버튼(CTA)</p>
          <select className={`${INPUT} text-[14px]`} value={c.cta} onChange={(e) => set("cta", e.target.value)}>
            {CTA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
