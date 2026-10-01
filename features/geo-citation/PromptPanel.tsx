"use client";

import { useState } from "react";
import { addPrompts, deletePrompt, updatePrompt } from "./geoData";
import { JOURNEY_STAGES, type GeoPrompt, type GeoSettings, type JourneyStage } from "./types";
import { ErrorBox, Section } from "./ui";

type Suggestion = { query: string; stage: JourneyStage; evidence: string; pick: boolean };

export function PromptPanel({
  clientId,
  prompts,
  settings,
  onChanged,
}: {
  clientId: string;
  prompts: GeoPrompt[];
  settings: GeoSettings | null;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<JourneyStage>("정보 탐색");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const stageCounts = JOURNEY_STAGES.map((s) => ({ s, n: prompts.filter((p) => p.active && p.stage === s).length }));
  const brandTerms = settings?.brand_terms ?? [];
  const hasBrand = (q: string) => brandTerms.some((b) => b.length >= 2 && q.toLowerCase().includes(b.toLowerCase()));

  async function add() {
    const q = query.trim();
    if (!q) return;
    setError(null);
    const err = await addPrompts(clientId, [{ query: q, stage }]);
    if (err) return setError(err);
    setQuery("");
    onChanged();
  }

  async function suggest() {
    if (!url.trim()) return setError("질문을 뽑을 페이지 URL을 입력해 주세요.");
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/geo-citation/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, brandTerms, count: 10, existing: prompts.map((p) => p.query) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "질문 초안을 만들지 못했어요.");
      setSuggestions((json.prompts as Omit<Suggestion, "pick">[]).map((p) => ({ ...p, pick: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setSuggesting(false);
    }
  }

  async function saveSuggestions() {
    const picked = suggestions.filter((s) => s.pick);
    if (!picked.length) return;
    const err = await addPrompts(clientId, picked.map(({ query, stage, evidence }) => ({ query, stage, evidence })));
    if (err) return setError(err);
    setSuggestions([]);
    onChanged();
  }

  return (
    <Section
      title="질문 세트"
      desc="전부 비브랜드 질문으로 — 브랜드명을 넣으면 '아는 사람이 찾는' 결과만 재게 돼요. 여정 4단계에 고르게 나눠 주세요"
      right={
        <div className="flex flex-wrap gap-1.5">
          {stageCounts.map(({ s, n }) => (
            <span key={s} className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[13px] ${n === 0 ? "border-warn/40 text-warn" : "border-line text-ink-soft"}`}>
              {s} {n}
            </span>
          ))}
        </div>
      }
    >
      {/* AI 초안 */}
      <div className="rounded-lg border border-line bg-canvas p-3">
        <p className="mb-2 text-[13px] font-medium text-ink-soft">
          <i className="ti ti-sparkles mr-1 text-signal" aria-hidden />
          페이지에서 질문 초안 뽑기 — 제목·헤딩·FAQ·JSON-LD 원문에서만 추출하고 근거를 함께 남겨요
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.brand.com/product/123" className="field h-9 min-w-[260px] flex-1 text-[15px]" />
          <button onClick={suggest} disabled={suggesting} className="btn-ghost h-9 px-3 text-[15px]">
            <i className={`ti ${suggesting ? "ti-loader-2 animate-spin" : "ti-wand"} text-[16px] text-signal`} aria-hidden />
            {suggesting ? "추출 중… (30초~1분)" : "초안 10개"}
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {suggestions.map((s, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 rounded-md bg-surface p-2">
                <input
                  type="checkbox"
                  checked={s.pick}
                  onChange={() => setSuggestions((prev) => prev.map((x, j) => (j === i ? { ...x, pick: !x.pick } : x)))}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-[15px] text-ink">{s.query}</span>
                  <span className="ml-2 rounded bg-canvas px-1.5 py-px text-[12px] text-ink-soft">{s.stage}</span>
                  {s.evidence && <span className="mt-0.5 block text-[13px] text-ink-muted">근거 · {s.evidence}</span>}
                </span>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setSuggestions([])} className="btn-ghost h-8 px-3 text-[13px]">
                버리기
              </button>
              <button onClick={saveSuggestions} className="btn-signal h-8 px-3 text-[13px]">
                선택한 {suggestions.filter((s) => s.pick).length}개 추가
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 직접 입력 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder="예: 민감성 피부 보습 크림 추천해줘"
          className="field h-9 min-w-[260px] flex-1 text-[15px]"
        />
        <select value={stage} onChange={(e) => setStage(e.target.value as JourneyStage)} className="field h-9 text-[15px]">
          {JOURNEY_STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button onClick={add} className="btn-signal h-9 px-3 text-[15px]">
          <i className="ti ti-plus text-[16px]" aria-hidden />
          추가
        </button>
      </div>
      {query && hasBrand(query) && <p className="mt-1 text-[13px] text-warn">브랜드 표기가 들어간 질문이에요 — 비브랜드 측정에서는 빼는 게 좋아요.</p>}
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}

      {/* 목록 */}
      <div className="mt-3 divide-y divide-line rounded-lg border border-line">
        {prompts.length === 0 && <p className="p-4 text-center text-[13px] text-ink-muted">등록된 질문이 없어요.</p>}
        {prompts.map((p) => (
          <div key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${p.active ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={p.active}
              title="측정에 포함"
              onChange={async () => {
                await updatePrompt(p.id, { active: !p.active });
                onChanged();
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="text-[15px] text-ink">{p.query}</span>
              {hasBrand(p.query) && <span className="ml-1.5 text-[12px] text-warn">브랜드 포함</span>}
              {p.evidence && <span className="block truncate text-[13px] text-ink-muted">근거 · {p.evidence}</span>}
            </span>
            <select
              value={p.stage}
              onChange={async (e) => {
                await updatePrompt(p.id, { stage: e.target.value as JourneyStage });
                onChanged();
              }}
              className="field h-7 text-[13px]"
            >
              {JOURNEY_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!confirm("이 질문을 삭제할까요? (지난 측정 기록은 남아요)")) return;
                await deletePrompt(p.id);
                onChanged();
              }}
              className="text-ink-faint hover:text-bad"
              aria-label="삭제"
            >
              <i className="ti ti-trash text-[16px]" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
