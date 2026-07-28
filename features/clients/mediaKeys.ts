// 매체별 API 키는 절대 브라우저에서 직접 읽거나 쓰지 않고, 서버 라우트를 통해서만 저장·확인한다.

export type MediaChannel = "meta" | "naver" | "gfa" | "kakao" | "google_ads" | "ga4";

export type MediaStatusItem = {
  key: string;
  label: string;
  connected: boolean;
  status: "ok" | "expired" | "error" | "none";
  detail: string;
};

export async function saveMediaKeys(
  clientId: string,
  channel: MediaChannel,
  keys: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/clients/${clientId}/media-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, keys }),
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
