// 자동 리포트 — 예시 리포트에서 학습용 텍스트 뽑기(브라우저). 서버에 원본 파일을 보내지 않고 텍스트만(PDF는 Claude가 직접 읽게 base64)
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { getDriveToken } from "@/features/autopilot/gfa/driveImport";

// xlsxBase64 = 원본 엑셀(서식 학습용 — 머리글 색·강조색·글꼴), 2.5MB까지
export type Extracted = { name: string; kind: "file" | "google"; text: string; pdfBase64?: string; xlsxBase64?: string };
const XLSX_STYLE_MAX = 2.5 * 1024 * 1024;

const MAX_CHARS = 60_000;
const ROWS_PER_SHEET = 150;
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function sheetsText(wb: XLSX.WorkBook): string {
  const out: string[] = [];
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "", blankrows: false, raw: false });
    const body = rows
      .slice(0, ROWS_PER_SHEET)
      .map((r) => r.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()).join(" | "))
      .filter((l) => l.replace(/[|\s]/g, ""));
    out.push(`### 시트 '${n}' (${rows.length}행${rows.length > ROWS_PER_SHEET ? `, 앞 ${ROWS_PER_SHEET}행만` : ""})\n${body.join("\n")}`);
  }
  return out.join("\n\n");
}

async function docxText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return decode(xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n");
}

async function pptxText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  const out: string[] = [];
  for (const [i, f] of slides.entries()) {
    const xml = await zip.file(f)!.async("string");
    const paras = xml.split(/<\/a:p>/).map((p) => decode([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(""))).filter((t) => t.trim());
    out.push(`### 슬라이드 ${i + 1}\n${paras.join("\n")}`);
  }
  return out.join("\n\n");
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function extractFile(file: File): Promise<Extracted> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buf = await file.arrayBuffer();
  let text = "";
  let pdfBase64: string | undefined;
  let xlsxBase64: string | undefined;
  if (["xlsx", "xls", "xlsm", "csv"].includes(ext)) {
    text = sheetsText(XLSX.read(buf, { type: "array" }));
    if ((ext === "xlsx" || ext === "xlsm") && buf.byteLength <= XLSX_STYLE_MAX) xlsxBase64 = toBase64(buf);
  }
  else if (ext === "docx") text = await docxText(buf);
  else if (ext === "pptx") text = await pptxText(buf);
  else if (ext === "pdf") {
    if (file.size > 2.3 * 1024 * 1024) throw new Error("PDF가 너무 커요(약 2.3MB까지). 엑셀·문서·슬라이드 원본이나 구글 문서 주소로 올려 주세요.");
    pdfBase64 = toBase64(buf);
  } else if (["txt", "md", "html", "htm"].includes(ext)) text = new TextDecoder().decode(buf).replace(/<[^>]+>/g, " ");
  else throw new Error("지원하는 형식: 엑셀(xlsx·xls·csv)·워드(docx)·파워포인트(pptx)·PDF·텍스트");
  if (!text.trim() && !pdfBase64) throw new Error("파일에서 읽을 내용이 없어요.");
  return { name: file.name, kind: "file", text: text.slice(0, MAX_CHARS), pdfBase64, xlsxBase64 };
}

// 구글 문서·스프레드시트·슬라이드 주소 → 내보내기(drive.readonly, 브라우저 팝업 동의 — 오토파일럿 드라이브 불러오기와 같은 연결)
export function googleFileOf(url: string): { id: string; type: "document" | "spreadsheets" | "presentation" } | null {
  const m = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/);
  return m ? { type: m[1] as "document" | "spreadsheets" | "presentation", id: m[2] } : null;
}

export async function extractGoogle(url: string): Promise<Extracted> {
  const g = googleFileOf(url);
  if (!g) throw new Error("구글 문서·스프레드시트·슬라이드 주소를 넣어 주세요(docs.google.com/…/d/…).");
  const token = await getDriveToken();
  const H = { Authorization: `Bearer ${token}` };
  const API = "https://www.googleapis.com/drive/v3/files";
  const meta = await fetch(`${API}/${g.id}?fields=name&supportsAllDrives=true`, { headers: H });
  if (!meta.ok) throw new Error(meta.status === 404 ? "파일을 찾지 못했어요 — 로그인한 구글 계정에 그 파일 보기 권한이 있는지 확인해 주세요." : `구글 드라이브 오류(HTTP ${meta.status})`);
  const name = ((await meta.json()) as { name?: string }).name ?? "구글 문서";
  const mime =
    g.type === "spreadsheets" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : g.type === "presentation" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "text/plain";
  const res = await fetch(`${API}/${g.id}/export?mimeType=${encodeURIComponent(mime)}`, { headers: H });
  if (!res.ok) throw new Error(`내보내기 실패(HTTP ${res.status}) — 파일이 너무 크면 엑셀·PDF로 받아 올려 주세요.`);
  let text: string;
  let xlsxBase64: string | undefined;
  if (g.type === "spreadsheets") {
    const buf = await res.arrayBuffer();
    text = sheetsText(XLSX.read(buf, { type: "array" }));
    if (buf.byteLength <= XLSX_STYLE_MAX) xlsxBase64 = toBase64(buf);
  }
  else if (g.type === "presentation") text = await pptxText(await res.arrayBuffer());
  else text = await res.text();
  return { name, kind: "google", text: text.slice(0, MAX_CHARS), xlsxBase64 };
}
