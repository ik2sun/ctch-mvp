"use client";

// 수동 세팅 · 캠페인 편집 — GFA '캠페인 만들기' 항목: 목적 · 이름 · 브랜드 · 대표 URL · 전환 추적 대상 · 최적화 전환 유형 · 전환 API · 지출 한도 · 캠페인 예산 최적화
import type { CampaignOptions } from "../gfaOps";
import { OBJECTIVE_LABEL } from "../types";
import { INPUT, MoneyInput } from "../ui";
import { ChoiceCards, Row, Section, Seg, Toggle } from "./controls";
import { LABEL, MANUAL_OBJECTIVES, campaignProblems, needsCap, type CampaignDraft, type Objective } from "./model";

export function CampaignEditor({
  c,
  options,
  optionsErr,
  onChange,
}: {
  c: CampaignDraft;
  options: CampaignOptions | null;
  optionsErr: string | null;
  onChange: (patch: Partial<CampaignDraft>) => void;
}) {
  if (c.existing) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-[#F9FAFB] px-4 py-3 text-[14px] text-ink-soft ring-1 ring-[#F2F4F7]">
          <p className="text-[16px] font-bold text-ink">{c.existing.name}</p>
          <p className="mt-1">
            기존 캠페인 · ID <span className="tabular-nums">{c.existing.no}</span> · {OBJECTIVE_LABEL[c.existing.objective] ?? c.existing.objective}
            {c.existing.cbo && " · 캠페인 예산 최적화 사용 중"}
          </p>
        </div>
        <p className="text-[14px] text-ink-muted">캠페인 설정은 바꾸지 않고, 아래에 추가한 광고그룹·소재만 만듭니다. 왼쪽에서 광고그룹을 추가하세요.</p>
      </div>
    );
  }

  const problems = campaignProblems(c);
  const approved = options?.urls.filter((u) => u.approved) ?? [];
  const pending = options?.urls.filter((u) => !u.approved) ?? [];
  const setObjective = (o: Objective) =>
    onChange({ objective: o, conversionType: o === "CONVERSION" ? "PURCHASE" : "", cboBidGoal: o === "CONVERSION" ? "MAX_CONV" : "MAX_CLICK", cboBidStrategy: "NO_CAP" });

  return (
    <div className="space-y-6">
      <Section title="캠페인 목적" hint="이미지 소재로 세팅하는 목적 2가지 — 앱 설치·동영상·카탈로그·ADVoost는 GFA에서 직접 만드세요">
        <ChoiceCards value={c.objective} options={MANUAL_OBJECTIVES.map((o) => ({ key: o.key, label: o.label, desc: o.desc }))} onChange={setObjective} />
      </Section>

      <Section title="기본 정보">
        <Row label="캠페인 이름 *">
          <input className={INPUT} value={c.name} maxLength={128} placeholder="예: [르무통_26] 가을 단풍 프로모션_전환" onChange={(e) => onChange({ name: e.target.value })} />
        </Row>
        {optionsErr && <p className="rounded-lg bg-[#FEF3F2] px-3 py-2 text-[14px] text-bad">{optionsErr}</p>}
        <Row label="브랜드 *" help="GFA 광고계정에 등록된 브랜드">
          <select className={INPUT} value={c.brandNo ?? ""} onChange={(e) => onChange({ brandNo: Number(e.target.value) || null })}>
            <option value="">{options ? "브랜드 선택" : "불러오는 중…"}</option>
            {options?.brands.map((b) => (
              <option key={b.no} value={b.no}>
                {b.name}
                {b.explanation ? ` — ${b.explanation.slice(0, 30)}` : ""}
              </option>
            ))}
          </select>
        </Row>
        <Row label="대표 URL *" help="검수 완료된 URL만 쓸 수 있어요. 새 URL은 GFA > 광고 계정 관리에서 등록">
          <select
            className={INPUT}
            value={c.urlNo ?? ""}
            onChange={(e) => {
              const urlNo = Number(e.target.value) || null;
              // 전환 추적 대상이 비어 있으면 같은 URL로 맞춰 준다(GFA 기본 동작과 같음)
              const conv = options?.conversionUrls.find((x) => x.urlNo === urlNo);
              onChange({ urlNo, ...(conv && !c.conversionUrlNo ? { conversionUrlNo: conv.urlNo } : {}) });
            }}
          >
            <option value="">{options ? "대표 URL 선택" : "불러오는 중…"}</option>
            {approved.map((u) => (
              <option key={u.no} value={u.no}>
                {u.url}
                {u.type === "NAVER_SHOPPING" ? " (네이버 쇼핑)" : ""}
              </option>
            ))}
            {pending.map((u) => (
              <option key={u.no} value={u.no} disabled>
                {u.url} (검수 중)
              </option>
            ))}
          </select>
        </Row>
        <Row label="전환 추적 대상" help="전환을 셀 URL(네이버 프리미엄 로그분석·전환 스크립트 설치된 곳)">
          <select className={INPUT} value={c.conversionUrlNo ?? ""} onChange={(e) => onChange({ conversionUrlNo: Number(e.target.value) || null })}>
            <option value="">선택 안 함</option>
            {options?.conversionUrls.map((x) => (
              <option key={x.urlNo} value={x.urlNo}>
                {x.url} · {x.name}
                {x.trackingDays ? ` · 전환 ${x.trackingDays}일` : ""}
                {x.status && x.status !== "INSTALLED" ? ` (${x.status})` : ""}
              </option>
            ))}
          </select>
        </Row>
        {c.objective === "CONVERSION" && (
          <Row label="최적화 전환 유형" help="이 전환을 기준으로 입찰을 최적화해요">
            <Seg value={c.conversionType} options={(["PURCHASE", "CART", ""] as const).map((k) => ({ key: k, label: LABEL.conversionType[k] }))} onChange={(v) => onChange({ conversionType: v })} />
          </Row>
        )}
      </Section>

      <Section title="예산·추가 설정">
        <Row label="지출 한도" help="캠페인 전체에서 이 금액까지만 씁니다. 비우면 제한 없음">
          <MoneyInput className="max-w-[260px]" value={c.spendLimit} onChange={(n) => onChange({ spendLimit: n })} placeholder="제한 없음" />
        </Row>
        <Row label="전환 API">
          <Toggle on={c.s2sApiOn} onChange={(v) => onChange({ s2sApiOn: v })} label="전환 API를 연동해 전환 추적" desc="광고주 서버에서 전환 API를 보내고 있을 때만 켜세요" />
        </Row>
        <Row label="캠페인 예산 최적화">
          <Toggle on={c.cbo} onChange={(v) => onChange({ cbo: v })} label="캠페인 예산 최적화(CBO) 사용" desc="켜면 입찰·예산을 캠페인에서 정하고 GFA가 광고그룹에 나눠 씁니다" />
        </Row>
        {c.cbo && (
          <div className="space-y-4 rounded-xl bg-[#F9FAFB] p-4 ring-1 ring-[#F2F4F7]">
            <Row label="입찰 목표">
              <Seg
                value={c.cboBidGoal}
                options={(c.objective === "CONVERSION" ? ["MAX_CONV"] : ["MAX_CLICK"]).map((k) => ({ key: k, label: LABEL.bidGoal[k] }))}
                onChange={(v) => onChange({ cboBidGoal: v })}
              />
            </Row>
            <Row label="비용 관리" help={c.objective === "CONVERSION" ? undefined : "비용 한도는 클릭수 최대화일 때만"}>
              <Seg
                value={c.cboBidStrategy}
                options={(c.cboBidGoal === "MAX_CLICK" ? ["NO_CAP", "BID_CAP", "COST_CAP"] : ["NO_CAP", "BID_CAP"]).map((k) => ({ key: k, label: LABEL.bidStrategy[k] }))}
                onChange={(v) => onChange({ cboBidStrategy: v })}
              />
            </Row>
            {needsCap(c.cboBidStrategy) && (
              <Row label={`${LABEL.bidStrategy[c.cboBidStrategy]} 금액 *`}>
                <MoneyInput className="max-w-[260px]" value={c.cboBidStrategyValue} onChange={(n) => onChange({ cboBidStrategyValue: n })} />
              </Row>
            )}
            <Row label="캠페인 예산 *" help="GFA 문서 표기 '예산 최적화 캠페인의 예산'">
              <MoneyInput className="max-w-[260px]" value={c.cboBudget} onChange={(n) => onChange({ cboBudget: n })} />
            </Row>
          </div>
        )}
      </Section>

      {problems.length > 0 && <p className="text-[13px] text-warn">채워야 할 항목: {problems.join(" · ")}</p>}
    </div>
  );
}
