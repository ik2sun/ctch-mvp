import { createClient } from "@/lib/supabase/server";
import { runChat } from "@/features/perf-manager/chat";
import { listBriefs } from "@/features/perf-manager/briefs";
import type { ChatEvent, ChatTurn } from "@/features/perf-manager/types";

// 퍼포먼스 매니저 대화 — NDJSON 스트림(한 줄에 이벤트 하나). 대화는 저장하지 않는다.
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았어요." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as { turns?: ChatTurn[]; context?: string | null; webSearch?: boolean } | null;
  const turns = (body?.turns ?? [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, 20000) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return Response.json({ error: "질문이 없어요." }, { status: 400 });

  const { briefs } = await listBriefs();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runChat({ turns, context: body?.context?.slice(0, 12000) ?? null, webSearch: !!body?.webSearch, briefs }, emit, req.signal);
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
