// 캠페인 오토파일럿 · GFA 실행 엔진(브라우저) — AI 자동 세팅과 엑셀 벌크 업로드가 같이 쓴다.
// 광고그룹(새로 만들기 또는 기존 재사용) → 템플릿 규격으로 이미지 자르기·업로드(광고계정 단위라 재사용) → 소재 생성 → 새 광고그룹만 켜기/끄기 → 기록
import { ALL_TEMPLATES, COLLECTION_TEMPLATE, copyForTemplate, withUtm, type PlanAdSet, type PlanCopy, type TemplateSpec } from "./types";
import { fitToTemplate, type SourceImage } from "./imageFit";

export type RunAdSet = { name: string; existingNo?: number; target?: PlanAdSet; overrides?: Record<string, unknown> }; // overrides = 엑셀 광고그룹 시트에 적힌 GFA 칸
// altMessage = 배너(IMAGE_BANNER) 소재의 광고 안내 문구, 비우면 광고 문구 → 제목
export type RunCreative = { adSetName: string; image: SourceImage; templates: string[]; copy: PlanCopy; altMessage?: string; landingUrl: string; name: (t: TemplateSpec) => string };
// 컬렉션 — 카드(이미지·설명 문구·랜딩 URL) 4~10장이 소재 하나
export type RunCollection = { adSetName: string; name: string; message: string; cta: string; ctaUrl: string; cards: { image: SourceImage; title: string; url: string }[] };
export type LogLine = { kind: "ok" | "err" | "info"; text: string };
export type RunResult = {
  adSets: { no: number; name: string; created: boolean }[];
  creatives: { no: number; name: string; adSetNo: number }[];
  errors: string[];
  activated: boolean;
};

export async function postAutopilot<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/autopilot/gfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요. 로그인이 만료됐다면 새로고침해 주세요." }));
  if (!res.ok) throw Object.assign(new Error(json.error || "요청 실패"), { code: json.code as string | undefined });
  return json as T;
}

export async function runSetup(opts: {
  clientId: string;
  campaignNo: number;
  campaignName: string;
  startTime: string | null;
  adSets: RunAdSet[];
  creatives: RunCreative[];
  collections?: RunCollection[];
  useUtm: boolean;
  turnOn: boolean;
  kind: "ai" | "bulk";
  logExtra?: Record<string, unknown>;
  onLog: (lines: LogLine[]) => void;
  imageCache?: Map<string, number>; // 여러 캠페인을 이어 돌릴 때 공유 — 이미지는 광고계정 단위라 다시 올리지 않는다
}): Promise<RunResult> {
  const { clientId, campaignNo } = opts;
  const lines: LogLine[] = [];
  const push = (l: LogLine) => {
    lines.push(l);
    opts.onLog([...lines]);
  };
  const out: RunResult = { adSets: [], creatives: [], errors: [], activated: false };
  const fail = (m: string) => {
    out.errors.push(m);
    push({ kind: "err", text: m });
  };
  const imageNos = opts.imageCache ?? new Map<string, number>(); // `${이미지 id}:${템플릿}` → GFA 이미지 번호
  // 템플릿 규격으로 맞춰 한 번만 업로드(같은 이미지·템플릿은 재사용)
  async function upload(img: SourceImage, t: TemplateSpec): Promise<number> {
    const key = `${img.id}:${t.code}`;
    const hit = imageNos.get(key);
    if (hit) return hit;
    const file = await fitToTemplate(img, t);
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("templateCode", t.code);
    fd.set("file", file);
    const res = await fetch("/api/autopilot/gfa/image", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "업로드 실패");
    const no = json.image.no as number;
    imageNos.set(key, no);
    push({ kind: "ok", text: `이미지 업로드 #${no} ${img.file.name} → ${t.label} (${Math.round(file.size / 1024)}KB)` });
    return no;
  }
  const ctaFor = (ctas: string[], want: string) => (ctas.length && !ctas.includes(want) ? (ctas.includes("MORE") ? "MORE" : ctas[0]) : want);

  for (const a of opts.adSets) {
    let info: { adSet: { no: number; name: string }; templates: TemplateSpec[]; ctas: string[] };
    try {
      if (a.existingNo) {
        push({ kind: "info", text: `기존 광고그룹 사용: #${a.existingNo} ${a.name}` });
        info = await postAutopilot({ action: "adSetMeta", clientId, campaignNo, adSetNo: a.existingNo });
        out.adSets.push({ ...info.adSet, created: false });
      } else {
        if (!a.target) throw new Error("타겟 정보가 없어요");
        push({ kind: "info", text: `광고그룹 만드는 중: ${a.name}` });
        info = await postAutopilot({ action: "createAdSet", clientId, campaignNo, adSet: a.target, name: a.name, startTime: opts.startTime, overrides: a.overrides });
        out.adSets.push({ ...info.adSet, created: true });
        push({ kind: "ok", text: `광고그룹 생성 #${info.adSet.no} ${info.adSet.name}` });
      }
    } catch (e) {
      fail(`광고그룹 ${a.name} ${a.existingNo ? "조회" : "생성"} 실패 — ${(e as Error).message}`);
      continue;
    }

    for (const c of opts.creatives.filter((x) => x.adSetName === a.name)) {
      // 광고그룹이 허용한 템플릿과 요청 규격의 교집합(조회 실패면 요청 규격 그대로)
      const wanted = ALL_TEMPLATES.filter((t) => c.templates.includes(t.code));
      const allowed = info.templates.length ? info.templates.filter((t) => c.templates.includes(t.code)) : wanted;
      if (!allowed.length) {
        fail(`${a.name} · ${c.image.file.name}: 이 광고그룹은 요청한 규격을 지원하지 않아요(지원: ${info.templates.map((t) => t.label).join(", ") || "없음"})`);
        continue;
      }
      for (const t of allowed) {
        let imageNo: number;
        try {
          imageNo = await upload(c.image, t);
        } catch (e) {
          fail(`이미지 ${c.image.file.name} ${t.label} 업로드 실패 — ${(e as Error).message}`);
          continue;
        }
        const cname = c.name(t).slice(0, 128);
        const linkUrl = opts.useUtm ? withUtm(c.landingUrl.trim(), opts.campaignName, cname) : c.landingUrl.trim();
        // 배너 = 랜딩 URL + 광고 안내 문구만 / 네이티브 이미지 = 템플릿이 받는 문구 칸만(피드는 광고 문구, 모바일 네이티브는 설명 문구1~3 …)
        const creative =
          t.kind === "IMAGE_BANNER"
            ? { adSetNo: info.adSet.no, creativeTemplateCode: t.code, imageNo, name: cname, linkUrl, altMessage: (c.altMessage || c.copy.message || c.copy.linkTitle).trim().slice(0, 100) }
            : { adSetNo: info.adSet.no, creativeTemplateCode: t.code, imageNo, name: cname, linkUrl, ctaCode: ctaFor(info.ctas, c.copy.cta), ...copyForTemplate(c.copy, t.code) };
        try {
          const r = await postAutopilot<{ creative: { no: number } }>({ action: "createCreative", clientId, campaignNo, creative });
          out.creatives.push({ no: r.creative.no, name: cname, adSetNo: info.adSet.no });
          push({ kind: "ok", text: `소재 생성 #${r.creative.no} ${cname}` });
        } catch (e) {
          fail(`소재 ${cname} 생성 실패 — ${(e as Error).message}`);
        }
      }
    }

    for (const col of (opts.collections ?? []).filter((x) => x.adSetName === a.name)) {
      const t = info.templates.find((x) => x.code === COLLECTION_TEMPLATE.code) ?? (info.templates.length ? null : COLLECTION_TEMPLATE);
      if (!t) {
        fail(`${a.name} · 컬렉션 ${col.name}: 이 광고그룹은 이미지 컬렉션을 지원하지 않아요(게재 위치에 피드가 있어야 함)`);
        continue;
      }
      const cname = col.name.slice(0, 128);
      const utm = (u: string) => (opts.useUtm ? withUtm(u.trim(), opts.campaignName, cname) : u.trim());
      const imageMedias: { imageNo: number; linkUrl: string; linkTitle: string }[] = [];
      try {
        for (const card of col.cards) imageMedias.push({ imageNo: await upload(card.image, t), linkUrl: utm(card.url), linkTitle: card.title.trim() });
      } catch (e) {
        fail(`컬렉션 ${cname} 카드 이미지 업로드 실패 — ${(e as Error).message}`);
        continue;
      }
      try {
        const r = await postAutopilot<{ creative: { no: number } }>({
          action: "createCreative",
          clientId,
          campaignNo,
          creative: { adSetNo: info.adSet.no, name: cname, message: col.message, creativeTemplateCode: t.code, ctaCode: ctaFor(info.ctas, col.cta), ctaUrl: utm(col.ctaUrl), imageMedias },
        });
        out.creatives.push({ no: r.creative.no, name: cname, adSetNo: info.adSet.no });
        push({ kind: "ok", text: `컬렉션 생성 #${r.creative.no} ${cname} (카드 ${imageMedias.length}장)` });
      } catch (e) {
        fail(`컬렉션 ${cname} 생성 실패 — ${(e as Error).message}`);
      }
    }
  }

  // 켜기/끄기는 이번에 새로 만든 광고그룹만 — 기존 광고그룹 상태는 건드리지 않는다
  const nos = out.adSets.filter((s) => s.created).map((s) => s.no);
  if (nos.length) {
    try {
      await postAutopilot({ action: "activate", clientId, campaignNo, adSetNos: nos, activated: opts.turnOn });
      out.activated = opts.turnOn;
      push({ kind: "ok", text: opts.turnOn ? `새 광고그룹 ${nos.length}개 켬 — 소재 검수 후 게재` : `새 광고그룹 ${nos.length}개 꺼 둠 — GFA에서 확인 후 켜세요` });
    } catch (e) {
      fail(`광고그룹 ${opts.turnOn ? "켜기" : "끄기"} 실패 — ${(e as Error).message}`);
    }
  }

  try {
    const r = await postAutopilot<{ skipped?: string }>({
      action: "log",
      clientId,
      campaignNo,
      summary: {
        mode: opts.kind,
        campaignName: opts.campaignName,
        adSets: out.adSets.filter((s) => s.created).length,
        reusedAdSets: out.adSets.filter((s) => !s.created).length,
        creatives: out.creatives.length,
        errors: out.errors.length,
        activated: out.activated,
        dailyBudget: opts.adSets.reduce((s, a) => s + (a.existingNo ? 0 : a.target?.budget ?? 0), 0),
      },
      detail: { adSets: out.adSets, creatives: out.creatives, errors: out.errors, ...opts.logExtra },
    });
    if (r.skipped) push({ kind: "info", text: r.skipped });
  } catch {
    /* 기록 실패는 세팅 결과에 영향 없음 */
  }
  push({ kind: out.errors.length ? "err" : "ok", text: `끝 — 광고그룹 ${out.adSets.length}개 · 소재 ${out.creatives.length}개 · 오류 ${out.errors.length}건` });
  return out;
}
