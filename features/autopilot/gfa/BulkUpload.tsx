"use client";

// 캠페인 오토파일럿 > 자동 세팅 > 엑셀 벌크 업로드(GFA)
// 엑셀(소재 시트 + 선택 광고그룹 시트) + 이미지(내 PC 파일·폴더 / 구글 드라이브 폴더) → 파일명 ↔ 상품명 자동 매칭 → 미리보기 → 한 번에 생성
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/features/dashboard/ui";
import { SINGLE_IMAGE_TEMPLATES, DEFAULT_TEMPLATES, MIN_ADSET_BUDGET, slug, startTimeFor, type GfaContext } from "./types";
import {
  ADSET_HEADERS,
  ADSET_SAMPLE,
  CREATIVE_HEADERS,
  CREATIVE_SAMPLE,
  CTA_ALL,
  SHEET_GUIDE,
  matchImages,
  norm,
  parseAdSetSheet,
  parseCreativeSheet,
  type BulkAdSetSpec,
  type BulkRow,
} from "./bulkSheet";
import { readImage, releaseImage, upscaleRatio, type SourceImage } from "./imageFit";
import { downloadDriveFile, folderIdFrom, getDriveToken, listDriveImages } from "./driveImport";
import { runSetup, type LogLine, type RunAdSet, type RunCreative, type RunResult } from "./runner";
import { CHIP, CHIP_ON, Field, INPUT, PRIMARY, RunLog, SECONDARY, todayKst, won } from "./ui";

const MAX_IMAGES = 400;

type Prepared = BulkRow & { images: SourceImage[]; tpl: string[]; adSet: { existingNo?: number; spec?: BulkAdSetSpec }; problems: string[]; count: number };

export function BulkUpload({ clientId, ctx, accountNo, canEdit }: { clientId: string; ctx: GfaContext; accountNo: string; canEdit: boolean }) {
  // 엑셀
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [specs, setSpecs] = useState<BulkAdSetSpec[]>([]);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  // 이미지
  const [images, setImages] = useState<SourceImage[]>([]);
  const [loadingImg, setLoadingImg] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState("");

  // 실행 설정
  const [formats, setFormats] = useState<string[]>(DEFAULT_TEMPLATES);
  const [defaultBudget, setDefaultBudget] = useState(30000);
  const [startDate, setStartDate] = useState("");
  const [useUtm, setUseUtm] = useState(true);
  const [turnOn, setTurnOn] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  // ── 엑셀 ──
  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.aoa_to_sheet([[...CREATIVE_HEADERS], ...CREATIVE_SAMPLE]);
    s1["!cols"] = [24, 16, 24, 14, 44, 20, 30, 14, 40, 20].map((w) => ({ wch: w }));
    const s2 = XLSX.utils.aoa_to_sheet([[...ADSET_HEADERS], ...ADSET_SAMPLE]);
    s2["!cols"] = [24, 8, 16, 8, 12].map((w) => ({ wch: w }));
    const s3 = XLSX.utils.aoa_to_sheet([...SHEET_GUIDE, [], ["CTA 목록", CTA_ALL.map((c) => `${c.name}(${c.value})`).join(", ")]]);
    s3["!cols"] = [{ wch: 22 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, s1, "소재");
    XLSX.utils.book_append_sheet(wb, s2, "광고그룹");
    XLSX.utils.book_append_sheet(wb, s3, "작성 안내");
    XLSX.writeFile(wb, "CTCH_GFA_소재_벌크업로드_템플릿.xlsx");
  }

  async function onSheet(file: File | undefined) {
    if (!file) return;
    setSheetErr(null);
    setResult(null);
    setLog([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const creativeSheet = wb.Sheets["소재"] ?? wb.Sheets[wb.SheetNames[0]];
      const parsed = parseCreativeSheet(XLSX.utils.sheet_to_json<unknown[]>(creativeSheet, { header: 1, defval: "", raw: true }));
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.rows.length) throw new Error("소재 행이 없어요.");
      const adSheet = wb.Sheets["광고그룹"];
      setSpecs(adSheet ? parseAdSetSheet(XLSX.utils.sheet_to_json<unknown[]>(adSheet, { header: 1, defval: "", raw: true })) : []);
      setRows(parsed.rows);
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
  const existing = useMemo(() => new Map(ctx.existingAdSets.map((s) => [s.name.trim(), s.no])), [ctx.existingAdSets]);
  const specByName = useMemo(() => new Map(specs.map((s) => [s.name.trim(), s])), [specs]);

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
      const tpl = r.templates ?? formats;
      if (!tpl.length) problems.push("소재 규격 없음");
      const no = existing.get(r.adSetName.trim());
      const spec = specByName.get(r.adSetName.trim());
      if (!no && spec?.errors.length) problems.push(`광고그룹 시트 ${spec.row}행: ${spec.errors.join(", ")}`);
      return { ...r, images: imgs, tpl, adSet: { existingNo: no, spec }, problems, count: imgs.length * tpl.length };
    });
  }, [rows, images, formats, existing, specByName]);

  const usedIds = new Set(prepared.flatMap((p) => p.images.map((i) => i.id)));
  const unmatched = images.filter((i) => !usedIds.has(i.id));
  const runnable = prepared.filter((p) => !excluded.has(p.row) && !p.problems.length && p.count > 0);
  const newAdSets = [...new Set(runnable.filter((p) => !p.adSet.existingNo).map((p) => p.adSetName.trim()))];
  const reuseAdSets = [...new Set(runnable.filter((p) => p.adSet.existingNo).map((p) => p.adSetName.trim()))];
  const totalCreatives = runnable.reduce((s, p) => s + p.count, 0);
  const newBudget = newAdSets.reduce((s, n) => s + (specByName.get(n)?.budget ?? defaultBudget), 0);
  const blurry = runnable.flatMap((p) => p.images.flatMap((img) => SINGLE_IMAGE_TEMPLATES.filter((t) => p.tpl.includes(t.code) && upscaleRatio(img, t) > 1.5).map(() => img.file.name)));
  const blurryNames = [...new Set(blurry)];

  async function run() {
    if (!runnable.length) return;
    const msg = `GFA 광고계정 ${accountNo} · 캠페인 "${ctx.campaign.name}"에\n새 광고그룹 ${newAdSets.length}개(일 예산 합계 ${won(newBudget)}) · 기존 광고그룹 ${reuseAdSets.length}개에\n소재 ${totalCreatives}개를 만듭니다. 새 광고그룹은 ${turnOn ? "만든 뒤 바로 켭니다." : "꺼진 상태로 만듭니다."}\n\n실행할까요?`;
    if (!window.confirm(msg)) return;
    setRunning(true);
    setResult(null);

    const adSets: RunAdSet[] = [...reuseAdSets.map((name) => ({ name, existingNo: existing.get(name) })), ...newAdSets.map((name) => {
      const spec = specByName.get(name);
      return {
        name,
        target: {
          label: name,
          rationale: "엑셀 벌크 업로드",
          genders: spec?.target.genders ?? [],
          ages: spec?.target.ages ?? [],
          device: spec?.target.device ?? "ALL",
          budget: Math.max(MIN_ADSET_BUDGET, Math.round((spec?.budget ?? defaultBudget) / 1000) * 1000),
        },
      };
    })];

    // 같은 광고그룹·상품에 카피가 여러 행이면 _c1, _c2로 구분
    const variantIdx = new Map<string, number>();
    const variantTotal = new Map<string, number>();
    for (const p of runnable) {
      const k = `${p.adSetName}|${p.product}`;
      variantTotal.set(k, (variantTotal.get(k) ?? 0) + 1);
    }
    const creatives: RunCreative[] = [];
    for (const p of runnable) {
      const k = `${p.adSetName}|${p.product}`;
      const v = (variantIdx.get(k) ?? 0) + 1;
      variantIdx.set(k, v);
      const suffix = (variantTotal.get(k) ?? 1) > 1 ? `_c${v}` : "";
      p.images.forEach((img, i) => {
        const nn = String(i + 1).padStart(2, "0");
        creatives.push({
          adSetName: p.adSetName.trim(),
          image: img,
          templates: p.tpl,
          copy: p.copy,
          landingUrl: p.landingUrl,
          name: (t) =>
            p.name
              ? `${p.name}${p.images.length > 1 ? `_${nn}` : ""}${p.tpl.length > 1 ? `_${t.short}` : ""}`
              : `${p.adSetName.trim()}_${slug(p.product, 20)}_${nn}_${t.short}${suffix}`,
        });
      });
    }

    const out = await runSetup({
      clientId,
      campaignNo: ctx.campaign.no,
      campaignName: ctx.campaign.name,
      startTime: startTimeFor(startDate, ctx.sample.startTime),
      adSets,
      creatives,
      useUtm,
      turnOn,
      kind: "bulk",
      logExtra: { sheet: fileName, rows: runnable.map((p) => p.row), images: images.length },
      onLog: setLog,
    });
    setResult(out);
    setRunning(false);
  }

  const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;
  const errorRows = prepared.filter((p) => p.problems.length).length;

  return (
    <div className="space-y-6">
      <Card title="2. 엑셀·이미지 불러오기" sub="한 행 = 상품 하나의 카피. 이미지는 파일명에 들어 있는 상품명으로 자동 매칭되고, 매칭된 이미지 × 규격만큼 소재가 만들어집니다">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-3">
            <Field label="① 엑셀">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={downloadTemplate} className={SECONDARY}>
                  <i className="ti ti-download mr-1" />
                  템플릿 내려받기
                </button>
                <label className={`${PRIMARY} cursor-pointer`}>
                  <i className="ti ti-file-spreadsheet mr-1" />
                  엑셀 올리기
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onSheet(e.target.files?.[0]).then(() => (e.target.value = ""))} />
                </label>
              </div>
            </Field>
            {fileName && (
              <p className="text-[14px] text-ink-soft">
                <b className="text-ink">{fileName}</b> · 소재 행 {rows.length}개 · 광고그룹 시트 {specs.length}개
                {errorRows > 0 && <span className="text-bad"> · 확인 필요 {errorRows}행</span>}
              </p>
            )}
            {sheetErr && <p className="text-[14px] text-bad">{sheetErr}</p>}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              캠페인에 이미 있는 광고그룹 이름을 쓰면 그 광고그룹에 소재만 추가하고(켜짐 상태는 건드리지 않음), 없는 이름이면 &apos;광고그룹&apos; 시트 설정으로 새로 만듭니다.
              이 캠페인의 기존 광고그룹 {ctx.existingAdSets.length}개.
            </p>
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

      {rows.length > 0 && (
        <Card
          title="3. 매칭 결과 확인"
          sub="빨간 행은 고치기 전까지 건너뜁니다. 체크를 풀면 그 행만 빼고 실행합니다"
          right={<span className="whitespace-nowrap text-[14px] text-ink-muted">실행 {runnable.length}행 · 소재 {totalCreatives}개</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                  <th className="py-2 pr-2 font-medium" />
                  <th className="py-2 pr-3 font-medium">행</th>
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
                  const off = excluded.has(p.row);
                  const bad = p.problems.length > 0;
                  return (
                    <tr key={p.row} className={`border-b border-line align-top ${bad ? "bg-[#FEF2F2]/60" : off ? "opacity-50" : ""}`}>
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          disabled={bad}
                          checked={!bad && !off}
                          onChange={() => setExcluded((s) => {
                            const n = new Set(s);
                            if (n.has(p.row)) n.delete(p.row);
                            else n.add(p.row);
                            return n;
                          })}
                          aria-label={`${p.row}행 포함`}
                        />
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-ink-muted">{p.row}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-mono text-[13px] text-ink">{p.adSetName}</p>
                        <span className={`mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] ${p.adSet.existingNo ? "bg-canvas text-ink-soft" : "bg-[#FDF1EC] text-[#C2410C]"}`}>
                          {p.adSet.existingNo ? `기존 #${p.adSet.existingNo}` : `새로 만듦 · ${won(p.adSet.spec?.budget ?? defaultBudget)}`}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink">{p.product}</td>
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
                        {SINGLE_IMAGE_TEMPLATES.filter((t) => p.tpl.includes(t.code)).map((t) => t.label.split(" ")[1]).join(", ")}
                        {!p.templates && <span className="text-ink-muted"> (기본)</span>}
                      </td>
                      <td className="max-w-[320px] py-2.5 pr-3">
                        <p className="truncate text-ink" title={p.copy.message}>
                          {p.copy.message}
                        </p>
                        <p className="truncate text-[12px] text-ink-muted">
                          {p.copy.linkTitle} · {p.copy.linkDescription} · {CTA_ALL.find((c) => c.value === p.copy.cta)?.name}
                        </p>
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
                        {p.warnings.map((w) => (
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
          {unmatched.length > 0 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer text-warn">어떤 행에도 안 붙은 이미지 {unmatched.length}장 — 파일명에 상품명이 들어 있는지 확인하세요</summary>
              <p className="mt-2 font-mono leading-relaxed text-ink-muted">{unmatched.map((i) => i.file.name).join(" · ")}</p>
            </details>
          )}
        </Card>
      )}

      {(
        <Card title="4. 실행 설정 · 승인" sub="아래 버튼을 누르고 확인 창에서 [확인]을 누르는 것이 승인입니다. 그 전에는 GFA에 아무것도 보내지 않습니다">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="기본 소재 규격 (엑셀 '소재 규격'이 빈 행에 적용)">
                <div className="flex flex-wrap gap-2">
                  {SINGLE_IMAGE_TEMPLATES.map((t) => {
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
                  <p className="mt-1 text-[12px] text-ink-muted">비우면 GFA 기본({ctx.sample.startTime?.replace("T", " ") ?? "—"})</p>
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
                새 광고그룹 <b className="text-ink">{newAdSets.length}</b>개(일 {won(newBudget)}) · 기존 광고그룹 <b className="text-ink">{reuseAdSets.length}</b>개 · 소재 <b className="text-ink">{totalCreatives}</b>개 · 이미지 업로드 약{" "}
                {new Set(runnable.flatMap((p) => p.images.flatMap((i) => p.tpl.map((t) => `${i.id}:${t}`)))).size}건
              </div>
              <div className="flex items-center justify-end gap-3">
                <span className="text-[13px] text-ink-muted">
                  {!canEdit
                    ? "보기 전용 계정 — 승인(실행)은 관리자(k2s)만"
                    : !rows.length
                      ? "엑셀을 올리면 버튼이 켜집니다"
                      : !images.length
                        ? "이미지를 불러오면 버튼이 켜집니다"
                        : !runnable.length
                          ? "실행할 수 있는 행이 없어요 — 3번 표의 빨간 행을 확인하세요"
                          : ""}
                </span>
                <button type="button" onClick={run} disabled={!canEdit || running || !runnable.length} className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-ink-soft disabled:opacity-40">
                  {running ? "업로드 중…" : `🚀 GFA에 벌크 업로드 (소재 ${totalCreatives}개)`}
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
