import { parseAmount } from "./parseAmount";

const CLIENT_HEADER_ALIASES = ["광고주", "거래처", "client"];

export type ClientSeries = {
  client: string;
  values: { month: string; value: number }[];
};

// 팀 탭("1국1팀_배병수" 등)처럼 "광고주" 헤더 셀 오른쪽에 월 컬럼, 그 아래 광고주명이 있는
// 행들이 데이터인 표를 파싱한다. "광고주" 헤더를 못 찾으면 이 탭은 대상이 아니라는 뜻.
export function parseClientPivot(rows: string[][]): ClientSeries[] {
  let headerRowIdx = -1;
  let labelCol = -1;

  outer: for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (CLIENT_HEADER_ALIASES.includes(String(row[c] ?? "").trim())) {
        headerRowIdx = r;
        labelCol = c;
        break outer;
      }
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('이 탭에는 "광고주" 헤더가 있는 표가 없어요.');
  }

  const headerRow = rows[headerRowIdx];
  const months: string[] = [];
  let c = labelCol + 1;
  while (c < headerRow.length && String(headerRow[c] ?? "").trim()) {
    months.push(String(headerRow[c]).trim());
    c++;
  }

  const out: ClientSeries[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = String(row?.[labelCol] ?? "").trim();
    if (!name) break; // 빈 행이 나오면 표 끝
    const values = months.map((m, idx) => ({ month: m, value: parseAmount(row[labelCol + 1 + idx]) }));
    out.push({ client: name, values });
  }
  return out;
}
