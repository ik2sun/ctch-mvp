// 비용/예산/금액 입력 필드 공통 포맷터 — 프로젝트 전체의 금액 입력에서 재사용한다.

// 입력 중인 값에 천 단위 콤마를 적용 (예: "5000000" → "5,000,000")
export function formatBudgetInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

// 콤마가 섞인 입력값을 순수 숫자로 변환 — 저장 직전에 사용
export function parseBudgetInput(formatted: string): number | null {
  const digits = formatted.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}
