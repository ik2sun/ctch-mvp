// 조합 분석 엑셀 시트(순수 함수) — 화면의 조합 매트릭스를 그대로 내보낸다. 엑셀 파일 쓰기는 화면(xlsx)에서.
// 시트: 조합 목록(칸 단위, 전 지표) · 매트릭스_<지표>/광고비/판정(열로 펼쳤을 때) · 추천 조합 · 안내
import type { Enriched } from "./analyze";
import { ALL, METRIC_META, OTHER, SEP, cellKey, type ComboDim, type ComboMetric, type CrossTab, type Discovery, type Stat } from "./combos";

const VERDICT: Record<Stat["verdict"], string> = { good: "▲ 확실히 좋음", bad: "▼ 확실히 나쁨", flat: "차이 불확실", thin: "판단 보류" };
const d = (a: number, b: number) => (b > 0 ? a / b : null);
const r1 = (v: number | null, k = 1) => (v == null ? null : Math.round(v * k * 100) / 100); // 소수 2자리
// 지표 값을 엑셀 숫자로: ROAS·CTR·CVR = %(숫자), CPA = 원
const asNum = (v: number | null, m: ComboMetric) => (v == null ? null : m === "cpa" ? Math.round(v) : r1(v, 100));
const unit = (m: ComboMetric) => (m === "cpa" ? "(원)" : "(%)");

function statCols(s: Stat, m: ComboMetric, totalCost: number): (string | number | null)[] {
  return [
    s.n,
    Math.round(s.cost),
    r1(d(s.cost, totalCost), 100),
    Math.round(s.impressions),
    Math.round(s.linkClicks),
    r1(s.conversions),
    Math.round(s.revenue),
    r1(d(s.revenue, s.cost), 100),
    d(s.cost, s.conversions) == null ? null : Math.round(d(s.cost, s.conversions)!),
    r1(d(s.linkClicks, s.impressions), 100),
    r1(d(s.conversions, s.linkClicks), 100),
    asNum(s.low, m),
    asNum(s.high, m),
    s.vsBase == null ? null : Math.round(s.vsBase * 100) / 100,
    VERDICT[s.verdict],
  ];
}
const STAT_HEAD = ["소재 수", "광고비(원)", "광고비 비중(%)", "노출", "링크 클릭", "전환", "매출(원)", "ROAS(%)", "CPA(원)", "CTR(%)", "CVR(%)", "90% 구간 하한", "90% 구간 상한", "평균 대비(배)", "판정"];

export function comboSheets(opts: {
  tab: CrossTab;
  rowDims: ComboDim[];
  colDim: ComboDim | null;
  metric: ComboMetric;
  rowKeys: string[]; // 화면 정렬·필터 순서(전부 — '더 보기'와 무관)
  found: Discovery[];
  info: [string, string][]; // 광고주·기간·필터 등
  rows: Enriched[];
}): Record<string, unknown[][]> {
  const { tab, rowDims, colDim, metric, rowKeys, found } = opts;
  const meta = METRIC_META[metric];
  const totalCost = tab.total.cost;
  const rowHead = rowDims.length ? rowDims.map((x) => x.label) : [ALL];
  const parts = (k: string) => (k === OTHER ? [`기타(${tab.foldedRows}개 조합)`, ...Array(Math.max(0, rowHead.length - 1)).fill("")] : k.split(SEP));
  const out: Record<string, unknown[][]> = {};

  // ① 조합 목록 — 칸 단위(열로 펼친 항목도 한 열로)
  const list: unknown[][] = [[...rowHead, ...(colDim ? [colDim.label] : []), ...STAT_HEAD]];
  for (const rk of rowKeys)
    for (const ck of colDim ? tab.colKeys : [ALL]) {
      const s = tab.cells.get(cellKey(rk, ck));
      if (s) list.push([...parts(rk), ...(colDim ? [ck] : []), ...statCols(s, metric, totalCost)]);
    }
  out["조합 목록"] = list;

  // ② 매트릭스(열로 펼쳤을 때) — 지표·광고비·판정 각각 한 시트, 마지막 열·행은 그 항목만 본 값
  if (colDim) {
    const head = [...rowHead, ...tab.colKeys, `${rowDims.length ? "행" : ""} 합계`];
    const sheet = (val: (s: Stat) => unknown) => {
      const aoa: unknown[][] = [head];
      for (const rk of rowKeys) aoa.push([...parts(rk), ...tab.colKeys.map((ck) => {
        const s = tab.cells.get(cellKey(rk, ck));
        return s ? val(s) : null;
      }), val(tab.rowStats.get(rk)!)]);
      aoa.push([`${colDim.label} 합계`, ...Array(rowHead.length - 1).fill(""), ...tab.colKeys.map((ck) => val(tab.colStats.get(ck)!)), val(tab.total)]);
      return aoa;
    };
    out[`매트릭스_${meta.label}`] = sheet((s) => asNum(s.value, metric));
    out["매트릭스_광고비"] = sheet((s) => Math.round(s.cost));
    out["매트릭스_판정"] = sheet((s) => VERDICT[s.verdict]);
  }

  // ③ 추천 조합
  out["추천 조합"] = [
    ["판정", "조합 효과", "항목 A", "값 A", "항목 B", "값 B", `${meta.label}${unit(metric)}`, "평균 대비(배)", `따로 볼 때 기대${unit(metric)}`, "조합 효과(배)", "광고비(원)", "소재 수"],
    ...found.map((f) => [
      VERDICT[f.verdict],
      f.combo ? "조합 효과" : "한 요소 덕분",
      f.rowDim.label,
      f.row,
      f.colDim.label,
      f.col,
      asNum(f.value, metric),
      f.vsBase == null ? null : Math.round(f.vsBase * 100) / 100,
      asNum(f.expected, metric),
      f.synergy == null ? null : Math.round((meta.higher ? f.synergy : 1 / f.synergy) * 100) / 100,
      Math.round(f.cost),
      f.n,
    ]),
  ];

  // ④ 안내
  out["안내"] = [
    ["CTCH 소재 분석 — 조합 분석"],
    ...opts.info,
    ["행 항목", rowDims.map((x) => x.label).join(" · ") || ALL],
    ["열로 펼친 항목", colDim?.label ?? "없음(목록)"],
    ["지표", `${meta.label} · 전체 평균 ${asNum(tab.base, metric) ?? "—"}${unit(metric)}`],
    ["소재 수", String(opts.rows.length)],
    [""],
    ["판정", `90% 구간(${meta.countLabel} 수 기준 포아송 근사)이 전체 평균보다 위면 '확실히 좋음', 아래면 '확실히 나쁨'. ${meta.countLabel} ${meta.min}건 미만은 '판단 보류'. 주문 금액 편차는 반영 못 함`],
    ["조합 효과", "실제 ÷ (두 항목을 따로 볼 때 값의 곱 ÷ 평균). 1.15배 이상이면 함께 쓸 때 더 잘 됨"],
    ["기준", "성별·연령대 = 위 '성별·연령대 기준' · 타겟 = 광고세트 타겟팅 · 캠페인 목표 = 캠페인 설정 · 콘텐츠·상품·모델·TVC·포맷 = 소재명 · 캠페인 유형 = UTM"],
    ["주의", "같은 광고세트·캠페인에 몰린 조합은 캠페인 차이가 섞여 있을 수 있음(원인 확정 아님). 상품이 여러 개인 소재는 상품마다 한 번씩 셈. 축마다 광고비 상위만 두고 나머지는 '기타'"],
  ];
  return out;
}
