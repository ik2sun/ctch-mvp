// 캠페인 오토파일럿 · GFA 수동 세팅 실행(브라우저) — 캠페인마다: (새 캠페인이면) 만들기 → runSetup(광고그룹·이미지·소재·켜기/끄기·기록) → (새 캠페인 + 켜기) 캠페인 켜기
import { postAutopilot, runSetup, type LogLine, type RunCollection, type RunCreative, type RunResult } from "../runner";
import { adSetSettings, campaignBody, cboOn, type CampaignDraft } from "./model";

export type ManualResult = RunResult & { campaigns: { no: number; name: string; created: boolean }[] };

export async function runManual(opts: { clientId: string; campaigns: CampaignDraft[]; turnOn: boolean; useUtm: boolean; onLog: (l: LogLine[]) => void }): Promise<ManualResult> {
  const out: ManualResult = { campaigns: [], adSets: [], creatives: [], errors: [], activated: false };
  let all: LogLine[] = [];
  const emit = (l: LogLine) => {
    all = [...all, l];
    opts.onLog(all);
  };
  const imageCache = new Map<string, number>(); // 이미지는 광고계정 단위 — 캠페인이 달라도 한 번만 올린다

  for (const c of opts.campaigns) {
    let campaignNo = c.existing?.no ?? 0;
    const campaignName = c.existing?.name ?? c.name.trim();
    if (!c.existing) {
      try {
        emit({ kind: "info", text: `캠페인 만드는 중: ${campaignName}` });
        const r = await postAutopilot<{ campaign: { no: number; name: string } }>({ action: "createCampaign", clientId: opts.clientId, campaign: campaignBody(c) });
        campaignNo = r.campaign.no;
        out.campaigns.push({ ...r.campaign, created: true });
        emit({ kind: "ok", text: `캠페인 생성 #${campaignNo} ${r.campaign.name} (꺼진 상태)` });
      } catch (e) {
        const m = `캠페인 ${campaignName} 생성 실패 — ${(e as Error).message}`;
        out.errors.push(m);
        emit({ kind: "err", text: m });
        continue;
      }
    } else out.campaigns.push({ no: campaignNo, name: campaignName, created: false });

    const cbo = cboOn(c);
    const creatives: RunCreative[] = [];
    const collections: RunCollection[] = [];
    for (const a of c.adSets) {
      for (const k of a.creatives) {
        if (k.kind === "MULTIPLE_IMAGE") {
          collections.push({
            adSetName: a.name.trim(),
            name: k.name.trim(),
            message: k.copy.message.trim(),
            cta: k.copy.cta,
            ctaUrl: k.ctaUrl.trim() || k.cards[0]?.url.trim() || "",
            cards: k.cards.filter((x) => x.image).map((x) => ({ image: x.image!, title: x.title, url: x.url })),
          });
        } else if (k.image) {
          creatives.push({
            adSetName: a.name.trim(),
            image: k.image,
            templates: k.templates,
            copy: k.copy,
            altMessage: k.altMessage,
            landingUrl: k.landingUrl,
            // 규격을 여러 개 고르면 규격마다 소재가 하나씩 — 이름 뒤에 규격 약어
            name: (t) => (k.templates.length > 1 ? `${k.name.trim()}_${t.short}` : k.name.trim()),
          });
        }
      }
    }

    const base = all;
    const r = await runSetup({
      clientId: opts.clientId,
      campaignNo,
      campaignName,
      startTime: null,
      adSets: c.adSets.map((a) => (a.existingNo ? { name: a.name.trim(), existingNo: a.existingNo } : { name: a.name.trim(), settings: adSetSettings(a, cbo) })),
      creatives,
      collections,
      useUtm: opts.useUtm,
      turnOn: opts.turnOn,
      kind: "manual",
      logExtra: { campaignCreated: !c.existing },
      imageCache,
      onLog: (lines) => {
        all = [...base, ...lines];
        opts.onLog(all);
      },
    });
    out.adSets.push(...r.adSets);
    out.creatives.push(...r.creatives);
    out.errors.push(...r.errors);
    out.activated = out.activated || r.activated;

    // 새로 만든 캠페인은 꺼진 상태로 만들어진다 — '바로 켜기'면 광고그룹이 하나라도 만들어졌을 때 켠다
    if (!c.existing && opts.turnOn && r.adSets.some((s) => s.created)) {
      try {
        await postAutopilot({ action: "activateCampaign", clientId: opts.clientId, campaignNo, activated: true });
        emit({ kind: "ok", text: `캠페인 #${campaignNo} 켬` });
      } catch (e) {
        const m = `캠페인 #${campaignNo} 켜기 실패 — ${(e as Error).message}`;
        out.errors.push(m);
        emit({ kind: "err", text: m });
      }
    }
  }
  return out;
}
