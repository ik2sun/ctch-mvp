"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅(GFA) — 탭 2개(왼쪽 = 엑셀 벌크 업로드 기본, 오른쪽 = 수동 세팅)
//  · 수동 세팅(manual/ManualSetup.tsx): 한 화면에서 캠페인·광고그룹·소재를 GFA 항목 그대로 만든다(새 캠페인 또는 기존 캠페인에 추가)
//  · 엑셀 벌크 업로드(BulkUpload.tsx): 기존 캠페인을 골라(여러 개 가능) 엑셀 한 장 + 이미지로 한 번에
// 실행은 둘 다 runner.ts. 2026-10-09 AI 자동 세팅은 사용자 요청으로 삭제
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { OBJECTIVE_LABEL, SUPPORTED_OBJECTIVES, type GfaCampaignLite, type GfaContext } from "./types";
import { postAutopilot as post } from "./runner";
import { BulkUpload } from "./BulkUpload";
import { ManualSetup } from "./manual/ManualSetup";

// 이미지 단일 소재로 세팅할 수 없는 목적 — 카드에 자물쇠와 함께 보여 준다
const UNSUPPORTED_REASON = "ADVoost 쇼핑·쇼핑 프로모션·카탈로그는 상품 피드로, 동영상 조회는 영상 소재로, 앱 설치는 앱 정보로 만드는 캠페인이라 이미지 소재 자동 세팅을 지원하지 않아요.";

export function GfaSetup() {
  const { selected } = useClients();
  const canEdit = true; // 오토파일럿 실행은 구성원 누구나(서버 access.ts memberOnly — 2026-10-09)
  const clientId = selected?.id ?? null;
  const [tab, setTab] = useState<"manual" | "bulk">("bulk");

  // 1. 캠페인
  const [campaigns, setCampaigns] = useState<GfaCampaignLite[] | null>(null);
  const [accountNo, setAccountNo] = useState("");
  const [campErr, setCampErr] = useState<{ msg: string; code?: string } | null>(null);
  const [campLoading, setCampLoading] = useState(false);
  const [onlyActive, setOnlyActive] = useState<"all" | "on" | "off">("all");
  const [query, setQuery] = useState("");
  // 여러 캠페인 선택(고른 순서 유지) — 벌크 업로드 대상
  const [picked, setPicked] = useState<number[]>([]);
  const [ctxs, setCtxs] = useState<Record<number, GfaContext>>({});
  const [ctxLoading, setCtxLoading] = useState<number[]>([]);
  const running = false; // 실행 중 잠금은 BulkUpload 안에서

  const ctx = picked.length === 1 ? ctxs[picked[0]] ?? null : null;
  const pickedCtxs = picked.map((n) => ctxs[n]).filter((c): c is GfaContext => !!c && SUPPORTED_OBJECTIVES.includes(c.campaign.objective));
  const allLoaded = picked.length > 0 && picked.every((n) => ctxs[n]);

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
    loadCampaigns();
  }, [loadCampaigns]);

  const changePicked = (next: number[]) => setPicked(next);

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

  const unsupported = ctx && !SUPPORTED_OBJECTIVES.includes(ctx.campaign.objective);

  // ── 화면 ──────────────────────────────────────────
  // 검색 — 이름·캠페인 ID, 대소문자·공백 무시. 상태 칩 개수는 검색 결과 기준
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  const searched = (campaigns ?? []).filter((c) => !q || norm(c.name).includes(q) || String(c.no).includes(q));
  const shownCampaigns = searched.filter((c) => onlyActive === "all" || (onlyActive === "on" ? c.activated : !c.activated));

  return (
    <div className="space-y-6">
      {/* 탭 — 수동 세팅 / 엑셀 벌크 업로드 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-[#EAECF0]">
          {(
            [
              { key: "bulk", label: "엑셀 벌크 업로드", icon: "file-spreadsheet" },
              { key: "manual", label: "수동 세팅", icon: "adjustments-horizontal" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setTab(o.key)}
              aria-pressed={tab === o.key}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-5 py-2 text-[15px] transition ${
                tab === o.key ? "bg-[#eb6834] font-semibold text-white shadow-[0_1px_3px_rgba(235,104,52,0.4)]" : "text-ink-muted hover:text-ink"
              }`}
            >
              <i className={`ti ti-${o.icon} text-[16px]`} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-[14px] text-ink-muted">
          {tab === "manual" ? "캠페인·광고그룹·소재를 한 화면에서 GFA 항목 그대로 — 새 캠페인부터 또는 기존 캠페인에 추가" : "기존 캠페인을 골라 엑셀 한 장 + 이미지로 한 번에(캠페인 여러 개 가능)"}
        </span>
      </div>

      {tab === "manual" ? (
        clientId ? <ManualSetup key={clientId} clientId={clientId} clientName={selected?.name ?? ""} /> : <p className="text-[15px] text-ink-muted">광고주를 먼저 고르세요.</p>
      ) : (
      <>
      {/* 진행 단계 */}
      <ol className="flex flex-wrap items-center gap-2">
        {[
          "캠페인 선택",
          "엑셀·이미지 불러오기",
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
      <section className="rounded-2xl border border-[#EAECF0] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
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
            className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2 transition ${
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
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[58px] animate-pulse rounded-lg bg-[#F2F4F7]" />
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
          <div className="-mx-1 mt-3 grid max-h-[300px] gap-2 overflow-y-auto px-1 pb-1 pt-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                  className={`group relative flex flex-col rounded-lg border px-3.5 py-2.5 text-left transition duration-200 ${
                    !ok
                      ? "cursor-not-allowed border-dashed border-[#D0D5DD] bg-[#FAFAFB]"
                      : active
                      ? "border-[#eb6834] bg-[#FFF8F4] shadow-[0_0_0_2px_rgba(235,104,52,0.14)]"
                      : "border-[#EAECF0] bg-white enabled:hover:border-[#F6C3AE] enabled:hover:shadow-[0_6px_16px_-8px_rgba(16,24,40,0.18)]"
                  } disabled:cursor-not-allowed ${ok ? "disabled:opacity-55" : ""}`}
                >
                  {/* 1줄: 이름 + 선택 체크(미지원 목적은 자물쇠) */}
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${ok ? "text-ink" : "text-ink-muted"}`} title={c.name}>
                      {c.name}
                    </span>
                    {!ok ? (
                      <i className="ti ti-lock shrink-0 text-[14px] text-ink-faint" aria-hidden />
                    ) : (
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded transition ${
                          active ? "bg-[#eb6834] text-white" : "border-2 border-[#D0D5DD] bg-white text-transparent group-hover:border-[#F6C3AE]"
                        }`}
                        aria-hidden
                      >
                        <i className={`ti ${loading ? "ti-loader-2 animate-spin" : "ti-check"} text-[12px]`} />
                      </span>
                    )}
                  </span>
                  {/* 2줄: 상태 · ID · 목적 */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.activated ? "bg-[#17B26A]" : "bg-[#98A2B3]"}`} />
                      <span className={c.activated ? "font-semibold text-[#067647]" : ""}>{c.activated ? "활성" : "비활성"}</span>
                    </span>
                    <span className="tabular-nums">ID {c.no}</span>
                    <span className={`rounded px-1.5 py-px font-medium ${ok ? "bg-[#FFF1EA] text-[#B93815]" : "bg-[#F2F4F7] text-ink-muted"}`}>{OBJECTIVE_LABEL[c.objective] ?? c.objective}</span>
                    {c.cbo && <span className="rounded bg-[#F2F4F7] px-1.5 py-px font-medium text-ink-soft">CBO</span>}
                    {!ok && <span>자동 세팅 미지원</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {ctxLoading.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-muted">
            <i className="ti ti-loader-2 animate-spin" aria-hidden />
            캠페인 정보를 불러오는 중… ({ctxLoading.length}개)
          </p>
        )}
        {picked.length === 1 && ctx && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-[#F9FAFB] px-4 py-2 text-[14px] text-ink-soft ring-1 ring-[#F2F4F7]">
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
          <div className="mt-3 max-h-[200px] overflow-auto rounded-xl ring-1 ring-[#F2F4F7]">
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

      {/* 캠페인을 고르기 전에도 보인다(엑셀·이미지 먼저 준비 가능). 선택을 바꿔도 엑셀·이미지는 유지(key 없음) */}
      {clientId && <BulkUpload clientId={clientId} ctxs={pickedCtxs} accountNo={accountNo} canEdit={canEdit} />}

      </>
      )}
    </div>
  );
}

