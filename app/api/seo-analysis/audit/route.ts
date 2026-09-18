import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAudit } from "@/features/seo-analysis/audit";

export const maxDuration = 60;

// 대상 URL을 AI 크롤러 시점(JS 미실행)으로 가져와 SEO·AEO·GEO 기술 진단을 돌린다.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  if (!body.url || !body.url.trim()) return NextResponse.json({ error: "진단할 URL을 입력해 주세요." }, { status: 400 });

  try {
    const result = await runAudit(body.url);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "진단 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
