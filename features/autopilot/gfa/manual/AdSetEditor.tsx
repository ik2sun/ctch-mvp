"use client";

// 수동 세팅 · 광고그룹 편집 — GFA '광고그룹 만들기' 항목 전부: 타겟(성별·연령·지역·관심사·구매 의도·확장 데모·고객 파일) · 기기·OS·게재 위치 ·
// 입찰(목표·비용 관리·과금·입찰가) · 예산 · 일정(시작·종료·요일×시간) · 고급(타겟팅 유형·빠른 게재·소재 노출 방식·노출 빈도)
// 선택지는 캠페인 목적이 허용하는 값만(typesFor). 기본은 GFA 샘플과 같다
import { useState } from "react";
import type { GfaCodeBook } from "../adSetSheet";
import type { GfaContext } from "../types";
import { CHIP, CHIP_ON, INPUT, MoneyInput, SelectAllLinks, todayKst } from "../ui";
import { ChoiceCards, CodePicker, MultiChips, Row, ScheduleGrid, Section, Seg, Toggle } from "./controls";
import { AGE_OPTIONS, LABEL, adSetProblems, cboOn, fullGrid, needsCap, scheduleHours, typesFor, type AdSetDraft, type AgeOption, type CampaignDraft } from "./model";

const BID_GOAL_DESC: Record<string, string> = {
  MAX_CONV: "예산 안에서 전환이 가장 많이 나오게",
  MAX_CONV_VALUE: "전환 금액(매출)이 가장 크게",
  MAX_CLICK: "예산 안에서 클릭이 가장 많이 나오게",
  NONE: "입찰가를 직접 정해요(고정 입찰)",
};
// 수동 입찰(NONE)은 고정 입찰, 자동 입찰 목표는 고정 입찰 외 — 목록이 비면 GFA가 준 값 전부
function strategiesFor(all: string[], goal: string) {
  const f = all.filter((k) => (goal === "NONE" ? k === "FIXED_BID" : k !== "FIXED_BID"));
  return f.length ? f : all;
}
// '모두 선택' 기준이 되는 최상위 항목 — 지역 = 시·도(이름에 공백 없음), 관심사 = 1단계, 구매 의도 = 경로 첫 단계
const isTopLocation = (_k: string, v: string) => !v.trim().includes(" ");
const isTopInterest = (k: string) => k.startsWith("1-");
const isTopPath = (_k: string, v: string) => !v.includes(">");
const PLACEMENT_GROUPS: { label: string; test: (code: string) => boolean }[] = [
  { label: "네이버+", test: (c) => c.startsWith("M_") || c.startsWith("N_") },
  { label: "네이버 퍼포먼스 네트워크", test: (c) => c.startsWith("NW_") },
  { label: "기타", test: () => true },
];

export function AdSetEditor({
  campaign,
  a,
  ctx,
  book,
  bookErr,
  onChange,
}: {
  campaign: CampaignDraft;
  a: AdSetDraft;
  ctx: GfaContext | null;
  book: GfaCodeBook | null;
  bookErr: string | null;
  onChange: (patch: Partial<AdSetDraft>) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  if (a.existingNo) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-[#F9FAFB] px-4 py-3 text-[14px] text-ink-soft ring-1 ring-[#F2F4F7]">
          <p className="text-[16px] font-bold text-ink">{a.name}</p>
          <p className="mt-1">
            기존 광고그룹 · ID <span className="tabular-nums">{a.existingNo}</span>
          </p>
        </div>
        <p className="text-[14px] text-ink-muted">설정(타겟·예산·켜짐 상태)은 바꾸지 않고 소재만 추가합니다. 왼쪽에서 소재를 추가하세요.</p>
      </div>
    );
  }

  const types = typesFor(campaign, ctx);
  const cbo = cboOn(campaign);
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
  const problems = adSetProblems(a, cbo, now);
  const defaultStart = ctx?.sample.startTime?.replace("T", " ") ?? "내일 09:00";
  const placements = types.placementGroupCodes;

  return (
    <div className="space-y-6">
      <Section title="기본 정보">
        <Row label="광고그룹 이름 *" help="소재 분석이 읽는 이름 규칙(예: 1010_핵심3040_f3044)을 쓰면 나중에 분석이 쉬워요">
          <input className={INPUT} value={a.name} maxLength={128} onChange={(e) => onChange({ name: e.target.value })} />
        </Row>
      </Section>

      <Section title="타겟" hint="비워 두면 '전체' — GFA와 같아요">
        <Row label="성별">
          <MultiChips<"M" | "F" | "U">
            value={a.genders}
            options={[
              { key: "F", label: "여성" },
              { key: "M", label: "남성" },
              { key: "U", label: "알 수 없음" },
            ]}
            onChange={(v) => onChange({ genders: v })}
          />
        </Row>
        <Row label="연령">
          <MultiChips<AgeOption> value={a.ages} options={AGE_OPTIONS.map((x) => ({ key: x.key, label: x.key }))} onChange={(v) => onChange({ ages: v })} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "20~30대", keys: ["19-24", "25-29", "30-34", "35-39"] },
              { label: "30~40대", keys: ["30-34", "35-39", "40-44", "45-49"] },
              { label: "40~50대", keys: ["40-44", "45-49", "50-54", "55-59"] },
              { label: "50대 이상", keys: ["50-54", "55-59", "60+"] },
            ].map((p) => (
              <button key={p.label} type="button" onClick={() => onChange({ ages: p.keys as AgeOption[] })} className="rounded-full px-2.5 py-0.5 text-[12px] text-ink-muted ring-1 ring-line hover:text-ink">
                {p.label}
              </button>
            ))}
          </div>
        </Row>
        {bookErr && <p className="rounded-lg bg-[#FEF3F2] px-3 py-2 text-[14px] text-bad">{bookErr}</p>}
        <Row label="지역">
          <CodePicker map={book?.locations ?? {}} value={a.locations} onChange={(v) => onChange({ locations: v })} placeholder="시·도, 시·군·구 검색 (예: 강남구)" emptyLabel="전체 지역" topLevel={isTopLocation} topLabel="시·도 전체" />
        </Row>
        <Row label="관심사">
          <CodePicker map={book?.interests ?? {}} value={a.interests} onChange={(v) => onChange({ interests: v })} placeholder="관심사 검색 (예: 패션, 여행)" emptyLabel="제한 없음" topLevel={isTopInterest} topLabel="대분류 전체" />
        </Row>
        <Row label="구매 의도">
          <CodePicker map={book?.purchase ?? {}} value={a.purchase} onChange={(v) => onChange({ purchase: v })} placeholder="구매 의도 검색 (예: 신발)" emptyLabel="제한 없음" topLevel={isTopPath} topLabel="대분류 전체" />
        </Row>
        <Row label="확장 데모">
          <MultiChips value={a.extDemos} options={Object.entries(book?.extDemo ?? {}).map(([k, v]) => ({ key: k, label: v }))} onChange={(v) => onChange({ extDemos: v })} allLabel="제한 없음" />
        </Row>
        <Row label="고객 파일 타겟" help="유사·웹사이트 방문자·앱·쇼핑소식 타겟은 GFA API가 생성 때 받지 않아 GFA에서 직접 추가해야 해요">
          {Object.keys(book?.adidLibraries ?? {}).length === 0 ? (
            <p className="pt-2 text-[14px] text-ink-muted">이 광고계정에 등록된 고객 파일이 없어요</p>
          ) : (
            <div className="space-y-1.5">
              {Object.keys(book!.adidLibraries).length > 1 && (
                <SelectAllLinks
                  allLabel="모두 포함"
                  onAll={() => onChange({ customFiles: Object.keys(book!.adidLibraries).map((no) => ({ no: Number(no), included: true })) })}
                  noneLabel="모두 안 씀"
                  onNone={() => onChange({ customFiles: [] })}
                  noneDisabled={!a.customFiles.length}
                />
              )}
              {Object.entries(book!.adidLibraries).map(([no, name]) => {
                const cur = a.customFiles.find((x) => x.no === Number(no));
                const set = (v: "none" | "in" | "out") =>
                  onChange({ customFiles: [...a.customFiles.filter((x) => x.no !== Number(no)), ...(v === "none" ? [] : [{ no: Number(no), included: v === "in" }])] });
                return (
                  <div key={no} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-[160px] text-[14px] text-ink">{name}</span>
                    <Seg value={!cur ? "none" : cur.included ? "in" : "out"} options={[{ key: "none", label: "안 씀" }, { key: "in", label: "포함" }, { key: "out", label: "제외" }]} onChange={set} />
                  </div>
                );
              })}
            </div>
          )}
        </Row>
      </Section>

      <Section title="기기·게재 위치">
        <Row label="기기">
          <Seg
            value={a.device}
            options={[{ key: "ALL", label: "전체" }, ...(types.deviceTypes.includes("MOBILE") ? [{ key: "MOBILE" as const, label: "모바일" }] : []), ...(types.deviceTypes.includes("DESKTOP") ? [{ key: "DESKTOP" as const, label: "PC" }] : [])]}
            onChange={(v) => onChange({ device: v })}
          />
        </Row>
        <Row label="운영체제">
          <Seg value={a.os} options={[{ key: "ALL", label: "전체" }, { key: "IOS", label: "iOS" }, { key: "ANDROID", label: "Android" }]} onChange={(v) => onChange({ os: v })} />
        </Row>
        <Row label="게재 위치" help="피드 규격 소재는 피드 지면, 배너 소재는 스마트채널·배너 지면이 있어야 만들어져요">
          <Seg value={a.placements.length ? "pick" : "auto"} options={[{ key: "auto", label: "전체(자동)" }, { key: "pick", label: "직접 선택" }]} onChange={(v) => onChange({ placements: v === "auto" ? [] : [...placements] })} />
          {a.placements.length > 0 && (
            <div className="mt-3 space-y-3">
              {PLACEMENT_GROUPS.map((g, gi) => {
                const codes = placements.filter((c) => g.test(c) && !PLACEMENT_GROUPS.slice(0, gi).some((p) => p.test(c)));
                if (!codes.length) return null;
                return (
                  <div key={g.label}>
                    <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-muted">
                      {g.label}
                      <SelectAllLinks
                        onAll={() => onChange({ placements: [...a.placements, ...codes.filter((c) => !a.placements.includes(c))] })}
                        allDisabled={codes.every((c) => a.placements.includes(c))}
                        // 다른 그룹에 하나라도 남아 있을 때만 이 그룹을 비울 수 있다(전부 비면 '전체(자동)'와 같음)
                        onNone={() => onChange({ placements: a.placements.filter((c) => !codes.includes(c)) })}
                        noneDisabled={!codes.some((c) => a.placements.includes(c)) || a.placements.every((c) => codes.includes(c))}
                      />
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map((c) => {
                        const on = a.placements.includes(c);
                        const name = (book?.placements[c] ?? c).split(">").pop()!.trim();
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              const next = on ? a.placements.filter((x) => x !== c) : [...a.placements, c];
                              onChange({ placements: next.length ? next : [c] });
                            }}
                            className={`${CHIP} ${on ? CHIP_ON : ""}`}
                            title={book?.placements[c] ?? c}
                          >
                            {on && "✓ "}
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Row>
      </Section>

      <Section title="입찰·예산">
        {cbo ? (
          <p className="rounded-lg bg-[#F9FAFB] px-4 py-3 text-[14px] text-ink-soft ring-1 ring-[#F2F4F7]">캠페인 예산 최적화를 쓰는 캠페인이라 입찰 목표·비용 관리·예산은 캠페인 설정을 따릅니다.</p>
        ) : (
          <>
            <Row label="입찰 목표">
              <ChoiceCards
                value={a.bidGoal}
                options={types.bidGoals.map((k) => ({ key: k, label: LABEL.bidGoal[k] ?? k, desc: BID_GOAL_DESC[k] }))}
                onChange={(v) => onChange({ bidGoal: v, ...(v === "NONE" ? { bidStrategy: types.bidStrategies.includes("FIXED_BID") ? "FIXED_BID" : a.bidStrategy } : a.bidStrategy === "FIXED_BID" ? { bidStrategy: "NO_CAP" } : {}) })}
              />
            </Row>
            <Row label="비용 관리" help={a.bidStrategy === "BID_CAP" ? "입찰가가 이 금액을 넘지 않게" : a.bidStrategy === "COST_CAP" ? "평균 결과당 비용이 이 금액 안쪽이 되게" : undefined}>
              <Seg
                value={a.bidStrategy}
                options={strategiesFor(types.bidStrategies, a.bidGoal).map((k) => ({ key: k, label: LABEL.bidStrategy[k] ?? k }))}
                onChange={(v) => onChange({ bidStrategy: v })}
              />
            </Row>
            {needsCap(a.bidStrategy) && (
              <Row label={`${LABEL.bidStrategy[a.bidStrategy]} 금액 *`}>
                <MoneyInput className="max-w-[260px]" value={a.bidStrategyValue} onChange={(n) => onChange({ bidStrategyValue: n })} />
              </Row>
            )}
            <Row label="과금 방식">
              <Seg value={a.bidType} options={types.bidTypes.map((k) => ({ key: k, label: LABEL.bidType[k] ?? k }))} onChange={(v) => onChange({ bidType: v })} />
            </Row>
            {a.bidStrategy === "FIXED_BID" && (
              <Row label="입찰가 *">
                <MoneyInput className="max-w-[260px]" value={a.bidPrice} onChange={(n) => onChange({ bidPrice: n })} />
              </Row>
            )}
            <Row label="예산 *">
              <div className="flex flex-wrap items-center gap-3">
                <Seg value={a.budgetType} options={types.budgetTypes.map((k) => ({ key: k, label: LABEL.budgetType[k] ?? k }))} onChange={(v) => onChange({ budgetType: v })} />
                <MoneyInput className="w-[220px]" value={a.budgetAmount || null} onChange={(n) => onChange({ budgetAmount: n ?? 0 })} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[10000, 30000, 50000, 100000, 300000].map((n) => (
                  <button key={n} type="button" onClick={() => onChange({ budgetAmount: n })} className={`${CHIP} ${a.budgetAmount === n ? CHIP_ON : ""}`}>
                    {n.toLocaleString("ko-KR")}
                  </button>
                ))}
              </div>
            </Row>
          </>
        )}
      </Section>

      <Section title="일정">
        <Row label="시작" help={`비우면 GFA 기본(${defaultStart})`}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" min={`${todayKst()}T00:00`} className={`${INPUT} w-[240px]`} value={a.start} onChange={(e) => onChange({ start: e.target.value })} />
            {a.start && (
              <button type="button" onClick={() => onChange({ start: "" })} className="text-[13px] text-ink-muted underline hover:text-ink">
                기본으로
              </button>
            )}
          </div>
        </Row>
        <Row label="종료">
          <div className="flex flex-wrap items-center gap-3">
            <Seg value={a.end ? "end" : "ongoing"} options={[{ key: "ongoing", label: "계속 게재" }, { key: "end", label: "종료일 지정" }]} onChange={(v) => onChange({ end: v === "ongoing" ? "" : `${todayKst()}T23:59` })} />
            {a.end && <input type="datetime-local" className={`${INPUT} w-[240px]`} value={a.end} onChange={(e) => onChange({ end: e.target.value })} />}
          </div>
        </Row>
        <Row label="요일·시간">
          <Seg value={a.schedule ? "pick" : "always"} options={[{ key: "always", label: "항상" }, { key: "pick", label: "요일·시간 지정" }]} onChange={(v) => onChange({ schedule: v === "always" ? null : fullGrid() })} />
          {a.schedule && (
            <div className="mt-3">
              <ScheduleGrid value={a.schedule} onChange={(g) => onChange({ schedule: g })} />
              <p className="mt-1 text-[13px] text-ink-muted">주 {scheduleHours(a.schedule)}시간 노출</p>
            </div>
          )}
        </Row>
      </Section>

      <Section
        title="고급 설정"
        hint="대부분 기본값 그대로 두면 돼요"
        right={
          <button type="button" onClick={() => setAdvanced(!advanced)} className="text-[14px] font-semibold text-[#C2410C]">
            {advanced ? "접기" : "펼치기"}
          </button>
        }
      >
        {advanced && (
          <>
            <Row label="타겟팅 유형">
              <select className={`${INPUT} max-w-[300px]`} value={a.targetingType} onChange={(e) => onChange({ targetingType: e.target.value })}>
                {Object.entries(LABEL.targetingType).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="게재 방식">
              <Toggle on={a.accelerated} onChange={(v) => onChange({ accelerated: v })} label="빠른 게재" desc="예산을 하루 초반에 빨리 씁니다(기본은 하루에 고르게)" />
            </Row>
            <Row label="소재 노출 방식">
              <Seg value={a.creativeChooserType} options={Object.entries(LABEL.creativeChooser).map(([k, v]) => ({ key: k, label: v }))} onChange={(v) => onChange({ creativeChooserType: v })} />
            </Row>
            <Row label="노출 빈도" help="한 사람에게 하루 최대 몇 번 보일지(1~5회). 끄면 GFA 자동">
              <div className="flex flex-wrap items-center gap-3">
                <Seg
                  value={a.frequencyAdUnit || "auto"}
                  options={[{ key: "auto", label: "자동" }, { key: "AD_SET", label: "광고그룹 기준" }, { key: "CREATIVE", label: "소재 기준" }]}
                  onChange={(v) => onChange({ frequencyAdUnit: v === "auto" ? "" : (v as "AD_SET" | "CREATIVE"), quota: v === "auto" ? null : a.quota ?? 3 })}
                />
                {a.frequencyAdUnit && (
                  <select className={`${INPUT} w-[100px]`} value={a.quota ?? 3} onChange={(e) => onChange({ quota: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}회
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Row>
          </>
        )}
      </Section>

      {problems.length > 0 && <p className="text-[13px] text-warn">채워야 할 항목: {problems.join(" · ")}</p>}
    </div>
  );
}
