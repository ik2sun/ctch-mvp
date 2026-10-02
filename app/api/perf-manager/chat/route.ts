import { NextResponse } from "next/server";
import { runChat } from "@/features/perf-manager/chat";
import { listBriefs } from "@/features/perf-manager/briefs";
import { listMailboxes, loadMemory, loadSettings, mailStats, peopleAsMembers, requireClientAccess } from "@/features/perf-manager/store";
import { memoryToText } from "@/features/perf-manager/memory";
import { EMPTY_SETTINGS, type ChatEvent, type ChatTurn } from "@/features/perf-manager/types";

// 캠페인 매니저 대화 — NDJSON 스트림(한 줄에 이벤트 하나). 대화는 저장하지 않는다.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: string; turns?: ChatTurn[]; webSearch?: boolean } | null;
  const access = await requireClientAccess(body?.clientId);
  if (access instanceof NextResponse) return access;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았어요." }, { status: 500 });

  const turns = (body?.turns ?? [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, 20000) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return Response.json({ error: "질문이 없어요." }, { status: 400 });

  const clientId = access.client.id;
  // 캠페인 매니저 테이블(0022)이 없어도 대화는 되게 — 메일·담당자 없이 성과·시장 도구만
  const safe = async <T,>(p: Promise<T>, d: T) => p.catch(() => d);
  const [{ briefs }, settings, linked, mem, stats] = await Promise.all([
    listBriefs(),
    safe(loadSettings(clientId), { ...EMPTY_SETTINGS }),
    safe(listMailboxes(access.user.id), []),
    safe(loadMemory(clientId), null),
    safe(mailStats(clientId), { count: 0, lastAt: null, byMailbox: [] }),
  ]);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runChat(
          {
            turns,
            webSearch: !!body?.webSearch,
            briefs,
            supabase: access.supabase,
            ownerId: access.ownerId,
            client: access.client,
            settings,
            owners: peopleAsMembers(settings),
            mailboxes: [...new Set([...linked.map((m) => m.email), ...stats.byMailbox.map((b) => b.email)])],
            memoryText: mem ? memoryToText(mem.memory) : null,
            memoryBuiltAt: mem?.meta.builtAt ?? null,
            mailCount: stats.count,
          },
          emit,
          req.signal,
        );
        emit({ type: "done" });
      } catch (e) {
        if (!req.signal.aborted) emit({ type: "error", message: e instanceof Error ? e.message : "답변 중 오류가 발생했어요." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
