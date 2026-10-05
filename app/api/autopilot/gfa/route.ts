import { NextResponse } from "next/server";
import { gfaErrorResponse } from "@/lib/gfa/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { gfaAccess } from "@/features/autopilot/gfa/access";
import {
  activateAdSets,
  adSetBody,
  adSetTemplates,
  callToActions,
  createAdSet,
  createSingleImageCreative,
  getAdSet,
  getAdSetDetails,
  listCampaigns,
  loadCodeBook,
  loadContext,
  type SingleImageCreative,
} from "@/features/autopilot/gfa/gfaOps";
import { buildPlan } from "@/features/autopilot/gfa/plan";
import { OVERRIDE_KEYS } from "@/features/autopilot/gfa/adSetSheet";
import { SUPPORTED_OBJECTIVES, copyProblems, singleImageSpecs, type PlanAdSet, type SetupBrief } from "@/features/autopilot/gfa/types";

export const maxDuration = 300;

// 캠페인 오토파일럿 · GFA 자동 세팅
// 읽기(구성원): campaigns · codebook · context · adSetDetails · plan · adSetMeta / 쓰기(소유자): createAdSet · createCreative · activate · log
// 실행은 화면이 단계별로 부른다(이미지 업로드는 /api/autopilot/gfa/image) — Vercel 본문 4.5MB·시간 제한 안에서 진행 표시
const WRITE = new Set(["createAdSet", "createCreative", "activate", "log"]);

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

    if (action === "codebook") {
      // 엑셀 '광고그룹' 시트의 코드 ↔ 이름(관심사·구매 의도·지역·확장 데모·게재 위치·고객 파일)
      return NextResponse.json(await loadCodeBook(c));
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

    if (action === "plan") {
      const brief = body.brief as SetupBrief;
      if (!brief?.product?.trim() || !brief?.landingUrl?.trim()) return NextResponse.json({ error: "상품과 랜딩 URL은 꼭 넣어 주세요." }, { status: 400 });
      if (!(brief.dailyBudget > 0)) return NextResponse.json({ error: "일 예산을 넣어 주세요." }, { status: 400 });
      const ctx = await loadContext(c, campaignNo);
      if (!SUPPORTED_OBJECTIVES.includes(ctx.campaign.objective)) {
        return NextResponse.json({ error: "이 캠페인 목적은 아직 자동 세팅을 지원하지 않아요(전환·웹사이트 트래픽·참여 유도만)." }, { status: 400 });
      }
      const plan = await buildPlan(ctx, brief, Number(body.imageCount) || 0);
      return NextResponse.json({ plan, context: ctx });
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
      return NextResponse.json({ adSet: created, templates: singleImageSpecs(templates), ctas });
    }

    if (action === "adSetMeta") {
      // 벌크 업로드가 기존 광고그룹에 소재를 넣을 때 — 이 캠페인 소속인지 확인하고 템플릿·CTA를 돌려준다
      const adSetNo = Number(body.adSetNo);
      if (!Number.isFinite(adSetNo) || adSetNo <= 0) return NextResponse.json({ error: "adSetNo가 필요해요." }, { status: 400 });
      const [d, ctas] = await Promise.all([getAdSet(c, adSetNo), callToActions(c, adSetNo).catch(() => [] as string[])]);
      if (Number(d.campaignNo) !== campaignNo) return NextResponse.json({ error: "선택한 캠페인의 광고그룹이 아니에요." }, { status: 400 });
      return NextResponse.json({ adSet: { no: d.no, name: d.name }, templates: singleImageSpecs(d.creativeTemplates), ctas });
    }

    if (action === "createCreative") {
      const cr = body.creative as SingleImageCreative;
      if (!cr?.adSetNo || !cr.imageNo || !cr.creativeTemplateCode) return NextResponse.json({ error: "소재 정보가 부족해요." }, { status: 400 });
      const problems = copyProblems({ message: cr.message, linkTitle: cr.linkTitle, linkDescription: cr.linkDescription, cta: cr.ctaCode });
      if (problems.length) return NextResponse.json({ error: problems.join(", ") }, { status: 400 });
      return NextResponse.json({ creative: await createSingleImageCreative(c, cr) });
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
