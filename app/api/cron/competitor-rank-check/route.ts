import { NextResponse } from "next/server";
import { sweepDueKeywordChecks } from "@/lib/naver-serp/autoCheckSweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron 등 외부 스케줄러가 호출하기 위한 엔드포인트(vercel.json 참고).
// 로컬 전용 배포에서는 대신 instrumentation.ts의 상주 타이머가 같은 로직을 직접 호출한다.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await sweepDueKeywordChecks();
  return NextResponse.json(summary);
}
