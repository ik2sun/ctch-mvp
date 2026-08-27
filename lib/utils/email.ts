const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "a@b.com, c@d.com" 같은 콤마 구분 문자열을 담당자 메일 배열로 분리한다.
// 하나라도 형식이 틀리거나 비어 있으면 null을 반환한다.
export function parseEmailList(input: string): string[] | null {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => !EMAIL_RE.test(p))) return null;
  return parts;
}
