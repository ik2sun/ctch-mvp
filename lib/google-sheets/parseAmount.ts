// NMG 매출 시트 공통 숫자 파서 — "1,234,567", "(40,558,529)"(음수), "10.93%", "0" 등을 처리한다.
export function parseAmount(v: unknown): number {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[(),%₩\s]/g, "");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

// "26년 1월", "1월" 등 월 라벨인지 판별
export function isMonthLabel(v: unknown): boolean {
  return /\d+\s*년?\s*\d{1,2}\s*월/.test(String(v ?? ""));
}
