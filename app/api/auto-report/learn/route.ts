// 예시 리포트(엑셀·CSV·문서·슬라이드·PDF·구글 문서에서 뽑은 텍스트) → 리포트 구조 학습
import { NextResponse } from "next/server";
import { requireClientAccess } from "@/features/perf-manager/store";
import { learnSpec } from "@/features/auto-report/ai";
import { connectedMedia } from "@/features/auto-report/store";
import { themeFromXlsx } from "@/features/auto-report/theme";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; sourceName?: string; text?: string; pdfBase64?: string; xlsxBase64?: string };
  const a = await requireClientAccess(body.clientId);
  if (a instanceof NextResponse) return a;
  const text = String(body.text ?? "");
  const pdf = body.pdfBase64 ? String(body.pdfBase64) : undefined;
  if (!text.trim() && !pdf) return NextResponse.json({ error: "학습할 리포트 내용이 비었어요." }, { status: 400 });
  if (pdf && pdf.length > 3_200_000) return NextResponse.json({ error: "PDF가 너무 커요(약 2.3MB까지). 페이지를 줄이거나 엑셀·문서로 올려 주세요." }, { status: 400 });
  try {
    const { media } = await connectedMedia(a.client.id);
    const [r, theme] = await Promise.all([
      learnSpec({ clientName: a.client.name, sourceName: String(body.sourceName ?? "업로드한 리포트"), text, pdfBase64: pdf, connected: media }),
      body.xlsxBase64 && body.xlsxBase64.length < 3_600_000 ? themeFromXlsx(Buffer.from(String(body.xlsxBase64), "base64")).catch(() => null) : Promise.resolve(null),
    ]);
    if (theme) r.spec.theme = theme;
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: `학습하지 못했어요 — ${(e as Error).message}` }, { status: 502 });
  }
}
