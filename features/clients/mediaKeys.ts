// 매체별 API 키는 절대 브라우저에서 직접 읽거나 쓰지 않고, 서버 라우트를 통해서만 저장·확인한다.

export type MediaChannel = "meta" | "naver" | "gfa" | "kakao" | "google_ads" | "ga4";

export type MediaStatusItem = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
  warning?: string; // 연결은 되지만 확인이 필요한 사항(예: 최근 30일 집행 없음)
  ownToken?: boolean; // 메타: 광고주 전용 토큰 저장 여부
};

export async function saveMediaKeys(
  clientId: string,
  channel: MediaChannel,
  keys: Record<string, string>,
  clear?: string[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/clients/${clientId}/media-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, keys, clear }),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "저장에 실패했어요." };
  return { ok: true };
}

export async function fetchMediaStatus(clientId: string): Promise<MediaStatusItem[]> {
  const res = await fetch("/api/media-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  const json = await res.json();
  if (!res.ok) return [];
  return json.media as MediaStatusItem[];
}
