// 캠페인 오토파일럿 · 카카오 실행 엔진(브라우저)
// 순서: 소재 파일 맞추기·스토리지 업로드(파일 문제를 광고그룹 만들기 전에 잡는다) → 광고그룹(새로·복사·기존) → 소재(광고그룹 × 소재) → 켜기 → 기록
// 카카오 소재는 광고그룹 소속이라 같은 소재를 광고그룹 3개에 넣으면 소재 3개가 생긴다. 파일은 한 번만 올려 URL을 같이 쓴다.
// 검증 전용 호출이 없어 실행 = 실제 생성. 새 광고그룹은 꺼진 채로 만들고 소재는 켜 둔다(그룹을 켜면 심사 승인된 소재부터 게재)
import { createClient } from "@/lib/supabase/client";
import { copyOf, FORMAT_OF, type AdGroupDraft, type CreativeDraft, type Defaults, type KakaoCampaignLite, type KakaoType } from "./model";
import { fitImage, fitProfile, videoThumb, type LocalMedia } from "./media";

export type LogLine = { kind: "ok" | "err" | "info"; text: string };
// 올린 파일 — 캠페인 여러 개를 차례로 실행할 때도 한 번만 올린다. paths = 실행이 다 끝나면 지울 임시 파일
export type FileCache = { files: Map<string, { path: string; thumbPath?: string | null }>; profile: string | null; paths: string[] };
export const newCache = (): FileCache => ({ files: new Map(), profile: null, paths: [] });
export type KakaoRunResult = {
  adGroups: { key: string; id: string; name: string; mode: AdGroupDraft["mode"] }[];
  creatives: { key: string; id: string; name: string; adGroupId: string; review: string | null }[];
  errors: string[];
  warnings: string[];
  activated: boolean;
};

export async function postKakao<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/autopilot/kakao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침해 주세요." }));
  if (!res.ok) throw Object.assign(new Error(json.error || "요청 실패"), { code: json.code });
  return json as T;
}

async function upload(clientId: string, blob: Blob, ext: string, cache: FileCache): Promise<string> {
  const up = await postKakao<{ bucket: string; path: string; token: string }>({ action: "uploadUrl", clientId, ext });
  const type = ext === "mp4" ? "video/mp4" : ext === "png" ? "image/png" : "image/jpeg";
  const { error } = await createClient().storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, blob, { contentType: type });
  if (error) throw new Error(`스토리지 업로드 실패 — ${error.message}`);
  cache.paths.push(up.path);
  return up.path;
}

export async function cleanupFiles(clientId: string, cache: FileCache) {
  // 영상은 카카오가 소재 생성 뒤에 내려받아 변환할 수 있어 지우지 않는다(이미지는 생성 응답에 카카오 CDN 주소가 와 바로 지워도 됨)
  const paths = cache.paths.splice(0).filter((p) => !p.endsWith(".mp4"));
  cache.files.clear();
  cache.profile = null;
  if (!paths.length) return;
  await postKakao({ action: "cleanup", clientId, paths }).catch(() => null);
}

export async function runKakao(opts: {
  clientId: string;
  campaign: KakaoCampaignLite;
  adGroups: AdGroupDraft[];
  creatives: CreativeDraft[];
  media: Map<string, LocalMedia>;
  defaults: Defaults;
  cache: FileCache;
  mode: "quick" | "bulk";
  logExtra?: Record<string, unknown>;
  onLog: (lines: LogLine[]) => void;
}): Promise<KakaoRunResult> {
  const { clientId, defaults: d, cache, campaign } = opts;
  const format = FORMAT_OF[campaign.type as KakaoType];
  const lines: LogLine[] = [];
  const push = (l: LogLine) => {
    lines.push(l);
    opts.onLog([...lines]);
  };
  const out: KakaoRunResult = { adGroups: [], creatives: [], errors: [], warnings: [], activated: false };
  const fail = (m: string) => {
    out.errors.push(m);
    push({ kind: "err", text: m });
  };
  const used = opts.creatives.filter((c) => opts.adGroups.some((g) => g.creatives.includes(c.key)));

  // ── 1. 파일 ──────────────────────────────────────
  const ready = new Map<string, { path: string; thumbPath: string | null }>(); // creative key → 업로드 경로
  for (const c of used) {
    const m = c.file ? opts.media.get(c.file) : null;
    if (!m) {
      fail(`${c.name}: 소재 파일이 없어요`);
      continue;
    }
    const ck = `${format}:${m.id}:${c.thumb ?? ""}`;
    const hit = cache.files.get(ck);
    if (hit) {
      ready.set(c.key, { path: hit.path, thumbPath: hit.thumbPath ?? null });
      continue;
    }
    try {
      if (format === "VIDEO_NATIVE") {
        push({ kind: "info", text: `영상 올리는 중 ${m.name} (${(m.size / 1024 / 1024).toFixed(1)}MB)` });
        const path = await upload(clientId, m.file, "mp4", cache);
        const tb = await videoThumb(m, c.thumb ? opts.media.get(c.thumb) ?? null : null);
        const thumbPath = tb ? await upload(clientId, tb, "jpg", cache) : null;
        if (!tb) push({ kind: "info", text: `${m.name}: 썸네일은 카카오가 영상에서 뽑아요` });
        cache.files.set(ck, { path, thumbPath });
        ready.set(c.key, { path, thumbPath });
      } else {
        const f = await fitImage(m, format);
        const path = await upload(clientId, f.blob, f.ext, cache);
        cache.files.set(ck, { path });
        ready.set(c.key, { path, thumbPath: null });
      }
      push({ kind: "ok", text: `파일 준비 ${m.name}` });
    } catch (e) {
      fail(`${c.name}: ${(e as Error).message}`);
    }
  }
  let profilePath: string | null = null;
  let profileUrl: string | null = null;
  if (format !== "IMAGE_BANNER") {
    const pf = d.profile?.fileId ? opts.media.get(d.profile.fileId) : null;
    if (pf) {
      try {
        profilePath = cache.profile ?? (cache.profile = await upload(clientId, await fitProfile(pf), "jpg", cache));
      } catch (e) {
        fail(`프로필 이미지 업로드 실패 — ${(e as Error).message}`);
        return finish();
      }
    } else profileUrl = d.profile?.imageUrl ?? null;
  }
  if (!ready.size) {
    fail("준비된 소재 파일이 없어 광고그룹을 만들지 않았어요");
    return finish();
  }

  // ── 2. 광고그룹 ──────────────────────────────────
  for (const g of opts.adGroups) {
    if (!g.creatives.some((k) => ready.has(k))) {
      fail(`광고그룹 ${g.name}: 넣을 소재가 모두 실패해 만들지 않았어요`);
      continue;
    }
    if (g.mode === "existing") {
      out.adGroups.push({ key: g.key, id: g.sourceId!, name: g.name, mode: "existing" });
      push({ kind: "info", text: `기존 광고그룹에 추가: ${g.name}` });
      continue;
    }
    try {
      const r = await postKakao<{ id: string; reused?: boolean; warning?: string }>({ action: "createAdGroup", clientId, campaignId: campaign.id, adGroup: g, turnOn: d.turnOn });
      if (r.warning) {
        out.warnings.push(`${g.name}: ${r.warning}`);
        push({ kind: "err", text: `${g.name}: ${r.warning}` });
      }
      if (r.reused) {
        out.adGroups.push({ key: g.key, id: r.id, name: g.name, mode: "existing" });
        push({ kind: "info", text: `광고그룹 ${g.name}: 같은 이름이 이미 있어 그 그룹에 소재만 추가` });
      } else {
        out.adGroups.push({ key: g.key, id: r.id, name: g.name, mode: g.mode });
        push({ kind: "ok", text: `광고그룹 ${g.mode === "copy" ? "복사" : "생성"} ${g.name}${d.turnOn ? "" : " (꺼 둠)"}` });
      }
    } catch (e) {
      fail(`광고그룹 ${g.name} ${g.mode === "copy" ? "복사" : "생성"} 실패 — ${(e as Error).message}`);
    }
  }

  // ── 3. 소재 ──────────────────────────────────────
  for (const g of out.adGroups) {
    const draft = opts.adGroups.find((x) => x.key === g.key)!;
    for (const key of draft.creatives) {
      const c = opts.creatives.find((x) => x.key === key);
      const f = ready.get(key);
      if (!c || !f) continue;
      // 새·복사 그룹은 그룹이 꺼져 있으니 소재는 켜 두고, 기존 그룹은 '바로 켜기'일 때만 켠다
      const active = g.mode !== "existing" || d.turnOn;
      try {
        const r = await postKakao<{ id: string; reviewStatus: string | null; warning?: string }>({
          action: "createCreative",
          clientId,
          adGroupId: g.id,
          format,
          name: c.name,
          copy: copyOf(c, d),
          freq: c.freq ?? d.freq,
          opinion: c.opinion,
          aiLabel: c.aiLabel,
          mediaPath: f.path,
          thumbPath: f.thumbPath,
          profilePath,
          profileUrl,
          active,
        });
        if (r.warning) out.warnings.push(`${c.name}: ${r.warning}`);
        out.creatives.push({ key, id: r.id, name: c.name, adGroupId: g.id, review: r.reviewStatus });
        push({ kind: "ok", text: `소재 생성 ${g.name} › ${c.name}${r.reviewStatus === "WAITING" ? " (심사중)" : ""}${!active ? " (꺼 둠)" : ""}` });
      } catch (e) {
        fail(`소재 ${g.name} › ${c.name} 생성 실패 — ${(e as Error).message}`);
      }
    }
  }

  // ── 4. 켜기 ──────────────────────────────────────
  // 새 광고그룹은 서버가 만들 때 '바로 켜기'면 켠 채로 둔다(끄기 생략). 여기서는 표시만
  if (d.turnOn && out.adGroups.some((g) => g.mode !== "existing")) {
    out.activated = true;
    push({ kind: "ok", text: "켬 — 새 광고그룹은 소재 심사 승인 뒤 게재" });
  } else push({ kind: "info", text: "새 광고그룹은 꺼 둔 상태예요 — 카카오모먼트에서 확인 후 켜세요" });

  return finish();

  async function finish(): Promise<KakaoRunResult> {
    try {
      const r = await postKakao<{ skipped?: string }>({
        action: "log",
        clientId,
        campaignId: campaign.id,
        summary: {
          mode: opts.mode,
          campaignName: campaign.name,
          format,
          adSets: out.adGroups.filter((g) => g.mode === "new").length,
          copiedAdSets: out.adGroups.filter((g) => g.mode === "copy").length,
          reusedAdSets: out.adGroups.filter((g) => g.mode === "existing").length,
          creatives: out.creatives.length,
          errors: out.errors.length,
          activated: out.activated,
        },
        detail: { adSets: out.adGroups, creatives: out.creatives, errors: out.errors, warnings: out.warnings, ...opts.logExtra },
      });
      if (r.skipped) push({ kind: "info", text: r.skipped });
    } catch {
      /* 기록 실패는 결과에 영향 없음 */
    }
    push({ kind: out.errors.length ? "err" : "ok", text: `끝 — 광고그룹 ${out.adGroups.length} · 소재 ${out.creatives.length} · 오류 ${out.errors.length}` });
    return out;
  }
}
