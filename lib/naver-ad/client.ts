import { buildNaverAdHeaders, type NaverAdCredentials } from "./auth";

// 공식 기본 URL(https://api.searchad.naver.com) — 구 문서상의 api.naver.com은 더 이상 쓰이지 않음
const BASE_URL = "https://api.searchad.naver.com";

export class NaverAdApiError extends Error {}

type Query = Record<string, string | number | undefined>;

export async function naverAdRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  credentials: NaverAdCredentials,
  query?: Query,
): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: buildNaverAdHeaders(method, path, credentials),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new NaverAdApiError("네이버 검색광고 API 응답을 해석하지 못했어요.");
    }
  }

  if (!res.ok) {
    const body = json as { title?: string; message?: string; detail?: string } | null;
    const detail =
      body?.title ?? body?.message ?? body?.detail ?? `네이버 검색광고 API 요청이 실패했어요. (${res.status})`;
    throw new NaverAdApiError(detail);
  }

  return json as T;
}

// URL 길이 제한을 피하기 위해 대량 id 목록을 나눠 요청
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
