import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AuditResult, SeoDiagnosis } from "@/features/seo-analysis/types";
import { buildReportModel, safeFileStem } from "@/features/seo-analysis/reportModel";

export const maxDuration = 60;
export const runtime = "nodejs";

type Body = {
  type?: "pptx" | "xlsx";
  audit?: AuditResult;
  diagnosis?: SeoDiagnosis | null;
  clientName?: string | null;
};

// 진단 결과를 보고서(PPT)·별첨(엑셀) 파일로 내려준다. 생성 라이브러리는 서버에서만 로드한다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  if (!body.audit || !Array.isArray(body.audit.findings)) return NextResponse.json({ error: "먼저 기술 진단을 실행해 주세요." }, { status: 400 });
  if (body.type !== "pptx" && body.type !== "xlsx") return NextResponse.json({ error: "type은 pptx 또는 xlsx여야 해요." }, { status: 400 });

  const opts = { clientName: body.clientName ?? null, preparedBy: user.email ? `NMG · ${user.email}` : "NMG · CTCH" };
  const model = buildReportModel(body.audit, body.diagnosis ?? null, opts);
  const stem = safeFileStem(model);

  try {
    let buf: Buffer;
    let mime: string;
    let ext: string;
    if (body.type === "pptx") {
      const { buildPptx } = await import("@/features/seo-analysis/exportPptx");
      buf = await buildPptx(body.audit, body.diagnosis ?? null, opts);
      mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      ext = "pptx";
    } else {
      const { buildXlsx } = await import("@/features/seo-analysis/exportXlsx");
      buf = await buildXlsx(body.audit, body.diagnosis ?? null, opts);
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    }
    const koreanName = `${model.brand}_SEO-GEO진단_${body.type === "pptx" ? "리포트" : "별첨"}_${model.dateCompact}.${ext}`;
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${stem}.${ext}"; filename*=UTF-8''${encodeURIComponent(koreanName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "문서 생성 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
