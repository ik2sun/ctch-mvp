import { NextResponse } from "next/server";
import { sweepGeoAuto } from "@/features/geo-citation/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GEO 인용 자동 측정 — 매시간 호출되어 자동 기간 안에서 주기가 된 광고주만 새 회차를 만들고, 끝나지 않은 회차를 이어서 처리한다.
// 로컬 상주 배포에서는 instrumentation.ts 타이머가 같은 로직을 호출한다.
export async function GET(req: Request) {
  const startedAt = Date.now();
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sweepGeoAuto(startedAt + 280_000));
}
