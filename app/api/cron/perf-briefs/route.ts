import { NextResponse } from "next/server";
import { refreshBriefs } from "@/features/perf-manager/briefs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 퍼포먼스 매니저 최신 정보 — 주 1회(월 09:00 KST) 웹 검색으로 새 소식을 쌓는다. 끄려면 vercel.json에서 이 항목을 지운다.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await refreshBriefs();
    return NextResponse.json({ added: r.added });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "실패" }, { status: 500 });
  }
}
