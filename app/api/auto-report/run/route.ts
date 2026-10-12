// 자동 리포트 미리보기·지금 발송 — 미리보기는 저장 전 초안으로도 가능, 발송은 저장된 리포트만(기록 남김)
import { NextResponse } from "next/server";
import { requireClientAccess } from "@/features/perf-manager/store";
import { cleanRecipients, generate, getReport, logRun, sendReport } from "@/features/auto-report/store";
import type { AutoReport } from "@/features/auto-report/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; report?: AutoReport; send?: boolean; to?: string[] };
  const a = await requireClientAccess(body.clientId);
  if (a instanceof NextResponse) return a;
  const by = a.user.email ?? "";
  let report: AutoReport | null = body.report ? { ...body.report, clientId: a.client.id } : null;
  if (body.send) {
    // 발송은 저장된 내용 그대로(화면의 저장 안 한 수정은 반영 안 함)
    if (!report?.id) return NextResponse.json({ error: "먼저 저장해 주세요." }, { status: 400 });
    report = await getReport(report.id, a.client.id);
    if (!report) return NextResponse.json({ error: "리포트를 찾지 못했어요." }, { status: 404 });
  }
  if (!report?.spec?.sections?.length) return NextResponse.json({ error: "리포트 구성이 비었어요." }, { status: 400 });
  // '나에게 테스트 발송' = 로그인한 본인 메일만, 자동 발송 일정에는 영향 없음
  const test = !!body.to?.includes("__me__");
  const to = test ? cleanRecipients([by]) : body.to ? cleanRecipients(body.to) : report.recipients;
  try {
    const g = await generate(report);
    if (body.send) {
      await sendReport(report, g, to);
      await logRun({ report, trigger: "manual", status: "sent", g, sentTo: to, by, touch: !test });
    }
    return NextResponse.json({ subject: g.subject, html: g.html, period: g.period, warnings: g.warnings, sentTo: body.send ? to : null });
  } catch (e) {
    const msg = (e as Error).message;
    if (body.send && report.id) await logRun({ report, trigger: "manual", status: "error", error: msg, sentTo: to, by, touch: !test }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
