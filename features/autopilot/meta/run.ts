// 캠페인 오토파일럿 · 메타 실행 엔진(브라우저)
// 순서: 소재 파일 업로드 → 광고 소재(creative) → 캠페인 → 광고세트(새로·복사·기존) → 광고(세트 × 소재) → 켜기 → 기록 → 임시 영상 정리
// 소재를 먼저 만드는 이유: 소재·라이브러리 업로드는 광고에 붙기 전엔 아무 영향이 없어서, 파일 문제로 실패해도 빈 광고세트가 남지 않는다.
// validateOnly = 메타에 '검증만' 요청 — 이미지 업로드(무해, 실행 때 재사용)는 하고 캠페인·세트·소재는 만들지 않는다. 새 캠페인 아래 세트·광고는 부모가 없어 검증 생략
import { createClient } from "@/lib/supabase/client";
import { copyOf, type AdDraft, type AdSetDraft, type CampaignDraft, type Defaults, type UploadedMedia } from "./model";
import { imageForUpload, videoThumbnail, type LocalMedia } from "./media";

export type LogLine = { kind: "ok" | "err" | "info"; text: string };
// 소재(creative)는 광고계정 단위라 여러 캠페인에 같은 광고를 넣을 때 한 번만 만든다(파일·문구·페이지가 같을 때)
export type MediaCache = { images: Map<string, string>; videos: Map<string, { videoId: string; thumbHash: string }>; creatives: Map<string, string> };
export const newCache = (): MediaCache => ({ images: new Map(), videos: new Map(), creatives: new Map() });
export type MetaRunResult = {
  validateOnly: boolean;
  campaignId: string | null;
  adSets: { key: string; id: string; name: string; mode: AdSetDraft["mode"] }[];
  creatives: { key: string; id: string; name: string }[];
  ads: { id: string; key: string; name: string; adSetId: string }[];
  errors: string[];
  warnings: string[];
  activated: boolean;
};

export async function postMeta<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/autopilot/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침해 주세요." }));
  if (!res.ok) throw Object.assign(new Error(json.error || "요청 실패"), { code: json.code });
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runMeta(opts: {
  clientId: string;
  campaign: CampaignDraft;
  campaignName: string;
  adSets: AdSetDraft[];
  ads: AdDraft[];
  media: Map<string, LocalMedia>;
  defaults: Defaults;
  validateOnly: boolean;
  cache: MediaCache;
  mode?: "quick" | "bulk";
  logExtra?: Record<string, unknown>;
  onLog: (lines: LogLine[]) => void;
}): Promise<MetaRunResult> {
  const { clientId, defaults: d, validateOnly: vo } = opts;
  const lines: LogLine[] = [];
  const push = (l: LogLine) => {
    lines.push(l);
    opts.onLog([...lines]);
  };
  const out: MetaRunResult = { validateOnly: vo, campaignId: null, adSets: [], creatives: [], ads: [], errors: [], warnings: [], activated: false };
  const fail = (m: string) => {
    out.errors.push(m);
    push({ kind: "err", text: m });
  };
  const tempPaths: string[] = [];
  const usedAds = opts.ads.filter((a) => opts.adSets.some((s) => s.ads.includes(a.key)));

  // ── 1. 소재 파일 ───────────────────────────────
  async function uploadImageBlob(blob: Blob, name: string): Promise<string> {
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("file", new File([blob], name, { type: blob.type || "image/jpeg" }));
    const res = await fetch("/api/autopilot/meta/image", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "업로드 실패");
    return json.image.hash as string;
  }
  async function image(m: LocalMedia): Promise<UploadedMedia> {
    let hash = opts.cache.images.get(m.id);
    if (!hash) {
      hash = await uploadImageBlob(await imageForUpload(m), m.name);
      opts.cache.images.set(m.id, hash);
      push({ kind: "ok", text: `이미지 업로드 ${m.name}` });
    }
    return { kind: "image", hash };
  }
  async function video(m: LocalMedia): Promise<UploadedMedia> {
    const hit = opts.cache.videos.get(m.id);
    if (hit) return { kind: "video", videoId: hit.videoId, thumbHash: hit.thumbHash };
    push({ kind: "info", text: `영상 올리는 중 ${m.name} (${m.size >= 1024 * 1024 ? `${(m.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(m.size / 1024)}KB`})` });
    const up = await postMeta<{ bucket: string; path: string; token: string }>({ action: "videoUploadUrl", clientId, ext: m.name.split(".").pop() });
    const { error } = await createClient().storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, m.file, { contentType: m.file.type || "video/mp4" });
    if (error) throw new Error(`스토리지 업로드 실패 — ${error.message}`);
    tempPaths.push(up.path);
    const { videoId } = await postMeta<{ videoId: string }>({ action: "registerVideo", clientId, path: up.path, name: m.name });
    // 썸네일은 영상 처리와 동시에
    const thumbP = videoThumbnail(m).then((b) => uploadImageBlob(b, `${m.name}_thumb.jpg`));
    const t0 = Date.now();
    for (;;) {
      const s = await postMeta<{ status: string; progress: number; error: string | null }>({ action: "videoStatus", clientId, videoId });
      if (s.error) throw new Error(`메타 영상 처리 실패 — ${s.error}`);
      if (s.status === "ready") break;
      if (Date.now() - t0 > 6 * 60_000) throw new Error("메타 영상 처리가 6분 넘게 끝나지 않았어요 — 잠시 뒤 다시 실행하면 이어서 진행해요");
      await sleep(4000);
    }
    const thumbHash = await thumbP;
    opts.cache.videos.set(m.id, { videoId, thumbHash });
    push({ kind: "ok", text: `영상 등록 ${m.name} (메타 처리 완료)` });
    return { kind: "video", videoId, thumbHash };
  }
  const uploadMedia = (id: string | null) => {
    if (!id) return Promise.resolve(null);
    const m = opts.media.get(id);
    if (!m) throw new Error("파일을 찾지 못했어요");
    return m.kind === "image" ? image(m) : vo ? Promise.resolve(null) : video(m);
  };

  // ── 2. 광고 소재(creative) ─────────────────────
  const creativeIds = new Map<string, string>(); // ad key → creative id
  for (const ad of usedAds) {
    let feed: UploadedMedia | null;
    let vertical: UploadedMedia | null;
    try {
      [feed, vertical] = await Promise.all([uploadMedia(ad.feed), uploadMedia(ad.vertical)]);
    } catch (e) {
      fail(`${ad.name} 파일 업로드 실패 — ${(e as Error).message}`);
      continue;
    }
    const isVideo = [ad.feed, ad.vertical].some((id) => id && opts.media.get(id)?.kind === "video");
    if (vo && isVideo) {
      push({ kind: "info", text: `${ad.name}: 영상 소재는 검증에서 건너뜀(실행 때 업로드·확인)` });
      continue;
    }
    const copy = copyOf(ad, d.copy);
    // {형식} = 영상 video / 이미지 display(르무통 utm_medium 규칙)
    const isVid = [ad.feed, ad.vertical].some((id) => id && opts.media.get(id)?.kind === "video");
    const urlTags = d.useUtm && !/[?&]utm_/.test(copy.url) ? d.urlTags.replace(/\{형식\}/g, isVid ? "video" : "display") : "";
    const sig = JSON.stringify([ad.name, ad.feed, ad.vertical, copy, urlTags, d.pageId, d.igId, d.aiEnhance, !!ad.productExt]);
    const reuse = vo ? undefined : opts.cache.creatives.get(sig);
    if (reuse) {
      creativeIds.set(ad.key, reuse);
      out.creatives.push({ key: ad.key, id: reuse, name: ad.name });
      push({ kind: "info", text: `소재 재사용 ${ad.name}` });
      continue;
    }
    try {
      const r = await postMeta<{ id: string | null }>({ action: "createCreative", clientId, validateOnly: vo, name: ad.name, pageId: d.pageId, igId: d.igId, copy, feed, vertical, urlTags, aiEnhance: d.aiEnhance, productExt: !!ad.productExt });
      if (vo) push({ kind: "ok", text: `소재 검증 통과 ${ad.name}` });
      else if (r.id) {
        creativeIds.set(ad.key, r.id);
        opts.cache.creatives.set(sig, r.id);
        out.creatives.push({ key: ad.key, id: r.id, name: ad.name });
        push({ kind: "ok", text: `소재 생성 ${ad.name}${feed && vertical ? " (피드 + 스토리·릴스 맞춤)" : ""}` });
      }
    } catch (e) {
      fail(`소재 ${ad.name} ${vo ? "검증" : "생성"} 실패 — ${(e as Error).message}`);
    }
  }
  if (!vo && !creativeIds.size) {
    fail("만들어진 소재가 없어 캠페인·광고세트 생성을 멈췄어요");
    return finish();
  }

  // ── 3. 캠페인 ───────────────────────────────────
  let campaignId = opts.campaign.mode === "existing" ? opts.campaign.existingId : null;
  if (opts.campaign.mode === "new") {
    try {
      const r = await postMeta<{ id: string | null }>({ action: "createCampaign", clientId, validateOnly: vo, campaign: opts.campaign });
      if (vo) push({ kind: "ok", text: `캠페인 검증 통과 ${opts.campaign.name}` });
      else {
        campaignId = r.id;
        push({ kind: "ok", text: `캠페인 생성 ${opts.campaign.name} (꺼 둠)` });
      }
    } catch (e) {
      fail(`캠페인 ${vo ? "검증" : "생성"} 실패 — ${(e as Error).message}`);
      return finish();
    }
  }
  out.campaignId = campaignId;
  if (!campaignId) {
    if (vo) push({ kind: "info", text: "새 캠페인 아래 광고세트·광고는 캠페인이 없어 검증을 건너뜀(실행 때 확인)" });
    return finish();
  }

  // ── 4. 광고세트 ─────────────────────────────────
  for (const s of opts.adSets) {
    try {
      if (s.mode === "existing") {
        out.adSets.push({ key: s.key, id: s.sourceId!, name: s.name, mode: s.mode });
        push({ kind: "info", text: `기존 광고세트에 추가: ${s.name}` });
        continue;
      }
      const action = s.mode === "copy" ? "copyAdSet" : "createAdSet";
      const r = await postMeta<{ id: string | null; warning?: string }>({ action, clientId, validateOnly: vo, campaignId, adSet: s, pixelId: d.pixelId });
      if (r.warning) {
        out.warnings.push(`${s.name}: ${r.warning}`);
        push({ kind: "err", text: `${s.name}: ${r.warning}` });
      }
      if (vo) push({ kind: "ok", text: `광고세트 검증 통과 ${s.name}${s.mode === "copy" ? " (복사는 실행 때 확인)" : ""}` });
      else if (r.id) {
        out.adSets.push({ key: s.key, id: r.id, name: s.name, mode: s.mode });
        push({ kind: "ok", text: `광고세트 ${s.mode === "copy" ? "복사" : "생성"} ${s.name} (꺼 둠)` });
      }
    } catch (e) {
      fail(`광고세트 ${s.name} ${vo ? "검증" : s.mode === "copy" ? "복사" : "생성"} 실패 — ${(e as Error).message}`);
    }
  }
  if (vo) {
    push({ kind: "info", text: "광고(세트 × 소재)는 부모가 아직 없어 검증을 건너뜀 — 위 항목이 통과하면 실행해도 됩니다" });
    return finish();
  }

  // ── 5. 광고 ─────────────────────────────────────
  for (const s of out.adSets) {
    const draft = opts.adSets.find((x) => x.key === s.key)!;
    for (const key of draft.ads) {
      const ad = opts.ads.find((a) => a.key === key);
      const cid = creativeIds.get(key);
      if (!ad || !cid) continue;
      try {
        // 새·복사 세트는 세트가 꺼져 있으니 광고는 켜 두고(세트가 켜지면 바로 게재), 기존 세트는 '바로 켜기'일 때만 켠다
        const active = s.mode !== "existing" || d.turnOn;
        const r = await postMeta<{ id: string }>({ action: "createAd", clientId, adSetId: s.id, creativeId: cid, name: ad.name, active });
        out.ads.push({ id: r.id, key: ad.key, name: ad.name, adSetId: s.id });
        push({ kind: "ok", text: `광고 생성 ${s.name} › ${ad.name}${active && s.mode === "existing" ? " (켬)" : ""}` });
      } catch (e) {
        fail(`광고 ${s.name} › ${ad.name} 생성 실패 — ${(e as Error).message}`);
      }
    }
  }

  // ── 6. 켜기 ─────────────────────────────────────
  if (d.turnOn) {
    const adSetIds = out.adSets.filter((s) => s.mode !== "existing").map((s) => s.id);
    if (adSetIds.length || opts.campaign.mode === "new") {
      try {
        await postMeta({ action: "activate", clientId, campaignId: opts.campaign.mode === "new" ? campaignId : null, adSetIds });
        out.activated = true;
        push({ kind: "ok", text: `켬 — ${opts.campaign.mode === "new" ? "캠페인 + " : ""}광고세트 ${adSetIds.length}개 (메타 검토 후 게재)` });
      } catch (e) {
        fail(`켜기 실패 — ${(e as Error).message} · 광고 관리자에서 켜 주세요`);
      }
    }
  } else push({ kind: "info", text: "꺼 둔 상태로 만들었어요 — 메타 광고 관리자에서 확인 후 켜세요" });

  return finish();

  async function finish(): Promise<MetaRunResult> {
    if (!vo) {
      try {
        const r = await postMeta<{ skipped?: string }>({
          action: "log",
          clientId,
          campaignId: out.campaignId,
          summary: {
            mode: opts.mode ?? "quick",
            campaignName: opts.campaignName,
            newCampaign: opts.campaign.mode === "new",
            adSets: out.adSets.filter((s) => s.mode === "new").length,
            copiedAdSets: out.adSets.filter((s) => s.mode === "copy").length,
            reusedAdSets: out.adSets.filter((s) => s.mode === "existing").length,
            creatives: out.creatives.length,
            ads: out.ads.length,
            errors: out.errors.length,
            activated: out.activated,
          },
          detail: { adSets: out.adSets, creatives: out.creatives, ads: out.ads, errors: out.errors, warnings: out.warnings, ...opts.logExtra },
        });
        if (r.skipped) push({ kind: "info", text: r.skipped });
      } catch {
        /* 기록 실패는 결과에 영향 없음 */
      }
      if (tempPaths.length) postMeta({ action: "cleanup", clientId, paths: tempPaths }).catch(() => null);
    }
    push({
      kind: out.errors.length ? "err" : "ok",
      text: vo ? `검증 끝 — 문제 ${out.errors.length}건` : `끝 — 광고세트 ${out.adSets.length} · 소재 ${out.creatives.length} · 광고 ${out.ads.length} · 오류 ${out.errors.length}`,
    });
    return out;
  }
}
