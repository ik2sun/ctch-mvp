import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describeApiError, generateScript } from "@/features/creative/generateScript";
import { EMPTY_BRIEF, durationPreset, type ShortFormBrief } from "@/features/creative/shortFormScript";
import { TEMPLATE_BY_ID } from "@/features/creative/shortFormTemplates";

export const maxDuration = 120;

// 숏폼 스크립트 생성 — 인증·검증 후 features/creative/generateScript.ts 에 위임
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 없어요." }, { status: 500 });
  }

  const body = (await req.json()) as {
    templateId?: string;
    brief?: Partial<ShortFormBrief>;
    clientId?: string | null;
    voice?: string;
    durationSec?: number;
  };
  const template = body.templateId ? TEMPLATE_BY_ID[body.templateId] : null;
  if (!template || !template.scripted) {
    return NextResponse.json({ error: "스크립트를 생성할 수 있는 템플릿이 아니에요." }, { status: 400 });
  }
  const brief: ShortFormBrief = { ...EMPTY_BRIEF, ...(body.brief ?? {}) };
  for (const k of Object.keys(brief) as (keyof ShortFormBrief)[]) brief[k] = String(brief[k] ?? "").trim().slice(0, 1000);
  if (!brief.product || !brief.benefit) {
    return NextResponse.json({ error: "제품·서비스와 핵심 강점은 꼭 입력해 주세요." }, { status: 400 });
  }

  let clientName: string | null = null;
  let clientIndustry: string | null = null;
  if (body.clientId) {
    const { data } = await supabase.from("clients").select("name, industry").eq("id", body.clientId).maybeSingle();
    clientName = data?.name ?? null;
    clientIndustry = data?.industry ?? null;
  }

  try {
    const script = await generateScript({
      brief,
      kind: template.kind,
      preset: durationPreset(body.durationSec),
      voice: body.voice,
      clientName,
      clientIndustry,
    });
    return NextResponse.json({ script });
  } catch (e) {
    return NextResponse.json({ error: describeApiError(e) }, { status: 500 });
  }
}
