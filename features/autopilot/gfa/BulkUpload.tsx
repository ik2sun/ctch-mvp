"use client";

// 캠페인 오토파일럿 > 자동 대량 세팅 > 엑셀 벌크 업로드(GFA)
// 엑셀(소재 유형별 시트 + 선택 광고그룹 시트) + 이미지(내 PC 파일·폴더 / 구글 드라이브 폴더) → 파일명 ↔ 상품명 자동 매칭 → 미리보기 → 한 번에 생성
// 소재 유형 3가지: 네이티브 이미지(템플릿별 문구 칸) · 이미지 배너(광고 안내 문구) · 컬렉션(카드 4~10장) — 템플릿을 내려받을 때 유형을 고른다
// 캠페인 여러 개: 행의 '캠페인' 칸이 비면 선택한 캠페인 전부, 적으면 그 캠페인에만. 실행은 캠페인별로 차례대로(이미지 업로드는 공유)
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/features/dashboard/ui";
import {
  COLLECTION_TEMPLATE,
  COPY_LABEL,
  COPY_RULES,
  SINGLE_IMAGE_TEMPLATES,
  DEFAULT_TEMPLATES,
  MIN_ADSET_BUDGET,
  autoTemplates,
  ratioMatches,
  slug,
  startTimeFor,
  templateByCode,
  templateCopyProblems,
  type CopyField,
  type GfaContext,
  type TemplateSpec,
} from "./types";
import {
  COL_WIDTHS,
  CTA_ALL,
  FAMILIES,
  FAMILY_DESC,
  FAMILY_LABEL,
  GUIDES,
  GUIDE_TAIL,
  HEADERS,
  IMAGE_REF_HEADER,
  NATIVE_TYPE_LABEL,
  PROFILE_HEADER,
  SAMPLES,
  imageTemplateRows,
  matchImages,
  norm,
  parseCollectionSheet,
  parseCreativeSheet,
  sheetFamily,
  type BulkRow,
  type CollectionGroup,
  type Family,
} from "./bulkSheet";
import { ADSET_COLUMNS, ADSET_FULL_HEADERS, ADSET_GUIDE, ADSET_SAMPLE_FULL, adSetToRow, parseAdSetSheetFull, type AdSetSpec, type GfaAdSetDetail, type GfaCodeBook } from "./adSetSheet";
import { readImage, releaseImage, upscaleRatio, type SourceImage } from "./imageFit";
import { downloadDriveFile, folderIdFrom, getDriveToken, listDriveImages } from "./driveImport";
import { postAutopilot, runSetup, type LogLine, type RunAdSet, type RunCollection, type RunCreative, type RunResult } from "./runner";
import { CHIP, CHIP_ON, Field, INPUT, PRIMARY, RunLog, SECONDARY, todayKst, won } from "./ui";

const MAX_IMAGES = 400;

type Target = { ctx: GfaContext; existingNo?: number; spec?: AdSetSpec };
// imgTpl[i] = images[i]에 쓸 규격(자동이면 이미지 크기로, 배너는 비율이 맞는 것만)
type Prepared = BulkRow & { images: SourceImage[]; imgTpl: string[][]; auto: boolean; targets: Target[]; problems: string[]; notes: string[]; count: number };
type PreparedCollection = CollectionGroup & { cardImages: (SourceImage | null)[]; targets: Target[]; problems: string[]; notes: string[]; count: number };

const fmtSize = (t: TemplateSpec) => `${t.width}×${t.height}`;
const filled = (v?: string) => (v ?? "").trim().length > 0;

// 이미지 한 장에 쓸 규격 — 규격 칸이 비면 크기로 자동(시트 유형 안에서), 맞는 비율이 없으면 네이티브는 화면 기본 규격으로 잘라 쓰고 배너는 오류.
// 342×228은 문구로 모바일/PC를 고른다(PC 긴 설명만 → PC, 설명 문구1~3만 → 모바일, 둘 다 → 둘 다)
function templatesFor(img: SourceImage, r: BulkRow, defaults: string[]): { codes: string[]; note?: string } {
  // 네이티브 '소재 유형' — 피드형은 이미지 비율로 가로·정사각·세로, 배너형은 342×228(비율이 다르면 가운데 잘림)
  if (r.nativeTypes) {
    const codes: string[] = [];
    const notes: string[] = [];
    for (const t of r.nativeTypes) {
      if (t === "feed") {
        const feed = autoTemplates(img, "SINGLE_IMAGE", "SINGLE_IMAGE").filter((x) => x.code.startsWith("FEED_"));
        if (feed.length) codes.push(feed[0].code);
        else {
          codes.push(...defaults);
          notes.push(`${img.file.name}(${img.width}×${img.height})는 피드 비율(1.91:1·1:1·2:3)이 아니라 기본 피드 규격으로 잘라 씀`);
        }
      } else {
        const code = t === "pc" ? "NATIVE_SINGLE_IMAGE_PC" : "NATIVE_SINGLE_IMAGE_V2";
        codes.push(code);
        if (!ratioMatches(img, templateByCode(code)!)) notes.push(`${img.file.name}(${img.width}×${img.height})는 342×228 비율이 아니라 가운데가 잘림`);
      }
    }
    return { codes: [...new Set(codes)], note: notes.join(" / ") || undefined };
  }
  if (r.templates) {
    const codes = r.templates.filter((c) => {
      const t = templateByCode(c);
      return t && (t.kind === "SINGLE_IMAGE" || ratioMatches(img, t));
    });
    if (codes.length) return { codes };
    const want = r.templates.map((c) => templateByCode(c)).filter((t): t is TemplateSpec => !!t);
    return { codes: [], note: `${img.file.name}(${img.width}×${img.height})는 ${want.map((t) => t.label).join("·")}와 비율이 달라요 — 배너는 잘라 쓰지 않아요` };
  }
  const only = r.family === "native" ? "SINGLE_IMAGE" : r.family === "banner" ? "IMAGE_BANNER" : undefined;
  const auto = autoTemplates(img, "SINGLE_IMAGE", only);
  if (auto.length) {
    if (auto[0].code !== "NATIVE_SINGLE_IMAGE_V2") return { codes: [auto[0].code] };
    const mobile = filled(r.copy.linkTitle) || filled(r.copy.linkDescription) || filled(r.copy.linkText3rd);
    const pc = filled(r.copy.linkText4th) || filled(r.copy.linkText5th);
    return { codes: pc && !mobile ? ["NATIVE_SINGLE_IMAGE_PC"] : pc ? ["NATIVE_SINGLE_IMAGE_V2", "NATIVE_SINGLE_IMAGE_PC"] : ["NATIVE_SINGLE_IMAGE_V2"] };
  }
  if (r.family === "banner") return { codes: [], note: `${img.file.name}(${img.width}×${img.height})는 배너 규격(750×160·750×280·750×200·1250×560·1200×1200)과 비율이 달라요 — 배너는 잘라 쓰지 않아요` };
  return { codes: defaults, note: `${img.file.name}(${img.width}×${img.height})는 맞는 규격 비율이 없어 기본 규격으로 잘라 씀` };
}

// 행의 문구가 템플릿에 들어갈 때 문제 — 네이티브는 템플릿별 필수 칸·글자 수, 배너는 광고 안내 문구
function copyIssues(r: BulkRow, codes: string[]): { problems: string[]; notes: string[] } {
  const problems = new Set<string>();
  const notes = new Set<string>();
  for (const code of new Set(codes)) {
    const t = templateByCode(code);
    if (!t) continue;
    if (t.kind === "IMAGE_BANNER") {
      if (!r.altMessage && r.altFallback.length < 2) problems.add("배너는 광고 안내 문구 필수(2~100자) — 이미지 속 글자를 적어 주세요");
      else if (!r.altMessage) notes.add(`광고 안내 문구가 비어 '${r.altFallback.slice(0, 30)}'로 대신 넣음 — 이미지 속 글자를 적는 것을 권장`);
      continue;
    }
    for (const p of templateCopyProblems(r.copy, code)) problems.add(`${t.label}: ${p}`);
    // 이 템플릿이 안 받는 칸에 적힌 문구는 빠진다고 알린다
    const rules = COPY_RULES[code] ?? {};
    const dropped = (Object.keys(COPY_LABEL) as CopyField[]).filter((f) => !rules[f] && filled(r.copy[f]));
    if (dropped.length) notes.add(`${t.label}는 ${dropped.map((f) => COPY_LABEL[f]).join("·")} 칸이 없어 빼고 보냄`);
  }
  if (r.altMessage && !codes.some((c) => templateByCode(c)?.kind === "IMAGE_BANNER")) notes.add("광고 안내 문구는 배너 소재에만 들어감");
  return { problems: [...problems], notes: [...notes] };
}

const campaignKey = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
const sameCampaign = (ctx: GfaContext, label: string) => String(ctx.campaign.no) === label.trim() || campaignKey(ctx.campaign.name) === campaignKey(label);

export function BulkUpload({ clientId, ctxs, accountNo, canEdit }: { clientId: string; ctxs: GfaContext[]; accountNo: string; canEdit: boolean }) {
  const multi = ctxs.length > 1;
  // 엑셀
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [groups, setGroups] = useState<CollectionGroup[]>([]);
  const [specs, setSpecs] = useState<AdSetSpec[]>([]);
  const [book, setBook] = useState<GfaCodeBook | null>(null);
  const [tplFamily, setTplFamily] = useState<Family>("banner");
  // 광고계정 프로필(네이티브·컬렉션에 자동으로 붙음) — undefined = 확인 중, null = 확인 못 함(기존 네이티브 소재 없음)
  const [profile, setProfile] = useState<{ name: string; imageUrl?: string } | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    postAutopilot<{ profile: { name: string; imageUrl?: string } | null }>({ action: "profile", clientId })
      .then((r) => !off && setProfile(r.profile))
      .catch(() => !off && setProfile(null));
    return () => {
      off = true;
    };
  }, [clientId]);
  const [templBusy, setTemplBusy] = useState<string | null>(null);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // 이미지
  const [images, setImages] = useState<SourceImage[]>([]);
  const [loadingImg, setLoadingImg] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState("");

  // 실행 설정
  const [formats, setFormats] = useState<string[]>(DEFAULT_TEMPLATES);
  const [defaultBudget, setDefaultBudget] = useState(30000);
  const [startDate, setStartDate] = useState("");
  const [useUtm, setUseUtm] = useState(false); // UTM 자동 추가는 기본 꺼짐(광고주 UTM 규칙 우선)
  const [turnOn, setTurnOn] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  // ── 엑셀 ──
  // 코드표(관심사·지역·게재 위치 등 이름 ↔ 코드) — 한 번 받아 두고 내보내기·해석에 같이 쓴다
  async function ensureBook(): Promise<GfaCodeBook | null> {
    if (book) return book;
    try {
      const b = await postAutopilot<GfaCodeBook>({ action: "codebook", clientId });
      setBook(b);
      return b;
    } catch {
      return null;
    }
  }

  async function downloadTemplate() {
    setSheetErr(null);
    // 선택한 캠페인 × 기존 광고그룹을 한 행씩 미리 채운다(광고그룹이 없으면 캠페인만). 이름이 겹치는 캠페인은 ID로
    const dupName = (name: string) => ctxs.filter((c) => c.campaign.name.trim() === name.trim()).length > 1;
    const labelOf = (c: GfaContext) => (dupName(c.campaign.name) ? String(c.campaign.no) : c.campaign.name);

    // '광고그룹' 시트 — 기존 광고그룹 설정 전 항목(상세 조회)
    const adSetRows: (string | number)[][] = [];
    try {
      if (ctxs.some((c) => c.existingAdSets.length)) {
        setTemplBusy("코드표 불러오는 중…");
        const b = await ensureBook();
        if (!b) throw new Error("GFA 코드표(관심사·지역 등)를 불러오지 못했어요.");
        for (const [i, c] of ctxs.entries()) {
          if (!c.existingAdSets.length) continue;
          setTemplBusy(`광고그룹 설정 읽는 중… 캠페인 ${i + 1}/${ctxs.length} (${c.existingAdSets.length}개)`);
          const r = await postAutopilot<{ adSets: GfaAdSetDetail[] }>({ action: "adSetDetails", clientId, campaignNo: c.campaign.no });
          for (const d of r.adSets) adSetRows.push(adSetToRow(labelOf(c), d, b));
        }
      }
    } catch (e) {
      setSheetErr(`광고그룹 설정을 못 읽었어요 — ${(e as Error).message}`);
      setTemplBusy(null);
      return;
    }
    setTemplBusy(null);

    // 고른 소재 유형의 시트 하나 — 머리글·안내·예시가 유형마다 다르다
    const fam = tplFamily;
    const headers = HEADERS[fam];
    const wb = XLSX.utils.book_new();
    const blank = headers.slice(2).map(() => "");
    const prefilled = ctxs.flatMap((c) => (c.existingAdSets.length ? c.existingAdSets.map((s) => [labelOf(c), s.name, ...blank]) : [[labelOf(c), "", ...blank]]));
    // 이미지를 먼저 불러왔으면 이미지 1장 = 1행(이미지 파일명·소재 이름 채움, 캠페인 칸은 비움 = 선택한 캠페인 전부)
    const fromImages = images.length ? imageTemplateRows(fam, images.map((i) => ({ name: i.file.name, width: i.width, height: i.height })), ctxs.flatMap((c) => c.existingAdSets.map((s) => s.name))) : [];
    const body = fromImages.length ? fromImages : prefilled.length ? prefilled : SAMPLES[fam].map((r) => [...r]);
    // 프로필 이름 칸 = 지금 광고계정 프로필(확인용), 네이티브 소재 유형 칸은 비어 있으면 피드형
    const pi = headers.indexOf(PROFILE_HEADER);
    const ti = fam === "native" ? headers.indexOf("소재 유형") : -1;
    for (const r of body) {
      if (pi >= 0 && profile?.name && !r[pi]) r[pi] = profile.name;
      if (ti >= 0 && !r[ti] && !fromImages.length) r[ti] = NATIVE_TYPE_LABEL.feed;
    }
    const s1 = XLSX.utils.aoa_to_sheet([fromImages.length ? [...headers, IMAGE_REF_HEADER] : [...headers], ...body]);
    s1["!cols"] = [Math.min(48, Math.max(20, ...ctxs.map((c) => c.campaign.name.length + 4))), ...COL_WIDTHS[fam].slice(1)].map((w) => ({ wch: w }));
    // 미리 채운 템플릿에서는 가짜 예시 광고그룹을 넣지 않는다
    const s2 = XLSX.utils.aoa_to_sheet([ADSET_FULL_HEADERS, ...(prefilled.length ? adSetRows : ADSET_SAMPLE_FULL)]);
    s2["!cols"] = ADSET_COLUMNS.map((c) => ({ wch: c.w }));
    s2["!freeze"] = { xSplit: 2, ySplit: 1 };
    const s3 = XLSX.utils.aoa_to_sheet([
      ...GUIDES[fam],
      ...GUIDE_TAIL,
      [],
      ["다른 소재 유형", `이 파일은 '${FAMILY_LABEL[fam]}' 시트만 들어 있어요. 다른 유형은 화면에서 유형을 바꿔 템플릿을 다시 내려받고, 시트를 이 파일에 복사해 함께 올려도 됩니다(시트 이름 그대로).`],
      [],
      ...ADSET_GUIDE,
      [],
      ["CTA 목록", CTA_ALL.map((c) => `${c.name}(${c.value})`).join(", ")],
      [],
      ["선택한 캠페인", "'캠페인' 칸에 아래 ID나 이름을 그대로 적으면 됩니다"],
      ...ctxs.map((c) => [String(c.campaign.no), c.campaign.name]),
    ]);
    s3["!cols"] = [{ wch: 22 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, s1, FAMILY_LABEL[fam]);
    XLSX.utils.book_append_sheet(wb, s2, "광고그룹");
    XLSX.utils.book_append_sheet(wb, s3, "작성 안내");
    const tag = ctxs.length === 1 ? `_${ctxs[0].campaign.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}` : ctxs.length > 1 ? `_캠페인${ctxs.length}개` : "";
    XLSX.writeFile(wb, `CTCH_GFA_${FAMILY_LABEL[fam].replace(/\s/g, "")}_벌크업로드${tag}.xlsx`);
  }

  // 시트 이름(네이티브 이미지·이미지 배너·컬렉션, 예전 '소재')이나 머리글로 유형을 알아내 전부 읽는다
  async function onSheet(file: File | undefined) {
    if (!file) return;
    setSheetErr(null);
    setResult(null);
    setLog([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const nextRows: BulkRow[] = [];
      const nextGroups: CollectionGroup[] = [];
      const errs: string[] = [];
      for (const name of wb.SheetNames) {
        if (name === "광고그룹" || name === "작성 안내") continue;
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
        const fam = sheetFamily(name, matrix);
        if (!fam) continue;
        if (fam === "collection") {
          const p = parseCollectionSheet(matrix, name);
          if (p.error) errs.push(p.error);
          nextGroups.push(...p.groups);
        } else {
          const p = parseCreativeSheet(matrix, fam, name);
          if (p.error) errs.push(p.error);
          nextRows.push(...p.rows);
        }
      }
      if (!nextRows.length && !nextGroups.length) throw new Error(errs[0] ?? `소재 시트(${FAMILIES.map((f) => FAMILY_LABEL[f]).join("·")})를 찾지 못했어요. 템플릿을 내려받아 쓰세요.`);
      const adSheet = wb.Sheets["광고그룹"];
      setSpecs(adSheet ? parseAdSetSheetFull(XLSX.utils.sheet_to_json<unknown[]>(adSheet, { header: 1, defval: "", raw: true }), await ensureBook()) : []);
      setRows(nextRows);
      setGroups(nextGroups);
      setExcluded(new Set());
      setFileName(file.name);
    } catch (e) {
      setSheetErr((e as Error).message);
    }
  }

  // ── 이미지 ──
  async function addFiles(files: File[], source: SourceImage["source"]) {
    const list = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name)).slice(0, MAX_IMAGES - images.length);
    const out: SourceImage[] = [];
    for (let i = 0; i < list.length; i += 8) {
      setLoadingImg(`이미지 읽는 중… ${Math.min(i + 8, list.length)}/${list.length}`);
      const batch = await Promise.all(list.slice(i, i + 8).map((f) => readImage(f, source).catch(() => null)));
      out.push(...batch.filter((x): x is SourceImage => !!x));
    }
    setImages((prev) => [...prev, ...out]);
    setLoadingImg(null);
    if (files.length > list.length) setImgErr(`이미지는 최대 ${MAX_IMAGES}장까지예요. ${files.length - list.length}장은 건너뛰었어요.`);
  }

  async function fromDrive() {
    const id = folderIdFrom(driveUrl);
    if (!id) return setImgErr("구글 드라이브 폴더 주소를 넣어 주세요. (drive.google.com/drive/folders/…)");
    setImgErr(null);
    try {
      setLoadingImg("구글 드라이브 권한 확인 중…");
      const token = await getDriveToken();
      setLoadingImg("폴더 목록 읽는 중…");
      const list = await listDriveImages(token, id);
      if (!list.length) throw new Error("폴더(하위 2단계 포함)에 이미지가 없어요.");
      const room = MAX_IMAGES - images.length;
      const files: File[] = [];
      const take = list.slice(0, room);
      for (let i = 0; i < take.length; i += 4) {
        setLoadingImg(`드라이브에서 내려받는 중… ${Math.min(i + 4, take.length)}/${take.length}`);
        files.push(...(await Promise.all(take.slice(i, i + 4).map((f) => downloadDriveFile(token, f)))));
      }
      await addFiles(files, "drive");
      if (list.length > room) setImgErr(`이미지는 최대 ${MAX_IMAGES}장까지예요. ${list.length - room}장은 건너뛰었어요.`);
    } catch (e) {
      setImgErr((e as Error).message);
    } finally {
      setLoadingImg(null);
    }
  }

  function clearImages() {
    images.forEach(releaseImage);
    setImages([]);
    setImgErr(null);
  }

  // ── 매칭·미리보기 ──
  // '광고그룹' 시트 행 찾기 — 캠페인 칸이 그 캠페인이면 우선, 비어 있으면 모든 캠페인 공통
  const specFor = useCallback(
    (ctx: GfaContext, name: string) => {
      const same = specs.filter((s) => s.name.trim() === name.trim());
      return same.find((s) => s.campaign && sameCampaign(ctx, s.campaign)) ?? same.find((s) => !s.campaign);
    },
    [specs],
  );
  // 캠페인별 기존 광고그룹 이름 → 번호
  const existingBy = useMemo(() => new Map(ctxs.map((c) => [c.campaign.no, new Map(c.existingAdSets.map((s) => [s.name.trim(), s.no]))])), [ctxs]);

  // 프로필 이름 칸 확인 — GFA는 소재별 프로필을 받지 않아 계정 프로필이 붙는다. 다른 이름이 적혀 있으면 멈춘다
  const profileCheck = useCallback(
    (name: string): { problem?: string; note?: string } => {
      const want = name.trim();
      if (profile === undefined) return {};
      if (!profile) return { note: "광고계정 프로필을 확인하지 못했어요(기존 네이티브 소재 없음) — GFA 프로필 관리에 등록돼 있어야 생성됩니다" };
      if (want && want.replace(/\s/g, "") !== profile.name.replace(/\s/g, ""))
        return { problem: `프로필 '${want}' ≠ 이 광고계정 프로필 '${profile.name}' — GFA는 소재별 프로필을 API로 받지 않아요. 계정 프로필을 바꾸거나 칸을 '${profile.name}'로` };
      return {};
    },
    [profile],
  );

  // 넣을 캠페인 — 칸이 비면 선택한 캠페인 전부, 적으면 ID 또는 이름이 같은 캠페인. 새로 만들 광고그룹의 시트 행 오류도 함께
  const targetsFor = useCallback(
    (campaigns: string[], adSetName: string): { targets: Target[]; problems: string[] } => {
      const problems: string[] = [];
      let picked = ctxs;
      if (campaigns.length) {
        picked = [];
        for (const want of campaigns) {
          const hit = ctxs.find((c) => String(c.campaign.no) === want || campaignKey(c.campaign.name) === campaignKey(want));
          if (!hit) problems.push(`선택하지 않은 캠페인 '${want}'`);
          else if (!picked.includes(hit)) picked.push(hit);
        }
      }
      const name = adSetName.trim();
      const targets: Target[] = picked.map((c) => ({ ctx: c, existingNo: existingBy.get(c.campaign.no)?.get(name), spec: specFor(c, name) }));
      for (const sp of new Set(targets.filter((t) => !t.existingNo && t.spec?.errors.length).map((t) => t.spec!))) {
        problems.push(`광고그룹 시트 ${sp.row}행: ${sp.errors.join(", ")}`);
      }
      return { targets, problems };
    },
    [ctxs, existingBy, specFor],
  );

  const prepared: Prepared[] = useMemo(() => {
    const named = images.map((img) => ({ name: img.file.name, img }));
    const { byProduct } = matchImages(
      rows.filter((r) => !r.files.length).map((r) => r.product),
      named,
    );
    const byFile = new Map<string, SourceImage[]>();
    for (const n of named) {
      for (const k of [n.name.toLowerCase(), norm(n.name)]) byFile.set(k, [...(byFile.get(k) ?? []), n.img]);
    }
    return rows.map((r) => {
      const problems = [...r.errors];
      let imgs: SourceImage[] = [];
      if (r.files.length) {
        for (const f of r.files) {
          const hit = byFile.get(f.toLowerCase()) ?? byFile.get(norm(f));
          if (hit) imgs.push(hit[0]);
          else problems.push(`이미지 '${f}' 없음`);
        }
      } else imgs = (byProduct.get(r.product) ?? []).map((x) => x.img);
      if (!imgs.length && !r.files.length) problems.push("상품명과 맞는 이미지 없음");
      const notes: string[] = [];
      const imgTpl = imgs.map((img) => {
        const f = templatesFor(img, r, formats);
        if (f.note) (f.codes.length ? notes : problems).push(f.note);
        return f.codes;
      });
      if (imgs.length && imgTpl.every((x) => !x.length) && !problems.some((x) => x.includes("비율"))) problems.push("소재 규격 없음");
      // 쓰이는 규격에 따라 문구 점검 — 네이티브는 템플릿별 필수 칸·글자 수, 배너는 광고 안내 문구
      const ci = copyIssues(r, imgTpl.flat());
      problems.push(...ci.problems);
      notes.push(...ci.notes);
      if (imgTpl.flat().some((c) => templateByCode(c)?.kind === "SINGLE_IMAGE")) {
        const pc = profileCheck(r.profileName);
        if (pc.problem) problems.push(pc.problem);
        if (pc.note) notes.push(pc.note);
      }

      const { targets, problems: tp } = targetsFor(r.campaigns, r.adSetName);
      problems.push(...tp);
      const perTarget = imgTpl.reduce((sum, x) => sum + x.length, 0);
      return { ...r, images: imgs, imgTpl, auto: !r.templates, targets, problems, notes, count: perTarget * targets.length };
    });
  }, [rows, images, formats, targetsFor, profileCheck]);

  // 컬렉션 — 카드 이미지는 파일명으로만 찾는다
  const preparedCols: PreparedCollection[] = useMemo(() => {
    const byFile = new Map<string, SourceImage>();
    for (const img of images) for (const k of [img.file.name.toLowerCase(), norm(img.file.name)]) if (!byFile.has(k)) byFile.set(k, img);
    return groups.map((g) => {
      const problems = [...g.errors];
      const notes = [...g.warnings];
      const cardImages = g.cards.map((c) => (c.file ? (byFile.get(c.file.toLowerCase()) ?? byFile.get(norm(c.file)) ?? null) : null));
      g.cards.forEach((c, i) => {
        if (c.file && !cardImages[i]) problems.push(`${c.row}행 이미지 '${c.file}' 없음`);
      });
      const off = cardImages.filter((img): img is SourceImage => !!img && !ratioMatches(img, COLLECTION_TEMPLATE)).length;
      if (off) notes.push(`정사각이 아닌 카드 이미지 ${off}장은 600×600으로 가운데 잘림`);
      const { targets, problems: tp } = targetsFor(g.campaigns, g.adSetName);
      problems.push(...tp);
      const pc = profileCheck(g.profileName);
      if (pc.problem) problems.push(pc.problem);
      if (pc.note) notes.push(pc.note);
      return { ...g, cardImages, targets, problems, notes, count: targets.length };
    });
  }, [groups, images, targetsFor, profileCheck]);

  const usedIds = new Set([...prepared.flatMap((p) => p.images.map((i) => i.id)), ...preparedCols.flatMap((g) => g.cardImages.filter(Boolean).map((i) => i!.id))]);
  const unmatched = images.filter((i) => !usedIds.has(i.id));
  const runnable = prepared.filter((p) => !excluded.has(p.key) && !p.problems.length && p.count > 0);
  const runnableCols = preparedCols.filter((g) => !excluded.has(g.key) && !g.problems.length && g.count > 0);

  // 캠페인별 실행 계획
  const plans = ctxs
    .map((c) => {
      const inCampaign = (t: Target[]) => t.some((x) => x.ctx.campaign.no === c.campaign.no);
      const mine = runnable.filter((p) => inCampaign(p.targets));
      const cols = runnableCols.filter((g) => inCampaign(g.targets));
      const ex = existingBy.get(c.campaign.no) ?? new Map<string, number>();
      const names = [...new Set([...mine.map((p) => p.adSetName.trim()), ...cols.map((g) => g.adSetName.trim())])];
      const newAdSets = names.filter((n) => !ex.has(n));
      const reuseAdSets = names.filter((n) => ex.has(n));
      return {
        ctx: c,
        rows: mine,
        cols,
        newAdSets,
        reuseAdSets,
        creatives: mine.reduce((s, p) => s + p.imgTpl.reduce((n, x) => n + x.length, 0), 0) + cols.length,
        budget: newAdSets.reduce((s, n) => s + (specFor(c, n)?.budget ?? defaultBudget), 0),
      };
    })
    .filter((x) => x.rows.length || x.cols.length);
  const newAdSetCount = plans.reduce((s, x) => s + x.newAdSets.length, 0);
  const reuseAdSetCount = plans.reduce((s, x) => s + x.reuseAdSets.length, 0);
  const totalCreatives = plans.reduce((s, x) => s + x.creatives, 0);
  const newBudget = plans.reduce((s, x) => s + x.budget, 0);
  const blurry = runnable.flatMap((p) => p.images.flatMap((img, i) => p.imgTpl[i].map((c) => templateByCode(c)!).filter((t) => upscaleRatio(img, t) > 1.5).map(() => img.file.name)));
  const blurryNames = [...new Set(blurry)];

  async function run() {
    if (!plans.length) return;
    const lines = plans.map((x) => `· ${x.ctx.campaign.name} — 새 광고그룹 ${x.newAdSets.length}개 · 기존 ${x.reuseAdSets.length}개 · 소재 ${x.creatives}개`).join("\n");
    const msg = `GFA 광고계정 ${accountNo}의 캠페인 ${plans.length}개에\n${lines}\n\n합계: 새 광고그룹 ${newAdSetCount}개(일 예산 합계 ${won(newBudget)}) · 소재 ${totalCreatives}개\n새 광고그룹은 ${turnOn ? "만든 뒤 바로 켭니다." : "꺼진 상태로 만듭니다."}\n\n실행할까요?`;
    if (!window.confirm(msg)) return;
    setRunning(true);
    setResult(null);

    const imageCache = new Map<string, number>(); // 이미지는 광고계정 단위 — 캠페인끼리 재사용
    const doneLines: LogLine[] = []; // 끝난 캠페인들의 로그 — 진행 중 캠페인 로그를 뒤에 이어 붙여 보여 준다
    let current: LogLine[] = [];
    const total: RunResult = { adSets: [], creatives: [], errors: [], activated: false };

    for (const [ci, x] of plans.entries()) {
      const ctx = x.ctx;
      const ex = existingBy.get(ctx.campaign.no) ?? new Map<string, number>();
      const head: LogLine = { kind: "info", text: `━━ 캠페인 ${ci + 1}/${plans.length}: ${ctx.campaign.name} (#${ctx.campaign.no})` };

      const adSets: RunAdSet[] = [
        ...x.reuseAdSets.map((name) => ({ name, existingNo: ex.get(name) })),
        ...x.newAdSets.map((name) => {
          const spec = specFor(ctx, name);
          return {
            name,
            // 기본 타겟은 전체, 시트에 적힌 칸(성별·연령·지역·관심사·입찰·일정 …)은 overrides로 GFA 기본값 위에 덮는다
            target: {
              label: name,
              rationale: "엑셀 벌크 업로드",
              genders: [],
              ages: [],
              device: "ALL" as const,
              budget: spec?.budget ?? Math.max(MIN_ADSET_BUDGET, Math.round(defaultBudget / 1000) * 1000),
            },
            overrides: spec?.overrides,
          };
        }),
      ];

      // 같은 광고그룹·상품에 카피가 여러 행이면 _c1, _c2로 구분
      const variantIdx = new Map<string, number>();
      const variantTotal = new Map<string, number>();
      for (const p of x.rows) {
        const k = `${p.adSetName}|${p.product || p.files.join(",")}`;
        variantTotal.set(k, (variantTotal.get(k) ?? 0) + 1);
      }
      const creatives: RunCreative[] = [];
      for (const p of x.rows) {
        const k = `${p.adSetName}|${p.product || p.files.join(",")}`;
        const v = (variantIdx.get(k) ?? 0) + 1;
        variantIdx.set(k, v);
        const suffix = (variantTotal.get(k) ?? 1) > 1 ? `_c${v}` : "";
        const multiTpl = new Set(p.imgTpl.flat()).size > 1;
        p.images.forEach((img, i) => {
          if (!p.imgTpl[i].length) return;
          const nn = String(i + 1).padStart(2, "0");
          // 상품명이 없으면(파일명 지정) 파일 이름으로
          const key = slug(p.product || img.file.name.replace(/\.[^.]+$/, ""), 30);
          creatives.push({
            adSetName: p.adSetName.trim(),
            image: img,
            templates: p.imgTpl[i],
            copy: p.copy,
            altMessage: p.altMessage || p.altFallback,
            landingUrl: p.landingUrl,
            name: (t) =>
              p.name
                ? `${p.name}${p.images.length > 1 ? `_${nn}` : ""}${multiTpl ? `_${t.short}` : ""}`
                : `${p.adSetName.trim()}_${key}${p.product ? `_${nn}` : ""}_${t.short}${suffix}`,
          });
        });
      }

      const collections: RunCollection[] = x.cols.map((g) => ({
        adSetName: g.adSetName.trim(),
        name: g.name,
        message: g.message,
        cta: g.cta,
        ctaUrl: g.ctaUrl,
        cards: g.cards.map((card, i) => ({ image: g.cardImages[i]!, title: card.title, url: card.url })),
      }));

      const out = await runSetup({
        clientId,
        campaignNo: ctx.campaign.no,
        campaignName: ctx.campaign.name,
        startTime: startTimeFor(startDate, ctx.sample.startTime),
        adSets,
        creatives,
        collections,
        useUtm,
        turnOn,
        kind: "bulk",
        logExtra: { sheet: fileName, rows: [...x.rows.map((p) => p.key), ...x.cols.map((g) => g.key)], images: images.length, batch: plans.length > 1 ? { index: ci + 1, of: plans.length } : undefined },
        imageCache,
        onLog: (l) => {
          current = l;
          setLog([...doneLines, head, ...l]);
        },
      });
      doneLines.push(head, ...current);
      current = [];
      total.adSets.push(...out.adSets);
      total.creatives.push(...out.creatives);
      total.errors.push(...out.errors.map((e) => (plans.length > 1 ? `[${ctx.campaign.name}] ${e}` : e)));
      total.activated = total.activated || out.activated;
    }
    setResult(total);
    setRunning(false);
  }

  const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;
  const errorRows = prepared.filter((p) => p.problems.length).length + preparedCols.filter((g) => g.problems.length).length;
  const totalUnits = rows.length + groups.length;
  const multiSheet = new Set([...rows.map((r) => r.sheet), ...groups.map((g) => g.sheet)]).size > 1;
  const toggle = (key: string) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  // 광고그룹 시트에서 '새로 만들' 행만 점검 결과를 보여 준다(기존 광고그룹 행은 참고용)
  const isExisting = (sp: AdSetSpec) => ctxs.some((c) => (!sp.campaign || sameCampaign(c, sp.campaign)) && c.existingAdSets.some((s) => s.name.trim() === sp.name.trim()));
  const usedNames = new Set([...rows.map((r) => r.adSetName.trim()), ...groups.map((g) => g.adSetName.trim())]);
  const newSpecNotes = specs
    .filter((sp) => !isExisting(sp))
    .flatMap((sp) => [
      ...sp.errors.map((e) => ({ kind: "err" as const, text: `광고그룹 시트 ${sp.row}행 ${sp.name}: ${e}` })),
      ...sp.warnings.map((w) => ({ kind: "warn" as const, text: `광고그룹 시트 ${sp.row}행 ${sp.name}: ${w}` })),
      ...sp.readOnlyIgnored.map((w) => ({ kind: "warn" as const, text: `광고그룹 시트 ${sp.row}행 ${sp.name}: ${w}` })),
      ...(usedNames.has(sp.name.trim()) ? [] : [{ kind: "warn" as const, text: `광고그룹 시트 ${sp.row}행 ${sp.name}: 소재 시트에 이 광고그룹 행이 없어 만들지 않아요` }]),
    ]);

  return (
    <div className="space-y-6">
      <Card title="2. 엑셀·이미지 불러오기" sub="소재 유형(네이티브 이미지·이미지 배너·컬렉션)을 골라 템플릿을 받으세요. 유형마다 GFA 입력 칸이 달라 시트가 다릅니다. 여러 유형 시트를 한 파일에 넣어 함께 올려도 됩니다">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <Field label="① 엑셀 — 소재 유형">
              <div className="mb-2 grid gap-2 sm:grid-cols-3">
                {FAMILIES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTplFamily(f)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${tplFamily === f ? "border-[#F45B35] bg-[#FFF4EE] ring-1 ring-[#F45B35]" : "border-line bg-white hover:bg-canvas"}`}
                  >
                    <p className="text-[14px] font-semibold text-ink">
                      {tplFamily === f && "✓ "}
                      {FAMILY_LABEL[f]}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{FAMILY_DESC[f]}</p>
                  </button>
                ))}
              </div>
              {tplFamily !== "banner" && (
                <p className="mb-2 flex items-center gap-2 text-[13px] text-ink-soft">
                  {profile?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.imageUrl} alt="" className="h-6 w-6 rounded-full border border-line object-cover" />
                  )}
                  <span>
                    이 광고계정 프로필:{" "}
                    <b className="text-ink">{profile === undefined ? "확인 중…" : profile ? profile.name : "확인 못 함(기존 네이티브 소재 없음)"}</b>
                    <span className="text-ink-muted"> — 네이티브·컬렉션에 자동으로 붙어요(소재별 지정은 GFA API 미지원)</span>
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadTemplate} disabled={!!templBusy} className={SECONDARY}>
                  <i className={`ti ${templBusy ? "ti-loader-2 animate-spin" : "ti-download"} mr-1`} />
                  {templBusy ? "템플릿 만드는 중…" : `${FAMILY_LABEL[tplFamily]} 템플릿 내려받기${images.length ? ` (이미지 채움)` : ""}`}
                </button>
                <label className={`${PRIMARY} cursor-pointer`}>
                  <i className="ti ti-file-spreadsheet mr-1" />
                  엑셀 올리기
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSheet(e.target.files?.[0]).then(() => (e.target.value = ""))} />
                </label>
              </div>
              <p className="mt-1.5 text-[13px] text-ink-muted">
                {templBusy ??
                  (images.length ? (
                    <>
                      {tplFamily === "collection"
                        ? <>불러온 이미지 <b className="text-ink">{images.length}장</b>이 카드 한 장씩 들어가요(10장씩 컬렉션01·02… 로 묶음) — 카드 설명 문구·랜딩 URL과 광고 문구·CTA URL을 적으면 됩니다.</>
                        : tplFamily === "banner"
                          ? <>불러온 이미지 중 배너 규격 비율인 이미지가 한 행씩 들어가요 — 광고 안내 문구(이미지 속 글자)·랜딩 URL을 적으면 됩니다.</>
                          : <>불러온 이미지 중 배너 규격이 아닌 이미지가 한 행씩 들어가요 — 이미지 파일명·소재 이름과 인식한 규격이 채워지고, 광고 문구·CTA·랜딩 URL(네이티브는 설명 문구도)을 적으면 됩니다.</>}
                    </>
                  ) : (
                  <>
                    이미지를 먼저 불러오면(②) 파일명이 채워진 템플릿을 받을 수 있어요. 지금은 선택한 캠페인 {ctxs.length}개와 기존 광고그룹 {ctxs.reduce((s, c) => s + c.existingAdSets.length, 0)}개가 채워져 있어요. 쓸 행에만 내용을 적으면 되고(빈 행은 건너뜀),
                    &apos;광고그룹&apos; 시트에는 기존 광고그룹의 타겟·입찰·예산·일정 전 항목이 들어 있어요 — 행을 복사해 이름만 바꾸면 같은 설정으로 새 광고그룹을 만듭니다.
                  </>
                  ))}
              </p>
            </Field>
            {fileName && (
              <p className="text-[14px] text-ink-soft">
                <b className="text-ink">{fileName}</b>
                {rows.length > 0 && ` · 네이티브·배너 행 ${rows.length}개`}
                {groups.length > 0 && ` · 컬렉션 ${groups.length}개`} · 광고그룹 시트 {specs.length}행
                {errorRows > 0 && <span className="text-bad"> · 확인 필요 {errorRows}행</span>}
              </p>
            )}
            {fileName && newSpecNotes.length > 0 && (
              <ul className="space-y-0.5 rounded-lg bg-canvas px-3 py-2 text-[13px]">
                {newSpecNotes.map((n) => (
                  <li key={n.text} className={n.kind === "err" ? "text-bad" : "text-warn"}>
                    {n.text}
                  </li>
                ))}
              </ul>
            )}
            {sheetErr && <p className="text-[14px] text-bad">{sheetErr}</p>}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              캠페인에 이미 있는 광고그룹 이름을 쓰면 그 광고그룹에 소재만 추가하고(켜짐 상태는 건드리지 않음), 없는 이름이면 &apos;광고그룹&apos; 시트 설정으로 새로 만듭니다.
              {multi ? ` 선택한 캠페인 ${ctxs.length}개의 기존 광고그룹 ${ctxs.reduce((s, c) => s + c.existingAdSets.length, 0)}개.` : ` 이 캠페인의 기존 광고그룹 ${ctxs[0]?.existingAdSets.length ?? 0}개.`}
            </p>
            {multi && (
              <p className="rounded-lg bg-[#FFF4EE] px-3 py-2 text-[13px] leading-relaxed text-ink-soft ring-1 ring-[#FAD9CB]">
                <b className="text-ink">캠페인 {ctxs.length}개 선택됨</b> — 엑셀 &apos;캠페인&apos; 칸을 비우면 그 행이 선택한 캠페인 <b className="text-ink">전부</b>에 들어가고, 캠페인 ID나 이름을 적으면 그 캠페인에만 들어갑니다. ID 목록은 템플릿의 &apos;작성 안내&apos; 시트에 있어요.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Field label="② 소재 이미지">
              <div className="flex flex-wrap gap-2">
                <label className={`${SECONDARY} cursor-pointer`}>
                  <i className="ti ti-photo mr-1" />내 PC 파일
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles([...(e.target.files ?? [])], "pc").then(() => (e.target.value = ""))} />
                </label>
                <label className={`${SECONDARY} cursor-pointer`}>
                  <i className="ti ti-folder mr-1" />내 PC 폴더
                  <input type="file" multiple className="hidden" {...folderProps} onChange={(e) => addFiles([...(e.target.files ?? [])], "pc").then(() => (e.target.value = ""))} />
                </label>
                {images.length > 0 && (
                  <button type="button" onClick={clearImages} className={SECONDARY}>
                    비우기
                  </button>
                )}
              </div>
            </Field>
            <div className="flex gap-2">
              <input className={INPUT} value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="구글 드라이브 폴더 주소 (drive.google.com/drive/folders/…)" />
              <button type="button" onClick={fromDrive} disabled={!!loadingImg || !driveUrl.trim()} className={`${SECONDARY} whitespace-nowrap`}>
                <i className="ti ti-brand-google-drive mr-1" />
                불러오기
              </button>
            </div>
            {loadingImg && <p className="text-[14px] text-ink-muted">{loadingImg}</p>}
            {imgErr && <p className="text-[14px] text-warn">{imgErr}</p>}
            {images.length > 0 && (
              <p className="text-[14px] text-ink-soft">
                이미지 <b className="text-ink">{images.length}장</b> (PC {images.filter((i) => i.source === "pc").length} · 드라이브 {images.filter((i) => i.source === "drive").length})
                {rows.length > 0 && <> · 매칭 {images.length - unmatched.length}장 · <span className={unmatched.length ? "text-warn" : ""}>안 쓰임 {unmatched.length}장</span></>}
              </p>
            )}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              파일명 예: <span className="font-mono">링티레몬맛_01.jpg</span>, <span className="font-mono">링티 복숭아맛-메인.png</span> — 띄어쓰기·대소문자·_·-는 무시하고, 상품명이 겹치면(링티 / 링티제로) 더 긴 이름에 붙입니다.
              드라이브는 처음 한 번 구글 권한 창이 뜹니다(읽기 전용, 내 브라우저에만 보관).
            </p>
          </div>
        </div>
      </Card>

      {totalUnits > 0 && (
        <Card
          title="3. 매칭 결과 확인"
          sub="빨간 행은 고치기 전까지 건너뜁니다. 체크를 풀면 그 행만 빼고 실행합니다"
          right={<span className="whitespace-nowrap text-[14px] text-ink-muted">실행 {runnable.length + runnableCols.length}건 · 소재 {totalCreatives}개</span>}
        >
          {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                  <th className="py-2 pr-2 font-medium" />
                  <th className="py-2 pr-3 font-medium">행</th>
                  {multi && <th className="py-2 pr-3 font-medium">캠페인</th>}
                  <th className="py-2 pr-3 font-medium">광고그룹</th>
                  <th className="py-2 pr-3 font-medium">상품명</th>
                  <th className="py-2 pr-3 font-medium">이미지</th>
                  <th className="py-2 pr-3 font-medium">규격</th>
                  <th className="py-2 pr-3 font-medium">카피</th>
                  <th className="py-2 pr-3 text-right font-medium">소재</th>
                  <th className="py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {prepared.map((p) => {
                  const off = excluded.has(p.key);
                  const bad = p.problems.length > 0;
                  return (
                    <tr key={p.key} className={`border-b border-line align-top ${bad ? "bg-[#FEF2F2]/60" : off ? "opacity-50" : ""}`}>
                      <td className="py-2.5 pr-2">
                        <input type="checkbox" disabled={bad} checked={!bad && !off} onChange={() => toggle(p.key)} aria-label={`${p.sheet} ${p.row}행 포함`} />
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-ink-muted">
                        {p.row}
                        {multiSheet && <p className="whitespace-nowrap text-[12px]">{p.sheet}</p>}
                      </td>
                      {multi && (
                        <td className="max-w-[220px] py-2.5 pr-3">
                          {p.campaigns.length ? (
                            p.targets.map((t) => (
                              <p key={t.ctx.campaign.no} className="truncate text-[13px] text-ink" title={`${t.ctx.campaign.name} (#${t.ctx.campaign.no})`}>
                                {t.ctx.campaign.name}
                              </p>
                            ))
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[12px] text-ink-soft" title={p.targets.map((t) => t.ctx.campaign.name).join(", ")}>
                              선택한 캠페인 전부 · {p.targets.length}개
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 pr-3">
                        <p className="font-mono text-[13px] text-ink">{p.adSetName}</p>
                        {(() => {
                          const reuse = p.targets.filter((t) => t.existingNo);
                          const fresh = p.targets.length - reuse.length;
                          const budget = won(p.targets.find((t) => !t.existingNo)?.spec?.budget ?? defaultBudget);
                          if (p.targets.length === 1)
                            return (
                              <span className={`mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] ${reuse.length ? "bg-canvas text-ink-soft" : "bg-[#FDF1EC] text-[#C2410C]"}`}>
                                {reuse.length ? `기존 #${reuse[0].existingNo}` : `새로 만듦 · ${budget}`}
                              </span>
                            );
                          return (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {fresh > 0 && <span className="whitespace-nowrap rounded-full bg-[#FDF1EC] px-2 py-0.5 text-[12px] text-[#C2410C]">새로 만듦 {fresh} · 각 {budget}</span>}
                              {reuse.length > 0 && <span className="whitespace-nowrap rounded-full bg-canvas px-2 py-0.5 text-[12px] text-ink-soft">기존 {reuse.length}</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-2.5 pr-3 text-ink">{p.product || <span className="text-ink-muted">—</span>}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex gap-1">
                          {p.images.slice(0, 4).map((img) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={img.id} src={img.url} alt="" title={`${img.file.name} · ${img.width}×${img.height}`} className="h-11 w-11 rounded border border-line object-cover" />
                          ))}
                          {p.images.length > 4 && <span className="self-center text-[12px] text-ink-muted">+{p.images.length - 4}</span>}
                        </div>
                        {p.files.length > 0 && <p className="mt-1 text-[12px] text-ink-muted">파일명 지정</p>}
                      </td>
                      <td className="py-2.5 pr-3 text-[13px] text-ink-soft">
                        {[...new Set(p.imgTpl.flat())].map((c) => {
                          const t = templateByCode(c)!;
                          return (
                            <p key={c} className="whitespace-nowrap">
                              {t.label.replace(` ${fmtSize(t)}`, "")} <span className="tabular-nums text-ink-muted">{fmtSize(t)}</span>
                            </p>
                          );
                        })}
                        {p.auto && p.images.length > 0 && <span className="text-[12px] text-ink-muted">이미지 크기로 자동</span>}
                      </td>
                      <td className="max-w-[320px] py-2.5 pr-3">
                        {p.copy.message && (
                          <p className="truncate text-ink" title={p.copy.message}>
                            {p.copy.message}
                          </p>
                        )}
                        {p.family !== "banner" && (
                          <p className="truncate text-[12px] text-ink-muted">
                            {[p.copy.linkTitle, p.copy.linkDescription, p.copy.linkText3rd, p.copy.linkText4th, p.copy.linkText5th, CTA_ALL.find((c) => c.value === p.copy.cta)?.name].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {p.altMessage && (
                          <p className="truncate text-[12px] text-ink-muted" title={p.altMessage}>
                            안내 문구: {p.altMessage}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{p.count}</td>
                      <td className="py-2.5 text-[13px]">
                        {bad ? (
                          p.problems.map((x) => (
                            <p key={x} className="text-bad">
                              {x}
                            </p>
                          ))
                        ) : (
                          <p className="text-good">준비됨</p>
                        )}
                        {[...p.notes, ...p.warnings].map((w) => (
                          <p key={w} className="text-warn">
                            {w}
                          </p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {preparedCols.length > 0 && (
            <div className={`overflow-x-auto ${rows.length ? "mt-6" : ""}`}>
              <p className="mb-2 text-[14px] font-semibold text-ink">컬렉션 {preparedCols.length}개</p>
              <table className="w-full min-w-[1000px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                    <th className="py-2 pr-2 font-medium" />
                    <th className="py-2 pr-3 font-medium">행</th>
                    {multi && <th className="py-2 pr-3 font-medium">캠페인</th>}
                    <th className="py-2 pr-3 font-medium">광고그룹 · 소재 이름</th>
                    <th className="py-2 pr-3 font-medium">카드</th>
                    <th className="py-2 pr-3 font-medium">광고 문구 · CTA</th>
                    <th className="py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {preparedCols.map((g) => {
                    const off = excluded.has(g.key);
                    const bad = g.problems.length > 0;
                    return (
                      <tr key={g.key} className={`border-b border-line align-top ${bad ? "bg-[#FEF2F2]/60" : off ? "opacity-50" : ""}`}>
                        <td className="py-2.5 pr-2">
                          <input type="checkbox" disabled={bad} checked={!bad && !off} onChange={() => toggle(g.key)} aria-label={`컬렉션 ${g.name} 포함`} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-ink-muted">
                          {g.rows[0]}~{g.rows[g.rows.length - 1]}
                        </td>
                        {multi && (
                          <td className="max-w-[200px] truncate py-2.5 pr-3 text-[13px] text-ink" title={g.targets.map((t) => t.ctx.campaign.name).join(", ")}>
                            {g.campaigns.length ? g.targets.map((t) => t.ctx.campaign.name).join(", ") : `선택한 캠페인 전부 · ${g.targets.length}개`}
                          </td>
                        )}
                        <td className="py-2.5 pr-3">
                          <p className="font-mono text-[13px] text-ink">{g.adSetName}</p>
                          <p className="text-[13px] text-ink-soft">{g.name}</p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {g.cards.map((c, i) => {
                              const img = g.cardImages[i];
                              return img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={c.row} src={img.url} alt="" title={`${c.title} · ${img.file.name}`} className="h-11 w-11 rounded border border-line object-cover" />
                              ) : (
                                <span key={c.row} title={c.file} className="flex h-11 w-11 items-center justify-center rounded border border-dashed border-line text-[11px] text-ink-muted">
                                  없음
                                </span>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[12px] text-ink-muted">카드 {g.cards.length}장</p>
                        </td>
                        <td className="max-w-[320px] py-2.5 pr-3">
                          <p className="truncate text-ink" title={g.message}>
                            {g.message}
                          </p>
                          <p className="truncate text-[12px] text-ink-muted" title={g.ctaUrl}>
                            {CTA_ALL.find((c) => c.value === g.cta)?.name} · {g.ctaUrl}
                          </p>
                        </td>
                        <td className="py-2.5 text-[13px]">
                          {bad ? (
                            g.problems.map((x) => (
                              <p key={x} className="text-bad">
                                {x}
                              </p>
                            ))
                          ) : (
                            <p className="text-good">준비됨</p>
                          )}
                          {g.notes.map((w) => (
                            <p key={w} className="text-warn">
                              {w}
                            </p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {unmatched.length > 0 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer text-warn">어떤 행에도 안 붙은 이미지 {unmatched.length}장 — 파일명에 상품명이 들어 있는지(컬렉션·파일명 지정은 파일명이 같은지) 확인하세요</summary>
              <p className="mt-2 font-mono leading-relaxed text-ink-muted">{unmatched.map((i) => i.file.name).join(" · ")}</p>
            </details>
          )}
        </Card>
      )}

      {(
        <Card title="4. 실행 설정 · 승인" sub="아래 버튼을 누르고 확인 창에서 [확인]을 누르는 것이 승인입니다. 그 전에는 GFA에 아무것도 보내지 않습니다">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="네이티브 기본 소재 규격 (규격 칸이 비었는데 이미지 비율이 어느 규격과도 안 맞을 때 잘라 씀)">
                <div className="flex flex-wrap gap-2">
                  {SINGLE_IMAGE_TEMPLATES.filter((t) => t.code.startsWith("FEED_")).map((t) => {
                    const on = formats.includes(t.code);
                    return (
                      <button key={t.code} type="button" onClick={() => setFormats(on ? formats.filter((f) => f !== t.code) : [...formats, t.code])} className={`${CHIP} ${on ? CHIP_ON : ""}`}>
                        {on && "✓ "}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="새 광고그룹 기본 일 예산 (시트에 없을 때)">
                  <input type="number" min={MIN_ADSET_BUDGET} step={10000} className={INPUT} value={defaultBudget} onChange={(e) => setDefaultBudget(Number(e.target.value))} />
                </Field>
                <Field label="새 광고그룹 시작일">
                  <input type="date" min={todayKst()} className={INPUT} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {multi ? "비우면 캠페인마다 GFA 기본 시작일" : `비우면 GFA 기본(${ctxs[0]?.sample.startTime?.replace("T", " ") ?? "—"})`}
                  </p>
                </Field>
              </div>
              {blurryNames.length > 0 && <p className="text-[13px] text-warn">원본보다 1.5배 넘게 키워져 흐려질 수 있는 이미지 {blurryNames.length}장: {blurryNames.slice(0, 5).join(", ")}{blurryNames.length > 5 ? " …" : ""}</p>}
            </div>
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-[14px] text-ink-soft">
                <input type="checkbox" className="mt-1" checked={useUtm} onChange={(e) => setUseUtm(e.target.checked)} />
                <span>
                  랜딩 URL에 UTM 자동 추가 <span className="text-ink-muted">(UTM이 이미 있으면 그대로)</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[14px] text-ink-soft">
                <input type="checkbox" className="mt-1" checked={turnOn} onChange={(e) => setTurnOn(e.target.checked)} />
                <span>
                  새 광고그룹을 만든 뒤 바로 켜기 <span className="text-ink-muted">(기존 광고그룹 상태는 건드리지 않음)</span>
                </span>
              </label>
              <div className="rounded-lg bg-canvas px-4 py-3 text-[14px] text-ink-soft">
                {multi && (
                  <>
                    캠페인 <b className="text-ink">{plans.length}</b>개 ·{" "}
                  </>
                )}
                새 광고그룹 <b className="text-ink">{newAdSetCount}</b>개(일 {won(newBudget)}) · 기존 광고그룹 <b className="text-ink">{reuseAdSetCount}</b>개 · 소재 <b className="text-ink">{totalCreatives}</b>개 · 이미지 업로드 약{" "}
                {new Set([...runnable.flatMap((p) => p.images.flatMap((i, k) => p.imgTpl[k].map((t) => `${i.id}:${t}`))), ...runnableCols.flatMap((g) => g.cardImages.map((i) => `${i?.id}:col`))]).size}건
                {multi && plans.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-[13px]">
                    {plans.map((x) => (
                      <li key={x.ctx.campaign.no} className="flex justify-between gap-3">
                        <span className="truncate text-ink" title={x.ctx.campaign.name}>
                          {x.ctx.campaign.name}
                        </span>
                        <span className="whitespace-nowrap tabular-nums text-ink-muted">
                          새 {x.newAdSets.length} · 기존 {x.reuseAdSets.length} · 소재 {x.creatives}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className="text-[13px] text-ink-muted">
                  {!canEdit
                    ? "보기 전용 계정 — 승인(실행)은 관리자(k2s)만"
                    : !totalUnits
                      ? "엑셀을 올리면 버튼이 켜집니다"
                      : !images.length
                        ? "이미지를 불러오면 버튼이 켜집니다"
                        : !runnable.length && !runnableCols.length
                          ? "실행할 수 있는 행이 없어요 — 3번 표의 빨간 행을 확인하세요"
                          : ""}
                </span>
                <button type="button" onClick={run} disabled={!canEdit || running || (!runnable.length && !runnableCols.length)} className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-ink-soft disabled:opacity-40">
                  {running ? "업로드 중…" : multi ? `🚀 캠페인 ${plans.length}개에 벌크 업로드 (소재 ${totalCreatives}개)` : `🚀 GFA에 벌크 업로드 (소재 ${totalCreatives}개)`}
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <RunLog title="5. 업로드 결과" log={log} result={result} running={running} />
    </div>
  );
}
