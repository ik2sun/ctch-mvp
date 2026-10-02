import { NextResponse } from "next/server";
import { loadBlock, loadSettings, mailStats, peopleAsMembers, removeMyMails, requireClientAccess } from "@/features/perf-manager/store";
import { syncClientMail } from "@/features/perf-manager/mailSync";
import { buildMemory } from "@/features/perf-manager/memory";
import { buildQuery } from "@/features/perf-manager/mailText";

// 광고주 메일
//  action=sync: Gmail 연동에 동의한 담당자 메일함 전체에서 이 프로젝트 조건에 맞는 메일 수집(민감 메일 제외, API 비용 없음)
//  action=removeMine: 이 광고주에서 내 메일함으로 들어온 메일 지우기
//  action=analyze: 모은 메일을 AI로 정리(Claude 호출 — 메일 120건 기준 약 $0.3~0.6)
// (대안) Claude Code Gmail MCP 가져오기는 scripts/pm-mail.ts — 같은 저장 로직
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: string; action?: string } | null;
  const access = await requireClientAccess(body?.clientId);
  if (access instanceof NextResponse) return access;
  const clientId = access.client.id;
  try {
    if (body?.action === "removeMine") {
      if (!access.user.email) return NextResponse.json({ error: "로그인 이메일을 확인할 수 없어요." }, { status: 400 });
      const r = await removeMyMails(clientId, access.user.email);
      return NextResponse.json({ ...r, stats: await mailStats(clientId) });
    }
    if (body?.action === "sync") {
      const settings = await loadSettings(clientId);
      if (!buildQuery(settings, "2000-01-01", await loadBlock())) return NextResponse.json({ error: "수집 조건(특정인·키워드)을 먼저 저장하세요." }, { status: 400 });
      const results = await syncClientMail(clientId, settings);
      if (!results.length) return NextResponse.json({ error: "Gmail 연동에 동의한 담당자가 없어요. 왼쪽 '내 Gmail 연동 동의'를 먼저 해 주세요." }, { status: 400 });
      return NextResponse.json({ results, stats: await mailStats(clientId) });
    }
    if (body?.action === "analyze") {
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았어요." }, { status: 500 });
      const owners = peopleAsMembers(await loadSettings(clientId));
      const r = await buildMemory(clientId, access.client.name, owners, access.user.email ?? "");
      return NextResponse.json({ memory: r.memory, memoryMeta: { builtAt: new Date().toISOString(), emailCount: r.emailCount, lastEmailAt: r.lastEmailAt, builtBy: access.user.email ?? null } });
    }
    return NextResponse.json({ error: "action은 sync·removeMine·analyze예요." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "처리 중 오류가 발생했어요." }, { status: 500 });
  }
}
