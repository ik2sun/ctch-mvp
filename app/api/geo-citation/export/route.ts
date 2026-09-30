import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessRun, requireUser } from "@/features/geo-citation/auth";
import { buildGeoXlsx } from "@/features/geo-citation/exportXlsx";
import type { GeoAnswer, GeoPrompt, GeoRun } from "@/features/geo-citation/types";

export const maxDuration = 60;
export const runtime = "nodejs";

// 측정 회차 별첨 엑셀 (8시트)
export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  const access = await canAccessRun(auth.supabase, runId);
  if (!access) return NextResponse.json({ error: "측정 회차를 찾지 못했어요." }, { status: 404 });

  const db = createAdminClient();
  const [{ data: run }, { data: answers }, { data: prompts }, { data: client }] = await Promise.all([
    db.from("geo_runs").select("*").eq("id", runId).single(),
    db.from("geo_answers").select("*").eq("run_id", runId),
    db.from("geo_prompts").select("*").eq("client_id", access.client_id).order("created_at"),
    db.from("clients").select("name").eq("id", access.client_id).maybeSingle(),
  ]);
  const clientName = (client?.name as string) ?? "광고주";
  const buf = await buildGeoXlsx({
    run: run as GeoRun,
    answers: (answers ?? []) as GeoAnswer[],
    prompts: (prompts ?? []) as GeoPrompt[],
    clientName,
  });
  const date = new Date((run as GeoRun).started_at).toISOString().slice(0, 10);
  const name = `GEO인용_${clientName}_${date}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
