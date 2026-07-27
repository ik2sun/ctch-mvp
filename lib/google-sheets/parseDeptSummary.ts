import { isMonthLabel, parseAmount } from "./parseAmount";

export type MetricSeries = {
  metric: string;
  values: { month: string; value: number }[];
};

// "26년 퍼포 합계" 탭처럼 "라벨 열 + 월 컬럼들" 헤더 아래 지표명(취급고/순매출/영업이익 등)이
// 행으로 나열된 표를 파싱한다. 헤더는 2번째 셀이 라벨, 3번째 셀부터 월 패턴("26년 1월")인 행.
export function parseDeptSummary(rows: string[][]): MetricSeries[] {
  let headerIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (String(row?.[1] ?? "").trim() && isMonthLabel(row?.[2])) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("이 탭에서 부서 합계 표(월별 헤더)를 찾지 못했어요.");
  }

  const headerRow = rows[headerIdx];
  const months: string[] = [];
  let c = 2;
  while (c < headerRow.length && String(headerRow[c] ?? "").trim()) {
    months.push(String(headerRow[c]).trim());
    c++;
  }

  const out: MetricSeries[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const metric = String(row?.[1] ?? "").trim();
    if (!metric) break; // 빈 라벨 나오면 표 끝
    const values = months.map((m, idx) => ({ month: m, value: parseAmount(row[2 + idx]) }));
    out.push({ metric, values });
  }
  return out;
}
