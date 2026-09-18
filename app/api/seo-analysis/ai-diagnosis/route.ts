import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AuditResult, BusinessBrief } from "@/features/seo-analysis/types";
import { buildPayload, describeApiError, diagnose } from "@/features/seo-analysis/diagnose";

export const maxDuration = 300;

// AI 진단 — 인증·입력 검증 후 features/seo-analysis/diagnose.ts에 위임
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const { audit, brief } = (await req.json()) as { audit?: AuditResult; brief?: BusinessBrief | null };
  if (!audit || !Array.isArray(audit.findings)) {
    return NextResponse.json({ error: "먼저 기술 진단을 실행해 주세요." }, { status: 400 });
  }

  try {
    const parsed = await diagnose(buildPayload(audit, brief ?? null));
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: describeApiError(e) }, { status: 500 });
  }
}
