import { createClient } from "@/lib/supabase/client";
import type { Device, PowerLinkAd } from "@/lib/naver-serp/rankChecker";
import { ALL_SECTIONS, type CollectSection, type ShoppingSnapshot } from "@/lib/naver-serp/shopping";

// null = 수동(자동 체크 안 함), 그 외에는 시간 단위 주기
export type CheckIntervalHours = 1 | 6 | 12 | 24 | 168 | null;

export type CompetitorKeyword = {
  id: string;
  client_id: string;
  keyword: string;
  target_domain: string | null; // 선택 — 비우면 순위 매칭 없이 수집만
  target_mall?: string | null; // 가격비교·플러스 스토어에서 찾을 몰·브랜드 이름(0035)
  auto_paused?: boolean; // 주기는 두고 자동 체크만 멈춤(0035)
  collect_sections?: CollectSection[]; // 수집할 영역(0036, 없으면 전부)
  memo: string | null;
  check_interval_hours: CheckIntervalHours;
  created_at: string;
};

export type RankCheck = {
  id: string;
  keyword_id: string;
  device: Device;
  matched_rank: number | null;
  ads_snapshot: PowerLinkAd[];
  shopping_snapshot?: ShoppingSnapshot | null; // 0035 이후 체크부터
  checked_at: string;
};

const supabase = createClient();

export async function listKeywords(clientId: string): Promise<CompetitorKeyword[]> {
  const { data } = await supabase
    .from("competitor_keywords")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function addKeyword(input: {
  clientId: string;
  keyword: string;
  targetDomain: string | null;
  targetMall?: string | null;
  collectSections?: CollectSection[];
  memo?: string | null;
  checkIntervalHours?: CheckIntervalHours;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const row: Record<string, unknown> = {
    user_id: user.id,
    client_id: input.clientId,
    keyword: input.keyword,
    target_domain: input.targetDomain || null,
    memo: input.memo ?? null,
    check_interval_hours: input.checkIntervalHours ?? null,
  };
  // 몰 이름 칸은 0035 이후에만 있다 — 비었으면 아예 안 보내 마이그레이션 전에도 추가되게
  if (input.targetMall) row.target_mall = input.targetMall;
  // 전부 수집(기본값)이면 안 보내 0036 마이그레이션 전에도 추가되게
  if (input.collectSections && input.collectSections.length < ALL_SECTIONS.length) row.collect_sections = input.collectSections;
  return supabase.from("competitor_keywords").insert(row).select("*").single();
}

export async function deleteKeywords(ids: string[]) {
  return supabase.from("competitor_keywords").delete().in("id", ids);
}

export async function updateCheckInterval(ids: string[], hours: CheckIntervalHours) {
  return supabase.from("competitor_keywords").update({ check_interval_hours: hours }).in("id", ids);
}

export async function updateCollectSections(ids: string[], sections: CollectSection[]) {
  return supabase.from("competitor_keywords").update({ collect_sections: sections }).in("id", ids);
}

export async function setAutoPaused(ids: string[], paused: boolean) {
  return supabase.from("competitor_keywords").update({ auto_paused: paused }).in("id", ids);
}

// 각 키워드별 최신 체크 결과(기기별 1건)만 모아서 반환한다.
// 1시간 주기면 이력이 금방 쌓이고 쇼핑 결과도 커서, 전체 이력이 아니라 키워드마다 최근 몇 건만 읽는다.
export async function listLatestChecks(keywordIds: string[]): Promise<Record<string, Partial<Record<Device, RankCheck>>>> {
  const result: Record<string, Partial<Record<Device, RankCheck>>> = {};
  await Promise.all(
    keywordIds.map(async (id) => {
      const { data } = await supabase
        .from("competitor_rank_checks")
        .select("*")
        .eq("keyword_id", id)
        .order("checked_at", { ascending: false })
        .limit(4);
      const bucket: Partial<Record<Device, RankCheck>> = {};
      for (const row of (data ?? []) as RankCheck[]) {
        if (!bucket[row.device]) bucket[row.device] = row;
      }
      result[id] = bucket;
    }),
  );
  return result;
}
