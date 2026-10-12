// 자동 리포트 일일 발송 — Vercel 크론(vercel.json, 매일 23:00 UTC = 08:00 KST). 오늘 보내는 날인 리포트만 생성·발송
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generate, getReport, logRun, migrationHint, sendReport } from "@/features/auto-report/store";
import { isDue, kstToday } from "@/features/auto-report/period";
import { DEFAULT_SCHEDULE, type Schedule } from "@/features/auto-report/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = kstToday();
  const t0 = Date.now();
  const { data, error } = await createAdminClient().from("auto_reports").select("id, schedule, recipients, last_run_at").eq("enabled", true);
  if (error) return NextResponse.json({ error: migrationHint(error) ?? error.message }, { status: 500 });
  const due = (data ?? []).filter((r) => {
    const s = { ...DEFAULT_SCHEDULE, ...(r.schedule as Schedule) };
    // 같은 날 두 번 보내지 않게(크론 재시도·수동 실행)
    const ranToday = r.last_run_at && kstToday(new Date(r.last_run_at)) === today;
    return isDue(s, today) && (r.recipients ?? []).length && !ranToday;
  });
  const done: { id: string; status: string; error?: string }[] = [];
  for (const r of due) {
    if (Date.now() - t0 > 240_000) {
      done.push({ id: r.id, status: "skipped", error: "시간 초과로 다음 실행으로 미룸" });
      continue;
    }
    const report = await getReport(r.id);
    if (!report) continue;
    try {
      const g = await generate(report, today);
      await sendReport(report, g);
      await logRun({ report, trigger: "cron", status: "sent", g, sentTo: report.recipients, by: "cron" });
      done.push({ id: r.id, status: "sent" });
    } catch (e) {
      const msg = (e as Error).message;
      await logRun({ report, trigger: "cron", status: "error", error: msg, sentTo: report.recipients, by: "cron" }).catch(() => {});
      done.push({ id: r.id, status: "error", error: msg });
    }
  }
  return NextResponse.json({ today, due: due.length, done });
}
