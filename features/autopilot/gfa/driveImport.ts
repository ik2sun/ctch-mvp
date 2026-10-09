// 캠페인 오토파일럿 · 구글 드라이브 폴더에서 소재 이미지 불러오기(브라우저 전용)
// 구글 Identity Services 토큰(팝업 동의, scope drive.readonly)을 브라우저 메모리에만 두고 Drive API로 목록·내려받기 — 서버 저장 없음.
// OAuth 클라이언트는 캠페인 매니저 Gmail 연결과 같은 'CTCH Gmail 연결'(GMAIL_CLIENT_ID). 준비(GCP ctch 프로젝트):
//   ① Google Drive API 사용 설정 ② 그 OAuth 클라이언트의 '승인된 자바스크립트 원본'에 http://localhost:3001 · https://ctch-mvp.vercel.app
//   ③ 동의 화면(내부)에 drive.readonly 범위 추가
const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string; hint?: string }) => void };
type Gis = { accounts: { oauth2: { initTokenClient: (cfg: Record<string, unknown>) => TokenClient } } };

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if ((window as unknown as { google?: Gis }).google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("구글 로그인 스크립트를 불러오지 못했어요."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

let cached: { token: string; until: number } | null = null;

export async function getDriveToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const res = await fetch("/api/autopilot/google-client");
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.clientId) throw new Error(json.error || "구글 OAuth 클라이언트 정보를 받지 못했어요.");
  await loadGis();
  const google = (window as unknown as { google: Gis }).google;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: json.clientId,
      scope: SCOPE,
      hd: "nmg.co.kr",
      callback: (r: TokenResponse) => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || "구글 드라이브 권한을 받지 못했어요."));
        cached = { token: r.access_token, until: Date.now() + Math.max(60, (r.expires_in ?? 3600) - 120) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e: { type?: string; message?: string }) =>
        reject(new Error(e.type === "popup_closed" ? "구글 동의 창이 닫혔어요." : e.type === "popup_failed_to_open" ? "팝업이 막혔어요. 브라우저 팝업을 허용해 주세요." : e.message || "구글 동의에 실패했어요.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

// 폴더 주소(…/folders/<id>, ?id=<id>) 또는 ID 그대로
export function folderIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}

export type DriveFile = { id: string; name: string; mimeType: string; size?: string; path: string };

async function driveGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) cached = null;
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403 && /has not been used|disabled/i.test(msg)) throw new Error("GCP 프로젝트에서 Google Drive API가 꺼져 있어요. 관리자에게 사용 설정을 요청하세요.");
    if (res.status === 404) throw new Error("폴더를 찾지 못했어요. 주소와 내 계정의 접근 권한을 확인하세요.");
    throw new Error(`구글 드라이브 오류: ${msg}`);
  }
  return json as T;
}

// 폴더 안 이미지(하위 폴더 2단계까지) — 공유 드라이브 포함. withVideo = mp4·mov 영상도(메타 벌크)
export async function listDriveImages(token: string, folderId: string, depth = 2, prefix = "", withVideo = false): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const page = await driveGet<{ files?: Omit<DriveFile, "path">[]; nextPageToken?: string }>(
      token,
      `/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    for (const f of page.files ?? []) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        if (depth > 0) out.push(...(await listDriveImages(token, f.id, depth - 1, `${prefix}${f.name}/`, withVideo)));
      } else if (f.mimeType.startsWith("image/") || (withVideo && /^video\/(mp4|quicktime)$/.test(f.mimeType))) out.push({ ...f, path: `${prefix}${f.name}` });
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function downloadDriveFile(token: string, f: DriveFile): Promise<File> {
  const res = await fetch(`${API}/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${f.name} 내려받기 실패(HTTP ${res.status})`);
  const blob = await res.blob();
  return new File([blob], f.name, { type: f.mimeType || blob.type });
}
