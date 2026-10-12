// 자동 리포트 목록·저장·삭제 — 워크스페이스 구성원 누구나(광고주 소유 확인)
import { NextResponse } from "next/server";
import { requireClientAccess } from "@/features/perf-manager/store";
import { connectedMedia, deleteReport, listReports, listRuns, saveReport } from "@/features/auto-report/store";
import type { AutoReport } from "@/features/auto-report/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const a = await requireClientAccess(clientId);
  if (a instanceof NextResponse) return a;
  const connected = await connectedMedia(a.client.id);
  try {
    const [reports, runs] = await Promise.all([listReports(a.client.id), listRuns(a.client.id)]);
    return NextResponse.json({ reports, runs, connected: connected.media });
  } catch (e) {
    return NextResponse.json({ reports: [], runs: [], connected: connected.media, setupError: (e as Error).message });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { report?: AutoReport };
  const r = body.report;
  const a = await requireClientAccess(r?.clientId);
  if (a instanceof NextResponse) return a;
  if (!r?.spec?.sections?.length) return NextResponse.json({ error: "리포트 구성이 비었어요." }, { status: 400 });
  try {
    const saved = await saveReport({ ...r, clientId: a.client.id }, a.user.email ?? "");
    return NextResponse.json({ report: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const a = await requireClientAccess(u.searchParams.get("clientId"));
  if (a instanceof NextResponse) return a;
  const id = u.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요해요." }, { status: 400 });
  try {
    await deleteReport(id, a.client.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
