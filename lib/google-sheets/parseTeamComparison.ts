import { isMonthLabel, parseAmount } from "./parseAmount";

export type TeamSeries = {
  section: string; // 예: "취급고", "순매출"
  team: string;
  values: { month: string; value: number }[];
};

// "주간보고raw" 탭처럼 "취급고"/"순매출" 같은 섹션 헤더가 여러 개 이어져 있고, 각 섹션 아래
// 팀별 합계 행(A열이 비어있음) + 선불/후불 세부 행(A열에 값 있음)이 섞여 있는 표를 파싱한다.
// 세부 행은 A열이 채워져 있어 자동으로 건너뛴다.
export function parseTeamComparison(rows: string[][]): TeamSeries[] {
  const out: TeamSeries[] = [];
  let section: string | null = null;
  let months: string[] = [];

  for (const row of rows) {
    const col0 = String(row?.[0] ?? "").trim();
    const col1 = String(row?.[1] ?? "").trim();

    if (col1 && isMonthLabel(row?.[2])) {
      section = col1;
      months = [];
      let c = 2;
      while (c < row.length && String(row[c] ?? "").trim()) {
        months.push(String(row[c]).trim());
        c++;
      }
      continue;
    }

    if (!section) continue;

    if (!col1) {
      section = null; // 빈 라벨 = 섹션 종료
      continue;
    }

    if (!col0) {
      const values = months.map((m, idx) => ({ month: m, value: parseAmount(row[2 + idx]) }));
      out.push({ section, team: col1, values });
    }
    // col0에 값이 있으면(선불/후불 세부 행) 건너뛴다 — 섹션은 유지
  }

  if (out.length === 0) {
    throw new Error("이 탭에서 팀별 합계 표를 찾지 못했어요.");
  }
  return out;
}
