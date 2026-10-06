"use client";

// 분석 규칙 팝오버 — 규칙 파일(규칙 세트·항목·값 사전·UTM 규칙)을 내려받고(실제 소재명으로 초안 채움) 올려서 미리보기 후 저장.
// 소재명 항목은 광고주가 정한 이름 그대로 분석 축이 되고, UTM은 source·medium·campaign·content 고정(namingRules.ts 머리말).
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { NamingDict, ParsedAdName } from "./naming";
import { KIND_LABEL, parseName, type NameSchema } from "./nameSchema";
import { coverage, parseRulesWorkbook, ruleCounts, rulesToSheets, utmMatchReport, type NameItem, type NamingRules, type ParseResult, type UtmRules, type UtmValues } from "./namingRules";

type Current = { dict: NamingDict; utm: UtmRules; source: string | null; saved: boolean; schema: NameSchema | null };
const EMPTY_DICT: NamingDict = { objectives: {}, contents: {}, products: {}, models: {}, tvc: {}, targets: {} };

export function NamingRulesEditor({
  current,
  saved,
  items,
  utmValues,
  clientName,
  ready,
  busy,
  onSave,
}: {
  current: Current;
  saved: NamingRules | null;
  items: NameItem[]; // 지금 조회된 소재명 + 캠페인(규칙 세트 선택·미리보기·초안용)
  utmValues?: UtmValues; // 지금 소재들의 실제 UTM 값(참고 시트·맞음 확인용)
  clientName: string;
  ready: boolean; // 0032 실행 여부
  busy: boolean;
  onSave: (rules: NamingRules | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<(ParseResult & { fileName: string }) | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [readErr, setReadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = ruleCounts(current);
  const draftDict = useMemo<NamingDict | null>(() => (draft ? (draft.rules.schema ? { ...EMPTY_DICT, schema: draft.rules.schema } : current.dict) : null), [draft, current.dict]);
  const before = useMemo(() => (open ? coverage(items, current.dict) : null), [open, items, current.dict]);
  const after = useMemo(() => (draftDict ? coverage(items, draftDict) : null), [draftDict, items]);

  const start = () => {
    setDraft(null);
    setReadErr(null);
    setSourceUrl(saved?.sourceUrl ?? "");
    setOpen(true);
  };
  const download = () => {
    const wb = XLSX.utils.book_new();
    const sheets = rulesToSheets({ schema: current.schema, utm: current.utm, dict: current.dict }, items, utmValues);
    const W: Record<string, number[]> = { "규칙 세트": [14, 40, 10, 34], 항목: [10, 10, 18, 10, 12, 12, 46], "값 사전": [10, 18, 24, 24, 12], "UTM 규칙": [14, 24, 24, 14, 24], "작성 안내": [26, 110], "참고_UTM 값": [14, 36, 10, 44] };
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = (W[name] ?? (name.startsWith("참고_소재명") ? [30, 48, ...Array(12).fill(14)] : [14, 24, 28, 14, 24])).map((wch) => ({ wch }));
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `CTCH_소재분석_규칙_${clientName}.xlsx`);
  };
  const upload = async (file: File) => {
    setReadErr(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheets: Record<string, unknown[][]> = {};
      for (const n of wb.SheetNames) sheets[n] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "", raw: false });
      setDraft({ ...parseRulesWorkbook(sheets), fileName: file.name });
    } catch {
      setReadErr("엑셀 파일을 읽지 못했어요(.xlsx·.xls·.csv).");
    }
  };
  const save = async () => {
    if (!draft) return;
    const ok = await onSave({ ...draft.rules, fileName: draft.fileName, sourceUrl: sourceUrl.trim() || null });
    if (ok) setOpen(false);
  };

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={start} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[14px] text-ink hover:border-[#F45B35]/60" title="소재명·UTM을 읽는 규칙 — 광고주별로 저장돼요">
        <span className="text-ink-muted">분석 규칙</span>
        <b className="max-w-[160px] truncate">{current.schema ? "업로드" : current.source ? "내장 사전" : "없음"}</b>
        <span className="text-ink-muted" aria-hidden>✎</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[40px] z-30 max-h-[min(80vh,780px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <p className="text-[13px] font-semibold text-ink">분석 규칙 — {clientName}에만 적용</p>

          <table className="mt-3 w-full text-[12px]">
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-1.5 [&_td]:align-top">
              <tr>
                <td className="w-[86px] font-semibold text-ink">소재명</td>
                <td className="text-ink-soft">항목을 직접 정해요(이름·위치·종류 자유, 한글 가능) → 그 이름이 성과 맵·조합 분석·요소별 성과·태그의 축</td>
              </tr>
              <tr>
                <td className="font-semibold text-ink">UTM</td>
                <td className="text-ink-soft">source·medium·campaign·content 고정 → 값의 뜻·캠페인 유형만 적어요</td>
              </tr>
              <tr>
                <td className="font-semibold text-ink">타겟·성별·연령</td>
                <td className="text-ink-soft">메타 실제 타겟팅·실제 성과 리포트 — 규칙 불필요</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[12px] text-ink-soft">
            지금: <b className="text-ink">{current.source ?? "규칙 없음(날짜·번호 같은 공통 패턴만)"}</b>
            {current.schema ? ` · 세트 ${counts.sets}개 · 항목 ${counts.fields}개 · 값 사전 ${counts.values}개` : ""} · UTM 값 {counts.utm}개
            {saved?.updatedAt && <> · {new Date(saved.updatedAt).toLocaleDateString("ko-KR")} 저장</>}
            {saved?.sourceUrl && (
              <>
                {" "}·{" "}
                <a href={saved.sourceUrl} target="_blank" rel="noreferrer" className="text-signal underline">
                  원본 문서
                </a>
              </>
            )}
            {current.schema && <SchemaLines schema={current.schema} />}
            {before && before.total > 0 && (
              <div className="mt-1">
                못 읽은 조각이 있는 소재 <b className="tabular-nums text-ink">{before.unresolved}</b> / {before.total}개
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={download} className="h-8 rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-signal hover:text-signal">
              <i className="ti ti-download mr-1" aria-hidden />
              템플릿 내려받기
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!ready} className="h-8 rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-signal hover:text-signal disabled:opacity-50">
              <i className="ti ti-upload mr-1" aria-hidden />
              규칙 파일 올리기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {current.schema ? "템플릿에 지금 규칙과 실제로 쓰인 값이 채워져 있어요." : "템플릿에 실제 소재명으로 만든 초안(조각 위치·날짜·번호 추정, 자리별 값 목록)이 채워져 있어요 — 항목 이름만 바꾸고 필요한 뜻을 적어 올리세요."}
          </p>
          {!ready && <p className="mt-2 text-[12px] text-warn">저장하려면 supabase/migrations/0032_client_naming_rules.sql을 SQL Editor에서 실행해 주세요.</p>}
          {readErr && <p className="mt-2 text-[12px] text-bad">{readErr}</p>}

          {draft && (
            <div className="mt-3 rounded-lg border border-line p-3 text-[12px]">
              <p className="font-semibold text-ink">{draft.fileName} 미리보기</p>
              <p className="mt-1 text-ink-soft">
                {Object.entries(draft.counts)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(" · ") || "읽은 항목 없음"}
                {!draft.found.utm && " · UTM 규칙 시트 없음 → 기본 해석"}
              </p>
              {draft.rules.schema && <SchemaLines schema={draft.rules.schema} bySet={after?.bySet} />}
              {after && before && after.total > 0 && (
                <p className="mt-1 text-ink-soft">
                  못 읽은 조각이 있는 소재 <b className="tabular-nums">{before.unresolved}</b> → <b className={`tabular-nums ${after.unresolved < before.unresolved ? "text-good" : after.unresolved > before.unresolved ? "text-bad" : "text-ink"}`}>{after.unresolved}</b>개
                  {after.codes.length > 0 && (
                    <span className="mt-1 block">
                      남는 조각:{" "}
                      {after.codes.slice(0, 10).map(([c, n]) => (
                        <span key={c} className="mr-1 rounded bg-canvas px-1 font-mono">
                          {c}
                          <span className="text-ink-faint">×{n}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              )}
              {draft.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-bad">
                  {draft.errors.slice(0, 6).map((m) => (
                    <li key={m}>· {m}</li>
                  ))}
                  {draft.errors.length > 6 && <li>· 외 {draft.errors.length - 6}건</li>}
                </ul>
              )}
              {draft.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-warn">
                  {draft.warnings.slice(0, 5).map((m) => (
                    <li key={m}>· {m}</li>
                  ))}
                  {draft.warnings.length > 5 && <li>· 외 {draft.warnings.length - 5}건</li>}
                </ul>
              )}
              {utmValues && <UtmCheck report={utmMatchReport(draft.rules.utm, utmValues)} />}
              {draftDict && items.length > 0 && <SamplePreview items={items} dict={draftDict} />}
              <label className="mt-2 block text-ink-soft">
                원본 규칙 문서 링크(선택)
                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://docs.google.com/…" className="mt-1 h-8 w-full rounded border border-line px-2 outline-none focus:border-[#F45B35]" />
              </label>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            {current.saved ? (
              <button type="button" onClick={async () => (await onSave(null)) && setOpen(false)} disabled={busy} className="text-[12px] text-ink-muted hover:text-ink">
                규칙 지우기(내장 해석으로)
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setOpen(false)} className="h-8 px-2.5 text-[13px] text-ink-muted hover:text-ink">
                닫기
              </button>
              {draft && (
                <button type="button" onClick={save} disabled={busy || draft.errors.length > 0 || !draft.found.fields} className="h-8 rounded-lg bg-[#F45B35] px-3 text-[13px] font-semibold text-white hover:brightness-95 disabled:opacity-50" title={draft.errors.length ? "오류를 고친 파일을 다시 올려 주세요" : undefined}>
                  이 규칙으로 저장
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

// 세트별 한 줄 — 적용 캠페인 · 구분자 · 항목(위치:이름) · 성과 맵 기준
function SchemaLines({ schema, bySet }: { schema: NameSchema; bySet?: Record<string, number> }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {schema.sets.map((s) => (
        <li key={s.name} className="text-ink">
          <b>{s.name}</b>
          <span className="text-ink-muted"> {s.campaigns.length ? `(캠페인에 '${s.campaigns.join("', '")}')` : "(기본)"} · 구분자 </span>
          <code className="rounded bg-surface px-1">{s.separator}</code>
          {bySet && <span className="text-ink-muted"> · 소재 {bySet[s.name] ?? 0}개</span>}
          <span className="block text-ink-soft">
            {s.fields.map((f) => `${typeof f.pos === "number" ? f.pos : f.pos === "auto" ? "자동" : "나머지"}:${f.name}${f.kind !== "text" ? `(${KIND_LABEL[f.kind]})` : ""}${f.map ? "★" : ""}`).join(" › ")}
          </span>
        </li>
      ))}
      <li className="text-[11px] text-ink-muted">★ = 성과 맵 기준</li>
    </ul>
  );
}

// 올린 규칙으로 실제 소재명 몇 개를 읽어 본 결과 — 저장 전에 자리·사전이 맞는지 눈으로 확인
function SamplePreview({ items, dict }: { items: NameItem[]; dict: NamingDict }) {
  const sample = [...new Map(items.map((it) => [it.name, it])).values()].slice(0, 6);
  const chips = (p: ParsedAdName) => [
    ...(p.fields ?? []).filter((f) => f.values.length).map((f) => `${f.name}: ${f.values.join(", ")}`),
    ...(p.ruleSet ? [] : p.serial ? [`번호: ${p.serial}`] : []),
  ];
  return (
    <div className="mt-2">
      <p className="text-ink-muted">해석 예시(지금 소재명 {sample.length}개)</p>
      <ul className="mt-1 space-y-1.5">
        {sample.map((it) => {
          const p = parseName(it.name, it.campaign, dict);
          return (
            <li key={it.name} className="rounded bg-canvas px-2 py-1.5">
              <span className="block truncate font-mono text-[11px] text-ink-muted" title={`${it.name}\n캠페인: ${it.campaign ?? ""}`}>
                {it.name}
                {p.ruleSet && <span className="ml-1 font-sans text-ink-faint">· {p.ruleSet} 세트</span>}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {chips(p).map((c) => (
                  <span key={c} className="whitespace-nowrap rounded bg-surface px-1.5 text-[11px] text-ink-soft">
                    {c}
                  </span>
                ))}
                {p.outOfRule && <span className="whitespace-nowrap rounded bg-[#FFFAEB] px-1.5 text-[11px] text-warn">규칙 밖 이름</span>}
                {p.unknown.filter((u) => u !== "(규칙 밖 이름)").length > 0 && <span className="whitespace-nowrap rounded bg-[#FEF3F2] px-1.5 text-[11px] text-bad">못 읽음: {p.unknown.filter((u) => u !== "(규칙 밖 이름)").join(", ")}</span>}
                {p.ruleSet && p.detail && <span className="whitespace-nowrap rounded bg-surface px-1.5 text-[11px] text-ink-faint">남는 조각: {p.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// UTM 규칙 값이 실제 값과 맞는지 — 맞은 규칙 수, 안 맞은 규칙, 규칙이 없는 실제 값(상위)
function UtmCheck({ report }: { report: ReturnType<typeof utmMatchReport> }) {
  if (!report.total && !report.uncovered.length) return null;
  return (
    <div className="mt-1 text-ink-soft">
      UTM 규칙 {report.total}개 중 실제 값과 맞음 <b className={report.used === report.total ? "text-good" : "text-warn"}>{report.used}개</b>
      {report.unusedRules.length > 0 && (
        <span className="block text-warn">
          안 맞음(이 기간 소재에 없는 값): {report.unusedRules.slice(0, 6).join(", ")}
          {report.unusedRules.length > 6 && ` 외 ${report.unusedRules.length - 6}개`}
        </span>
      )}
      {report.uncovered.length > 0 && (
        <span className="block text-ink-muted">
          규칙 없는 실제 값(그대로 보여요): {report.uncovered.slice(0, 6).map(([p, v, n]) => `${p.replace("utm_", "")}=${v}×${n}`).join(", ")}
          {report.uncovered.length > 6 && ` 외 ${report.uncovered.length - 6}개`}
        </span>
      )}
    </div>
  );
}
