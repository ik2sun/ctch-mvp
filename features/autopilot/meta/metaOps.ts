// 캠페인 오토파일럿 · 메타 — 광고계정 읽기와 생성 호출(서버 전용). 본문 모양은 model.ts가 만든다.
import { META_API_VERSION, MetaGraphError, graphAll, graphGet, graphPost, metaAppUsage, num } from "@/lib/meta/graph";
import { attributionKeyOf, type MetaAccountCtx, type MetaAdSetLite, type MetaAudience, type MetaCampaignLite, type MetaPage, type MetaPixel } from "./model";

// 소수점 없는 통화(메타 금액 단위 = 1). 그 밖은 1/100 단위 — media-mix/sync.ts와 같은 표
const ZERO_DECIMAL = new Set(["KRW", "JPY", "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "PYG", "TWD", "VND"]);

const CACHE = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as T;
  const v = await fn();
  CACHE.set(key, { at: Date.now(), v });
  return v;
}
export const dropCache = (prefix: string) => [...CACHE.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => CACHE.delete(k));

type RawCampaign = { id: string; name: string; objective: string; effective_status: string; daily_budget?: string; lifetime_budget?: string; bid_strategy?: string; buying_type?: string };

// 화면 첫 로드 한 번 — 계정·페이지(+연결 인스타)·픽셀·캠페인(꺼진 것 포함, 보관·삭제 제외)
export async function loadAccount(act: string, token: string, fresh = false): Promise<MetaAccountCtx> {
  if (fresh) dropCache(act);
  return cached(`${act}:account`, 5 * 60_000, async () => {
    const [acc, pages, pixels, camps] = await Promise.all([
      graphGet<{ name: string; currency: string; timezone_name: string; account_status: number; min_daily_budget?: number }>(act, { fields: "name,currency,timezone_name,account_status,min_daily_budget" }, token),
      graphAll<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }>(`${act}/promote_pages`, { fields: "id,name,instagram_business_account{id,username}", limit: "100" }, token, 3),
      graphAll<{ id: string; name: string; last_fired_time?: string }>(`${act}/adspixels`, { fields: "id,name,last_fired_time", limit: "100" }, token, 2),
      graphAll<RawCampaign>(
        `${act}/campaigns`,
        { fields: "id,name,objective,effective_status,daily_budget,lifetime_budget,bid_strategy,buying_type", effective_status: JSON.stringify(["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"]), limit: "200" },
        token,
        5,
      ),
    ]);
    const offset = ZERO_DECIMAL.has(acc.currency) ? 1 : 100;
    const page: MetaPage[] = pages.map((p) => ({ id: p.id, name: p.name, igId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null }));
    const px: MetaPixel[] = pixels
      .map((p) => ({ id: p.id, name: p.name, lastFired: p.last_fired_time ?? null }))
      .sort((a, b) => (b.lastFired ?? "").localeCompare(a.lastFired ?? ""));
    const campaigns: MetaCampaignLite[] = camps.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.effective_status,
      dailyBudget: num(c.daily_budget) > 0 ? num(c.daily_budget) / offset : null,
      lifetimeBudget: num(c.lifetime_budget) > 0 ? num(c.lifetime_budget) / offset : null,
      bidStrategy: c.bid_strategy ?? null,
      buyingType: c.buying_type ?? "AUCTION",
    }));
    return {
      act,
      name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone_name,
      accountStatus: acc.account_status,
      minDailyBudget: Math.ceil(num(acc.min_daily_budget) / offset) || 1000,
      offset,
      pages: page,
      pixels: px,
      campaigns,
      appUsage: metaAppUsage(),
    };
  });
}

type RawAdSet = {
  id: string;
  name: string;
  effective_status: string;
  optimization_goal: string;
  daily_budget?: string;
  lifetime_budget?: string;
  promoted_object?: { custom_event_type?: string };
  start_time?: string;
  end_time?: string;
  attribution_spec?: unknown;
  targeting?: {
    custom_audiences?: { id: string; name: string }[];
    excluded_custom_audiences?: { id: string; name: string }[];
    age_min?: number;
    age_max?: number;
    genders?: number[];
    publisher_platforms?: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    targeting_automation?: { advantage_audience?: number };
  };
};

function placementSummary(t: RawAdSet["targeting"]) {
  if (!t?.publisher_platforms?.length) return "Advantage+ 게재 위치";
  const n = (t.facebook_positions?.length ?? 0) + (t.instagram_positions?.length ?? 0);
  return `${t.publisher_platforms.map((p) => ({ facebook: "FB", instagram: "IG", audience_network: "AN", messenger: "메신저" })[p] ?? p).join("·")} ${n}곳`;
}

export async function listAdSets(act: string, campaignId: string, token: string, offset: number): Promise<MetaAdSetLite[]> {
  return cached(`${act}:adsets:${campaignId}`, 60_000, async () => {
    const rows = await graphAll<RawAdSet>(
      `${campaignId}/adsets`,
      { fields: "id,name,effective_status,optimization_goal,daily_budget,lifetime_budget,promoted_object,start_time,end_time,attribution_spec,targeting{age_min,age_max,genders,publisher_platforms,facebook_positions,instagram_positions,targeting_automation,custom_audiences,excluded_custom_audiences}", effective_status: JSON.stringify(["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED"]), limit: "200" },
      token,
      5,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.effective_status,
      optimizationGoal: r.optimization_goal,
      dailyBudget: num(r.daily_budget) > 0 ? num(r.daily_budget) / offset : null,
      lifetimeBudget: num(r.lifetime_budget) > 0 ? num(r.lifetime_budget) / offset : null,
      ageMin: r.targeting?.age_min ?? null,
      ageMax: r.targeting?.age_max ?? null,
      genders: r.targeting?.genders ?? [],
      advantageAudience: r.targeting?.targeting_automation?.advantage_audience === 1,
      pixelEvent: r.promoted_object?.custom_event_type ?? null,
      placements: placementSummary(r.targeting),
      startTime: r.start_time ?? null,
      endTime: r.end_time ?? null,
      attribution: attributionKeyOf(r.attribution_spec),
      includeAudiences: (r.targeting?.custom_audiences ?? []).map((a) => ({ id: a.id, name: a.name })),
      excludeAudiences: (r.targeting?.excluded_custom_audiences ?? []).map((a) => ({ id: a.id, name: a.name })),
    }));
  });
}

// 광고세트가 캠페인 소속인지 + 캠페인 목표 — 기존 세트에 광고를 넣을 때·복사할 때 확인
export async function getAdSet(id: string, token: string) {
  return graphGet<{ id: string; name: string; campaign_id: string; account_id: string; targeting?: Record<string, unknown>; attribution_spec?: unknown }>(id, { fields: "id,name,campaign_id,account_id,targeting,attribution_spec" }, token);
}
export async function getCampaign(id: string, token: string) {
  return graphGet<{ id: string; name: string; objective: string; account_id: string; daily_budget?: string; lifetime_budget?: string }>(id, { fields: "id,name,objective,account_id,daily_budget,lifetime_budget" }, token);
}

// 맞춤·유사 타겟 목록(포함·제외 타겟 선택용) — 10분 캐시. ok = 메타가 '사용할 수 있음'(delivery_status 200)
export async function listAudiences(act: string, token: string): Promise<MetaAudience[]> {
  return cached(`${act}:audiences`, 10 * 60_000, async () => {
    const rows = await graphAll<{ id: string; name: string; subtype?: string; approximate_count_lower_bound?: number; delivery_status?: { code?: number } }>(
      `${act}/customaudiences`,
      { fields: "id,name,subtype,approximate_count_lower_bound,delivery_status", limit: "200" },
      token,
      5,
    );
    return rows
      .map((r) => ({ id: r.id, name: r.name, subtype: r.subtype ?? "", size: r.approximate_count_lower_bound && r.approximate_count_lower_bound > 0 ? r.approximate_count_lower_bound : null, ok: (r.delivery_status?.code ?? 200) === 200 }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  });
}

export async function createCampaign(act: string, body: Record<string, unknown>, token: string, validateOnly = false) {
  return graphPost<{ id?: string; success?: boolean }>(`${act}/campaigns`, body, token, { validateOnly });
}
export async function createAdSet(act: string, body: Record<string, unknown>, token: string, validateOnly = false) {
  return graphPost<{ id?: string; success?: boolean }>(`${act}/adsets`, body, token, { validateOnly });
}
// 광고세트 설정 복사 — 광고는 빼고(deep_copy=false) 세트만, 대상 캠페인으로. 끈 상태로 복사한 뒤 이름·예산·기간·연령을 덮는다
export async function copyAdSet(sourceId: string, campaignId: string, token: string) {
  const r = await graphPost<{ copied_adset_id?: string; ad_object_ids?: { copied_id: string }[] }>(`${sourceId}/copies`, { campaign_id: campaignId, deep_copy: false, status_option: "PAUSED" }, token);
  const id = r.copied_adset_id ?? r.ad_object_ids?.[0]?.copied_id;
  if (!id) throw new Error("광고세트 복사 결과에 새 세트 ID가 없어요");
  return id;
}
export async function updateObject(id: string, body: Record<string, unknown>, token: string) {
  return graphPost<{ success?: boolean }>(id, body, token);
}

// 이미지 — multipart 파일로 올려 라이브러리에 원래 파일명이 남게(base64 bytes로 올리면 이름이 전부 'bytes'). 응답 { images: { <파일명>: { hash, url } } }
export async function uploadImage(act: string, file: Blob, fileName: string, token: string) {
  const fd = new FormData();
  fd.set("access_token", token);
  fd.set("filename", file, fileName.replace(/[\/:*?"<>|]/g, "_").slice(0, 120) || "image.jpg");
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${act}/adimages`, { method: "POST", body: fd, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new MetaGraphError([json.error.error_user_title, json.error.error_user_msg].filter(Boolean).join(" — ") || json.error.message || "이미지 업로드 실패", json.error.code);
  const img = Object.values((json.images ?? {}) as Record<string, { hash: string; url?: string }>)[0];
  if (!img?.hash) throw new Error("이미지 업로드 결과에 해시가 없어요");
  return img;
}
// 영상 — 메타가 공개 URL(file_url)에서 직접 받아 간다. 처리가 끝나야(status.video_status=ready) 소재에 쓸 수 있음
export async function createVideo(act: string, fileUrl: string, name: string, token: string) {
  const r = await graphPost<{ id?: string }>(`${act}/advideos`, { file_url: fileUrl, name: name.slice(0, 100) }, token);
  if (!r.id) throw new Error("영상 등록 결과에 ID가 없어요");
  return r.id;
}
export async function videoStatus(id: string, token: string) {
  const r = await graphGet<{ status?: { video_status?: string; processing_progress?: number; processing_phase?: { status?: string; errors?: { message: string }[] } } }>(id, { fields: "status" }, token);
  const s = r.status ?? {};
  const err = s.processing_phase?.errors?.[0]?.message ?? (s.video_status === "error" ? "영상 처리 실패" : null);
  return { status: s.video_status ?? "processing", progress: s.processing_progress ?? 0, error: err };
}

export async function createCreative(act: string, body: Record<string, unknown>, token: string, validateOnly = false) {
  return graphPost<{ id?: string; success?: boolean }>(`${act}/adcreatives`, body, token, { validateOnly });
}
export async function createAd(act: string, body: Record<string, unknown>, token: string, validateOnly = false) {
  return graphPost<{ id?: string; success?: boolean }>(`${act}/ads`, body, token, { validateOnly });
}
