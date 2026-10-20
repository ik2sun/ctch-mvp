import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dataOwnerId } from "@/lib/workspace";
import { resolveMetaToken } from "@/lib/meta/token";
import { actOf, graphByIds } from "@/lib/meta/graph";
import { getGfaCredentials } from "@/lib/gfa/auth";
import { gfaRequest } from "@/lib/gfa/client";
import { resolveNaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverAdRequest } from "@/lib/naver-ad/client";
import { ensureKakaoAccessToken, KAKAO_TOKEN_COLUMNS } from "@/lib/kakao-moment/auth";
import { kakaoRequest } from "@/lib/kakao-moment/client";
import { getGoogleAdsCredentials } from "@/lib/google-ads/auth";
import { gadsSearch } from "@/lib/google-ads/client";

// 대시보드 '우수·저효율 소재' 썸네일 — 매체 소재 id → 썸네일·원본 이미지·소재 이름. 읽기 전용, 최대 24개.
// 성과(insights) 응답엔 이미지가 없어 매체별 소재 상세를 따로 읽는다.
//  메타: 광고 → creative thumbnail_url(600×600)·image_url / GFA: /creatives/{no} medias[].image.imageUrl
//  네이버 SA: /ncc/ads referenceData.imageUrl(쇼핑 상품) — 텍스트 소재는 이미지 없음 / 카카오: /creatives/{id} image.url
//  구글 Ads: 광고의 첫 영상·이미지 자산 → 유튜브 썸네일(i.ytimg.com) 또는 이미지 자산 원본
type Raw = Record<string, unknown>;
type Thumb = { thumb: string | null; image: string | null; name?: string | null; video?: boolean; live?: boolean };
type Item = { media: string; id: string };

const CACHE = new Map<string, Thumb & { at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // fbcdn URL은 며칠 뒤 만료 — 6시간만 재사용

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const abs = (u: string | null) => (u && u.startsWith("//") ? `https:${u}` : u);

// 소재 thumbnail_url — 외부 링크 미리보기 프록시(external-*.fbcdn.net/emg1, t13)는 링크 대상(인스타 라이브 등) 대신 회색 대체 이미지가 오므로 버리고 image_url을 쓴다
function ownThumb(c: Raw | undefined): string | null {
  const t = str(c?.thumbnail_url);
  if (t && /\/\/external[-.]|\/emg1\/|\/t13\//.test(t)) return null;
  return t;
}

async function metaThumbs(ids: string[], row: Raw): Promise<Record<string, Thumb>> {
  if (!row.meta_account_id) return {};
  const { token } = await resolveMetaToken(row.meta_access_token as string | null);
  if (!token) return {};
  const account = actOf(String(row.meta_account_id)).replace(/^act_/, "");
  const ads = await graphByIds<Raw>(
    ids,
    "account_id,creative{id,video_id,image_url,object_story_spec{link_data{call_to_action{type}},video_data{video_id,image_url}},asset_feed_spec{videos{video_id,thumbnail_url}}}",
    token,
  );
  const creativeOf = new Map<string, string>();
  const videoOf = new Map<string, { videoId: string | null; still: string | null }>();
  const liveOf = new Set<string>();
  ads.forEach((ad, adId) => {
    if (String(ad.account_id ?? "") !== account) return; // 다른 광고계정 광고 id는 무시
    const c = (ad.creative as Raw | undefined) ?? {};
    const cid = str(c.id);
    if (cid) creativeOf.set(adId, cid);
    // 영상 소재: creative thumbnail_url이 회색 대체 이미지로 오는 경우가 많아 영상 자체 썸네일을 쓴다
    const vd = ((c.object_story_spec as Raw | undefined)?.video_data as Raw | undefined) ?? {};
    const afv = (((c.asset_feed_spec as Raw | undefined)?.videos as Raw[] | undefined) ?? [])[0] ?? {};
    const videoId = str(c.video_id) ?? str(vd.video_id) ?? str(afv.video_id);
    if (videoId) videoOf.set(adId, { videoId, still: str(afv.thumbnail_url) ?? str(vd.image_url) });
    // 인스타 라이브 광고(CTA WATCH_LIVE_VIDEO 등) — 영상 id가 없고 이미지도 메타의 '라이브' 회색 대체 이미지뿐(방송 화면은 남지 않음)
    const cta = str((((c.object_story_spec as Raw | undefined)?.link_data as Raw | undefined)?.call_to_action as Raw | undefined)?.type);
    if (!videoId && cta && /VIDEO/.test(cta)) liveOf.add(adId);
  });
  const [creatives, videos] = await Promise.all([
    graphByIds<Raw>([...creativeOf.values()], "thumbnail_url,image_url", token, { thumbnail_width: "600", thumbnail_height: "600" }),
    // 파트너십 영상 등 권한 없는 영상은 배치에서 항목별로 빠진다
    graphByIds<Raw>([...videoOf.values()].map((v) => v.videoId as string), "picture,thumbnails{uri,width,height}", token).catch(() => new Map<string, Raw>()),
  ]);
  const out: Record<string, Thumb> = {};
  for (const id of ids) {
    const c = creatives.get(creativeOf.get(id) ?? "");
    const v = videoOf.get(id);
    if (v) {
      const vv = videos.get(v.videoId ?? "");
      const big = ((((vv?.thumbnails as Raw | undefined)?.data as { uri?: string; width?: number }[] | undefined) ?? []).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.uri) ?? null;
      // 영상 썸네일(최대 해상도) → 소재 썸네일 600 → 소재 지정 썸네일(작음) → 영상 picture
      const img = big ?? ownThumb(c) ?? v.still ?? str(vv?.picture) ?? str(c?.image_url);
      out[id] = { thumb: img, image: img, video: true };
      continue;
    }
    if (liveOf.has(id)) {
      out[id] = { thumb: null, image: null, live: true };
      continue;
    }
    const thumb = ownThumb(c) ?? str(c?.image_url);
    out[id] = { thumb, image: str(c?.image_url) ?? thumb };
  }
  return out;
}

async function gfaThumbs(ids: string[], row: Raw): Promise<Record<string, Thumb>> {
  if (!row.gfa_customer_id) return {};
  const c = await getGfaCredentials(String(row.gfa_customer_id));
  const opt = { accessToken: c.accessToken, managerAccountNo: c.managerAccountNo };
  const out: Record<string, Thumb> = {};
  await Promise.all(
    ids.map(async (id) => {
      const d = await gfaRequest<Raw>(`/adAccounts/${c.adAccountNo}/creatives/${encodeURIComponent(id)}`, opt).catch(() => null);
      if (!d) return;
      const medias = Array.isArray(d.medias) ? (d.medias as Raw[]) : [];
      const img = medias.map((m) => str((m.image as Raw | undefined)?.imageUrl) ?? str((m.video as Raw | undefined)?.thumbnailUrl)).find(Boolean) ?? null;
      out[id] = { thumb: img, image: img, name: str(d.name) };
    }),
  );
  return out;
}

async function naverThumbs(ids: string[], row: Raw): Promise<Record<string, Thumb>> {
  if (!row.naver_ad_customer_id) return {};
  const creds = await resolveNaverAdCredentials(row as never);
  const ads = await naverAdRequest<Raw[]>("GET", "/ncc/ads", creds, { ids: ids.join(",") });
  const out: Record<string, Thumb> = {};
  for (const a of ads ?? []) {
    const ad = (a.ad as Raw | undefined) ?? {};
    const ref = (a.referenceData as Raw | undefined) ?? {};
    const path = str(ad.imagePath);
    const img = str(ref.imageUrl) ?? (path ? `https://searchad-phinf.pstatic.net${path}` : null);
    const title = (ad.headline as Raw | undefined)?.pc ?? ad.headline;
    out[String(a.nccAdId)] = { thumb: img, image: img, name: str(ad.productName) ?? str(ref.productTitle) ?? str(title) };
  }
  return out;
}

async function kakaoThumbs(ids: string[], row: Raw, supabase: Awaited<ReturnType<typeof createClient>>, clientId: string): Promise<Record<string, Thumb>> {
  if (!row.kakao_ad_account_id) return {};
  const creds = await ensureKakaoAccessToken(supabase, clientId, row as never);
  const out: Record<string, Thumb> = {};
  for (const id of ids) {
    // 카카오 목록 버킷(요청 간격)이 순서를 맞추므로 차례로
    const d = await kakaoRequest<Raw>(`/creatives/${encodeURIComponent(id)}`, { accessToken: creds.accessToken, adAccountId: creds.adAccountId, bucket: "list" }).catch(() => null);
    if (!d) continue;
    const pick = (k: string) => abs(str((d[k] as Raw | undefined)?.url));
    const img = pick("image") ?? pick("thumbnailImage") ?? abs(str((d.video as Raw | undefined)?.thumbnailUrl));
    out[id] = { thumb: img, image: img, name: str(d.name) };
  }
  return out;
}

// 광고 유형별 자산 칸 — 영상 먼저(영상 소재는 영상 썸네일), 없으면 이미지
const GADS_ASSET_FIELDS = [
  "ad_group_ad.ad.video_responsive_ad.videos",
  "ad_group_ad.ad.demand_gen_video_responsive_ad.videos",
  "ad_group_ad.ad.video_ad.video.asset",
  "ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images",
  "ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images",
  "ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images",
  "ad_group_ad.ad.responsive_display_ad.square_marketing_images",
  "ad_group_ad.ad.responsive_display_ad.marketing_images",
];

async function googleThumbs(ids: string[], row: Raw): Promise<Record<string, Thumb>> {
  if (!row.google_ads_customer_id) return {};
  const creds = await getGoogleAdsCredentials(row as never);
  const nums = ids.filter((id) => /^\d+$/.test(id));
  if (!nums.length) return {};
  const rows = await gadsSearch<Raw>(creds, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.image_ad.image_url, ${GADS_ASSET_FIELDS.join(", ")} FROM ad_group_ad WHERE ad_group_ad.ad.id IN (${nums.join(",")})`);
  const firstAsset = new Map<string, string>();
  const direct = new Map<string, string>();
  for (const r of rows) {
    const ad = ((r.adGroupAd as Raw | undefined)?.ad as Raw | undefined) ?? {};
    const id = String(ad.id ?? "");
    if (!id || firstAsset.has(id) || direct.has(id)) continue;
    const imageUrl = str((ad.imageAd as Raw | undefined)?.imageUrl);
    if (imageUrl) {
      direct.set(id, imageUrl);
      continue;
    }
    // 필드 순서(영상 → 이미지)대로 첫 자산
    const json = JSON.stringify([ad.videoResponsiveAd, ad.demandGenVideoResponsiveAd, ad.videoAd, ad.demandGenMultiAssetAd, ad.responsiveDisplayAd]);
    const m = /customers\/\d+\/assets\/\d+/.exec(json);
    if (m) firstAsset.set(id, m[0]);
  }
  const assets = new Map<string, Raw>();
  const names = [...new Set(firstAsset.values())];
  if (names.length) {
    const ar = await gadsSearch<Raw>(creds, `SELECT asset.resource_name, asset.youtube_video_asset.youtube_video_id, asset.image_asset.full_size.url FROM asset WHERE asset.resource_name IN (${names.map((n) => `'${n}'`).join(",")})`);
    for (const x of ar) {
      const a = (x.asset as Raw | undefined) ?? {};
      if (a.resourceName) assets.set(String(a.resourceName), a);
    }
  }
  const out: Record<string, Thumb> = {};
  for (const id of nums) {
    const d = direct.get(id);
    if (d) {
      out[id] = { thumb: d, image: d };
      continue;
    }
    const a = assets.get(firstAsset.get(id) ?? "");
    const yt = str((a?.youtubeVideoAsset as Raw | undefined)?.youtubeVideoId);
    if (yt) {
      out[id] = { thumb: `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`, image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, video: true };
      continue;
    }
    const img = str(((a?.imageAsset as Raw | undefined)?.fullSize as Raw | undefined)?.url);
    if (img) out[id] = { thumb: img, image: img };
  }
  return out;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; items?: unknown };
  const clientId = body.clientId;
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((x): x is Item => !!x && typeof (x as Item).media === "string" && typeof (x as Item).id === "string" && /^[\w-]{1,64}$/.test((x as Item).id))
    .slice(0, 24);
  if (!clientId || !items.length) return NextResponse.json({ items: {} });

  const { data: row } = await supabase
    .from("clients")
    .select(`meta_account_id, meta_access_token, gfa_customer_id, naver_ad_api_key, naver_ad_secret, naver_ad_customer_id, google_ads_customer_id, ${KAKAO_TOKEN_COLUMNS}`)
    .eq("id", clientId)
    .eq("user_id", await dataOwnerId(user))
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const result: Record<string, Thumb> = {};
  const now = Date.now();
  const missing = new Map<string, string[]>();
  for (const it of items) {
    const key = `v5:${clientId}:${it.media}:${it.id}`; // v5 = 영상·라이브·구글 Ads 썸네일 반영(예전 회색 대체 이미지 캐시 무시)
    const hit = CACHE.get(key);
    if (hit && now - hit.at < TTL_MS) result[`${it.media}:${it.id}`] = { thumb: hit.thumb, image: hit.image, name: hit.name, video: hit.video, live: hit.live };
    else missing.set(it.media, [...(missing.get(it.media) ?? []), it.id]);
  }

  const r = row as Raw;
  const fetchers: Record<string, (ids: string[]) => Promise<Record<string, Thumb>>> = {
    meta: (ids) => metaThumbs(ids, r),
    gfa: (ids) => gfaThumbs(ids, r),
    naver: (ids) => naverThumbs(ids, r),
    kakao: (ids) => kakaoThumbs(ids, r, supabase, clientId),
    google_ads: (ids) => googleThumbs(ids, r),
  };
  await Promise.all(
    [...missing.entries()].map(async ([media, ids]) => {
      const f = fetchers[media];
      if (!f) return;
      // 매체 하나가 실패해도 나머지는 표시
      const got = await f(ids).catch(() => ({}) as Record<string, Thumb>);
      for (const id of ids) {
        const t = got[id];
        if (!t) continue;
        result[`${media}:${id}`] = t;
        CACHE.set(`v5:${clientId}:${media}:${id}`, { ...t, at: now });
      }
    }),
  );
  return NextResponse.json({ items: result });
}
