"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 카카오 > 엑셀 벌크 업로드(메타 벌크와 같은 흐름)
// ① 캠페인 고르기(여러 개, 유형 섞어도 됨) → ② 템플릿(기존 광고그룹 설정 미리 채움, 파일을 먼저 불러오면 소재 행까지) · 엑셀·소재 파일
// → ③ 매칭 결과(행마다 캠페인 × 광고그룹(기존·새로·복사) × 소재 형식(캠페인 유형이 정함) × 문구) → 아래 고정 바에서 실행
// 실행은 캠페인마다 run.ts runKakao를 차례로(파일은 한 번만 올리고 URL 재사용), 끝나면 임시 이미지 정리
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { downloadDriveFile, folderIdFrom, getDriveToken, listDriveImages } from "../gfa/driveImport";
import { MoneyInput } from "../gfa/ui";
import { markSheet } from "../meta/markSheet";
import {
  AG_GUIDE,
  AG_HEADERS,
  AG_SAMPLES,
  AG_SHEET,
  AG_WIDTHS,
  CR_GUIDE,
  CR_HEADERS,
  CR_SAMPLES,
  CR_SHEET,
  CR_WIDTHS,
  GUIDE_SHEET,
  GUIDE_TAIL,
  adGroupToRow,
  agesLabel,
  bidText,
  campaignKey,
  findFile,
  freqText,
  parseAgSheet,
  parseCrSheet,
  type AgSpec,
  type CrRow,
} from "./bulkSheet";
import { AccountError, BTN, BTN_PRIMARY, CARD, CampaignPicker, INP, KakaoAccountBar, KakaoRunBar, KakaoRunLog, Step, Thumb, typeBadge, useApplyAccountDefaults, useKakaoAccount } from "./KakaoParts";
import { readMedia, VIDEO_MAX, type LocalMedia } from "./media";
import {
  ACTION_BUTTONS,
  ACTION_LABEL,
  EMPTY_COPY,
  FORMAT_LABEL,
  copyAdGroupBody,
  copyOf,
  copyProblems,
  defaultBid,
  formatOfCampaign,
  mediaFit,
  newAdGroupBody,
  todayKst,
  type AdGroupDraft,
  type CreativeDraft,
  type Defaults,
  type KakaoAdGroupLite,
  type KakaoCampaignLite,
  type Problem,
} from "./model";
import { cleanupFiles, newCache, postKakao, runKakao, type KakaoRunResult, type LogLine } from "./run";

const MAX_FILES = 400;
const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

type GroupPlan = { mode: AdGroupDraft["mode"]; source?: KakaoAdGroupLite; draft: Omit<AdGroupDraft, "key" | "creatives">; problems: string[] };
type Target = { campaign: KakaoCampaignLite; group: GroupPlan; problems: string[]; notes: string[] };
type Prepared = { key: string; row: CrRow; name: string; file: LocalMedia | null; thumb: LocalMedia | null; targets: Target[]; problems: string[] };

const rowSig = (p: Prepared) => `${p.row.adGroup.trim()}|${p.name}`;
const madeSig = (campaignId: string, p: Prepared) => `${campaignId}|${rowSig(p)}`;

export function KakaoBulk({ clientId }: { clientId: string }) {
  const { acc, err: accErr, loading: accLoading, defs, reload } = useKakaoAccount(clientId);
  const [defaults, setDefaults] = useState<Defaults>({ copy: { ...EMPTY_COPY }, freq: { type: "AUTO" }, profile: null, turnOn: false });
  useApplyAccountDefaults(defs, setDefaults);
  const [profileFile, setProfileFile] = useState<LocalMedia | null>(null);
  const [newBudget, setNewBudget] = useState<number | null>(100000);

  // ── ① 캠페인 ──
  const [picked, setPicked] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, KakaoAdGroupLite[] | "loading" | { error: string }>>({});
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const loadGroups = useCallback(
    async (ids: string[], fresh = false) => {
      const need = ids.filter((id) => fresh || groupsRef.current[id] === undefined);
      if (!need.length) return;
      setGroups((m) => ({ ...m, ...Object.fromEntries(need.map((id) => [id, "loading" as const])) }));
      // 광고그룹 상세는 하나씩 읽어 느리다 — 캠페인을 차례로
      for (const id of need) {
        try {
          const r = await postKakao<{ adGroups: KakaoAdGroupLite[] }>({ action: "adgroups", clientId, campaignId: id, fresh });
          setGroups((m) => ({ ...m, [id]: r.adGroups }));
        } catch (e) {
          setGroups((m) => ({ ...m, [id]: { error: (e as Error).message } }));
        }
      }
    },
    [clientId],
  );
  useEffect(() => {
    loadGroups(picked);
  }, [picked, loadGroups]);
  const pickedCampaigns = picked.map((id) => acc?.campaigns.find((c) => c.id === id)).filter((c): c is KakaoCampaignLite => !!c);
  const groupsOf = (id: string) => (Array.isArray(groups[id]) ? (groups[id] as KakaoAdGroupLite[]) : []);
  const groupsLoading = picked.some((id) => groups[id] === "loading" || groups[id] === undefined);

  // ── ② 엑셀 ──
  const [fileName, setFileName] = useState("");
  const [sheetBuf, setSheetBuf] = useState<ArrayBuffer | null>(null);
  const [rows, setRows] = useState<CrRow[]>([]);
  const [specs, setSpecs] = useState<AgSpec[]>([]);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [made, setMade] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const [templBusy, setTemplBusy] = useState(false);

  // ── ② 소재 파일 ──
  const [media, setMedia] = useState<Map<string, LocalMedia>>(new Map());
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const files = useMemo(() => [...media.values()], [media]);

  async function downloadTemplate() {
    setTemplBusy(true);
    setSheetErr(null);
    try {
      const fresh: Record<string, KakaoAdGroupLite[]> = {};
      for (const c of pickedCampaigns) {
        const cur = groupsRef.current[c.id];
        fresh[c.id] = Array.isArray(cur) ? cur : (await postKakao<{ adGroups: KakaoAdGroupLite[] }>({ action: "adgroups", clientId, campaignId: c.id })).adGroups;
      }
      const dup = (name: string) => pickedCampaigns.filter((c) => c.name.trim() === name.trim()).length > 1;
      const labelOf = (c: KakaoCampaignLite) => (dup(c.name) ? c.id : c.name);
      const blank = CR_HEADERS.slice(5).map(() => "");
      // 파일을 먼저 불러왔으면 파일 1개 = 1행. 캠페인은 파일 종류(배너 비율 이미지 → 비즈보드, 영상 → 동영상, 나머지 이미지 → 디스플레이)에 맞는 것만
      const fitCampaigns = (m: LocalMedia) => pickedCampaigns.filter((c) => {
        const f = formatOfCampaign(c);
        return f ? !mediaFit(m, f).problems.length : false;
      });
      const thumbs = new Set(files.filter((m) => m.kind === "image" && files.some((v) => v.kind === "video" && sameStem(v.name, m.name))).map((m) => m.id));
      const crBody = files.length
        ? files
            .filter((m) => !thumbs.has(m.id))
            .map((m) => {
              const cs = fitCampaigns(m);
              const gs = cs.flatMap((c) => fresh[c.id] ?? []);
              const th = m.kind === "video" ? files.find((x) => thumbs.has(x.id) && sameStem(m.name, x.name))?.name ?? "" : "";
              return [cs.map(labelOf).join(", "), gs.length === 1 ? gs[0].name : "", m.name.replace(/\.[^.]+$/, "").slice(0, 50), m.name, th, ...blank];
            })
        : pickedCampaigns.length
          ? pickedCampaigns.flatMap((c) => (fresh[c.id].length ? fresh[c.id].map((g) => [labelOf(c), g.name, "", "", "", ...blank]) : [[labelOf(c), "", "", "", "", ...blank]]))
          : CR_SAMPLES.map((r) => [...r]);
      const agBody = pickedCampaigns.length ? pickedCampaigns.flatMap((c) => fresh[c.id].map((g) => adGroupToRow(labelOf(c), g, c.goal))) : AG_SAMPLES.map((r) => [...r]);
      const wb = XLSX.utils.book_new();
      const s1 = XLSX.utils.aoa_to_sheet([[...CR_HEADERS], ...crBody]);
      s1["!cols"] = CR_WIDTHS.map((w) => ({ wch: w }));
      const s2 = XLSX.utils.aoa_to_sheet([[...AG_HEADERS], ...agBody]);
      s2["!cols"] = AG_WIDTHS.map((w) => ({ wch: w }));
      const s3 = XLSX.utils.aoa_to_sheet([
        ...CR_GUIDE,
        [],
        ...AG_GUIDE,
        [],
        ...GUIDE_TAIL,
        [],
        ["선택한 캠페인", "'캠페인' 칸에 아래 ID나 이름을 그대로 적으면 됩니다"],
        ...pickedCampaigns.map((c) => [c.id, `${c.name} · ${typeBadge(c)}${c.dailyBudget ? ` · 캠페인 일 예산 ${c.dailyBudget.toLocaleString("ko-KR")}원` : ""}`]),
        [],
        ["행동유도버튼", ACTION_BUTTONS.map((a) => `${a.label}(${a.key})`).join(" · ")],
      ]);
      s3["!cols"] = [{ wch: 30 }, { wch: 120 }];
      XLSX.utils.book_append_sheet(wb, s1, CR_SHEET);
      XLSX.utils.book_append_sheet(wb, s2, AG_SHEET);
      XLSX.utils.book_append_sheet(wb, s3, GUIDE_SHEET);
      const tag = pickedCampaigns.length === 1 ? `_${pickedCampaigns[0].name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}` : pickedCampaigns.length > 1 ? `_캠페인${pickedCampaigns.length}개` : "";
      XLSX.writeFile(wb, `CTCH_카카오_벌크업로드${tag}.xlsx`);
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
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheetOf = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
      const crName = wb.SheetNames.find((n) => n === CR_SHEET) ?? wb.SheetNames.find((n) => n !== AG_SHEET && n !== GUIDE_SHEET);
      const p = parseCrSheet(crName ? sheetOf(crName) : []);
      if (p.error) throw new Error(p.error);
      if (!p.rows.length) throw new Error(`'${CR_SHEET}' 시트에 내용이 있는 행이 없어요(소재 파일·문구를 적은 행만 읽어요).`);
      setRows(p.rows);
      setSpecs(wb.Sheets[AG_SHEET] ? parseAgSheet(sheetOf(AG_SHEET)) : []);
      setExcluded(new Set());
      setFileName(file.name);
      setSheetBuf(buf);
    } catch (e) {
      setSheetErr((e as Error).message);
    }
  }

  async function addFiles(list: File[]) {
    const ok = list.filter((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|mp4|mov)$/i.test(f.name));
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
          if (known.has(`${f.name}:${f.size}`)) return null;
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
      const got: File[] = [];
      const take = list.slice(0, MAX_FILES - media.size);
      for (let i = 0; i < take.length; i += 4) {
        setLoadingFiles(`드라이브에서 내려받는 중… ${Math.min(i + 4, take.length)}/${take.length}`);
        got.push(...(await Promise.all(take.slice(i, i + 4).map((f) => downloadDriveFile(token, f)))));
      }
      await addFiles(got);
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
  const today = todayKst();
  const planGroup = useCallback(
    (campaign: KakaoCampaignLite, groupName: string): GroupPlan => {
      const name = groupName.trim();
      const existing = groupsOf(campaign.id).find((g) => g.name.trim() === name);
      if (existing) return { mode: "existing", source: existing, draft: { mode: "existing", sourceId: existing.id, name, gender: null, ages: null, budget: null, beginDate: "", endDate: "", bid: null }, problems: [] };
      const same = specs.filter((s) => s.name.trim() === name);
      const spec = same.find((s) => s.campaign && (s.campaign === campaign.id || campaignKey(s.campaign) === campaignKey(campaign.name))) ?? same.find((s) => !s.campaign);
      const problems = spec ? spec.errors.map((e) => `광고그룹 시트 ${spec.sheetRow}행: ${e}`) : [];
      const ctx = { campaignId: campaign.id, campaignType: campaign.type, campaignGoal: campaign.goal, campaignBudget: campaign.dailyBudget, today };
      if (spec?.copyFrom) {
        let src: KakaoAdGroupLite | undefined;
        let srcCampaign: KakaoCampaignLite | undefined;
        for (const c of pickedCampaigns) {
          const hit = groupsOf(c.id).find((g) => g.id === spec.copyFrom);
          if (hit) {
            src = hit;
            srcCampaign = c;
            break;
          }
        }
        const draft = { mode: "copy" as const, sourceId: src?.id ?? spec.copyFrom, name, gender: spec.gender, ages: spec.ages, budget: spec.budget, beginDate: spec.beginDate, endDate: spec.endDate, bid: spec.bid };
        if (!src) problems.push(`원본 광고그룹 ${spec.copyFrom}을 선택한 캠페인에서 못 찾음(비우면 기본값으로 새로)`);
        else {
          if (srcCampaign && srcCampaign.type !== campaign.type) problems.push(`원본은 ${typeBadge(srcCampaign).split(" · ")[0]} 광고그룹이라 이 캠페인에 복사할 수 없어요`);
          // 화면 점검용 — 원본 요약으로 같은 규칙(예산·입찰·기간)을 돌린다. 실제 본문은 서버가 원본 상세로 만든다
          problems.push(...copyAdGroupBody(liteToRaw(src), draft, ctx).problems);
        }
        return { mode: "copy", source: src, draft, problems };
      }
      const draft = { mode: "new" as const, sourceId: null, name, gender: spec?.gender ?? null, ages: spec?.ages ?? null, budget: spec?.budget ?? newBudget, beginDate: spec?.beginDate ?? "", endDate: spec?.endDate ?? "", bid: spec?.bid ?? null };
      problems.push(...newAdGroupBody(draft, ctx).problems.map((p) => (p.startsWith("일 예산") && !spec?.budget ? `${p}(광고그룹 시트 또는 화면 '새 광고그룹 일 예산')` : p)));
      return { mode: "new", draft, problems };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, specs, newBudget, picked, acc, today],
  );

  const prepared: Prepared[] = useMemo(
    () =>
      rows.map((r) => {
        const key = `r${r.sheetRow}`;
        const problems = [...r.errors];
        const f = findFile(r.fileCell, files);
        if (f.problem) problems.push(f.problem);
        if (!files.length) problems.push("소재 파일을 불러오세요");
        const th = findFile(r.thumbCell, files);
        if (th.problem) problems.push(`썸네일 ${th.problem}`);
        let targets: KakaoCampaignLite[] = pickedCampaigns;
        if (r.campaigns.length) {
          targets = [];
          for (const w of r.campaigns) {
            const hit = pickedCampaigns.find((c) => c.id === w || campaignKey(c.name) === campaignKey(w));
            if (!hit) problems.push(`선택하지 않은 캠페인 '${w}'`);
            else if (!targets.includes(hit)) targets.push(hit);
          }
        }
        if (!pickedCampaigns.length) problems.push("① 에서 캠페인을 고르세요");
        const draft = rowDraft(key, r, f.file?.name ?? "", f.file?.id ?? null, th.file?.id ?? null);
        const t: Target[] = targets.map((c) => {
          const format = formatOfCampaign(c)!;
          const tp: string[] = [];
          const notes: string[] = [];
          if (f.file) {
            const fit = mediaFit(f.file, format);
            tp.push(...fit.problems);
            notes.push(...fit.notes);
          }
          if (th.file && format !== "VIDEO_NATIVE") notes.push("썸네일은 동영상 소재에만 써요");
          tp.push(...copyProblems(format, copyOf(draft, defaults), defaults.profile));
          if (r.aiLabel && format !== "IMAGE_BANNER") notes.push("AI 표기는 비즈보드만");
          const group = planGroup(c, r.adGroup);
          tp.push(...group.problems);
          return { campaign: c, group, problems: tp, notes };
        });
        for (const x of t) problems.push(...x.problems.map((p) => (t.length > 1 ? `${x.campaign.name}: ${p}` : p)));
        return { key, row: r, name: draft.name, file: f.file, thumb: th.file, targets: t, problems: [...new Set(problems)] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, files, picked, acc, planGroup, defaults],
  );
  const done = useMemo(() => new Set(prepared.filter((p) => p.targets.length > 0 && p.targets.every((t) => made.has(madeSig(t.campaign.id, p)))).map((p) => p.key)), [prepared, made]);
  const failedRows = prepared.filter((p) => !done.has(p.key) && failed.has(rowSig(p)));
  const runnable = prepared.filter((p) => !p.problems.length && !excluded.has(p.key) && !done.has(p.key));
  const usedFiles = new Set(prepared.flatMap((p) => [p.file?.id, p.thumb?.id]));
  const unused = files.filter((f) => !usedFiles.has(f.id));
  const creativeCount = runnable.reduce((n, p) => n + p.targets.length, 0);
  const newGroupCount = new Set(runnable.flatMap((p) => p.targets.filter((t) => t.group.mode !== "existing").map((t) => `${t.campaign.id}:${p.row.adGroup.trim()}`))).size;

  const globalProblems: Problem[] = [];
  if (!acc) globalProblems.push({ where: "계정", text: "카카오 광고계정을 불러오는 중" });
  if (!picked.length) globalProblems.push({ where: "① 캠페인", text: "캠페인을 고르세요", target: "campaigns" });
  if (groupsLoading) globalProblems.push({ where: "① 캠페인", text: "광고그룹 목록을 불러오는 중" });
  if (!rows.length) globalProblems.push({ where: "② 엑셀", text: "엑셀을 올리세요", target: "files" });
  else if (!runnable.length && !(done.size && done.size === prepared.length))
    globalProblems.push(failedRows.length ? { where: "③ 매칭", text: `실패 ${failedRows.length}행 — 고쳐서 다시 올리거나 체크해 다시 실행`, target: "preview" } : { where: "③ 매칭", text: "실행할 행이 없어요 — 빨간 행을 고치거나 체크하세요", target: "preview" });

  // ── 실행 ──
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<KakaoRunResult | null>(null);
  const cache = useRef(newCache());

  async function run() {
    if (running || globalProblems.length) return;
    const byCampaign = pickedCampaigns.map((c) => ({ c, rows: runnable.filter((p) => p.targets.some((t) => t.campaign.id === c.id)) })).filter((x) => x.rows.length);
    const msg = [
      `카카오모먼트 광고계정 ${acc?.adAccountId}에 실제로 만듭니다(카카오는 사전 검증 API가 없어요).`,
      "",
      ...byCampaign.map((x) => {
        const nNew = new Set(x.rows.filter((p) => p.targets.find((t) => t.campaign.id === x.c.id)!.group.mode !== "existing").map((p) => p.row.adGroup.trim())).size;
        return `· ${x.c.name} (${typeBadge(x.c)}): 소재 ${x.rows.length}개 · 새 광고그룹 ${nNew}개`;
      }),
      "",
      defaults.turnOn ? "상태: 바로 켜기 — 심사 승인 뒤 게재(기존 광고그룹에 넣는 소재도 켜짐)" : "상태: 새 광고그룹·기존 그룹의 새 소재 모두 꺼 둔 채로",
      "",
      "진행할까요?",
    ].join("\n");
    if (!window.confirm(msg)) return;
    setRunning(true);
    setResult(null);
    const lines: LogLine[] = [];
    const total: KakaoRunResult = { adGroups: [], creatives: [], errors: [], warnings: [], activated: false };
    const madeNow: string[] = [];
    const failedNow = new Map<string, string>();
    const okRows: string[] = [];
    const mediaAll = new Map(media);
    if (profileFile) mediaAll.set(profileFile.id, profileFile);
    try {
      for (const [i, x] of byCampaign.entries()) {
        const head: LogLine = { kind: "info", text: `── 캠페인 ${i + 1}/${byCampaign.length} · ${x.c.name}` };
        const gm = new Map<string, AdGroupDraft>();
        for (const p of x.rows) {
          const t = p.targets.find((y) => y.campaign.id === x.c.id)!;
          const nm = p.row.adGroup.trim();
          const cur = gm.get(nm);
          if (cur) cur.creatives.push(p.key);
          else gm.set(nm, { key: `${x.c.id}:${nm}`, ...t.group.draft, creatives: [p.key] });
        }
        const creatives = x.rows.map((p) => rowDraft(p.key, p.row, p.file?.name ?? "", p.file?.id ?? null, p.thumb?.id ?? null));
        const base = [...lines, head];
        let current: LogLine[] = [];
        const r = await runKakao({
          clientId,
          campaign: x.c,
          adGroups: [...gm.values()],
          creatives,
          media: mediaAll,
          defaults,
          cache: cache.current,
          mode: "bulk",
          logExtra: { sheet: fileName, rows: x.rows.map((p) => p.row.sheetRow), batch: byCampaign.length > 1 ? { index: i + 1, of: byCampaign.length } : undefined },
          onLog: (l) => {
            current = l;
            setLog([...base, ...l]);
          },
        });
        lines.push(head, ...current);
        total.adGroups.push(...r.adGroups);
        total.creatives.push(...r.creatives);
        total.errors.push(...r.errors);
        total.warnings.push(...r.warnings);
        total.activated ||= r.activated;
        const madeKeys = new Set(r.creatives.map((c) => c.key));
        for (const p of x.rows) {
          if (madeKeys.has(p.key)) {
            madeNow.push(madeSig(x.c.id, p));
            okRows.push(rowSig(p));
          } else failedNow.set(rowSig(p), r.errors.find((e) => e.includes(p.name)) ?? r.errors.find((e) => e.includes(p.row.adGroup)) ?? r.errors[0] ?? "소재가 만들어지지 않았어요");
        }
      }
      setResult(total);
      setMade((d) => new Set([...d, ...madeNow]));
      setFailed((f) => {
        const n = new Map(f);
        for (const k of okRows) n.delete(k);
        for (const [k, v] of failedNow) n.set(k, v);
        return n;
      });
      setExcluded((e) => new Set([...e, ...byCampaign.flatMap((x) => x.rows).filter((p) => failedNow.has(rowSig(p))).map((p) => p.key)]));
      // 새로 만든 광고그룹이 '기존'으로 보이게 목록 새로
      loadGroups(byCampaign.map((x) => x.c.id), true);
    } finally {
      await cleanupFiles(clientId, cache.current);
      setRunning(false);
    }
  }

  // 올린 엑셀에 'CTCH 상태'·'수정할 부분'을 붙여 내려받기
  const [markErr, setMarkErr] = useState<string | null>(null);
  function downloadMarked() {
    if (!sheetBuf) return;
    setMarkErr(null);
    try {
      const wb = XLSX.read(sheetBuf, { cellStyles: true });
      const crName = wb.SheetNames.find((n) => n === CR_SHEET) ?? wb.SheetNames.find((n) => n !== AG_SHEET && n !== GUIDE_SHEET);
      const items = prepared.map((p) =>
        done.has(p.key)
          ? { row: p.row.sheetRow, status: "완료", fix: "이미 만듦 — 다시 올리면 건너뜀", tone: "ok" as const }
          : p.problems.length
            ? { row: p.row.sheetRow, status: "수정 필요", fix: p.problems.join("\n"), tone: "bad" as const }
            : failed.has(rowSig(p))
              ? { row: p.row.sheetRow, status: "실패", fix: `${failed.get(rowSig(p))}\n→ 고친 뒤 다시 올리면 다시 실행`, tone: "bad" as const }
              : { row: p.row.sheetRow, status: excluded.has(p.key) ? "제외" : "준비됨", fix: "", tone: "" as const },
      );
      if (!crName || !markSheet(wb.Sheets[crName], (v) => v.includes("광고그룹") && v.includes("소재 파일"), items)) throw new Error(`'${CR_SHEET}' 시트 머리글을 못 찾았어요`);
      const agItems = specs.filter((s) => s.errors.length).map((s) => ({ row: s.sheetRow, status: "수정 필요", fix: s.errors.join("\n"), tone: "bad" as const }));
      if (wb.Sheets[AG_SHEET] && agItems.length) markSheet(wb.Sheets[AG_SHEET], (v) => v.includes("광고그룹") && v.includes("성별"), agItems);
      XLSX.writeFile(wb, `${fileName.replace(/\.(xlsx|xls|csv)$/i, "").replace(/_수정표시$/, "")}_수정표시.xlsx`);
    } catch (e) {
      setMarkErr(`표시 엑셀을 못 만들었어요 — ${(e as Error).message}`);
    }
  }
  const fixCount = prepared.filter((p) => !done.has(p.key) && (p.problems.length || failed.has(rowSig(p)))).length;

  useEffect(() => {
    if (!rows.length && !media.size) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [rows.length, media.size]);

  if (accErr && !acc) return <AccountError err={accErr} onRetry={() => reload(true)} />;

  const multi = pickedCampaigns.length > 1;
  const selectable = prepared.filter((p) => !p.problems.length && !done.has(p.key)).map((p) => p.key);
  const onCount = selectable.filter((k) => !excluded.has(k)).length;
  const kinds = { banner: files.filter((m) => m.kind === "image" && !mediaFit(m, "IMAGE_BANNER").problems.length).length, video: files.filter((m) => m.kind === "video").length };

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
      <KakaoAccountBar acc={acc} loading={accLoading} defaults={defaults} setDefaults={setDefaults} defs={defs} profileFile={profileFile} setProfileFile={setProfileFile} onRefresh={() => { reload(true); setGroups({}); }} />

      {/* ① 캠페인 */}
      <section id="kakao-campaigns" className={CARD}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Step n={1} />
          <h3 className="text-[16px] font-bold text-ink">캠페인 선택</h3>
          <span className="text-[13px] text-ink-muted">여러 개·유형 섞어도 돼요 — 소재 형식은 캠페인 유형이 정해요(비즈보드 = 배너 · 디스플레이 = 네이티브 이미지 · 동영상 = 동영상 네이티브)</span>
        </div>
        <CampaignPicker
          acc={acc}
          picked={picked}
          setPicked={setPicked}
          multi
          disabled={running}
          extra={(c) => {
            const st = groups[c.id];
            return <span>· 광고그룹 {st === "loading" || st === undefined ? "…" : Array.isArray(st) ? st.length : "오류"}</span>;
          }}
        />
      </section>

      {/* ② 엑셀 · 소재 파일 */}
      <section id="kakao-files" className="grid gap-4 xl:grid-cols-2">
        <div className={CARD}>
          <div className="mb-3 flex items-center gap-2">
            <Step n={2} />
            <h3 className="text-[16px] font-bold text-ink">엑셀</h3>
            <span className="text-[13px] text-ink-muted">시트 2장 — 소재 · 광고그룹</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} disabled={templBusy || groupsLoading} className={media.size ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-[#eb6834] bg-[#FFF4EE] px-3 py-1.5 text-[14px] font-semibold text-[#C2410C] hover:bg-[#FFE9DD] disabled:opacity-50" : BTN}>
              <i className={`ti ${templBusy ? "ti-loader-2 animate-spin" : "ti-download"} text-[16px]`} aria-hidden />
              템플릿 내려받기
              {media.size ? <span className="rounded-full bg-[#eb6834] px-2 py-0.5 text-[12px] font-semibold text-white">소재 {media.size}개 반영</span> : pickedCampaigns.length ? " (기존 광고그룹 채움)" : ""}
            </button>
            <label className={`${BTN_PRIMARY} cursor-pointer`}>
              <i className="ti ti-file-spreadsheet text-[16px]" aria-hidden />
              엑셀 올리기
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSheet(e.target.files?.[0]).then(() => (e.target.value = ""))} />
            </label>
          </div>
          <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-ink-muted">
            <li>· 소재 파일을 먼저 불러오고 템플릿을 받으면 <b className="text-ink-soft">파일 1개 = 1행</b>, 캠페인 칸에는 파일 규격에 맞는 캠페인만 채워져요(1029×258 = 비즈보드, 영상 = 동영상)</li>
            <li>· <b className="text-ink-soft">광고그룹</b> 시트: 이름이 캠페인에 있으면 소재만 추가, 없으면 새로 — 기존 행을 복사해 이름만 바꾸면 그 광고그룹 설정(지면·맞춤타겟·입찰·요일/시간)을 복사해요</li>
            <li>· 문구·URL 빈 칸은 아래 공통 값으로 채워요. 엑셀·파일은 화면 어디에 끌어 놓아도 돼요</li>
          </ul>
          {fileName && (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[14px] text-ink-soft">
              <b className="text-ink">{fileName}</b> · 소재 행 {rows.length}개 · 광고그룹 시트 {specs.length}행
            </p>
          )}
          {sheetErr && <p className="mt-2 text-[14px] text-bad">{sheetErr}</p>}
        </div>

        <div className={CARD}>
          <div className="mb-3 flex items-center gap-2">
            <Step n={2} />
            <h3 className="text-[16px] font-bold text-ink">소재 파일</h3>
            <span className="text-[13px] text-ink-muted">이미지(JPG·PNG) · 영상(MP4 200MB)</span>
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
              파일 <b className="text-ink">{media.size}개</b> (비즈보드 배너 비율 {kinds.banner} · 영상 {kinds.video} · 그 밖의 이미지 {media.size - kinds.banner - kinds.video})
              {rows.length > 0 && <span className={unused.length ? "text-warn" : ""}> · 안 쓰임 {unused.length}개</span>}
            </p>
          )}
        </div>
      </section>

      {/* 공통 값 */}
      <section className={CARD}>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-ink">공통 문구 · 기본값</h3>
          <span className="text-[13px] text-ink-muted">엑셀에서 비운 칸에 들어가요 · 타이틀·홍보문구·버튼은 네이티브·동영상만</span>
        </div>
        <CommonCopy defaults={defaults} setDefaults={setDefaults} newBudget={newBudget} setNewBudget={setNewBudget} />
      </section>

      {/* ③ 매칭 결과 */}
      <section id="kakao-preview" className={CARD}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Step n={3} />
          <h3 className="text-[16px] font-bold text-ink">매칭 결과</h3>
          <span className="text-[13px] text-ink-muted">빨간 행은 고치기 전까지 빠져요 · 체크를 풀면 그 행만 빼고 실행</span>
          {prepared.length > 0 && (
            <span className="ml-auto text-[14px] text-ink-soft">
              실행 <b className="text-ink">{runnable.length}</b>행 · 새 광고그룹 <b className="text-ink">{newGroupCount}</b> · 소재 <b className="text-[#C2410C]">{creativeCount}</b>
              {done.size > 0 && <span className="text-good"> · 완료 {done.size}</span>}
            </span>
          )}
          {sheetBuf && (fixCount > 0 || done.size > 0) && (
            <div className="flex basis-full flex-wrap gap-2">
              <button type="button" onClick={downloadMarked} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[14px] font-semibold ${fixCount > 0 ? "border-[#FDA29B] bg-[#FEF3F2] text-[#B42318] hover:bg-[#FEE4E2]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647] hover:bg-[#DCFAE6]"}`}>
                <i className={`ti ${fixCount > 0 ? "ti-file-alert" : "ti-file-check"} text-[16px]`} aria-hidden />
                {fixCount > 0 ? `수정할 부분 표시해 내려받기 (${fixCount}행)` : "실행 결과 표시해 내려받기"}
              </button>
              <label className={`${BTN_PRIMARY} cursor-pointer`}>
                <i className="ti ti-file-upload text-[16px]" aria-hidden />
                수정 후 다시 올리기
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSheet(e.target.files?.[0]).then(() => (e.target.value = ""))} />
              </label>
              {markErr && <span className="basis-full text-[13px] text-bad">{markErr}</span>}
            </div>
          )}
        </div>
        {!prepared.length ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
            <i className="ti ti-table-import text-[28px] text-ink-faint" aria-hidden />
            <p className="text-[15px] text-ink-muted">{fileName ? "올린 엑셀에 소재 행이 없어요." : "엑셀을 올리면 행마다 캠페인 · 광고그룹 · 소재 형식 · 문구가 여기 나와요."}</p>
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
                  {multi && <th className="py-2 pr-3 font-medium">캠페인 · 형식</th>}
                  <th className="py-2 pr-3 font-medium">광고그룹</th>
                  <th className="py-2 pr-3 font-medium">소재</th>
                  <th className="py-2 pr-3 font-medium">소재 이름</th>
                  <th className="py-2 pr-3 font-medium">문구</th>
                  <th className="py-2 pr-3 font-medium">버튼 · URL · 빈도</th>
                  <th className="py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {prepared.map((p) => {
                  const isDone = done.has(p.key);
                  const bad = !isDone && p.problems.length > 0;
                  const off = excluded.has(p.key) || isDone;
                  const c = copyOf(rowDraft(p.key, p.row, "", null, null), defaults);
                  const one = p.targets.length === 1 ? p.targets[0] : null;
                  const fmt = one ? formatOfCampaign(one.campaign) : null;
                  const notes = [...new Set(p.targets.flatMap((t) => t.notes))];
                  return (
                    <tr key={p.key} className={`border-b border-[#F2F4F7] align-top ${bad ? "bg-[#FEF2F2]/60" : off ? "opacity-50" : ""}`}>
                      <td className="py-2">
                        <input type="checkbox" className="accent-[#eb6834]" disabled={bad || isDone} checked={!bad && !off} onChange={() => setExcluded((x) => (x.has(p.key) ? new Set([...x].filter((k) => k !== p.key)) : new Set([...x, p.key])))} aria-label={`${p.row.sheetRow}행 포함`} />
                      </td>
                      <td className="py-2 tabular-nums text-ink-muted">{p.row.sheetRow}</td>
                      {multi && (
                        <td className="max-w-[220px] py-2 pr-3">
                          {p.targets.map((t) => (
                            <p key={t.campaign.id} className="truncate text-[13px]" title={`${t.campaign.name} · ${typeBadge(t.campaign)}`}>
                              {t.campaign.name}
                              <span className="ml-1 text-[11px] text-ink-muted">{FORMAT_LABEL[formatOfCampaign(t.campaign)!]}</span>
                            </p>
                          ))}
                        </td>
                      )}
                      <td className="max-w-[230px] py-2 pr-3">
                        <p className="truncate font-mono text-[13px] text-ink" title={p.row.adGroup}>
                          {p.row.adGroup || "—"}
                        </p>
                        {isDone ? <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[12px] text-[#067647]">이 광고그룹에 만듦</span> : <GroupBadges targets={p.targets} />}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-end gap-1">
                          {p.file ? <Thumb m={p.file} /> : <span className="text-[12px] text-ink-faint">{p.row.fileCell || "—"}</span>}
                          {p.thumb && <Thumb m={p.thumb} h={32} />}
                        </div>
                        {!multi && fmt && <p className="mt-0.5 text-[11px] text-ink-muted">{FORMAT_LABEL[fmt]}</p>}
                      </td>
                      <td className="max-w-[180px] py-2 pr-3">
                        <p className="truncate font-mono text-[13px] text-ink" title={p.name}>
                          {p.name || "—"}
                        </p>
                      </td>
                      <td className="max-w-[300px] py-2 pr-3">
                        {fmt === "IMAGE_BANNER" ? (
                          <p className={`truncate text-[13px] ${p.row.altText ? "text-ink" : "text-ink-muted"}`} title="소재 설명(대체 텍스트)">
                            {c.altText || "—"}
                          </p>
                        ) : (
                          <>
                            <p className={`truncate text-[13px] font-semibold ${p.row.title ? "text-ink" : "text-ink-muted"}`}>{c.title || "—"}</p>
                            <p className={`line-clamp-2 text-[12px] ${p.row.description ? "text-ink-soft" : "text-ink-muted"}`}>{c.description}</p>
                          </>
                        )}
                      </td>
                      <td className="max-w-[200px] py-2 pr-3">
                        {fmt !== "IMAGE_BANNER" && <p className={`text-[12px] ${p.row.actionButton ? "text-ink-soft" : "text-ink-muted"}`}>{ACTION_LABEL[c.actionButton] ?? c.actionButton}</p>}
                        <p className={`truncate text-[12px] ${p.row.url ? "text-ink-soft" : "text-ink-muted"}`} title={c.url}>
                          {c.url.replace(/^https?:\/\//, "") || "—"}
                        </p>
                        <p className={`text-[12px] ${p.row.freq ? "text-ink-soft" : "text-ink-muted"}`}>{freqText(p.row.freq ?? defaults.freq)}</p>
                      </td>
                      <td className="max-w-[320px] py-2">
                        {isDone ? (
                          <span className="whitespace-nowrap rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[12px] font-semibold text-[#067647]">완료</span>
                        ) : failed.has(rowSig(p)) && !bad ? (
                          <>
                            <span className="whitespace-nowrap rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[12px] font-semibold text-bad">지난 실행 실패</span>
                            <p className="mt-1 text-[12px] leading-snug text-bad">{failed.get(rowSig(p))}</p>
                          </>
                        ) : bad ? (
                          p.problems.map((x) => (
                            <p key={x} className="text-[12px] leading-snug text-bad">
                              · {x}
                            </p>
                          ))
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[12px] text-[#067647]">준비됨</span>
                        )}
                        {notes.map((n) => (
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
            <p className="mt-2 text-[12px] text-ink-muted">회색 글자 = 공통 값에서 가져온 값</p>
          </div>
        )}
      </section>

      <KakaoRunLog log={log} result={result} running={running} />

      <KakaoRunBar
        ready={!!acc}
        summary={
          <>
            <span className="font-semibold text-ink">{pickedCampaigns.length ? `캠페인 ${pickedCampaigns.length}개` : "캠페인 미선택"}</span>
            <span className="mx-2 text-ink-faint">›</span>새 광고그룹 <b className="tabular-nums text-ink">{newGroupCount}</b>
            <span className="mx-1.5 text-ink-faint">·</span>소재 <b className="tabular-nums text-[#C2410C]">{creativeCount}</b>개
            {done.size > 0 && <span className="ml-2 whitespace-nowrap text-good">· 완료 {done.size}행</span>}
            {failedRows.length > 0 && <span className="ml-1.5 whitespace-nowrap text-bad">· 실패 {failedRows.length}행</span>}
          </>
        }
        problems={globalProblems}
        onJump={(t) => document.getElementById(`kakao-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        running={running}
        turnOn={defaults.turnOn}
        setTurnOn={(v) => setDefaults((d) => ({ ...d, turnOn: v }))}
        onRun={run}
        runLabel={creativeCount > 0 ? `소재 ${creativeCount}개 만들기` : done.size && !failedRows.length ? "모두 완료" : "만들 소재 없음"}
      />
    </div>
  );
}

// 시트 행 → 소재 초안(빈 칸은 공통 값으로 — copyOf가 채움)
function rowDraft(key: string, r: CrRow, fileName: string, fileId: string | null, thumbId: string | null): CreativeDraft {
  return {
    key,
    name: (r.name || fileName.replace(/\.[^.]+$/, "")).slice(0, 50),
    file: fileId,
    thumb: thumbId,
    copy: { title: r.title, description: r.description, profileName: r.profileName, actionButton: r.actionButton, url: r.url, altText: r.altText },
    freq: r.freq,
    opinion: r.opinion,
    aiLabel: r.aiLabel,
  };
}

// 광고그룹 요약 → 점검용 원본 모양(서버 copyAdGroupBody와 같은 규칙을 화면에서 돌리기 위함)
function liteToRaw(g: KakaoAdGroupLite): Record<string, unknown> {
  return {
    dailyBudgetAmount: g.dailyBudget,
    bidStrategy: g.bidStrategy,
    pricingType: g.pricingType,
    bidAmount: g.bidAmount,
    bidStrategyTarget: g.bidTarget,
    adult: g.adult,
    targeting: { type: g.audience.some((a) => a.startsWith("오디언스")) ? "DISPLAY" : "NORMAL", genderType: g.genders.length ? "NOT_ALL" : "ALL", ageType: g.ages.length ? "NOT_ALL" : "ALL", ages: g.ages, genders: g.genders },
    schedule: { beginDate: g.beginDate, endDate: g.endDate },
  };
}

const sameStem = (a: string, b: string) => {
  const s = (x: string) => x.toLowerCase().replace(/\.[^.]+$/, "").replace(/[_\-\s]*(thumb|thumbnail|썸네일|cover|커버)$/i, "");
  return s(a) === s(b) && a !== b;
};

function GroupBadges({ targets }: { targets: Target[] }) {
  const B = "mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px]";
  if (targets.length !== 1) {
    const n = { existing: 0, new: 0, copy: 0 };
    targets.forEach((t) => n[t.group.mode]++);
    return (
      <span className="mt-1 flex flex-wrap gap-1">
        {n.new > 0 && <span className={`${B} mt-0 bg-[#FDF1EC] text-[#C2410C]`}>새로 {n.new}</span>}
        {n.copy > 0 && <span className={`${B} mt-0 bg-[#EEF4FF] text-[#3538CD]`}>복사 {n.copy}</span>}
        {n.existing > 0 && <span className={`${B} mt-0 bg-[#F2F4F7] text-ink-soft`}>기존 {n.existing}</span>}
      </span>
    );
  }
  const t = targets[0];
  const g = t.group;
  if (g.mode === "existing") return <span className={`${B} bg-[#F2F4F7] text-ink-soft`}>기존 광고그룹에 추가</span>;
  const d = g.draft;
  const parts = [d.gender ? (d.gender === "all" ? "전체" : d.gender === "f" ? "여" : "남") : null, d.ages ? agesLabel(d.ages) : null, d.budget ? `${d.budget.toLocaleString("ko-KR")}원` : null, d.bid ? bidText(d.bid) : null].filter(Boolean);
  if (g.mode === "copy")
    return (
      <>
        <span className={`${B} bg-[#EEF4FF] text-[#3538CD]`} title={g.source ? `${g.source.name} 설정 복사` : undefined}>
          복사 · {g.source?.name ?? d.sourceId}
        </span>
        {parts.length > 0 && <p className="mt-0.5 text-[11px] text-ink-muted">바꿈: {parts.join(" · ")}</p>}
      </>
    );
  return (
    <>
      <span className={`${B} bg-[#FDF1EC] text-[#C2410C]`}>새로 · {[d.gender ? (d.gender === "all" ? "전체" : d.gender === "f" ? "여" : "남") : "전체", d.ages ? agesLabel(d.ages) : "전체 연령", d.budget ? `${d.budget.toLocaleString("ko-KR")}원` : ""].filter(Boolean).join(" ")}</span>
      <p className="mt-0.5 text-[11px] text-ink-muted">{d.bid ? bidText(d.bid) : t.campaign.type === "VIDEO" ? `수동 CPV ${defaultBid("VIDEO").amount}` : t.campaign.goal === "CONVERSION" ? "전환수 최대화" : "클릭수 최대화"} · 국내 전체 · 모든 지면</p>
    </>
  );
}

// 공통 문구 칸 — 엑셀 벌크·수동 세팅 공용
export function CommonCopy({ defaults, setDefaults, newBudget, setNewBudget }: { defaults: Defaults; setDefaults: (fn: (d: Defaults) => Defaults) => void; newBudget?: number | null; setNewBudget?: (n: number | null) => void }) {
  const set = (k: keyof Defaults["copy"], v: string) => setDefaults((d) => ({ ...d, copy: { ...d.copy, [k]: v } }));
  const len = (s: string) => [...s].length;
  return (
    <div className="grid gap-2 lg:grid-cols-[1.3fr_2fr_130px_1.6fr_1.3fr_auto]">
      <Counted value={defaults.copy.title} max={25} onChange={(v) => set("title", v)} placeholder="타이틀(25자)" />
      <Counted value={defaults.copy.description} max={45} onChange={(v) => set("description", v)} placeholder="홍보문구(45자)" />
      <select className={INP} value={defaults.copy.actionButton} onChange={(e) => set("actionButton", e.target.value)} title="행동유도버튼">
        {ACTION_BUTTONS.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <input className={INP} value={defaults.copy.url} onChange={(e) => set("url", e.target.value.trim())} placeholder="랜딩 URL https://" />
      <div className="relative">
        <input className={`${INP} pr-10 ${len(defaults.copy.altText) > 30 ? "border-bad" : ""}`} value={defaults.copy.altText} onChange={(e) => set("altText", e.target.value)} placeholder="소재 설명(비우면 타이틀에서)" title="비즈보드·네이티브 이미지의 대체 텍스트(30자, 특수문자 불가)" />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-ink-faint">{len(defaults.copy.altText)}/30</span>
      </div>
      {setNewBudget && (
        <div className="w-[160px]" title="광고그룹 시트에 행·예산이 없는 새 광고그룹의 일 예산(1만 원 이상)">
          <MoneyInput value={newBudget ?? null} onChange={setNewBudget} placeholder="새 광고그룹 일 예산" />
        </div>
      )}
    </div>
  );
}

export function Counted({ value, max, onChange, placeholder, className = "" }: { value: string; max: number; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const n = [...value].length;
  return (
    <div className={`relative ${className}`}>
      <input className={`${INP} pr-12 ${n > max ? "border-bad" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tabular-nums ${n > max ? "text-bad" : "text-ink-faint"}`}>
        {n}/{max}
      </span>
    </div>
  );
}
