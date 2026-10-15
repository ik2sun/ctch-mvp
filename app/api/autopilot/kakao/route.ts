import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KakaoAuthError } from "@/lib/kakao-moment/auth";
import { KakaoMomentApiError } from "@/lib/kakao-moment/client";
import { kakaoAccess } from "@/features/autopilot/kakao/access";
import { accountDefaults, createAdGroup, createCreative, dropCache, findAdGroupByName, getAdGroupRaw, listAdGroups, loadAccount, ownCampaign, setAdGroupConfig, setCreativeConfig } from "@/features/autopilot/kakao/kakaoOps";
import { copyAdGroupBody, copyProblems, creativeBody, FORMAT_OF, kindOf, newAdGroupBody, SUPPORTED_KINDS, todayKst, type AdGroupDraft, type Copy, type Freq, type KakaoFormat, type KakaoType } from "@/features/autopilot/kakao/model";

export const maxDuration = 120;

// 캠페인 오토파일럿 · 카카오모먼트 자동 대량 세팅
// 읽기: account · defaults · adgroups / 쓰기: uploadUrl · createAdGroup · createCreative · activate · cleanup · log
// 본문은 화면 초안을 받아 서버가 model.ts로 만든다 — 임의 칸을 카카오에 넘기지 않게. 파일은 브라우저 → 스토리지(서명 업로드) → 공개 URL을 카카오가 받아 감
// 카카오에는 검증 전용 호출이 없어 실제로 만든다. 새 광고그룹은 만든 직후 끄고(바로 켜기면 그대로), 기존 광고그룹에 넣는 소재도 바로 켜기가 아니면 끈다
const WRITE = new Set(["uploadUrl", "createAdGroup", "createCreative", "activate", "cleanup", "log"]);
const BUCKET = "shortform";
const DIR = "autopilot-kakao";
const EXT = new Set(["png", "jpg", "jpeg", "mp4"]);
const publicUrl = (path: string) => createAdminClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const ownPath = (p: unknown) => typeof p === "string" && p.startsWith(`${DIR}/`) && !p.includes("..");
// 프로필 이미지 재사용 — 카카오 CDN에 이미 올라간 것만(임의 외부 주소는 받지 않음)
const kakaoCdn = (u: unknown) => typeof u === "string" && /^https:\/\/[a-z0-9.-]+\.(kakaocdn|daumcdn)\.net\//i.test(u);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 본문을 읽지 못했어요." }, { status: 400 });
  const action = String(body.action ?? "");
  try {
    const access = await kakaoAccess(body.clientId, WRITE.has(action));
    if (access instanceof NextResponse) return access;
    const c = access.creds;
    const acc = c.adAccountId;

    // 광고그룹이 이 계정 캠페인 소속인지 + 그 캠페인
    const ownAdGroup = async (id: unknown) => {
      const raw = await getAdGroupRaw(c, String(id ?? ""));
      const camp = await ownCampaign(c, raw.campaign?.id);
      return { raw, camp };
    };
    const supported = (camp: { type: string; goal: string }) => {
      if (!SUPPORTED_KINDS.includes(kindOf(camp))) throw new Error("이 캠페인 유형은 자동 세팅을 지원하지 않아요(비즈보드·디스플레이·동영상).");
    };

    if (action === "account") return NextResponse.json(await loadAccount(c, body.fresh === true));

    if (action === "defaults") {
      const a = await loadAccount(c);
      return NextResponse.json(await accountDefaults(c, a.campaigns));
    }

    if (action === "adgroups") {
      const camp = await ownCampaign(c, body.campaignId);
      return NextResponse.json({ adGroups: await listAdGroups(c, camp.id, body.fresh === true) });
    }

    if (action === "uploadUrl") {
      const ext = String(body.ext ?? "").toLowerCase();
      if (!EXT.has(ext)) return NextResponse.json({ error: "PNG·JPG·MP4만 올릴 수 있어요." }, { status: 400 });
      const path = `${DIR}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return NextResponse.json({ error: `업로드 주소를 못 만들었어요 — ${error?.message ?? ""}` }, { status: 500 });
      return NextResponse.json({ bucket: BUCKET, path, token: data.token });
    }

    if (action === "createAdGroup") {
      const d = body.adGroup as AdGroupDraft | undefined;
      if (!d || String(d.name ?? "").trim().length < 1) return NextResponse.json({ error: "광고그룹 이름이 필요해요." }, { status: 400 });
      if ([...String(d.name).trim()].length > 50) return NextResponse.json({ error: "광고그룹 이름은 50자 이하" }, { status: 400 });
      const camp = await ownCampaign(c, body.campaignId);
      supported(camp);
      // 같은 이름 광고그룹이 이미 있으면 새로 만들지 않고 그 그룹을 쓴다
      const dup = await findAdGroupByName(c, camp.id, d.name);
      if (dup) return NextResponse.json({ id: dup, reused: true });
      const ctx = { campaignId: camp.id, campaignType: camp.type, campaignGoal: camp.goal, campaignBudget: camp.dailyBudget, today: todayKst() };
      let built: { body: Record<string, unknown>; problems: string[] };
      if (d.mode === "copy") {
        const src = await ownAdGroup(d.sourceId);
        if (src.camp.type !== camp.type) return NextResponse.json({ error: `원본 광고그룹은 ${src.camp.type} 캠페인 소속이라 ${camp.type} 캠페인에 복사할 수 없어요.` }, { status: 400 });
        built = copyAdGroupBody(src.raw, d, ctx);
      } else built = newAdGroupBody(d, ctx);
      if (built.problems.length) return NextResponse.json({ error: built.problems.join(" · ") }, { status: 400 });
      const r = await createAdGroup(c, built.body);
      const id = String(r.id);
      dropCache(`${acc}:adgroups:${camp.id}`);
      // 새 광고그룹은 꺼 두고 만든다(바로 켜기면 그대로) — 끄기 실패는 경고로만
      let warning: string | undefined;
      if (body.turnOn !== true) {
        try {
          await setAdGroupConfig(c, id, false);
        } catch (e) {
          warning = `만들었지만 끄지 못했어요 — 카카오모먼트에서 확인해 주세요(${(e as Error).message})`;
        }
      }
      return NextResponse.json({ id, warning });
    }

    if (action === "createCreative") {
      const { camp } = await ownAdGroup(body.adGroupId);
      supported(camp);
      const format = FORMAT_OF[camp.type as KakaoType] as KakaoFormat;
      if (body.format !== format) return NextResponse.json({ error: `이 광고그룹(${camp.type})에는 ${format} 소재만 만들 수 있어요.` }, { status: 400 });
      if (!ownPath(body.mediaPath)) return NextResponse.json({ error: "소재 파일 경로가 잘못됐어요." }, { status: 400 });
      if (body.thumbPath && !ownPath(body.thumbPath)) return NextResponse.json({ error: "썸네일 경로가 잘못됐어요." }, { status: 400 });
      let profileUrl: string | null = null;
      if (format !== "IMAGE_BANNER") {
        if (ownPath(body.profilePath)) profileUrl = publicUrl(String(body.profilePath));
        else if (kakaoCdn(body.profileUrl)) profileUrl = String(body.profileUrl);
        else return NextResponse.json({ error: "프로필 이미지가 필요해요." }, { status: 400 });
      }
      const copy = body.copy as Copy;
      const probs = copyProblems(format, copy, { name: copy?.profileName ?? "", imageUrl: profileUrl });
      if (probs.length) return NextResponse.json({ error: probs.join(" · ") }, { status: 400 });
      const freq = (body.freq as Freq) ?? { type: "AUTO" };
      if (freq.type === "DAY_IMP" && !(freq.cap >= 1 && freq.cap <= 5 && freq.hours >= 1 && freq.hours <= 24)) return NextResponse.json({ error: "게재빈도는 1~24시간에 1~5회" }, { status: 400 });
      const r = await createCreative(
        c,
        creativeBody({
          format,
          adGroupId: String(body.adGroupId),
          name: String(body.name ?? "creative"),
          copy,
          freq,
          opinion: String(body.opinion ?? ""),
          aiLabel: body.aiLabel === true,
          mediaUrl: publicUrl(String(body.mediaPath)),
          thumbUrl: body.thumbPath ? publicUrl(String(body.thumbPath)) : null,
          profileUrl,
        }),
      );
      const id = String(r.id);
      let warning: string | undefined;
      if (body.active === false) {
        try {
          await setCreativeConfig(c, id, false);
        } catch (e) {
          warning = `만들었지만 끄지 못했어요(${(e as Error).message})`;
        }
      }
      return NextResponse.json({ id, reviewStatus: r.reviewStatus ?? null, warning });
    }

    if (action === "activate") {
      // 이번에 만든 광고그룹만 켠다(화면이 보낸 ID를 이 계정 소속인지 확인)
      const done: string[] = [];
      for (const id of (Array.isArray(body.adGroupIds) ? body.adGroupIds : []).map(String)) {
        await ownAdGroup(id);
        await setAdGroupConfig(c, id, true);
        done.push(id);
      }
      dropCache(acc);
      return NextResponse.json({ ok: true, done });
    }

    if (action === "cleanup") {
      const paths = (Array.isArray(body.paths) ? body.paths : []).filter(ownPath).map(String);
      if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
      return NextResponse.json({ ok: true });
    }

    if (action === "log") {
      const { error } = await createAdminClient().from("autopilot_actions").insert({
        client_id: body.clientId,
        media: "kakao",
        ad_account_no: acc,
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
    const msg = e instanceof Error ? e.message : "카카오모먼트 요청 실패";
    const code = e instanceof KakaoAuthError ? e.code : e instanceof KakaoMomentApiError ? e.code : undefined;
    return NextResponse.json({ error: msg, code }, { status: e instanceof KakaoAuthError ? 409 : 502 });
  }
}
