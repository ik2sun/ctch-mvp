import { NextResponse } from "next/server";
import { MetaGraphError } from "@/lib/meta/graph";
import { createAdminClient } from "@/lib/supabase/admin";
import { metaAccess } from "@/features/autopilot/meta/access";
import {
  copyAdSet,
  createAd,
  createAdSet,
  createCampaign,
  createCreative,
  createVideo,
  dropCache,
  getAdSet,
  getCampaign,
  listAdSets,
  listAudiences,
  loadAccount,
  updateObject,
  videoStatus,
} from "@/features/autopilot/meta/metaOps";
import { adSetBody, campaignBody, copyOverrides, creativeBody, NEW_OBJECTIVES, SUPPORTED_OBJECTIVES, type AdSetDraft, type CampaignDraft, type Copy, type UploadedMedia } from "@/features/autopilot/meta/model";

export const maxDuration = 120;

// 캠페인 오토파일럿 · 메타 빠른 세팅
// 읽기: account · adsets / 쓰기: createCampaign · createAdSet · copyAdSet · videoUploadUrl · registerVideo · videoStatus · createCreative · createAd · activate · cleanup · log
// 본문은 화면 초안(model.ts)을 받아 서버가 만든다 — 임의 칸을 메타에 넘기지 않게. 이미지 업로드는 /api/autopilot/meta/image
// validateOnly=true면 메타에 '검증만' 요청(실제로 만들지 않음)
const WRITE = new Set(["createCampaign", "createAdSet", "copyAdSet", "videoUploadUrl", "registerVideo", "createCreative", "createAd", "activate", "cleanup", "log"]);
const BUCKET = "shortform";
const VIDEO_DIR = "autopilot-meta";
const bare = (act: string) => act.replace(/^act_/, "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 본문을 읽지 못했어요." }, { status: 400 });
  const action = String(body.action ?? "");
  const validateOnly = body.validateOnly === true;
  try {
    const access = await metaAccess(body.clientId, WRITE.has(action));
    if (access instanceof NextResponse) return access;
    const { act, token } = access;

    // 이 광고계정 소속인지 확인
    const ownCampaign = async (id: unknown) => {
      const c = await getCampaign(String(id ?? ""), token);
      if (c.account_id !== bare(act)) throw new MetaGraphError("이 광고계정의 캠페인이 아니에요.");
      return c;
    };
    const ownAdSet = async (id: unknown) => {
      const a = await getAdSet(String(id ?? ""), token);
      if (a.account_id !== bare(act)) throw new MetaGraphError("이 광고계정의 광고세트가 아니에요.");
      return a;
    };

    if (action === "account") {
      return NextResponse.json(await loadAccount(act, token, body.fresh === true));
    }

    if (action === "audiences") {
      return NextResponse.json({ audiences: await listAudiences(act, token) });
    }

    if (action === "adsets") {
      const acc = await loadAccount(act, token);
      await ownCampaign(body.campaignId);
      return NextResponse.json({ adSets: await listAdSets(act, String(body.campaignId), token, acc.offset) });
    }

    if (action === "createCampaign") {
      const c = body.campaign as CampaignDraft;
      if (!c || !NEW_OBJECTIVES.some((o) => o.key === c.objective)) return NextResponse.json({ error: "지원하지 않는 캠페인 목표예요." }, { status: 400 });
      if (String(c.name ?? "").trim().length < 2) return NextResponse.json({ error: "캠페인 이름은 2자 이상" }, { status: 400 });
      const acc = await loadAccount(act, token);
      if (c.cbo && (!c.budget || c.budget < acc.minDailyBudget)) return NextResponse.json({ error: `캠페인 일 예산은 ${acc.minDailyBudget}원 이상` }, { status: 400 });
      // 새 캠페인은 끈 상태로 만들고, 실행 끝에 '바로 켜기'면 activate로 켠다
      const r = await createCampaign(act, campaignBody(c, false, acc.offset), token, validateOnly);
      dropCache(`${act}:account`);
      return NextResponse.json({ id: r.id ?? null, validated: validateOnly });
    }

    if (action === "createAdSet" || action === "copyAdSet") {
      const a = body.adSet as AdSetDraft;
      if (!a || String(a.name ?? "").trim().length < 2) return NextResponse.json({ error: "광고세트 이름은 2자 이상" }, { status: 400 });
      const acc = await loadAccount(act, token);
      const camp = await ownCampaign(body.campaignId);
      if (!SUPPORTED_OBJECTIVES.includes(camp.objective)) return NextResponse.json({ error: "이 캠페인 목표는 지원하지 않아요." }, { status: 400 });
      const cbo = Number(camp.daily_budget) > 0 || Number(camp.lifetime_budget) > 0;
      // 맞춤 타겟은 이 광고계정 것만
      const audIds = [...(a.includeAudiences ?? []), ...(a.excludeAudiences ?? [])];
      if (audIds.length) {
        const own = new Set((await listAudiences(act, token)).map((x) => x.id));
        const bad = audIds.filter((id) => !own.has(String(id)));
        if (bad.length) return NextResponse.json({ error: `이 광고계정의 맞춤 타겟이 아니에요(${bad.join(", ")})` }, { status: 400 });
      }
      if (action === "createAdSet") {
        const pixelId = String(body.pixelId ?? "");
        if (pixelId && !acc.pixels.some((p) => p.id === pixelId)) return NextResponse.json({ error: "이 광고계정의 픽셀이 아니에요." }, { status: 400 });
        const r = await createAdSet(act, adSetBody(a, { campaignId: camp.id, objective: camp.objective, cbo, pixelId, offset: acc.offset, turnOn: false }), token, validateOnly);
        dropCache(`${act}:adsets:${camp.id}`);
        return NextResponse.json({ id: r.id ?? null, validated: validateOnly });
      }
      // 설정 복사 — 원본 세트(같은 광고계정)를 대상 캠페인으로 복사 → 화면 값 덮어쓰기
      const src = await ownAdSet(a.sourceId);
      if (validateOnly) return NextResponse.json({ id: null, validated: true });
      const id = await copyAdSet(src.id, camp.id, token);
      try {
        await updateObject(id, copyOverrides(a, src, { cbo, offset: acc.offset }), token);
      } catch (e) {
        // 복사는 됐지만 덮어쓰기 실패 — 세트 ID를 알려 줘서 화면이 이어서 진행·안내
        return NextResponse.json({ id, warning: `복사는 됐지만 이름·예산·연령 반영 실패 — ${(e as Error).message}` });
      }
      dropCache(`${act}:adsets:${camp.id}`);
      return NextResponse.json({ id });
    }

    if (action === "videoUploadUrl") {
      // 영상은 Vercel 본문 한도(4.5MB) 때문에 브라우저 → 스토리지로 직접 올리고, 메타가 공개 URL에서 받아 가게 한다
      const ext = String(body.ext ?? "mp4").toLowerCase() === "mov" ? "mov" : "mp4";
      const path = `${VIDEO_DIR}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return NextResponse.json({ error: `업로드 주소를 못 만들었어요 — ${error?.message ?? ""}` }, { status: 500 });
      return NextResponse.json({ bucket: BUCKET, path, token: data.token });
    }

    if (action === "registerVideo") {
      const path = String(body.path ?? "");
      if (!path.startsWith(`${VIDEO_DIR}/`)) return NextResponse.json({ error: "잘못된 영상 경로예요." }, { status: 400 });
      const url = createAdminClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      return NextResponse.json({ videoId: await createVideo(act, url, String(body.name ?? "video"), token) });
    }

    if (action === "videoStatus") {
      return NextResponse.json(await videoStatus(String(body.videoId ?? ""), token));
    }

    if (action === "cleanup") {
      const paths = (Array.isArray(body.paths) ? body.paths : []).map(String).filter((p) => p.startsWith(`${VIDEO_DIR}/`));
      if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
      return NextResponse.json({ ok: true });
    }

    if (action === "createCreative") {
      const acc = await loadAccount(act, token);
      const page = acc.pages.find((p) => p.id === body.pageId);
      if (!page) return NextResponse.json({ error: "이 광고계정에서 홍보할 수 있는 페이지가 아니에요." }, { status: 400 });
      const igId = body.igId ? String(body.igId) : "";
      if (igId && page.igId !== igId) return NextResponse.json({ error: "페이지에 연결된 인스타그램 계정이 아니에요." }, { status: 400 });
      const copy = body.copy as Copy;
      if (!copy?.url || !/^https?:\/\//.test(copy.url)) return NextResponse.json({ error: "랜딩 URL이 필요해요." }, { status: 400 });
      const feed = (body.feed as UploadedMedia | null) ?? null;
      const vertical = (body.vertical as UploadedMedia | null) ?? null;
      if (!feed && !vertical) return NextResponse.json({ error: "소재가 없어요." }, { status: 400 });
      const r = await createCreative(
        act,
        creativeBody({ name: String(body.name ?? "creative"), pageId: page.id, igId, copy, feed, vertical, urlTags: String(body.urlTags ?? ""), aiEnhance: body.aiEnhance === true, productExt: body.productExt === true }),
        token,
        validateOnly,
      );
      return NextResponse.json({ id: r.id ?? null, validated: validateOnly });
    }

    if (action === "createAd") {
      const set = await ownAdSet(body.adSetId);
      const name = String(body.name ?? "").trim().slice(0, 400);
      if (!name || !body.creativeId) return NextResponse.json({ error: "광고 이름·소재가 필요해요." }, { status: 400 });
      const r = await createAd(act, { name, adset_id: set.id, creative: { creative_id: String(body.creativeId) }, status: body.active === true ? "ACTIVE" : "PAUSED" }, token, validateOnly);
      return NextResponse.json({ id: r.id ?? null, validated: validateOnly });
    }

    if (action === "activate") {
      // 이번에 만든 캠페인·광고세트만 켠다(화면이 보낸 ID를 이 계정 소속인지 확인)
      const done: string[] = [];
      if (body.campaignId) {
        await ownCampaign(body.campaignId);
        await updateObject(String(body.campaignId), { status: "ACTIVE" }, token);
        done.push(String(body.campaignId));
      }
      for (const id of (Array.isArray(body.adSetIds) ? body.adSetIds : []).map(String)) {
        await ownAdSet(id);
        await updateObject(id, { status: "ACTIVE" }, token);
        done.push(id);
      }
      dropCache(act);
      return NextResponse.json({ ok: true, done });
    }

    if (action === "log") {
      // 실행 기록 — 테이블(0031)이 없으면 건너뛴다
      const { error } = await createAdminClient().from("autopilot_actions").insert({
        client_id: body.clientId,
        media: "meta",
        ad_account_no: act,
        campaign_no: body.campaignId ? String(body.campaignId) : null,
        kind: "setup",
        summary: body.summary ?? null,
        detail: body.detail ?? null,
        created_by: access.userEmail,
      });
      return NextResponse.json({ ok: !error, skipped: error ? `실행 기록은 건너뛰었어요 — ${error.message}` : undefined });
    }

    return NextResponse.json({ error: "알 수 없는 action이에요." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "메타 요청 실패";
    return NextResponse.json({ error: msg, code: e instanceof MetaGraphError ? e.code : undefined }, { status: 502 });
  }
}
