// 최신 정보 카드 — 서버 전용. 시드(코드) + DB(perf_briefs, "최신 정보 업데이트"·주간 크론이 쌓음)를 합쳐 최신순으로.
// 갱신: Claude + 웹 검색으로 최근 소식을 찾아 출처 URL이 있는 항목만 JSON으로 받는다. 이미 있는 URL은 건너뛴다.
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRIEF_SEED } from "./briefSeed";
import { PM_MODEL } from "./types";
import type { Brief, BriefKind, BriefPlatform } from "./types";

const PLATFORMS: BriefPlatform[] = ["meta", "google", "naver", "kakao", "measurement", "industry"];
const KINDS: BriefKind[] = ["update", "seminar", "guide"];

type Row = { id: string; platform: string; kind: string; title: string; date: string; summary: string; takeaways: string[] | null; source_name: string; source_url: string };

export async function listBriefs(): Promise<{ briefs: Brief[]; dbReady: boolean; lastRefreshed: string | null }> {
  let rows: Brief[] = [];
  let dbReady = true;
  let lastRefreshed: string | null = null;
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("perf_briefs").select("*").order("date", { ascending: false }).limit(200);
    if (error) throw error;
    rows = (data as (Row & { created_at: string })[]).map(fromRow);
    lastRefreshed = (data as { created_at: string }[]).reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null);
  } catch {
    dbReady = false; // 0019 마이그레이션 전 — 시드만
  }
  const seen = new Set<string>();
  const all = [...rows, ...BRIEF_SEED].filter((b) => {
    const k = normUrl(b.source.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  all.sort((a, b) => b.date.localeCompare(a.date));
  return { briefs: all, dbReady, lastRefreshed };
}

function fromRow(r: Row): Brief {
  return {
    id: r.id,
    platform: (PLATFORMS.includes(r.platform as BriefPlatform) ? r.platform : "industry") as BriefPlatform,
    kind: (KINDS.includes(r.kind as BriefKind) ? r.kind : "update") as BriefKind,
    title: r.title,
    date: r.date,
    summary: r.summary,
    takeaways: r.takeaways ?? [],
    source: { name: r.source_name, url: r.source_url },
  };
}

function normUrl(u: string) {
  return u.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

const REFRESH_PROMPT = (today: string, known: string[]) => `오늘은 ${today}다. 한국 퍼포먼스 마케팅 대행사가 알아야 할 최근(대략 최근 60일) 광고 플랫폼 소식을 웹 검색으로 찾아라.
범위: 메타(Advantage+·광고 시스템·측정·크리에이티브 AI), 구글(검색·PMax·Demand Gen·유튜브·GA4·Marketing Live 등 행사), 네이버(검색광고·GFA·쇼핑·AI 광고 상품·세미나), 카카오(카카오모먼트·비즈보드·카카오톡 광고·세미나), 측정(MMM·증분·개인정보 정책), 업계 리포트.
공식 블로그·보도자료·공식 행사 페이지·신뢰할 만한 업계 매체만. 직접 확인한 페이지만 쓰고 추측하지 마라.
이미 있는 URL(제외): ${known.slice(0, 80).join(" ")}

마지막에 아래 형식의 JSON 배열만 \`\`\`json 코드 블록으로 출력하라(최대 10개, 새 항목이 없으면 []):
[{"platform":"meta|google|naver|kakao|measurement|industry","kind":"update|seminar|guide","title":"한국어 제목","date":"YYYY-MM-DD","summary":"한국어 2~3문장","takeaways":["국내 마케터가 바로 할 일 1~3개"],"source":{"name":"출처 이름","url":"https://..."}}]`;

export async function refreshBriefs(): Promise<{ added: number; items: Brief[] }> {
  const { briefs } = await listBriefs();
  const known = new Set(briefs.map((b) => normUrl(b.source.url)));
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 280_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: REFRESH_PROMPT(new Date().toISOString().slice(0, 10), [...known]) }];
  let text = "";
  for (let i = 0; i < 4; i++) {
    const msg = await client.beta.messages
      .stream({
        model: PM_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as never, // 거절 시 분류별 자동 대체 모델(API는 지원, SDK 0.110 타입은 배열형만 선언)
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
        messages,
      })
      .finalMessage();
    text += msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const json = text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("최신 정보 응답을 해석하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const items: Brief[] = (Array.isArray(parsed) ? parsed : [])
    .map((x: Record<string, unknown>, i): Brief | null => {
      const src = (x.source ?? {}) as { name?: string; url?: string };
      const url = String(src.url ?? "");
      const date = String(x.date ?? "");
      if (!/^https?:\/\//.test(url) || !/^\d{4}-\d{2}(-\d{2})?$/.test(date) || !x.title || !x.summary) return null;
      if (known.has(normUrl(url))) return null;
      return {
        id: `auto-${date}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        platform: (PLATFORMS.includes(x.platform as BriefPlatform) ? x.platform : "industry") as BriefPlatform,
        kind: (KINDS.includes(x.kind as BriefKind) ? x.kind : "update") as BriefKind,
        title: String(x.title).slice(0, 200),
        date,
        summary: String(x.summary).slice(0, 600),
        takeaways: (Array.isArray(x.takeaways) ? x.takeaways : []).map(String).slice(0, 3),
        source: { name: String(src.name ?? new URL(url).hostname), url },
      };
    })
    .filter((b): b is Brief => b != null);

  if (items.length) {
    const db = createAdminClient();
    const { error } = await db.from("perf_briefs").insert(
      items.map((b) => ({ id: b.id, platform: b.platform, kind: b.kind, title: b.title, date: b.date, summary: b.summary, takeaways: b.takeaways, source_name: b.source.name, source_url: b.source.url })),
    );
    if (error) throw new Error(`저장 실패: ${error.message} (0019 마이그레이션을 실행했는지 확인해 주세요)`);
  }
  return { added: items.length, items };
}
