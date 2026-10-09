"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 메타 > 엑셀 벌크 업로드
// ① 캠페인 고르기(여러 개) → ② 템플릿 내려받기(기존 광고세트·설정 미리 채움, 파일을 먼저 불러오면 광고 행까지) · 엑셀·소재 파일 올리기
// → ③ 매칭 결과(행마다 캠페인 × 세트(기존·새로·복사) × 소재(피드 + 세로 자동 짝) × 문구, 문제 행은 자동 제외) → 아래 고정 바에서 메타 검증·실행
// 실행은 캠페인마다 run.ts runMeta를 차례로(파일·소재는 광고계정 단위라 캐시로 한 번만 올리고 만든다)
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { downloadDriveFile, folderIdFrom, getDriveToken, listDriveImages } from "../gfa/driveImport";
import { MoneyInput } from "../gfa/ui";
import { AccountBar } from "./AccountBar";
import {
  AD_GUIDE,
  AD_HEADERS,
  AD_SAMPLES,
  AD_SHEET,
  AD_WIDTHS,
  AUDIENCE_HEADERS,
  AUDIENCE_SHEET,
  GUIDE_SHEET,
  GUIDE_TAIL,
  SET_GUIDE,
  SET_HEADERS,
  SET_SAMPLES,
  SET_SHEET,
  SET_WIDTHS,
  adSetToRow,
  audienceRows,
  campaignKey,
  optimizationIndex,
  parseAdSheet,
  parseSetSheet,
  resolveAudiences,
  resolveMedia,
  type AdRow,
  type SetSpec,
} from "./bulkSheet";
import { readMedia, VIDEO_MAX, type LocalMedia } from "./media";
import {
  adsFromMedia,
  ATTRIBUTIONS,
  CTA_LABEL,
  DEFAULT_URL_TAGS,
  EMPTY_COPY,
  OBJECTIVE_LABEL,
  OPTIMIZATION,
  SUPPORTED_OBJECTIVES,
  copyOf,
  type AdDraft,
  type AdSetDraft,
  type Defaults,
  type MetaAccountCtx,
  type MetaAdSetLite,
  type MetaAudience,
  type MetaCampaignLite,
  type MetaObjective,
  type Problem,
} from "./model";
import { newCache, postMeta, runMeta, type LogLine, type MetaRunResult } from "./run";
import { MetaRunLog, RunBar } from "./RunBar";
import { StateFilter, isOn, lockReason, type StateKey } from "./StateFilter";

const MAX_FILES = 400;
const LS_KEY = (clientId: string) => `ctch_meta_setup_${clientId}`; // 빠른 세팅과 공통 문구·옵션 공유
const STATUS_DOT: Record<string, string> = { ACTIVE: "bg-[#17B26A]", PAUSED: "bg-[#98A2B3]", IN_PROCESS: "bg-[#F79009]", WITH_ISSUES: "bg-[#F04438]" };
const BTN = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-50";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#eb6834] px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-[#d95926] disabled:opacity-40";
const INP = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-[#eb6834]";
const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

type SetPlan = { mode: AdSetDraft["mode"]; sourceId: string | null; source?: MetaAdSetLite; spec?: SetSpec; draft: Omit<AdSetDraft, "key" | "ads"> | null; problems: string[] };
type Target = { campaign: MetaCampaignLite; set: SetPlan };
type Prepared = {
  key: string;
  row: AdRow;
  name: string;
  feed: LocalMedia | null;
  vertical: LocalMedia | null;
  targets: Target[];
  problems: string[];
  notes: string[];
};

export function MetaBulk({ clientId }: { clientId: string }) {
  // ── 광고계정·기본값 ──
  const [acc, setAcc] = useState<MetaAccountCtx | null>(null);
  const [accErr, setAccErr] = useState<{ msg: string; code?: string } | null>(null);
  const [accLoading, setAccLoading] = useState(false);
  const [defaults, setDefaults] = useState<Defaults>(() => {
    const base: Defaults = { pageId: "", igId: "", pixelId: "", copy: { ...EMPTY_COPY, cta: "LEARN_MORE" }, urlTags: DEFAULT_URL_TAGS, useUtm: false, turnOn: false, aiEnhance: false };
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY(clientId)) ?? "null") as Partial<Defaults> | null;
      if (s) return { ...base, ...s, copy: { ...base.copy, ...s.copy }, turnOn: false };
    } catch {
      /* 저장값 없음 */
    }
    return base;
  });
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY(clientId)) ?? "{}");
      localStorage.setItem(LS_KEY(clientId), JSON.stringify({ ...prev, copy: defaults.copy, urlTags: defaults.urlTags, useUtm: defaults.useUtm, aiEnhance: defaults.aiEnhance }));
    } catch {
      /* 저장 못 해도 동작 */
    }
  }, [clientId, defaults.copy, defaults.urlTags, defaults.useUtm, defaults.aiEnhance]);
  const [newBudget, setNewBudget] = useState<number | null>(50000); // 새 세트 기본 일 예산(시트에 행·예산이 없을 때)

  const loadAccount = useCallback(
    async (fresh = false) => {
      setAccLoading(true);
      setAccErr(null);
      try {
        const a = await postMeta<MetaAccountCtx>({ action: "account", clientId, fresh });
        setAcc(a);
        if (fresh) setSets({});
        setDefaults((d) => {
          const page = a.pages.find((p) => p.id === d.pageId) ?? a.pages[0];
          return { ...d, pageId: page?.id ?? "", igId: d.pageId === page?.id ? d.igId : page?.igId ?? "", pixelId: a.pixels.some((p) => p.id === d.pixelId) ? d.pixelId : a.pixels[0]?.id ?? "" };
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
  // 맞춤·유사 타겟(포함·제외 타겟 이름 확인 · 템플릿 '맞춤 타겟 목록' 시트)
  const [audiences, setAudiences] = useState<MetaAudience[] | null>(null);
  const [audErr, setAudErr] = useState<string | null>(null);
  const loadAudiences = useCallback(async (): Promise<MetaAudience[]> => {
    try {
      const r = await postMeta<{ audiences: MetaAudience[] }>({ action: "audiences", clientId });
      setAudiences(r.audiences);
      setAudErr(null);
      return r.audiences;
    } catch (e) {
      setAudErr((e as Error).message);
      return [];
    }
  }, [clientId]);
  useEffect(() => {
    loadAudiences();
  }, [loadAudiences]);

  // ── ① 캠페인 ──
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<StateKey>("all");
  const [sets, setSets] = useState<Record<string, MetaAdSetLite[] | "loading" | { error: string }>>({});
  const setsRef = useRef(sets);
  setsRef.current = sets;
  const loadSets = useCallback(
    async (ids: string[]) => {
      const need = ids.filter((id) => setsRef.current[id] === undefined); // 오류는 자동 재시도하지 않음(새로고침 버튼)
      if (!need.length) return;
      setSets((m) => ({ ...m, ...Object.fromEntries(need.map((id) => [id, "loading" as const])) }));
      await Promise.all(
        need.map(async (id) => {
          try {
            const r = await postMeta<{ adSets: MetaAdSetLite[] }>({ action: "adsets", clientId, campaignId: id });
            setSets((m) => ({ ...m, [id]: r.adSets }));
          } catch (e) {
            setSets((m) => ({ ...m, [id]: { error: (e as Error).message } }));
          }
        }),
      );
    },
    [clientId],
  );
  useEffect(() => {
    loadSets(picked);
  }, [picked, loadSets, sets]); // sets: 실행 뒤 목록을 비우면 다시 읽음(오류 상태는 need에서 빠져 반복 안 함)

  const campaigns = useMemo(() => (acc?.campaigns ?? []).filter((c) => SUPPORTED_OBJECTIVES.includes(c.objective) && c.buyingType === "AUCTION"), [acc]);
  // 목록은 계정 캠페인 전부(지원 안 하는 목표는 자물쇠) — 검색 → 전체/ON/OFF
  const searched = useMemo(() => {
    const n = (t: string) => t.toLowerCase().replace(/\s+/g, "");
    return (acc?.campaigns ?? []).filter((c) => !q || n(c.name).includes(n(q)) || c.id.includes(q));
  }, [acc, q]);
  const shownAll = searched.filter((c) => stateFilter === "all" || (stateFilter === "on" ? isOn(c.status) : !isOn(c.status)));
  const shown = shownAll.filter((c) => !lockReason(c, SUPPORTED_OBJECTIVES));
  const stateCounts = { all: searched.length, on: searched.filter((c) => isOn(c.status)).length, off: searched.filter((c) => !isOn(c.status)).length };
  const pickedCampaigns = picked.map((id) => campaigns.find((c) => c.id === id)).filter((c): c is MetaCampaignLite => !!c);
  const setsOf = (id: string) => (Array.isArray(sets[id]) ? (sets[id] as MetaAdSetLite[]) : []);
  const setsLoading = picked.some((id) => sets[id] === "loading" || sets[id] === undefined);

  // ── ② 엑셀 ──
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AdRow[]>([]);
  const [specs, setSpecs] = useState<SetSpec[]>([]);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [templBusy, setTemplBusy] = useState(false);

  async function downloadTemplate() {
    setTemplBusy(true);
    setSheetErr(null);
    try {
      // 고른 캠페인의 세트 목록이 다 올 때까지
      const fresh: Record<string, MetaAdSetLite[]> = {};
      for (const c of pickedCampaigns) {
        const cur = setsRef.current[c.id];
        fresh[c.id] = Array.isArray(cur) ? cur : (await postMeta<{ adSets: MetaAdSetLite[] }>({ action: "adsets", clientId, campaignId: c.id })).adSets;
      }
      const dup = (name: string) => pickedCampaigns.filter((c) => c.name.trim() === name.trim()).length > 1;
      const labelOf = (c: MetaCampaignLite) => (dup(c.name) ? c.id : c.name);
      const allSets = pickedCampaigns.flatMap((c) => fresh[c.id]);
      const guessSet = allSets.length === 1 ? allSets[0].name : "";
      // 광고 시트 — 파일을 먼저 불러왔으면 광고 1개 = 1행(짝 묶음 그대로), 아니면 고른 캠페인 × 기존 세트 빈 행, 둘 다 없으면 예시
      const files = [...media.values()];
      const blank = AD_HEADERS.slice(5).map(() => "");
      const adBody = files.length
        ? adsFromMedia(files).map((a) => {
            const f = a.feed ? media.get(a.feed)?.name ?? "" : "";
            const v = a.vertical ? media.get(a.vertical)?.name ?? "" : "";
            return ["", guessSet, a.name, f || v, f ? v : "", ...blank];
          })
        : pickedCampaigns.length
          ? pickedCampaigns.flatMap((c) => (fresh[c.id].length ? fresh[c.id].map((s) => [labelOf(c), s.name, "", "", "", ...blank]) : [[labelOf(c), "", "", "", "", ...blank]]))
          : AD_SAMPLES.map((r) => [...r]);
      const setBody = pickedCampaigns.length ? pickedCampaigns.flatMap((c) => fresh[c.id].map((s) => adSetToRow(labelOf(c), s))) : SET_SAMPLES.map((r) => [...r]);
      const aud = audiences ?? (await loadAudiences());
      const wb = XLSX.utils.book_new();
      const s1 = XLSX.utils.aoa_to_sheet([[...AD_HEADERS], ...adBody]);
      s1["!cols"] = AD_WIDTHS.map((w) => ({ wch: w }));
      s1["!freeze"] = { xSplit: 0, ySplit: 1 };
      const s2 = XLSX.utils.aoa_to_sheet([[...SET_HEADERS], ...setBody]);
      s2["!cols"] = SET_WIDTHS.map((w) => ({ wch: w }));
      const s3 = XLSX.utils.aoa_to_sheet([
        ...AD_GUIDE,
        [],
        ...SET_GUIDE,
        [],
        ...GUIDE_TAIL,
        [],
        ["선택한 캠페인", "'캠페인' 칸에 아래 ID나 이름을 그대로 적으면 됩니다"],
        ...pickedCampaigns.map((c) => [c.id, `${c.name} · ${OBJECTIVE_LABEL[c.objective] ?? c.objective}${c.dailyBudget || c.lifetimeBudget ? " · 캠페인 예산" : ""}`]),
      ]);
      s3["!cols"] = [{ wch: 24 }, { wch: 120 }];
      XLSX.utils.book_append_sheet(wb, s1, AD_SHEET);
      XLSX.utils.book_append_sheet(wb, s2, SET_SHEET);
      const s4 = XLSX.utils.aoa_to_sheet([AUDIENCE_HEADERS, ...audienceRows(aud)]);
      s4["!cols"] = [{ wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, s3, GUIDE_SHEET);
      XLSX.utils.book_append_sheet(wb, s4, AUDIENCE_SHEET);
      const tag = pickedCampaigns.length === 1 ? `_${pickedCampaigns[0].name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}` : pickedCampaigns.length > 1 ? `_캠페인${pickedCampaigns.length}개` : "";
      XLSX.writeFile(wb, `CTCH_메타_벌크업로드${tag}.xlsx`);
    } catch (e) {
      setSheetErr(`템플릿을 못 만들었어요 — ${(e as Error).message}`);
    } finally {
      setTemplBusy(false);
    }
  }

  async function onSheet(file: File | undefined) {
    if (!file) return;
    setSheetErr(null);
    setResult(null);
    setLog([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheetOf = (name: string) => wb.Sheets[name] && XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
      // 시트 이름이 바뀌었어도 머리글로 찾는다
      const adName = wb.SheetNames.find((n) => n === AD_SHEET) ?? wb.SheetNames.find((n) => n !== SET_SHEET && n !== GUIDE_SHEET && n !== AUDIENCE_SHEET);
      const p = parseAdSheet(adName ? sheetOf(adName) : []);
      if (p.error) throw new Error(p.error);
      if (!p.rows.length) throw new Error(`'${AD_SHEET}' 시트에 내용이 있는 행이 없어요(소재 파일·문구를 적은 행만 읽어요).`);
      setRows(p.rows);
      setSpecs(wb.Sheets[SET_SHEET] ? parseSetSheet(sheetOf(SET_SHEET)) : []);
      setExcluded(new Set());
      setDone(new Set());
      setFileName(file.name);
    } catch (e) {
      setSheetErr((e as Error).message);
    }
  }

  // ── ② 소재 파일 ──
  const [media, setMedia] = useState<Map<string, LocalMedia>>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string[]>([]);
  const [driveUrl, setDriveUrl] = useState("");

  async function addFiles(files: File[]) {
    const ok = files.filter((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(f.name));
    const room = MAX_FILES - media.size;
    const take = ok.slice(0, room);
    const errs: string[] = [];
    if (ok.length > room) errs.push(`파일은 최대 ${MAX_FILES}개 — ${ok.length - room}개는 건너뜀`);
    const out: LocalMedia[] = [];
    const known = new Set([...media.values()].map((m) => `${m.name}:${m.size}`));
    for (let i = 0; i < take.length; i += 8) {
      setLoadingFiles(`파일 읽는 중… ${Math.min(i + 8, take.length)}/${take.length}`);
      const batch = await Promise.all(
        take.slice(i, i + 8).map(async (f) => {
          if (known.has(`${f.name}:${f.size}`)) return null; // 같은 파일 두 번 불러오기 방지
          if (f.type.startsWith("video/") && f.size > VIDEO_MAX) {
            errs.push(`${f.name}: 영상은 200MB까지`);
            return null;
          }
          return readMedia(f).catch((e) => {
            errs.push((e as Error).message);
            return null;
          });
        }),
      );
      out.push(...batch.filter((x): x is LocalMedia => !!x));
    }
    setLoadingFiles(null);
    setFileErr(errs);
    if (out.length) setMedia((m) => new Map([...m, ...out.map((x) => [x.id, x] as const)]));
  }
  async function fromDrive() {
    const id = folderIdFrom(driveUrl);
    if (!id) return setFileErr(["구글 드라이브 폴더 주소를 넣어 주세요 (drive.google.com/drive/folders/…)"]);
    try {
      setLoadingFiles("구글 드라이브 권한 확인 중…");
      const token = await getDriveToken();
      setLoadingFiles("폴더 목록 읽는 중…");
      const list = await listDriveImages(token, id, 2, "", true);
      if (!list.length) throw new Error("폴더(하위 2단계 포함)에 이미지·영상이 없어요.");
      const files: File[] = [];
      const take = list.slice(0, MAX_FILES - media.size);
      for (let i = 0; i < take.length; i += 4) {
        setLoadingFiles(`드라이브에서 내려받는 중… ${Math.min(i + 4, take.length)}/${take.length}`);
        files.push(...(await Promise.all(take.slice(i, i + 4).map((f) => downloadDriveFile(token, f)))));
      }
      await addFiles(files);
    } catch (e) {
      setFileErr([(e as Error).message]);
    } finally {
      setLoadingFiles(null);
    }
  }
  function clearFiles() {
    media.forEach((m) => URL.revokeObjectURL(m.url));
    setMedia(new Map());
    setFileErr([]);
  }

  // ── ③ 매칭 ──
  const findSource = useCallback(
    (campaign: MetaCampaignLite, want: string): MetaAdSetLite | undefined => {
      const w = want.trim();
      const own = setsOf(campaign.id).find((s) => s.id === w || s.name.trim() === w);
      if (own) return own;
      for (const c of pickedCampaigns) {
        const hit = setsOf(c.id).find((s) => s.id === w || s.name.trim() === w);
        if (hit) return hit;
      }
      return undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, picked],
  );

  const planSet = useCallback(
    (campaign: MetaCampaignLite, setName: string): SetPlan => {
      const name = setName.trim();
      const existing = setsOf(campaign.id).find((s) => s.name.trim() === name);
      if (existing) return { mode: "existing", sourceId: existing.id, source: existing, draft: null, problems: [] };
      const same = specs.filter((s) => s.name.trim() === name);
      const spec = same.find((s) => s.campaign && (s.campaign === campaign.id || campaignKey(s.campaign) === campaignKey(campaign.name))) ?? same.find((s) => !s.campaign);
      const problems = spec ? spec.errors.map((e) => `광고세트 시트 ${spec.sheetRow}행: ${e}`) : [];
      const cbo = !!(campaign.dailyBudget || campaign.lifetimeBudget);
      const inc = resolveAudiences(spec?.include ?? null, audiences ?? []);
      const exc = resolveAudiences(spec?.exclude ?? null, audiences ?? []);
      if ((spec?.include?.length || spec?.exclude?.length) && !audiences) problems.push(audErr ? `맞춤 타겟 목록을 못 불러옴 — ${audErr}` : "맞춤 타겟 목록 불러오는 중");
      else if (inc.bad.length || exc.bad.length) problems.push(`이 광고계정에 없는 맞춤 타겟: ${[...inc.bad, ...exc.bad].join(", ")} ('맞춤 타겟 목록' 시트 이름 그대로)`);
      const extra = { attribution: spec?.attribution ?? null, includeAudiences: inc.ids, excludeAudiences: exc.ids };
      const min = acc?.minDailyBudget ?? 1000;
      if (spec?.copyFrom) {
        const src = findSource(campaign, spec.copyFrom);
        if (!src) problems.push(`복사할 세트 '${spec.copyFrom}'를 선택한 캠페인에서 못 찾음`);
        const g = src ? src.genders.filter((x) => x === 1 || x === 2) : [];
        const draft = {
          mode: "copy" as const,
          sourceId: src?.id ?? null,
          name,
          gender: spec.gender ?? (g.length === 1 ? (g[0] === 1 ? "m" : "f") : "all"),
          ageMin: spec.ageMin ?? src?.ageMin ?? 18,
          ageMax: spec.ageMax ?? src?.ageMax ?? 65,
          advantageAudience: src?.advantageAudience ?? false,
          budget: cbo ? null : spec.budget,
          startDate: spec.startDate,
          endDate: spec.endDate,
          optimization: 0,
          placement: "auto" as const,
          ...extra,
          attribution: null,
          sourceEnd: src?.endTime ?? null,
        };
        if (!cbo && spec.budget && spec.budget < min) problems.push(`일 예산 ${min.toLocaleString("ko-KR")}원 이상`);
        // 메타 제약(2026-10-09 르무통 실검증): 기여 설정은 생성 뒤 변경 불가 · Advantage+ 타겟 세트는 최소 연령 25세 이하 · 종료된 원본은 새 종료일 필요
        if (src && spec.attribution && spec.attribution !== src.attribution) problems.push(`복사 세트는 기여 설정을 바꿀 수 없어요(메타 제한, 원본 ${ATTRIBUTIONS.find((a) => a.key === src.attribution)?.label ?? "?"}) — 칸을 비우거나 '복사할 세트'를 비워 새로 만드세요`);
        if (src?.advantageAudience && draft.ageMin > 25) problems.push("원본이 Advantage+ 타겟이라 최소 연령은 25세 이하만 돼요");
        if (src?.advantageAudience && draft.ageMax < 65) problems.push("원본이 Advantage+ 타겟이라 최대 연령은 65+만 돼요");
        if (src?.endTime && new Date(src.endTime).getTime() < Date.now() && !spec.endDate) problems.push("원본 세트가 이미 종료됐어요 — 종료일(필요하면 시작일도)을 새로 적으세요");
        if (spec.startDate && spec.endDate && spec.endDate < spec.startDate) problems.push("종료일이 시작일보다 빨라요");
        return { mode: "copy", sourceId: src?.id ?? null, source: src, spec, draft, problems };
      }
      const opt = spec ? optimizationIndex(campaign.objective, spec.optimization) : 0;
      if (opt < 0) problems.push(`최적화 '${spec!.optimization}'는 ${OBJECTIVE_LABEL[campaign.objective]} 캠페인에 못 씀(${(OPTIMIZATION[campaign.objective] ?? []).map((o) => o.label).join("·")})`);
      const budget = cbo ? null : spec?.budget ?? newBudget;
      if (!cbo && (!budget || budget < min)) problems.push(`새 세트 일 예산 ${min.toLocaleString("ko-KR")}원 이상(광고세트 시트 또는 화면 기본값)`);
      const ageMin = spec?.ageMin ?? 25;
      const advantage = spec?.advantageAudience ?? false;
      if (advantage && ageMin > 25) problems.push("Advantage+ 타겟은 최소 연령 25세 이하");
      if (advantage && (spec?.ageMax ?? 65) < 65) problems.push("Advantage+ 타겟은 최대 연령 65+");
      const o = (OPTIMIZATION[campaign.objective] ?? [])[Math.max(0, opt)];
      if (o?.needsPixel && !defaults.pixelId) problems.push("전환 최적화에는 픽셀이 필요해요(위 계정 줄)");
      if (spec?.startDate && spec.endDate && spec.endDate < spec.startDate) problems.push("종료일이 시작일보다 빨라요");
      return {
        mode: "new",
        sourceId: null,
        spec,
        draft: { mode: "new", sourceId: null, name, gender: spec?.gender ?? "all", ageMin, ageMax: spec?.ageMax ?? 65, advantageAudience: advantage, budget, startDate: spec?.startDate ?? "", endDate: spec?.endDate ?? "", optimization: Math.max(0, opt), placement: spec?.placement ?? "auto", ...extra },
        problems,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, specs, acc, newBudget, defaults.pixelId, findSource, audiences, audErr],
  );

  const files = useMemo(() => [...media.values()], [media]);
  const prepared: Prepared[] = useMemo(
    () =>
      rows.map((r) => {
        const key = `r${r.sheetRow}`;
        const problems = [...r.errors];
        const m = resolveMedia(r.feedCell, r.verticalCell, files);
        problems.push(...m.problems);
        if (!files.length && !m.problems.length) problems.push("소재 파일을 불러오세요");
        // 캠페인
        let targets: MetaCampaignLite[] = pickedCampaigns;
        if (r.campaigns.length) {
          targets = [];
          for (const w of r.campaigns) {
            const hit = pickedCampaigns.find((c) => c.id === w || campaignKey(c.name) === campaignKey(w));
            if (!hit) problems.push(`선택하지 않은 캠페인 '${w}'`);
            else if (!targets.includes(hit)) targets.push(hit);
          }
        }
        if (!pickedCampaigns.length) problems.push("① 에서 캠페인을 고르세요");
        const t: Target[] = targets.map((c) => ({ campaign: c, set: planSet(c, r.adSet) }));
        for (const x of t) problems.push(...x.set.problems.map((p) => (t.length > 1 ? `${x.campaign.name}: ${p}` : p)));
        const copy = copyOf({ key, name: "", feed: null, vertical: null, copy: { message: r.message, headline: r.headline, description: r.description, cta: r.cta, url: r.url } }, defaults.copy);
        if (!/^https?:\/\/\S+\.\S+/.test(copy.url)) problems.push("랜딩 URL 없음(행 또는 공통)");
        if (!copy.message.trim()) problems.push("기본 문구 없음(행 또는 공통)");
        const name = (r.name || m.name || "").slice(0, 400);
        return { key, row: r, name, feed: m.feed ? media.get(m.feed) ?? null : null, vertical: m.vertical ? media.get(m.vertical) ?? null : null, targets: t, problems: [...new Set(problems)], notes: m.notes };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, files, media, picked, campaigns, planSet, defaults.copy],
  );
  const runnable = prepared.filter((p) => !p.problems.length && !excluded.has(p.key) && !done.has(p.key));
  const usedFiles = new Set(prepared.flatMap((p) => [p.feed?.id, p.vertical?.id]));
  const unused = files.filter((f) => !usedFiles.has(f.id));
  const adCount = runnable.reduce((n, p) => n + p.targets.length, 0);
  const setKeys = new Set(runnable.flatMap((p) => p.targets.map((t) => `${t.campaign.id}:${p.row.adSet.trim()}`)));
  const newSetCount = new Set(runnable.flatMap((p) => p.targets.filter((t) => t.set.mode !== "existing").map((t) => `${t.campaign.id}:${p.row.adSet.trim()}`))).size;

  const globalProblems: Problem[] = [];
  if (!acc) globalProblems.push({ where: "계정", text: "메타 광고계정을 불러오는 중" });
  if (!defaults.pageId) globalProblems.push({ where: "계정", text: "페이지가 없어요(광고계정에서 홍보 가능한 페이지)", target: "defaults" });
  if (!picked.length) globalProblems.push({ where: "① 캠페인", text: "캠페인을 고르세요", target: "bulk-campaigns" });
  if (setsLoading) globalProblems.push({ where: "① 캠페인", text: "광고세트 목록을 불러오는 중" });
  if (!rows.length) globalProblems.push({ where: "② 엑셀", text: "엑셀을 올리세요", target: "bulk-files" });
  else if (!runnable.length) globalProblems.push({ where: "③ 매칭", text: "실행할 행이 없어요 — 빨간 행을 고치거나 체크하세요", target: "bulk-preview" });

  // ── 실행 ──
  const [running, setRunning] = useState<"validate" | "run" | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<MetaRunResult | null>(null);
  const cache = useRef(newCache());

  async function run(validateOnly: boolean) {
    if (running || globalProblems.length) return;
    const byCampaign = pickedCampaigns
      .map((c) => ({ c, rows: runnable.filter((p) => p.targets.some((t) => t.campaign.id === c.id)) }))
      .filter((x) => x.rows.length);
    if (!validateOnly) {
      const msg = [
        `메타 광고계정 ${acc?.name}에 만듭니다.`,
        "",
        ...byCampaign.map((x) => {
          const t = x.rows.map((p) => p.targets.find((y) => y.campaign.id === x.c.id)!);
          const nSet = new Set(x.rows.filter((_, i) => t[i].set.mode !== "existing").map((p) => p.row.adSet.trim())).size;
          return `· ${x.c.name}: 광고 ${x.rows.length}개 · 새 세트 ${nSet}개`;
        }),
        "",
        defaults.turnOn ? "상태: 바로 켜기 — 메타 검토 후 게재(기존 세트에 넣는 광고도 켜짐)" : "상태: 꺼 둔 채로 만들기",
        "",
        "진행할까요?",
      ].join("\n");
      if (!window.confirm(msg)) return;
    }
    setRunning(validateOnly ? "validate" : "run");
    setResult(null);
    const lines: LogLine[] = [];
    const total: MetaRunResult = { validateOnly, campaignId: null, adSets: [], creatives: [], ads: [], errors: [], warnings: [], activated: false };
    const madeKeys = new Set<string>();
    try {
      for (const [i, x] of byCampaign.entries()) {
        const head: LogLine = { kind: "info", text: `── 캠페인 ${i + 1}/${byCampaign.length} · ${x.c.name}` };
        // 세트 초안 — 같은 이름은 하나로, 광고는 행 key
        const setMap = new Map<string, AdSetDraft>();
        for (const p of x.rows) {
          const t = p.targets.find((y) => y.campaign.id === x.c.id)!;
          const nm = p.row.adSet.trim();
          const cur = setMap.get(nm);
          if (cur) {
            cur.ads.push(p.key);
            continue;
          }
          setMap.set(
            nm,
            t.set.mode === "existing"
              ? { key: `${x.c.id}:${nm}`, mode: "existing", sourceId: t.set.sourceId, name: nm, gender: "all", ageMin: 18, ageMax: 65, advantageAudience: false, budget: null, startDate: "", endDate: "", optimization: 0, placement: "auto", attribution: null, includeAudiences: null, excludeAudiences: null, ads: [p.key] }
              : { key: `${x.c.id}:${nm}`, ...t.set.draft!, ads: [p.key] },
          );
        }
        const ads: AdDraft[] = x.rows.map((p) => ({ key: p.key, name: p.name, feed: p.feed?.id ?? null, vertical: p.vertical?.id ?? null, copy: { message: p.row.message, headline: p.row.headline, description: p.row.description, cta: p.row.cta, url: p.row.url }, productExt: p.row.productExt }));
        const base = [...lines, head];
        let current: LogLine[] = [];
        const r = await runMeta({
          clientId,
          campaign: { mode: "existing", existingId: x.c.id, name: x.c.name, objective: x.c.objective as MetaObjective, cbo: false, budget: null },
          campaignName: x.c.name,
          adSets: [...setMap.values()],
          ads,
          media,
          defaults,
          validateOnly,
          cache: cache.current,
          mode: "bulk",
          logExtra: { sheet: fileName, rows: x.rows.map((p) => p.row.sheetRow), batch: byCampaign.length > 1 ? { index: i + 1, of: byCampaign.length } : undefined },
          onLog: (l) => {
            current = l;
            setLog([...base, ...l]);
          },
        });
        lines.push(head, ...current);
        total.adSets.push(...r.adSets);
        total.creatives.push(...r.creatives);
        total.ads.push(...r.ads);
        total.errors.push(...r.errors);
        total.warnings.push(...r.warnings);
        total.activated = total.activated || r.activated;
        if (!validateOnly) {
          // 광고가 하나라도 만들어진 행은 완료(다시 실행 때 중복 생성 방지)
          for (const a of r.ads) madeKeys.add(a.key);
        }
      }
      setResult(total);
      if (!validateOnly) {
        setDone((d) => new Set([...d, ...madeKeys]));
        // 새로 만든 세트가 '기존'으로 보이게 세트 목록 새로
        setSets((m) => {
          const n = { ...m };
          for (const c of byCampaign) delete n[c.c.id];
          return n;
        });
      }
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => {
    if (!rows.length && !media.size) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [rows.length, media.size]);

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

  const multi = pickedCampaigns.length > 1;
  const errorRows = prepared.filter((p) => p.problems.length).length;
  const selectable = prepared.filter((p) => !p.problems.length && !done.has(p.key)).map((p) => p.key);
  const onCount = selectable.filter((k) => !excluded.has(k)).length;

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        const all = [...e.dataTransfer.files];
        const sheet = all.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
        if (sheet) onSheet(sheet);
        const rest = all.filter((f) => f !== sheet);
        if (rest.length) addFiles(rest);
      }}
    >
      <AccountBar acc={acc} loading={accLoading} defaults={defaults} setDefaults={setDefaults} onRefresh={() => loadAccount(true)} />

      {/* ① 캠페인 */}
      <section id="meta-bulk-campaigns" className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <Step n={1} />
          <h3 className="text-[16px] font-bold text-ink">캠페인 선택</h3>
          <span className="text-[13px] text-ink-muted">여러 개 가능 — 엑셀 &apos;캠페인&apos; 칸을 비운 행은 고른 캠페인 전부에 들어가요</span>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative">
              <i className="ti ti-search pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-faint" aria-hidden />
              <input className={`${INP} w-[220px] pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·ID 검색" />
            </label>
            <StateFilter value={stateFilter} onChange={setStateFilter} counts={acc ? stateCounts : undefined} />
            <span className="inline-flex items-center gap-1 text-[13px]">
              <button type="button" onClick={() => setPicked((p) => [...p, ...shown.map((c) => c.id).filter((id) => !p.includes(id))])} disabled={!!running} className="rounded px-1.5 py-0.5 font-semibold text-[#C2410C] hover:bg-[#FFF4EE]">
                {q || stateFilter !== "all" ? "보이는 것 모두 선택" : "모두 선택"}
              </button>
              <span className="text-ink-faint">·</span>
              <button type="button" onClick={() => setPicked([])} disabled={!!running || !picked.length} className="rounded px-1.5 py-0.5 text-ink-soft hover:bg-canvas disabled:text-ink-faint">
                모두 해제
              </button>
            </span>
          </div>
        </div>
        <div className="-mx-1 mt-3 grid max-h-[220px] gap-1.5 overflow-y-auto px-1 py-0.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {!acc && [0, 1, 2, 3].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-[#F2F4F7]" />)}
          {acc && !shownAll.length && (
            <p className="col-span-full py-4 text-center text-[14px] text-ink-muted">
              {q ? `'${q}'에 맞는 ${stateFilter === "on" ? "켜진 " : stateFilter === "off" ? "꺼진 " : ""}캠페인이 없어요` : stateFilter === "on" ? "켜진 캠페인이 없어요" : stateFilter === "off" ? "꺼진 캠페인이 없어요" : "캠페인이 없어요"} — 광고 관리자에서 방금 만들었다면 &apos;게시&apos; 후 위 계정 줄 새로고침(↻)을 누르세요(초안은 API에 안 보여요)
            </p>
          )}
          {shownAll.map((c) => {
            const on = picked.includes(c.id);
            const st = sets[c.id];
            const lock = lockReason(c, SUPPORTED_OBJECTIVES);
            return (
              <button
                key={c.id}
                type="button"
                disabled={!!running || !!lock}
                title={lock ?? `${c.name} (${c.id})`}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                aria-pressed={on}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${lock ? "cursor-not-allowed border-dashed border-[#D0D5DD] bg-[#FAFAFB]" : on ? "border-[#eb6834] bg-[#FFF8F4]" : "border-[#EAECF0] hover:border-[#F6C3AE]"}`}
              >
                {lock ? (
                  <i className="ti ti-lock mt-0.5 shrink-0 text-[14px] text-ink-faint" aria-hidden />
                ) : (
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${on ? "bg-[#eb6834] text-white" : "border-2 border-[#D0D5DD]"}`}>{on && <i className="ti ti-check text-[11px]" aria-hidden />}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${lock ? "text-ink-muted" : "text-ink"}`} title={c.name}>
                    {c.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status] ?? "bg-[#98A2B3]"}`} />
                    <span className={isOn(c.status) ? "font-semibold text-[#067647]" : ""}>{isOn(c.status) ? "ON" : "OFF"}</span>
                    {OBJECTIVE_LABEL[c.objective] ?? c.objective}
                    {lock && <span>· 자동 세팅 미지원</span>}
                    {(c.dailyBudget || c.lifetimeBudget) && <span className="rounded bg-[#EEF4FF] px-1 text-[#3538CD]">CBO</span>}
                    {on && <span>· 세트 {st === "loading" || st === undefined ? "…" : Array.isArray(st) ? st.length : "오류"}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ② 엑셀 · 소재 파일 */}
      <section id="meta-bulk-files" className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-3 flex items-center gap-2">
            <Step n={2} />
            <h3 className="text-[16px] font-bold text-ink">엑셀</h3>
            <span className="text-[13px] text-ink-muted">시트 2장 — 광고 · 광고세트</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} disabled={templBusy} className={BTN}>
              <i className={`ti ${templBusy ? "ti-loader-2 animate-spin" : "ti-download"} text-[16px]`} aria-hidden />
              템플릿 내려받기{media.size ? " (파일로 광고 행 채움)" : pickedCampaigns.length ? " (기존 세트 채움)" : ""}
            </button>
            <label className={`${BTN_PRIMARY} cursor-pointer`}>
              <i className="ti ti-file-spreadsheet text-[16px]" aria-hidden />
              엑셀 올리기
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSheet(e.target.files?.[0]).then(() => (e.target.value = ""))} />
            </label>
          </div>
          <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-ink-muted">
            <li>
              · <b className="text-ink-soft">소재 파일</b> 칸에 짝 이름 하나(<span className="font-mono">fall_01</span>)만 적으면 <span className="font-mono">fall_01_feed.jpg</span> + <span className="font-mono">fall_01_story.jpg</span>를 찾아 피드 + 스토리·릴스 한 광고로 묶어요
            </li>
            <li>
              · <b className="text-ink-soft">광고세트</b> 시트의 기존 세트 행을 복사해 이름만 바꾸면 그 세트의 타겟·최적화를 그대로 복사한 새 세트가 돼요
            </li>
            <li>· 문구·URL 빈 칸은 아래 공통 문구로 채워요. 엑셀·파일은 화면 어디에 끌어 놓아도 돼요</li>
          </ul>
          {fileName && (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[14px] text-ink-soft">
              <b className="text-ink">{fileName}</b> · 광고 행 {rows.length}개 · 광고세트 시트 {specs.length}행
              {errorRows > 0 && <span className="text-bad"> · 확인 필요 {errorRows}행</span>}
            </p>
          )}
          {sheetErr && <p className="mt-2 text-[14px] text-bad">{sheetErr}</p>}
        </div>

        <div className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-3 flex items-center gap-2">
            <Step n={2} />
            <h3 className="text-[16px] font-bold text-ink">소재 파일</h3>
            <span className="text-[13px] text-ink-muted">이미지·영상(MP4·MOV 200MB) — 먼저 불러오면 템플릿에 광고 행이 채워져요</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`${BTN} cursor-pointer`}>
              <i className="ti ti-photo-video text-[16px]" aria-hidden />내 PC 파일
              <input type="file" multiple accept="image/*,video/mp4,video/quicktime" className="hidden" onChange={(e) => addFiles([...(e.target.files ?? [])]).then(() => (e.target.value = ""))} />
            </label>
            <label className={`${BTN} cursor-pointer`}>
              <i className="ti ti-folder text-[16px]" aria-hidden />내 PC 폴더
              <input type="file" multiple className="hidden" {...folderProps} onChange={(e) => addFiles([...(e.target.files ?? [])]).then(() => (e.target.value = ""))} />
            </label>
            {media.size > 0 && (
              <button type="button" onClick={clearFiles} className={BTN}>
                비우기
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input className={INP} value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="구글 드라이브 폴더 주소 (drive.google.com/drive/folders/…)" />
            <button type="button" onClick={fromDrive} disabled={!!loadingFiles || !driveUrl.trim()} className={BTN}>
              <i className="ti ti-brand-google-drive text-[16px]" aria-hidden />
              불러오기
            </button>
          </div>
          {loadingFiles && <p className="mt-2 text-[14px] text-ink-muted">{loadingFiles}</p>}
          {fileErr.map((e) => (
            <p key={e} className="mt-1 text-[13px] text-warn">
              {e}
            </p>
          ))}
          {media.size > 0 && (
            <p className="mt-2 text-[14px] text-ink-soft">
              파일 <b className="text-ink">{media.size}개</b> (이미지 {files.filter((f) => f.kind === "image").length} · 영상 {files.filter((f) => f.kind === "video").length}
              {" · "}세로 9:16 {files.filter((f) => f.height / f.width > 1.6).length})
              {rows.length > 0 && (
                <>
                  {" "}
                  · <span className={unused.length ? "text-warn" : ""}>안 쓰임 {unused.length}개</span>
                </>
              )}
            </p>
          )}
          {rows.length > 0 && unused.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[12px] text-ink-muted" title={unused.map((f) => f.name).join("\n")}>
              {unused.slice(0, 12).map((f) => f.name).join(", ")}
              {unused.length > 12 && ` 외 ${unused.length - 12}개`}
            </p>
          )}
        </div>
      </section>

      {/* 공통 문구 · 새 세트 기본값 */}
      <section className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-ink">공통 문구 · 기본값</h3>
          <span className="text-[13px] text-ink-muted">엑셀에서 비운 칸에 들어가요(광고주별로 기억)</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-[2fr_1.2fr_1fr_150px_1.6fr_150px]">
          <textarea rows={2} className={`${INP} resize-y`} value={defaults.copy.message} onChange={(e) => setDefaults((d) => ({ ...d, copy: { ...d.copy, message: e.target.value } }))} placeholder="기본 문구(본문)" />
          <input className={INP} value={defaults.copy.headline} onChange={(e) => setDefaults((d) => ({ ...d, copy: { ...d.copy, headline: e.target.value } }))} placeholder="제목" />
          <input className={INP} value={defaults.copy.description} onChange={(e) => setDefaults((d) => ({ ...d, copy: { ...d.copy, description: e.target.value } }))} placeholder="설명(선택)" />
          <select className={INP} value={defaults.copy.cta} onChange={(e) => setDefaults((d) => ({ ...d, copy: { ...d.copy, cta: e.target.value } }))}>
            {Object.entries(CTA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input className={INP} value={defaults.copy.url} onChange={(e) => setDefaults((d) => ({ ...d, copy: { ...d.copy, url: e.target.value.trim() } }))} placeholder="랜딩 URL https://" />
          <div title="광고세트 시트에 행이 없거나 일 예산을 비운 새 세트의 일 예산">
            <MoneyInput value={newBudget} onChange={setNewBudget} placeholder="새 세트 일 예산" />
          </div>
        </div>
      </section>

      {/* ③ 매칭 결과 */}
      <section id="meta-bulk-preview" className="rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Step n={3} />
          <h3 className="text-[16px] font-bold text-ink">매칭 결과</h3>
          <span className="text-[13px] text-ink-muted">빨간 행은 고치기 전까지 빠져요 · 체크를 풀면 그 행만 빼고 실행</span>
          {prepared.length > 0 && (
            <span className="ml-auto text-[14px] text-ink-soft">
              실행 <b className="text-ink">{runnable.length}</b>행 · 새 세트 <b className="text-ink">{newSetCount}</b> · 광고 <b className="text-[#C2410C]">{adCount}</b>
              {done.size > 0 && <span className="text-good"> · 완료 {done.size}</span>}
            </span>
          )}
        </div>
        {!prepared.length ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
            <i className="ti ti-table-import text-[28px] text-ink-faint" aria-hidden />
            <p className="text-[15px] text-ink-muted">{fileName ? "올린 엑셀에 광고 행이 없어요." : "엑셀을 올리면 행마다 캠페인 · 광고세트 · 소재 짝 · 문구가 여기 나와요."}</p>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[1100px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      className="accent-[#eb6834]"
                      disabled={!selectable.length}
                      checked={selectable.length > 0 && onCount === selectable.length}
                      ref={(el) => {
                        if (el) el.indeterminate = onCount > 0 && onCount < selectable.length;
                      }}
                      onChange={(e) => setExcluded((x) => (e.target.checked ? new Set([...x].filter((k) => !selectable.includes(k))) : new Set([...x, ...selectable])))}
                      title="모두 선택 · 모두 해제"
                    />
                  </th>
                  <th className="w-10 py-2 font-medium">행</th>
                  {multi && <th className="py-2 pr-3 font-medium">캠페인</th>}
                  <th className="py-2 pr-3 font-medium">광고세트</th>
                  <th className="py-2 pr-3 font-medium">소재</th>
                  <th className="py-2 pr-3 font-medium">광고 이름</th>
                  <th className="py-2 pr-3 font-medium">문구</th>
                  <th className="py-2 pr-3 font-medium">버튼 · URL</th>
                  <th className="py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {prepared.map((p) => {
                  const bad = p.problems.length > 0;
                  const isDone = done.has(p.key);
                  const off = excluded.has(p.key) || isDone;
                  const c = copyOf({ key: p.key, name: "", feed: null, vertical: null, copy: { message: p.row.message, headline: p.row.headline, description: p.row.description, cta: p.row.cta, url: p.row.url } }, defaults.copy);
                  return (
                    <tr key={p.key} className={`border-b border-[#F2F4F7] align-top ${bad ? "bg-[#FEF2F2]/60" : off ? "opacity-50" : ""}`}>
                      <td className="py-2">
                        <input type="checkbox" className="accent-[#eb6834]" disabled={bad || isDone} checked={!bad && !off} onChange={() => setExcluded((x) => (x.has(p.key) ? new Set([...x].filter((k) => k !== p.key)) : new Set([...x, p.key])))} aria-label={`${p.row.sheetRow}행 포함`} />
                      </td>
                      <td className="py-2 tabular-nums text-ink-muted">{p.row.sheetRow}</td>
                      {multi && (
                        <td className="max-w-[200px] py-2 pr-3">
                          {p.row.campaigns.length ? (
                            p.targets.map((t) => (
                              <p key={t.campaign.id} className="truncate text-[13px]" title={t.campaign.name}>
                                {t.campaign.name}
                              </p>
                            ))
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[12px] text-ink-soft" title={p.targets.map((t) => t.campaign.name).join("\n")}>
                              전부 · {p.targets.length}개
                            </span>
                          )}
                        </td>
                      )}
                      <td className="max-w-[220px] py-2 pr-3">
                        <p className="truncate font-mono text-[13px] text-ink" title={p.row.adSet}>
                          {p.row.adSet || "—"}
                        </p>
                        <SetBadges targets={p.targets} audiences={audiences ?? []} />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-end gap-1">
                          {p.feed && <Thumb m={p.feed} />}
                          {p.vertical && <Thumb m={p.vertical} />}
                          {!p.feed && !p.vertical && <span className="text-[12px] text-ink-faint">{p.row.feedCell || "—"}</span>}
                        </div>
                        {p.feed && p.vertical && <p className="mt-0.5 text-[11px] text-[#3538CD]">피드 + 스토리·릴스</p>}
                        {p.row.productExt && <p className="mt-0.5 text-[11px] text-ink-muted">상품 확장 켬</p>}
                      </td>
                      <td className="max-w-[180px] py-2 pr-3">
                        <p className="truncate font-mono text-[13px] text-ink" title={p.name}>
                          {p.name || "—"}
                        </p>
                      </td>
                      <td className="max-w-[300px] py-2 pr-3">
                        <p className={`line-clamp-2 whitespace-pre-line text-[13px] ${p.row.message ? "text-ink" : "text-ink-muted"}`} title={c.message}>
                          {c.message || "—"}
                        </p>
                        {c.headline && <p className={`mt-0.5 truncate text-[12px] font-semibold ${p.row.headline ? "text-ink-soft" : "text-ink-muted"}`}>{c.headline}</p>}
                      </td>
                      <td className="max-w-[200px] py-2 pr-3">
                        <p className={`text-[12px] ${p.row.cta ? "text-ink-soft" : "text-ink-muted"}`}>{CTA_LABEL[c.cta] ?? c.cta}</p>
                        <p className={`truncate text-[12px] ${p.row.url ? "text-ink-soft" : "text-ink-muted"}`} title={c.url}>
                          {c.url.replace(/^https?:\/\//, "") || "—"}
                        </p>
                      </td>
                      <td className="max-w-[300px] py-2">
                        {isDone ? (
                          <span className="whitespace-nowrap rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[12px] font-semibold text-[#067647]">완료</span>
                        ) : bad ? (
                          p.problems.map((x) => (
                            <p key={x} className="text-[12px] leading-snug text-bad">
                              · {x}
                            </p>
                          ))
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[12px] text-[#067647]">준비됨</span>
                        )}
                        {p.notes.map((n) => (
                          <p key={n} className="text-[12px] text-ink-muted">
                            {n}
                          </p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-ink-muted">회색 글자 = 공통 문구에서 가져온 값</p>
          </div>
        )}
      </section>

      <MetaRunLog log={log} result={result} running={running} />

      <RunBar
        acc={acc}
        campaignLabel={pickedCampaigns.length ? `캠페인 ${pickedCampaigns.length}개` : "캠페인 미선택"}
        adSetCount={setKeys.size}
        creativeCount={runnable.length}
        adCount={adCount}
        problems={globalProblems}
        onJump={(t) => document.getElementById(`meta-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        running={running}
        turnOn={defaults.turnOn}
        setTurnOn={(v) => setDefaults((d) => ({ ...d, turnOn: v }))}
        onValidate={() => run(true)}
        onRun={() => run(false)}
      />
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFF1EA] text-[13px] font-bold text-[#eb6834]">{n}</span>;
}

function SetBadges({ targets, audiences }: { targets: Target[]; audiences: MetaAudience[] }) {
  const nameOf = (id: string) => audiences.find((a) => a.id === id)?.name ?? id;
  const n = { existing: 0, new: 0, copy: 0 };
  targets.forEach((t) => n[t.set.mode]++);
  const one = targets.length === 1 ? targets[0].set : null;
  const B = "mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px]";
  if (one) {
    if (one.mode === "existing") return <span className={`${B} bg-[#F2F4F7] text-ink-soft`}>기존 세트에 추가</span>;
    if (one.mode === "copy")
      return (
        <>
          <span className={`${B} bg-[#EEF4FF] text-[#3538CD]`} title={one.source ? `${one.source.name} 설정 복사` : undefined}>
            복사 · {one.source?.name ?? "?"}
          </span>
          {one.draft && <AudLine d={one.draft} nameOf={nameOf} copy />}
        </>
      );
    const d = one.draft!;
    return (
      <>
        <span className={`${B} bg-[#FDF1EC] text-[#C2410C]`}>
          새로 · {d.gender === "all" ? "전체" : d.gender === "f" ? "여" : "남"} {d.ageMin}-{d.ageMax}
          {d.budget ? ` · ${d.budget.toLocaleString("ko-KR")}원` : ""}
        </span>
        <AudLine d={d} nameOf={nameOf} />
      </>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {n.new > 0 && <span className={`${B} mt-0 bg-[#FDF1EC] text-[#C2410C]`}>새로 {n.new}</span>}
      {n.copy > 0 && <span className={`${B} mt-0 bg-[#EEF4FF] text-[#3538CD]`}>복사 {n.copy}</span>}
      {n.existing > 0 && <span className={`${B} mt-0 bg-[#F2F4F7] text-ink-soft`}>기존 {n.existing}</span>}
    </span>
  );
}

function Thumb({ m }: { m: LocalMedia }) {
  const h = 52;
  const w = Math.max(26, Math.min(80, Math.round((h * m.width) / m.height)));
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

// 세트 배지 아래 한 줄 — 기여 설정·포함·제외 타겟(복사는 바꾸는 것만)
function AudLine({ d, nameOf, copy }: { d: Omit<AdSetDraft, "key" | "ads">; nameOf: (id: string) => string; copy?: boolean }) {
  const parts: string[] = [];
  if (d.attribution) parts.push(ATTRIBUTIONS.find((a) => a.key === d.attribution)?.label ?? "");
  else if (!copy) parts.push("기여 목표 기본");
  if (d.includeAudiences?.length) parts.push(`+ ${d.includeAudiences.map(nameOf).join(", ")}`);
  else if (copy && d.includeAudiences) parts.push("포함 타겟 뺌");
  if (d.excludeAudiences?.length) parts.push(`− ${d.excludeAudiences.map(nameOf).join(", ")}`);
  else if (copy && d.excludeAudiences) parts.push("제외 타겟 뺌");
  if (!parts.length) return null;
  return (
    <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-ink-muted" title={parts.join("\n")}>
      {parts.join(" · ")}
    </p>
  );
}
