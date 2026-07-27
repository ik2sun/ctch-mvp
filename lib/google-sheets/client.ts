import { google } from "googleapis";
import { NextResponse } from "next/server";

// 구글 서비스 계정 인증 — 키 파일을 저장소에 두지 않고, JSON 전체를 환경변수 문자열로 받는다.
// (Vercel처럼 파일시스템이 배포에 포함되지 않는 환경에서도 그대로 동작하게 하기 위함)
function getServiceAccountCredentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "서버에 GOOGLE_SERVICE_ACCOUNT_JSON이 설정되지 않았어요. 구글 서비스 계정 키 JSON 전체를 환경변수로 등록해 주세요.",
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 값이 올바른 JSON이 아니에요.");
  }
}

let cachedSheets: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (cachedSheets) return cachedSheets;
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
}

export class GoogleSheetsError extends Error {}

// NMG 전사 공용 매출 시트 ID — 광고주별이 아니라 부서 전체가 공유하는 문서 1개
export function getNmgRevenueSheetId(): string {
  const id = process.env.NMG_REVENUE_SHEET_ID;
  if (!id) {
    throw new Error("서버에 NMG_REVENUE_SHEET_ID가 설정되지 않았어요.");
  }
  return id;
}

export type SheetTab = { title: string; sheetId: number };

// 스프레드시트의 전체 탭 이름 목록 — 탭 선택 드롭다운용
export async function getSpreadsheetTabs(spreadsheetId: string): Promise<SheetTab[]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });
    return (res.data.sheets ?? []).map((s) => ({
      title: s.properties?.title ?? "",
      sheetId: s.properties?.sheetId ?? 0,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new GoogleSheetsError(`탭 목록을 불러오지 못했어요: ${message}`);
  }
}

// 시트 탭 전체 값을 2차원 배열(행×열, 문자열)로 가져온다. 첫 행은 호출부에서 헤더로 취급.
export async function fetchSheetValues(spreadsheetId: string, tab: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: tab,
    });
    return (res.data.values as string[][] | undefined) ?? [];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unable to parse range")) {
      throw new GoogleSheetsError(`"${tab}" 탭을 찾을 수 없어요. 탭 이름을 확인해 주세요.`);
    }
    if (message.includes("The caller does not have permission") || message.includes("PERMISSION_DENIED")) {
      throw new GoogleSheetsError("이 스프레드시트에 서비스 계정 접근 권한이 없어요. 시트를 서비스 계정 이메일과 공유해 주세요.");
    }
    if (message.includes("Requested entity was not found")) {
      throw new GoogleSheetsError("스프레드시트 ID를 찾을 수 없어요. ID를 다시 확인해 주세요.");
    }
    throw new GoogleSheetsError(`구글 시트 조회에 실패했어요: ${message}`);
  }
}

// app/api/nmg-revenue/* 라우트 공용 에러 응답
export function googleSheetsErrorResponse(e: unknown, fallbackMessage: string) {
  const message = e instanceof Error ? e.message : fallbackMessage;
  const status = e instanceof GoogleSheetsError ? 502 : 400;
  return NextResponse.json({ error: message }, { status });
}
