// 소재 상세 원본 조회 — 다이내믹 소재의 모든 이미지(원본 해상도), 영상 썸네일·길이. 서버 전용, 읽기 전용.
import { graphAll, MetaGraphError } from "@/lib/meta/graph";
import type { CreativeAsset } from "./types";

const G = "https://graph.facebook.com/v21.0";
type Raw = Record<string, unknown>;

async function get(url: string) {
  const j = await (await fetch(url, { cache: "no-store" })).json();
  if (j.error) throw new MetaGraphError(j.error.message, j.error.code);
  return j as Raw;
}

export async function fetchCreativeAssets(act: string, adId: string, token: string): Promise<CreativeAsset[]> {
  const ad = await get(
    `${G}/${adId}?${new URLSearchParams({ fields: "account_id,creative{image_hash,image_url,video_id,asset_feed_spec{images,videos},object_story_spec{link_data{image_hash,child_attachments{image_hash,video_id}},video_data{video_id,image_url}}}", access_token: token })}`,
  );
  // 다른 광고계정의 광고 id로 조회하는 것 방지
  if (String(ad.account_id ?? "") !== act.replace(/^act_/, "")) throw new MetaGraphError("이 광고주의 광고가 아니에요.", 403);

  const c = (ad.creative ?? {}) as Raw;
  const afs = (c.asset_feed_spec ?? {}) as { images?: { hash?: string }[]; videos?: { video_id?: string; thumbnail_url?: string }[] };
  const oss = (c.object_story_spec ?? {}) as { link_data?: { image_hash?: string; child_attachments?: { image_hash?: string; video_id?: string }[] }; video_data?: { video_id?: string } };
  const hashes = [
    c.image_hash as string | undefined,
    oss.link_data?.image_hash,
    ...(afs.images ?? []).map((i) => i.hash),
    ...(oss.link_data?.child_attachments ?? []).map((a) => a.image_hash),
  ].filter((h): h is string => !!h);
  const videoIds = [
    c.video_id as string | undefined,
    oss.video_data?.video_id,
    ...(afs.videos ?? []).map((v) => v.video_id),
    ...(oss.link_data?.child_attachments ?? []).map((a) => a.video_id),
  ].filter((v): v is string => !!v);

  const assets: CreativeAsset[] = [];
  const uniqHashes = [...new Set(hashes)].slice(0, 20);
  if (uniqHashes.length) {
    const imgs = await graphAll<Raw>(`${act}/adimages`, { hashes: JSON.stringify(uniqHashes), fields: "hash,url,width,height" }, token, 2);
    for (const h of uniqHashes) {
      const im = imgs.find((x) => x.hash === h);
      if (im?.url) assets.push({ kind: "image", url: im.url as string, width: Number(im.width) || null, height: Number(im.height) || null });
    }
  }
  for (const vid of [...new Set(videoIds)].slice(0, 10)) {
    const v = await get(`${G}/${vid}?${new URLSearchParams({ fields: "length,picture,thumbnails{uri,width,height}", access_token: token })}`).catch(() => null);
    if (!v) continue;
    const best = (((v.thumbnails as Raw | undefined)?.data as { uri: string; width: number; height: number }[] | undefined) ?? []).sort((a, b) => b.width - a.width)[0];
    const url = best?.uri ?? (v.picture as string | undefined);
    if (url) assets.push({ kind: "video", url, width: best?.width ?? null, height: best?.height ?? null, lengthSec: v.length != null ? Number(v.length) : null });
  }
  if (!assets.length && c.image_url) assets.push({ kind: "image", url: c.image_url as string, width: null, height: null });
  return assets;
}
