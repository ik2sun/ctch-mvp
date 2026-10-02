// 캠페인 매니저 도구 — 시장·경쟁 신호(CTCH에 이미 쌓인 데이터). 서버 전용.
// 경쟁사 키워드 순위 추적(네이버 파워링크), 브랜드 키워드 침해 감지, 광고주 시장 메모. 웹 검색은 대화의 web_search가 맡는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PmSettings } from "./types";

type Ad = { rank?: number; domain?: string; title?: string };

export async function marketSignals(supabase: SupabaseClient, clientId: string, ownerId: string, s: PmSettings, industry: string | null): Promise<string> {
  const out: string[] = [];
  out.push(`업종: ${industry || "(미입력)"}`);
  out.push(`경쟁사(설정): ${s.competitors.length ? s.competitors.join(", ") : "(미입력 — 캠페인 매니저 설정에서 추가)"}`);
  if (s.marketNotes) out.push(`시장 메모: ${s.marketNotes}`);

  // 경쟁사 키워드 — 키워드별 최근 체크 1건
  const { data: kws } = await supabase.from("competitor_keywords").select("id, keyword, target_domain").eq("client_id", clientId).eq("user_id", ownerId).limit(30);
  if (kws?.length) {
    out.push("", "## 네이버 파워링크 순위 추적(최근 체크)");
    for (const k of kws) {
      const { data: chk } = await supabase.from("competitor_rank_checks").select("device, matched_rank, ads_snapshot, checked_at").eq("keyword_id", k.id).order("checked_at", { ascending: false }).limit(2);
      if (!chk?.length) {
        out.push(`- '${k.keyword}' (${k.target_domain}): 체크 기록 없음`);
        continue;
      }
      for (const c of chk) {
        const ads = ((c.ads_snapshot as Ad[]) ?? []).slice(0, 5).map((a) => `${a.rank ?? "?"}.${a.domain ?? ""}`).join(" ");
        out.push(`- '${k.keyword}' ${c.device} ${String(c.checked_at).slice(0, 10)}: ${k.target_domain} ${c.matched_rank ? `${c.matched_rank}위` : "순위 밖"} · 상위 광고 ${ads || "—"}`);
      }
    }
  }

  // 브랜드 키워드 침해 — 최근 알림
  const { data: bks } = await supabase.from("brand_keywords").select("id, keyword, owner_domain").eq("client_id", clientId).eq("user_id", ownerId).limit(30);
  if (bks?.length) {
    const ids = bks.map((b) => b.id);
    const { data: alerts } = await supabase.from("brand_keyword_alerts").select("keyword_id, device, infringing_domains, sent_at").in("keyword_id", ids).order("sent_at", { ascending: false }).limit(15);
    out.push("", "## 브랜드 키워드 침해 감지(최근)");
    if (!alerts?.length) out.push(`- 감시 키워드 ${bks.map((b) => b.keyword).join(", ")}: 최근 침해 알림 없음`);
    for (const a of alerts ?? []) {
      const kw = bks.find((b) => b.id === a.keyword_id)?.keyword ?? "?";
      out.push(`- ${String(a.sent_at).slice(0, 10)} '${kw}' ${a.device}: ${(a.infringing_domains as string[]).join(", ")}`);
    }
  }
  if (!kws?.length && !bks?.length) out.push("", "(CTCH 경쟁사·브랜드 키워드 모니터링 미설정 — 시장 동향은 웹 검색으로 확인)");
  return out.join("\n");
}
