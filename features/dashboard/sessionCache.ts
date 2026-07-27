// 대시보드/리포트 위젯 공용 브라우저 캐시 — 같은 키 조회는 TTL 동안 재사용해서
// 잦은 새로고침/광고주 전환이 API rate limit이나 불필요한 비용으로 이어지지 않게 한다.
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function getSessionCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw) as { savedAt: number; data: T };
    if (Date.now() - savedAt > ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setSessionCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* 저장 실패는 무시 — 캐시는 있으면 좋고 없어도 그만 */
  }
}
