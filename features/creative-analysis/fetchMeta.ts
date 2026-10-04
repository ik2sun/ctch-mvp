import { actOf, graphAll, graphByIds, graphByIdsTolerant, num, pickAction, PURCHASE_TYPES } from "@/lib/meta/graph";
import type { AdsetSetting, CampaignSetting, CreativeAnalysisRes, CreativeRow, ObjectiveGroup } from "@/features/creative-analysis/types";
import type { DailyPoint } from "@/features/ai-report/metaTypes";

// 소재 분석(메타) 조회 — 서버 전용. 기간 내 집행된 모든 광고(페이지 끝까지) + 소재 정보(썸네일·문구·미리보기) + 광고세트 타겟팅 + 캠페인 설정.
// 일별은 광고비 상위 40개 소재만(피로도용). 읽기 전용, 비용 없음.

const DAILY_TOP = 40;
const AD_FIELDS =
  "name,effective_status,created_time,preview_shareable_link,creative{id,object_type,image_url,image_hash,video_id,title,body,call_to_action_type,url_tags,asset_feed_spec{bodies,titles,images,videos,link_urls{website_url}},object_story_spec{link_data{message,name,link,image_hash,child_attachments},video_data{message,title,video_id,call_to_action{value{link}}}}}";

// UTM — 메타는 소재의 url_tags("utm_source=…&utm_campaign=…")로 붙이거나 랜딩 URL에 직접 넣는다. 둘 다 보고 url_tags 우선.
function utmOf(ad: Raw | undefined): CreativeRow["utm"] {
  const c = (ad?.creative ?? {}) as Raw;
  const oss = (c.object_story_spec ?? {}) as { link_data?: { link?: string }; video_data?: { call_to_action?: { value?: { link?: string } } } };
  const afs = (c.asset_feed_spec ?? {}) as { link_urls?: { website_url?: string }[] };
  const params = new URLSearchParams();
  const link = oss.link_data?.link ?? oss.video_data?.call_to_action?.value?.link ?? afs.link_urls?.[0]?.website_url ?? "";
  try {
    if (link) new URL(link).searchParams.forEach((v, k) => params.set(k.toLowerCase(), v));
  } catch {
    /* 잘못된 URL */
  }
  const tags = typeof c.url_tags === "string" ? c.url_tags.replace(/^[?&]/, "") : "";
  if (tags) new URLSearchParams(tags).forEach((v, k) => params.set(k.toLowerCase(), v));
  const pick = (k: string) => {
    const v = params.get(k)?.trim();
    return v && !/^\{\{.*\}\}$/.test(v) ? v : null; // {{campaign.name}} 같은 동적 매크로는 값이 아니라 제외
  };
  const utm = { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign"), content: pick("utm_content") };
  return utm.source || utm.medium || utm.campaign || utm.content ? utm : null;
}

// 서버 메모리 캐시(같은 프로세스) — 원본 크기는 바뀌지 않고, 썸네일 URL은 수일 유효 → 다시 열 때 메타 호출을 줄인다
const SIZE_CACHE = new Map<string, { w: number; h: number }>(); // "h:<hash>" | "v:<videoId>"
const THUMB_CACHE = new Map<string, { url: string; at: number }>(); // "<creativeId>:<ratio>"
const THUMB_TTL_MS = 12 * 60 * 60 * 1000;

// 썸네일 비율 — 메타는 thumbnail_width×height 상자로 잘라서 준다. 원본 비율에 가장 가까운 상자로 요청해야 카피가 안 잘린다.
const RATIOS = [
  { key: "1.91:1", hw: 314 / 600 },
  { key: "1:1", hw: 1 },
  { key: "4:5", hw: 1.25 },
  { key: "9:16", hw: 1920 / 1080 },
];
function nearestRatio(h: number, w: number) {
  const r = h / w;
  return RATIOS.reduce((best, x) => (Math.abs(Math.log(x.hw / r)) < Math.abs(Math.log(best.hw / r)) ? x : best), RATIOS[1]);
}

// 광고 소재의 대표 이미지 해시·영상 id(첫 에셋)
function primaryAsset(ad: Raw | undefined): { hash?: string; videoId?: string } {
  const c = (ad?.creative ?? {}) as Raw;
  const afs = (c.asset_feed_spec ?? {}) as { images?: { hash?: string }[]; videos?: { video_id?: string }[] };
  const oss = (c.object_story_spec ?? {}) as { link_data?: { image_hash?: string; child_attachments?: { image_hash?: string }[] }; video_data?: { video_id?: string } };
  const videoId = (c.video_id as string | undefined) ?? oss.video_data?.video_id ?? afs.videos?.[0]?.video_id;
  const hash = (c.image_hash as string | undefined) ?? oss.link_data?.image_hash ?? afs.images?.[0]?.hash ?? oss.link_data?.child_attachments?.[0]?.image_hash;
  return videoId ? { videoId } : { hash };
}
const ADSET_FIELDS =
  "name,campaign_id,effective_status,optimization_goal,bid_strategy,daily_budget,lifetime_budget,learning_stage_info,targeting";
const CAMPAIGN_FIELDS = "name,objective,bid_strategy,daily_budget,lifetime_budget,smart_promotion_type";

type Raw = Record<string, unknown>;
type Named = { name?: string };

function groupOf(objective: string | null): ObjectiveGroup {
  return objective && /SALES|CONVERSIONS|PRODUCT_CATALOG/.test(objective) ? "sales" : "upper";
}

function metricsOf(r: Raw) {
  return {
    impressions: num(r.impressions),
    reach: num(r.reach),
    frequency: num(r.frequency),
    linkClicks: num(r.inline_link_clicks),
    cost: num(r.spend),
    conversions: pickAction(r.actions, PURCHASE_TYPES),
    revenue: pickAction(r.action_values, PURCHASE_TYPES),
    videoViews3s: pickAction(r.actions, ["video_view"]),
    thruplays: pickAction(r.video_thruplay_watched_actions, ["video_view"]),
  };
}

function creativeInfo(ad: Raw | undefined) {
  const c = (ad?.creative ?? {}) as Raw;
  const afs = (c.asset_feed_spec ?? {}) as { bodies?: { text?: string }[]; titles?: { text?: string }[]; images?: unknown[]; videos?: unknown[] };
  const oss = (c.object_story_spec ?? {}) as { link_data?: { message?: string; name?: string; child_attachments?: unknown[] }; video_data?: { message?: string; title?: string } };
  const isVideo = c.object_type === "VIDEO" || !!c.video_id || !!oss.video_data || (afs.videos?.length ?? 0) > 0;
  const multiAsset = (afs.images?.length ?? 0) + (afs.videos?.length ?? 0) > 1;
  const format: CreativeRow["format"] = oss.link_data?.child_attachments?.length ? "carousel" : multiAsset ? "dynamic" : isVideo ? "video" : c.object_type === "SHARE" || c.object_type === "PHOTO" || c.image_url || (afs.images?.length ?? 0) > 0 ? "image" : "other";
  return {
    format,
    utm: utmOf(ad),
    thumbnailUrl: (c.image_url as string) ?? null,
    title: (c.title as string) ?? afs.titles?.[0]?.text ?? oss.link_data?.name ?? oss.video_data?.title ?? null,
    body: (c.body as string) ?? afs.bodies?.[0]?.text ?? oss.link_data?.message ?? oss.video_data?.message ?? null,
    cta: (c.call_to_action_type as string) ?? null,
  };
}

function toAdset(id: string, s: Raw): AdsetSetting {
  const t = (s.targeting ?? {}) as Raw;
  const flex = (t.flexible_spec ?? []) as { interests?: Named[]; behaviors?: Named[] }[];
  const pos = ["facebook_positions", "instagram_positions", "audience_network_positions", "messenger_positions"].some((k) => Array.isArray(t[k]) && (t[k] as unknown[]).length > 0);
  return {
    id,
    name: (s.name as string) ?? id,
    campaignId: (s.campaign_id as string) ?? "",
    status: (s.effective_status as string) ?? "",
    optimizationGoal: (s.optimization_goal as string) ?? null,
    bidStrategy: (s.bid_strategy as string) ?? null,
    dailyBudget: s.daily_budget ? num(s.daily_budget) : null,
    lifetimeBudget: s.lifetime_budget ? num(s.lifetime_budget) : null,
    learning: ((s.learning_stage_info as Raw | undefined)?.status as string) ?? null,
    ageMin: t.age_min != null ? num(t.age_min) : null,
    ageMax: t.age_max != null ? num(t.age_max) : null,
    genders: ((t.genders as number[] | undefined) ?? []).filter((g) => g === 1 || g === 2),
    countries: ((t.geo_locations as Raw | undefined)?.countries as string[] | undefined) ?? [],
    customIncluded: ((t.custom_audiences as Named[] | undefined) ?? []).map((a) => a.name ?? "").filter(Boolean),
    customExcluded: ((t.excluded_custom_audiences as Named[] | undefined) ?? []).map((a) => a.name ?? "").filter(Boolean),
    interests: flex.flatMap((f) => [...(f.interests ?? []), ...(f.behaviors ?? [])].map((i) => i.name ?? "")).filter(Boolean),
    advantageAudience: Number((t.targeting_automation as Raw | undefined)?.advantage_audience ?? 0) === 1,
    placements: pos ? "manual" : "auto",
    platforms: (t.publisher_platforms as string[] | undefined) ?? [],
  };
}

export async function fetchMetaCreatives(
  client: { name: string; meta_account_id: string },
  token: string,
  since: string,
  until: string,
): Promise<CreativeAnalysisRes> {
  const act = actOf(client.meta_account_id);
  const timeRange = JSON.stringify({ since, until });
  const notes: string[] = [];

  const insights = await graphAll<Raw>(
    `${act}/insights`,
    {
      level: "ad",
      time_range: timeRange,
      fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,reach,frequency,inline_link_clicks,spend,actions,action_values,video_thruplay_watched_actions",
    },
    token,
  );
  const rows = insights.filter((r) => num(r.impressions) > 0);
  const adIds = rows.map((r) => r.ad_id as string);
  const adsetIds = rows.map((r) => r.adset_id as string);
  const campIds = rows.map((r) => r.campaign_id as string);
  const topIds = [...rows].sort((a, b) => num(b.spend) - num(a.spend)).slice(0, DAILY_TOP).map((r) => r.ad_id as string);

  const [ads, adsetMap, campMap, dailyRaw] = await Promise.all([
    graphByIds<Raw>(adIds, AD_FIELDS, token),
    graphByIds<Raw>(adsetIds, ADSET_FIELDS, token),
    graphByIds<Raw>(campIds, CAMPAIGN_FIELDS, token),
    topIds.length
      ? graphAll<Raw>(
          `${act}/insights`,
          {
            level: "ad",
            time_range: timeRange,
            time_increment: "1",
            fields: "ad_id,impressions,inline_link_clicks,spend,actions,action_values",
            filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: topIds }]),
          },
          token,
        ).catch(() => {
          notes.push("일별 소재 데이터를 받지 못해 피로도 분석을 건너뛰었어요.");
          return [] as Raw[];
        })
      : Promise.resolve([] as Raw[]),
  ]);

  // 썸네일 — 광고의 creative{thumbnail_url}은 64px라, 소재(creative)를 id로 다시 받아 600px로
  const creativeIds = [...ads.values()].map((a) => ((a.creative as Raw | undefined)?.id as string) ?? "").filter(Boolean);
  // 1) 원본 크기 — 이미지는 해시로 adimages(50개씩), 영상은 프레임 크기
  const prim = new Map<string, { hash?: string; videoId?: string }>();
  for (const [adId, ad] of ads) prim.set(adId, primaryAsset(ad));
  const hashes = [...new Set([...prim.values()].map((p) => p.hash).filter((h): h is string => !!h && !SIZE_CACHE.has(`h:${h}`)))];
  const videoIds = [...new Set([...prim.values()].map((p) => p.videoId).filter((v): v is string => !!v && !SIZE_CACHE.has(`v:${v}`)))];
  await Promise.all([
    ...Array.from({ length: Math.ceil(hashes.length / 50) }, (_, i) =>
      graphAll<Raw>(`${act}/adimages`, { hashes: JSON.stringify(hashes.slice(i * 50, i * 50 + 50)), fields: "hash,width,height" }, token, 2)
        .then((list) => list.forEach((im) => num(im.width) && SIZE_CACHE.set(`h:${im.hash as string}`, { w: num(im.width), h: num(im.height) })))
        .catch(() => undefined),
    ),
    // 영상은 50개 묶음 — 파트너십(인플루언서) 영상은 권한이 없어 묶음이 실패하면 반으로 나눠 다시(1건씩 조회하지 않음)
    graphByIdsTolerant<Raw>(videoIds, "thumbnails.limit(1){width,height}", token).then((m) =>
      m.forEach((v, id) => {
        const t = ((v.thumbnails as Raw | undefined)?.data as { width?: number; height?: number }[] | undefined)?.[0];
        if (t?.width && t?.height) SIZE_CACHE.set(`v:${id}`, { w: t.width, h: t.height });
      }),
    ),
  ]);

  // 2) 비율별로 묶어 그 비율 상자로 썸네일 요청(모르는 건 1:1)
  const ratioByCreative = new Map<string, (typeof RATIOS)[number]>();
  for (const [adId, ad] of ads) {
    const cid = ((ad.creative as Raw | undefined)?.id as string) ?? "";
    if (!cid) continue;
    const p = prim.get(adId);
    const sz = p?.videoId ? SIZE_CACHE.get(`v:${p.videoId}`) : p?.hash ? SIZE_CACHE.get(`h:${p.hash}`) : undefined;
    // 크기를 모르면 영상은 9:16(대부분 릴스), 이미지는 1:1
    ratioByCreative.set(cid, sz ? nearestRatio(sz.h, sz.w) : p?.videoId ? RATIOS[3] : RATIOS[1]);
  }
  // 캐시에 있는(12시간 이내) 썸네일은 재사용, 없는 것만 비율별로 요청
  const thumbs = new Map<string, Raw>();
  const now = Date.now();
  const missing: string[] = [];
  for (const cid of creativeIds) {
    const hit = THUMB_CACHE.get(`${cid}:${ratioByCreative.get(cid)?.key}`);
    if (hit && now - hit.at < THUMB_TTL_MS) thumbs.set(cid, { thumbnail_url: hit.url });
    else missing.push(cid);
  }
  await Promise.all(
    RATIOS.map((r) => {
      const ids = missing.filter((cid) => ratioByCreative.get(cid)?.key === r.key);
      return ids.length
        ? graphByIds<Raw>(ids, "thumbnail_url", token, { thumbnail_width: "600", thumbnail_height: String(Math.round(600 * r.hw)) })
            .then((m) =>
              m.forEach((v, k) => {
                thumbs.set(k, v);
                if (v.thumbnail_url) THUMB_CACHE.set(`${k}:${r.key}`, { url: v.thumbnail_url as string, at: now });
              }),
            )
            .catch(() => undefined)
        : Promise.resolve();
    }),
  );

  const dailyByAd = new Map<string, DailyPoint[]>();
  for (const r of dailyRaw) {
    const id = r.ad_id as string;
    const m = metricsOf(r);
    if (!dailyByAd.has(id)) dailyByAd.set(id, []);
    dailyByAd.get(id)!.push({ date: (r.date_start as string) ?? "", impressions: m.impressions, clicks: m.linkClicks, cost: m.cost, conversions: m.conversions, revenue: m.revenue });
  }

  const creatives: CreativeRow[] = rows.map((r) => {
    const id = r.ad_id as string;
    const ad = ads.get(id);
    const info = creativeInfo(ad);
    const thumb = thumbs.get(((ad?.creative as Raw | undefined)?.id as string) ?? "")?.thumbnail_url as string | undefined;
    return {
      id,
      name: (r.ad_name as string) ?? id,
      status: (ad?.effective_status as string) ?? "",
      createdTime: (ad?.created_time as string) ?? null,
      adsetId: (r.adset_id as string) ?? "",
      adsetName: (r.adset_name as string) ?? "",
      campaignId: (r.campaign_id as string) ?? "",
      campaignName: (r.campaign_name as string) ?? "",
      previewUrl: (ad?.preview_shareable_link as string) ?? null,
      ...info,
      thumbnailUrl: thumb ?? info.thumbnailUrl,
      thumbnailRatio: ratioByCreative.get(((ad?.creative as Raw | undefined)?.id as string) ?? "")?.key ?? null,
      ...metricsOf(r),
      daily: dailyByAd.get(id)?.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  const adsets: AdsetSetting[] = [...adsetMap.entries()].map(([id, s]) => toAdset(id, s));
  const campaigns: CampaignSetting[] = [...campMap.entries()].map(([id, c]) => {
    const objective = (c.objective as string) ?? null;
    return {
      id,
      name: (c.name as string) ?? id,
      objective,
      group: groupOf(objective),
      bidStrategy: (c.bid_strategy as string) ?? null,
      dailyBudget: c.daily_budget ? num(c.daily_budget) : null,
      lifetimeBudget: c.lifetime_budget ? num(c.lifetime_budget) : null,
      advantagePlus: c.smart_promotion_type === "AUTOMATED_SHOPPING_ADS",
    };
  });

  const noThumb = creatives.filter((c) => !c.thumbnailUrl).length;
  if (noThumb) notes.push(`썸네일이 없는 소재 ${noThumb}개는 이미지 대신 이름으로 표시해요.`);

  return { clientName: client.name, period: { since, until }, creatives, adsets, campaigns, notes };
}
