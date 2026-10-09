import { NextResponse } from "next/server";
import { gfaErrorResponse } from "@/lib/gfa/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { gfaAccess } from "@/features/autopilot/gfa/access";
import {
  activateAdSets,
  activateCampaigns,
  adSetBody,
  adSetTemplates,
  callToActions,
  campaignOptions,
  createAdSet,
  createCampaign,
  createImageBannerCreative,
  createMultipleImageCreative,
  createSingleImageCreative,
  accountProfile,
  getAdSet,
  getAdSetDetails,
  listCampaigns,
  loadCodeBook,
  loadContext,
  loadSample,
  manualAdSetBody,
  type ImageBannerCreative,
  type MultipleImageCreative,
  type SingleImageCreative,
} from "@/features/autopilot/gfa/gfaOps";
import { OVERRIDE_KEYS } from "@/features/autopilot/gfa/adSetSheet";
import { COLLECTION_CARDS, copyForTemplate, imageSpecs, templateByCode, templateCopyProblems, type PlanAdSet } from "@/features/autopilot/gfa/types";

export const maxDuration = 300;

// 캠페인 오토파일럿 · GFA 세팅(수동 세팅 · 엑셀 벌크 업로드)
// 읽기: campaigns · campaignOptions · codebook · profile · context · adSetDetails · adSetMeta
// 쓰기: createCampaign · activateCampaign · createAdSet · createAdSetManual · createCreative · activate · log — 구성원 누구나(access.ts memberOnly)
// 실행은 화면이 단계별로 부른다(이미지 업로드는 /api/autopilot/gfa/image) — Vercel 본문 4.5MB·시간 제한 안에서 진행 표시
const WRITE = new Set(["createCampaign", "activateCampaign", "createAdSet", "createAdSetManual", "createCreative", "activate", "log"]);
// 캠페인 생성 본문에 받는 칸(공식 스펙 CONVERSION·WEB_SITE_TRAFFIC)
const CAMPAIGN_KEYS = ["name", "objective", "brandNo", "urlNo", "conversionUrlNo", "conversionType", "s2sApiOn", "spendLimit", "optimization"] as const;
const CAMPAIGN_OBJECTIVES = ["CONVERSION", "WEB_SITE_TRAFFIC"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 본문을 읽지 못했어요." }, { status: 400 });
  const action = String(body.action ?? "");
  try {
    const access = await gfaAccess(body.clientId, WRITE.has(action));
    if (access instanceof NextResponse) return access;
    const c = access.creds;

    if (action === "campaigns") {
      return NextResponse.json({ adAccountNo: c.adAccountNo, campaigns: await listCampaigns(c) });
    }

    if (action === "profile") {
      // 광고계정 프로필(네이티브·컬렉션에 자동으로 붙는 이름) — 기존 소재 상세에서 읽음, 없으면 null
      return NextResponse.json({ profile: await accountProfile(c) });
    }

    if (action === "codebook") {
      // 코드 ↔ 이름(관심사·구매 의도·지역·확장 데모·게재 위치·고객 파일) — 엑셀 '광고그룹' 시트와 수동 세팅 타겟 선택
      return NextResponse.json(await loadCodeBook(c));
    }

    if (action === "campaignOptions") {
      // 새 캠페인 선택지 — 브랜드·대표 URL·전환 추적 대상(목적별)
      const objective = String(body.objective ?? "");
      if (!CAMPAIGN_OBJECTIVES.includes(objective)) return NextResponse.json({ error: "지원하지 않는 캠페인 목적이에요." }, { status: 400 });
      return NextResponse.json(await campaignOptions(c, objective));
    }

    if (action === "createCampaign") {
      const raw = (body.campaign ?? {}) as Record<string, unknown>;
      const camp = Object.fromEntries(CAMPAIGN_KEYS.filter((k) => raw[k] !== undefined && raw[k] !== null && raw[k] !== "").map((k) => [k, raw[k]]));
      const problems: string[] = [];
      if (!CAMPAIGN_OBJECTIVES.includes(String(camp.objective))) problems.push("목적은 웹사이트 전환·트래픽만");
      if (String(camp.name ?? "").trim().length < 2) problems.push("캠페인 이름 2자 이상");
      if (!Number(camp.brandNo)) problems.push("브랜드");
      if (!Number(camp.urlNo)) problems.push("대표 URL");
      if (problems.length) return NextResponse.json({ error: problems.join(", ") }, { status: 400 });
      const created = await createCampaign(c, camp);
      // 새 캠페인은 우선 꺼 둔다 — 켜기는 실행 끝에 화면 선택(activateCampaign)으로
      await activateCampaigns(c, [created.no], false).catch(() => null);
      return NextResponse.json({ campaign: created });
    }

    if (action === "activateCampaign") {
      const no = Number(body.campaignNo);
      if (!Number.isFinite(no) || no <= 0) return NextResponse.json({ error: "campaignNo가 필요해요." }, { status: 400 });
      await activateCampaigns(c, [no], body.activated === true);
      return NextResponse.json({ ok: true });
    }

    const campaignNo = Number(body.campaignNo);
    if (!Number.isFinite(campaignNo) || campaignNo <= 0) return NextResponse.json({ error: "campaignNo가 필요해요." }, { status: 400 });

    if (action === "context") {
      return NextResponse.json(await loadContext(c, campaignNo));
    }

    if (action === "adSetDetails") {
      // 기존 광고그룹 설정 전 항목 — 벌크 템플릿 '광고그룹' 시트 내보내기용. 이 캠페인 소속만 돌려준다
      const ctx = await loadContext(c, campaignNo);
      const state = new Map(ctx.existingAdSets.map((s) => [s.no, s.activated]));
      const details = await getAdSetDetails(c, campaignNo, ctx.existingAdSets.map((s) => s.no));
      return NextResponse.json({ adSets: details.map((d) => ({ ...d, activated: state.get(d.no) })) });
    }

    if (action === "createAdSetManual") {
      // 수동 세팅 — 화면에서 정한 GFA 칸 전부(OVERRIDE_KEYS만)를 그 캠페인 샘플 위에 덮는다
      const name = String(body.name ?? "").trim();
      if (name.length < 2) return NextResponse.json({ error: "광고그룹 이름은 2자 이상" }, { status: 400 });
      const raw = (body.settings ?? {}) as Record<string, unknown>;
      const settings = Object.fromEntries(OVERRIDE_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
      const created = await createAdSet(c, manualAdSetBody(await loadSample(c, campaignNo), name, settings));
      const [templates, ctas] = await Promise.all([adSetTemplates(c, created.no).catch(() => []), callToActions(c, created.no).catch(() => [] as string[])]);
      return NextResponse.json({ adSet: created, templates: imageSpecs(templates), ctas });
    }

    if (action === "createAdSet") {
      const a = body.adSet as PlanAdSet;
      const name = String(body.name ?? "").trim();
      if (!a || name.length < 2) return NextResponse.json({ error: "광고그룹 이름·타겟이 필요해요." }, { status: 400 });
      const ctx = await loadContext(c, campaignNo);
      // 엑셀 '광고그룹' 시트에 적힌 칸 — GFA 생성 본문에 있는 칸만 받아 기본값 위에 덮는다
      const raw = (body.overrides ?? {}) as Record<string, unknown>;
      const overrides = Object.fromEntries(OVERRIDE_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
      const created = await createAdSet(c, { ...adSetBody(ctx.sample, ctx.types, a, name, (body.startTime as string | null) ?? null), ...overrides });
      // 템플릿·CTA 조회가 실패해도 광고그룹 생성 결과는 돌려준다(화면이 기본 규격으로 진행)
      const [templates, ctas] = await Promise.all([adSetTemplates(c, created.no).catch(() => []), callToActions(c, created.no).catch(() => [] as string[])]);
      return NextResponse.json({ adSet: created, templates: imageSpecs(templates), ctas });
    }

    if (action === "adSetMeta") {
      // 벌크 업로드가 기존 광고그룹에 소재를 넣을 때 — 이 캠페인 소속인지 확인하고 템플릿·CTA를 돌려준다
      const adSetNo = Number(body.adSetNo);
      if (!Number.isFinite(adSetNo) || adSetNo <= 0) return NextResponse.json({ error: "adSetNo가 필요해요." }, { status: 400 });
      const [d, ctas] = await Promise.all([getAdSet(c, adSetNo), callToActions(c, adSetNo).catch(() => [] as string[])]);
      if (Number(d.campaignNo) !== campaignNo) return NextResponse.json({ error: "선택한 캠페인의 광고그룹이 아니에요." }, { status: 400 });
      return NextResponse.json({ adSet: { no: d.no, name: d.name }, templates: imageSpecs(d.creativeTemplates), ctas });
    }

    if (action === "createCreative") {
      const cr = body.creative as SingleImageCreative;
      const tpl = templateByCode(cr?.creativeTemplateCode ?? "");
      if (!tpl) return NextResponse.json({ error: "지원하지 않는 소재 템플릿이에요." }, { status: 400 });
      if (tpl.kind === "MULTIPLE_IMAGE") {
        // 컬렉션 — 카드 4~10장(설명 문구 2~28자·랜딩 URL) + 광고 문구·CTA·CTA URL
        const m = body.creative as MultipleImageCreative;
        const cards = Array.isArray(m.imageMedias) ? m.imageMedias : [];
        const problems: string[] = [];
        if (!m.adSetNo) problems.push("광고그룹 번호 없음");
        if (cards.length < COLLECTION_CARDS.min || cards.length > COLLECTION_CARDS.max) problems.push(`카드는 ${COLLECTION_CARDS.min}~${COLLECTION_CARDS.max}장(지금 ${cards.length}장)`);
        if (cards.some((x) => !x.imageNo || !x.linkUrl || (x.linkTitle ?? "").trim().length < 2 || x.linkTitle.trim().length > COLLECTION_CARDS.titleMax)) problems.push(`카드마다 이미지·랜딩 URL·설명 문구(2~${COLLECTION_CARDS.titleMax}자) 필요`);
        const msg = (m.message ?? "").trim();
        if (msg.length < 2 || msg.length > COLLECTION_CARDS.messageMax) problems.push(`광고 문구 2~${COLLECTION_CARDS.messageMax}자`);
        if (!m.ctaCode || !m.ctaUrl) problems.push("CTA·CTA URL 필요");
        if (problems.length) return NextResponse.json({ error: problems.join(", ") }, { status: 400 });
        return NextResponse.json({
          creative: await createMultipleImageCreative(c, {
            adSetNo: m.adSetNo,
            name: m.name,
            message: msg,
            creativeTemplateCode: tpl.code,
            ctaCode: m.ctaCode,
            ctaUrl: m.ctaUrl,
            imageMedias: cards.map((x) => ({ imageNo: x.imageNo, linkUrl: x.linkUrl, linkTitle: x.linkTitle.trim() })),
          }),
        });
      }
      if (!cr?.adSetNo || !cr.imageNo) return NextResponse.json({ error: "소재 정보가 부족해요." }, { status: 400 });
      if (tpl.kind === "IMAGE_BANNER") {
        // 배너형은 글자가 이미지 안에 있어 랜딩 URL + 광고 안내 문구(대체 텍스트)만 보낸다
        const altMessage = String((body.creative as ImageBannerCreative).altMessage ?? "").trim().slice(0, 100);
        if (altMessage.length < 2) return NextResponse.json({ error: "배너 소재의 광고 안내 문구는 2자 이상" }, { status: 400 });
        return NextResponse.json({
          creative: await createImageBannerCreative(c, { adSetNo: cr.adSetNo, creativeTemplateCode: tpl.code, imageNo: cr.imageNo, name: cr.name, url: cr.linkUrl, altMessage }),
        });
      }
      // 네이티브 이미지 — 템플릿이 받는 문구 칸만 보낸다(공식 소재 가이드 표)
      const problems = templateCopyProblems(cr, tpl.code);
      if (problems.length) return NextResponse.json({ error: problems.join(", ") }, { status: 400 });
      return NextResponse.json({
        creative: await createSingleImageCreative(c, {
          adSetNo: cr.adSetNo,
          creativeTemplateCode: tpl.code,
          imageNo: cr.imageNo,
          name: cr.name,
          linkUrl: cr.linkUrl,
          ctaCode: cr.ctaCode,
          ...copyForTemplate(cr, tpl.code),
        }),
      });
    }

    if (action === "activate") {
      const nos = (Array.isArray(body.adSetNos) ? body.adSetNos : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      if (!nos.length) return NextResponse.json({ error: "adSetNos가 필요해요." }, { status: 400 });
      await activateAdSets(c, nos, body.activated === true);
      return NextResponse.json({ ok: true });
    }

    if (action === "log") {
      // 실행 기록 — 테이블(0031)이 없으면 건너뛴다
      const { error } = await createAdminClient().from("autopilot_actions").insert({
        client_id: body.clientId,
        media: "gfa",
        ad_account_no: c.adAccountNo,
        campaign_no: campaignNo,
        kind: "setup",
        summary: body.summary ?? null,
        detail: body.detail ?? null,
        created_by: access.userEmail,
      });
      return NextResponse.json({ ok: !error, skipped: error ? "실행 기록 테이블이 없어 기록은 건너뛰었어요(0031 마이그레이션 실행 필요)." : undefined });
    }

    return NextResponse.json({ error: "알 수 없는 action이에요." }, { status: 400 });
  } catch (e) {
    return gfaErrorResponse(e, "GFA 자동 세팅 중 오류가 났어요.");
  }
}
