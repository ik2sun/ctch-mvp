// 경쟁사 모니터링 엑셀의 '순위 추이' 시트 — 키워드 × 기기 × 영역마다
// 업체(브랜드)별 요약(노출 횟수·평균·최고·1~3위 비율) + 시간대별 순위 표 + 꺾은선 차트(위 = 1위).
// exceljs는 차트를 못 만들어서, 시트를 다 쓴 뒤 xlsx(zip) 안에 엑셀 기본 차트 XML을 넣는다(injectTrendCharts).
// 차트는 엑셀에서 그대로 편집되는 진짜 차트다.

import type ExcelJS from "exceljs";
import JSZip from "jszip";
import type { PowerLinkAd } from "./rankChecker";
import { snapshotHas, type CollectSection, type ShopItem, type ShoppingSnapshot } from "./shopping";

export const TREND_SHEET = "순위 추이";

type Device = "pc" | "mobile";
type TrendKeyword = { id: string; keyword: string };
type TrendCheck = {
  keyword_id: string;
  device: Device;
  matched_rank: number | null;
  ads_snapshot: PowerLinkAd[];
  shopping_snapshot?: ShoppingSnapshot | null;
  checked_at: string;
};

const DEVICE_LABEL: Record<Device, string> = { pc: "PC", mobile: "모바일" };
const SECTION_LABEL: Record<CollectSection, string> = { powerlink: "파워링크", price: "네이버 가격비교", store: "네이버플러스 스토어" };

const MAX_TIMES = 168; // 1시간 주기 7일
const MAX_ROWS = 10; // 표에 넣는 업체 수
const MAX_SERIES = 8; // 차트에 넣는 업체 수(범주 색 8개)
// ctch-dataviz 매체 범주 색(검증 세트) + 다음 슬롯 — 순서 고정
const SERIES_COLORS = ["2A78D6", "EB6834", "1BAF7A", "EDA100", "E87BA4", "008300", "4A3AA7", "E34948"];
const CHART_ROWS = 18; // 차트 높이(행 수)
const FIRST_TIME_COL = 7; // G열부터 시간대

type BrandRow = { key: string; label: string; isTarget: boolean; ranks: (number | null)[]; seen: number; avg: number; best: number; top3: number };
type Block = { title: string; times: string[]; rows: BrandRow[]; maxRank: number };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

// 업체 이름 — 파워링크는 도메인 기준(모바일에만 있는 업체명을 붙임), 쇼핑은 판매처(가격비교 묶음은 상품명)
function plLabels(checks: TrendCheck[]): Map<string, string> {
  const names = new Map<string, Map<string, number>>();
  for (const c of checks) {
    for (const ad of c.ads_snapshot ?? []) {
      if (!ad.business) continue;
      const m = names.get(ad.domain) ?? new Map<string, number>();
      m.set(ad.business, (m.get(ad.business) ?? 0) + 1);
      names.set(ad.domain, m);
    }
  }
  const out = new Map<string, string>();
  for (const [domain, m] of names) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) out.set(domain, `${top} (${domain})`);
  }
  return out;
}

function shopKey(it: ShopItem): string {
  return it.kind === "catalog" ? `[가격비교] ${it.title.slice(0, 24)}` : it.mall || it.title.slice(0, 24);
}

export function buildTrendBlocks(keywords: TrendKeyword[], checks: TrendCheck[]): Block[] {
  const labelOf = plLabels(checks);
  const blocks: Block[] = [];
  for (const k of keywords) {
    for (const device of ["pc", "mobile"] as Device[]) {
      for (const section of ["powerlink", "price", "store"] as CollectSection[]) {
        const list = checks
          .filter((c) => c.keyword_id === k.id && c.device === device && snapshotHas(c.shopping_snapshot, section))
          .sort((a, b) => a.checked_at.localeCompare(b.checked_at))
          // 같은 분에 두 번 확인한 회차(수동 + 자동 등)는 나중 것 하나로
          .filter((c, i, arr) => i === arr.length - 1 || fmtTime(arr[i + 1].checked_at) !== fmtTime(c.checked_at))
          .slice(-MAX_TIMES);
        if (list.length === 0) continue;

        // 회차마다 업체 → 가장 높은 순위
        const perCheck: Map<string, number>[] = [];
        const targets = new Set<string>();
        const labels = new Map<string, string>();
        for (const c of list) {
          const m = new Map<string, number>();
          if (section === "powerlink") {
            for (const ad of c.ads_snapshot ?? []) {
              const key = ad.domain;
              if (!m.has(key) || m.get(key)! > ad.rank) m.set(key, ad.rank);
              labels.set(key, labelOf.get(key) ?? ad.domain);
              if (c.matched_rank != null && ad.rank === c.matched_rank) targets.add(key);
            }
          } else {
            const items = (section === "price" ? c.shopping_snapshot?.price : c.shopping_snapshot?.store) ?? [];
            const myRank = section === "price" ? c.shopping_snapshot?.priceRank : c.shopping_snapshot?.storeRank;
            for (const it of items) {
              const key = shopKey(it);
              if (!m.has(key) || m.get(key)! > it.position) m.set(key, it.position);
              labels.set(key, key);
              if (myRank != null && it.position === myRank) targets.add(key);
            }
          }
          perCheck.push(m);
        }

        const rows: BrandRow[] = [...labels.keys()].map((key) => {
          const ranks = perCheck.map((m) => m.get(key) ?? null);
          const hit = ranks.filter((r): r is number => r != null);
          return {
            key,
            label: labels.get(key)!,
            isTarget: targets.has(key),
            ranks,
            seen: hit.length,
            avg: hit.reduce((a, b) => a + b, 0) / hit.length,
            best: Math.min(...hit),
            top3: hit.filter((r) => r <= 3).length / list.length,
          };
        });
        // 자주 · 높게 나온 업체 순, 타겟은 항상 포함
        rows.sort((a, b) => b.seen - a.seen || a.avg - b.avg);
        const picked = rows.slice(0, MAX_ROWS);
        const target = rows.find((r) => r.isTarget && !picked.includes(r));
        if (target) picked[picked.length - 1] = target;
        if (picked.length === 0) continue;

        const maxRank = Math.max(...picked.flatMap((r) => r.ranks.filter((x): x is number => x != null)), 3);
        blocks.push({
          title: `${k.keyword} — ${DEVICE_LABEL[device]} ${SECTION_LABEL[section]}`,
          times: list.map((c) => fmtTime(c.checked_at)),
          rows: picked,
          maxRank,
        });
      }
    }
  }
  return blocks;
}

export type ChartSpec = {
  title: string;
  fromRow: number; // 0부터(엑셀 앵커)
  toRow: number;
  toCol: number;
  catRef: string; // 시간 머리글 범위
  series: { nameRef: string; valRef: string; color: string }[];
  maxRank: number;
};

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const ref = (col: number, row: number) => `'${TREND_SHEET}'!$${colName(col)}$${row}`;

// 시트를 쓰고 차트 위치·참조를 돌려준다
export function writeTrendSheet(wb: ExcelJS.Workbook, blocks: Block[]): ChartSpec[] {
  const ws = wb.addWorksheet(TREND_SHEET, { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 34;
  [2, 3, 4, 5].forEach((c) => (ws.getColumn(c).width = 10));
  ws.getColumn(6).width = 13;
  const maxTimes = Math.max(0, ...blocks.map((b) => b.times.length));
  for (let i = 0; i < maxTimes; i++) ws.getColumn(FIRST_TIME_COL + i).width = 11;

  const intro = ws.addRow(["업체별 · 시간대별 순위 추이"]);
  intro.font = { bold: true, size: 14 };
  ws.addRow([
    "칸 숫자 = 그 시각의 순위(빈칸 = 노출 안 됨). 한 회차에 여러 상품이 나오면 가장 높은 순위. 업체는 자주·높게 나온 순으로 최대 10곳, 차트는 상위 8곳(★ = 타겟). 차트는 위가 1위예요.",
  ]).font = { color: { argb: "FF475467" }, size: 10 };
  if (blocks.length === 0) ws.addRow(["고른 기간에 확인 기록이 없어요."]);

  const specs: ChartSpec[] = [];
  for (const b of blocks) {
    ws.addRow([]);
    const t = ws.addRow([b.title]);
    t.font = { bold: true, size: 12, color: { argb: "FF101828" } };

    const head = ws.addRow(["업체", "노출 회차", "노출률", "평균 순위", "최고 순위", "3위 내 노출률", ...b.times]);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF344054" } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    head.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    head.height = 30;
    const headRow = head.number;

    const n = b.times.length;
    for (const r of b.rows) {
      const row = ws.addRow([
        `${r.isTarget ? "★ " : ""}${r.label}`,
        `${r.seen}/${n}`,
        r.seen / n,
        Math.round(r.avg * 10) / 10,
        r.best,
        r.top3,
        ...r.ranks.map((x) => x ?? null),
      ]);
      row.getCell(3).numFmt = "0%";
      row.getCell(6).numFmt = "0%";
      row.getCell(4).numFmt = "0.0";
      for (let c = 2; c <= FIRST_TIME_COL + n - 1; c++) row.getCell(c).alignment = { horizontal: "center" };
      if (r.isTarget) row.font = { bold: true, color: { argb: "FF4F46E5" } };
    }
    const firstRow = headRow + 1;
    const lastRow = headRow + b.rows.length;
    // 순위 칸 색 — 1위 진한 파랑 → 하위 흰색
    if (n > 0) {
      ws.addConditionalFormatting({
        ref: `${colName(FIRST_TIME_COL)}${firstRow}:${colName(FIRST_TIME_COL + n - 1)}${lastRow}`,
        rules: [
          {
            type: "colorScale",
            priority: 1,
            cfvo: [{ type: "num", value: 1 }, { type: "num", value: Math.max(b.maxRank, 2) }],
            color: [{ argb: "FF8DB4EA" }, { argb: "FFF4F8FD" }],
          },
        ],
      });
    }

    // 차트 자리(빈 행)
    const chartTop = lastRow + 1;
    for (let i = 0; i < CHART_ROWS; i++) ws.addRow([]);
    specs.push({
      title: b.title,
      fromRow: chartTop, // 0부터 = lastRow 다음 줄
      toRow: chartTop + CHART_ROWS - 1,
      toCol: Math.max(10, Math.min(FIRST_TIME_COL + n, 20)),
      catRef: `${ref(FIRST_TIME_COL, headRow)}:${ref(FIRST_TIME_COL + n - 1, headRow).split("!")[1]}`,
      series: b.rows.slice(0, MAX_SERIES).map((r, i) => ({
        nameRef: ref(1, firstRow + i),
        valRef: `${ref(FIRST_TIME_COL, firstRow + i)}:${ref(FIRST_TIME_COL + n - 1, firstRow + i).split("!")[1]}`,
        color: SERIES_COLORS[i],
      })),
      maxRank: b.maxRank,
    });
  }
  return specs;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const AXIS_TEXT = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="4A4F58"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr>`;

function chartXml(s: ChartSpec): string {
  const series = s.series
    .map(
      (se, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${esc(se.nameRef)}</c:f></c:strRef></c:tx>` +
        `<c:spPr><a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="${se.color}"/></a:solidFill><a:round/></a:ln></c:spPr>` +
        `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${se.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>` +
        `<c:cat><c:strRef><c:f>${esc(s.catRef)}</c:f></c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${esc(se.valRef)}</c:f></c:numRef></c:val><c:smooth val="0"/></c:ser>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1200" b="1"><a:solidFill><a:srgbClr val="101828"/></a:solidFill></a:rPr><a:t>${esc(s.title)} 순위 추이</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>` +
    `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D4"/></a:solidFill></a:ln></c:spPr>${AXIS_TEXT}<c:crossAx val="5002"/><c:crosses val="max"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="maxMin"/><c:max val="${s.maxRank}"/><c:min val="1"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="EEEEEA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0&quot;위&quot;" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${AXIS_TEXT}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="1"/></c:valAx>` +
    `</c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/>${AXIS_TEXT}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="EAECF0"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

function anchorXml(s: ChartSpec, i: number): string {
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.fromRow}</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${s.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="순위 추이 ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

// exceljs가 쓴 xlsx에 차트를 넣는다(그 시트에는 이미지가 없어 drawing이 없다는 전제).
export async function injectTrendCharts(buf: ArrayBuffer | Buffer, specs: ChartSpec[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  if (specs.length === 0) return zip.generateAsync({ type: "nodebuffer" });

  // 시트 이름 → 파일
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const rid = new RegExp(`<sheet [^>]*name="${TREND_SHEET}"[^>]*r:id="([^"]+)"`).exec(wbXml)?.[1];
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const target = rid ? new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(wbRels)?.[1] ?? new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(wbRels)?.[1] : undefined;
  if (!target) return zip.generateAsync({ type: "nodebuffer" });
  const sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
  const sheetName = sheetPath.split("/").pop()!;
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`;

  const used = Object.keys(zip.files);
  const nextNum = (prefix: string) => {
    let n = 1;
    while (used.includes(`${prefix}${n}.xml`)) n++;
    return n;
  };
  const drawingNo = nextNum("xl/drawings/drawing");
  const firstChart = nextNum("xl/charts/chart");

  let ct = await zip.file("[Content_Types].xml")!.async("string");
  const overrides: string[] = [`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`];

  const drawingRels: string[] = [];
  specs.forEach((s, i) => {
    const no = firstChart + i;
    zip.file(`xl/charts/chart${no}.xml`, chartXml(s));
    overrides.push(`<Override PartName="/xl/charts/chart${no}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    drawingRels.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${no}.xml"/>`);
  });

  zip.file(
    `xl/drawings/drawing${drawingNo}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${specs.map(anchorXml).join("")}</xdr:wsDr>`,
  );
  zip.file(
    `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`,
  );
  ct = ct.replace("</Types>", `${overrides.join("")}</Types>`);
  zip.file("[Content_Types].xml", ct);

  // 시트 → drawing 연결
  const relEntry = `<Relationship Id="rIdTrendDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`;
  const existingRels = zip.file(relsPath) ? await zip.file(relsPath)!.async("string") : null;
  zip.file(
    relsPath,
    existingRels
      ? existingRels.replace("</Relationships>", `${relEntry}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEntry}</Relationships>`,
  );
  let sheetXml = await zip.file(sheetPath)!.async("string");
  if (!/xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace("<worksheet ", `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `);
  }
  // <drawing>은 pageMargins·pageSetup·headerFooter 뒤, legacyDrawing·tableParts·extLst 앞
  const tag = `<drawing r:id="rIdTrendDrawing"/>`;
  const before = ["<legacyDrawing", "<legacyDrawingHF", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"]
    .map((m) => sheetXml.indexOf(m))
    .filter((i) => i >= 0);
  const at = Math.min(...before);
  sheetXml = sheetXml.slice(0, at) + tag + sheetXml.slice(at);
  zip.file(sheetPath, sheetXml);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
