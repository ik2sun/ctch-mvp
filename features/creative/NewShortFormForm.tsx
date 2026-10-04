"use client";

import { useEffect, useMemo, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { PlatformSelector } from "./PlatformSelector";
import { ImageCollector } from "./ImageCollector";
import { LibraryPicker } from "./LibraryPicker";
import { PLATFORM_BY_ID, VEO_MODELS, veoClipSeconds, veoUsdPerSec, type PlatformId, type VeoModelId } from "./platforms";
import { TEMPLATES, TEMPLATE_BY_ID } from "./shortFormTemplates";
import {
  BRIEF_FIELDS,
  DEFAULT_DURATION,
  DURATION_PRESETS,
  EMPTY_BRIEF,
  SCENE_ROLE_LABEL,
  VOICES,
  durationPreset,
  scriptDurationSec,
  type DurationPreset,
  type SceneRole,
  type ScriptScene,
  type ShortFormBrief,
  type ShortFormScript,
} from "./shortFormScript";
import {
  createJob,
  missingTableMessage,
  newJobId,
  uploadAsset,
  uploadClip,
  type JobMode,
  type ShortFormJob,
} from "./shortFormJobs";

const INPUT =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";
const TEXTAREA =
  "w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400 outline-none focus:border-signal focus:ring-4 focus:ring-signal/10";

// 장면 역할 색 — 스토리 흐름(후킹→공감·해결→증명→혜택)이 한눈에 보이도록. 채도는 낮게, 배경은 50톤.
const ROLE_TONE: Record<SceneRole, { chip: string; dot: string; bar: string }> = {
  hook: { chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", bar: "bg-rose-400" },
  benefit: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", bar: "bg-amber-400" },
  proof: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-400" },
  offer: { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500", bar: "bg-violet-400" },
  cta: { chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500", bar: "bg-sky-400" },
};

// 새 숏폼 생성 — 템플릿 → (브리프 → AI 스크립트 → 편집) → 소재(사진 업로드 | 클립 업로드 | Veo API 자동) → 작업 등록.
// 실제 Veo 생성·TTS·합성은 사내 렌더 워커(short-form/worker/render_worker.py)가 처리한다.
export function NewShortFormForm({
  onClose,
  onCreated,
  initial,
}: {
  onClose: () => void;
  onCreated: (job: ShortFormJob) => void;
  initial?: { title?: string; brief?: Partial<ShortFormBrief> } | null; // 인스타 분석에서 넘어온 브리프 — 스크립트형(veo_promo)으로 연다
}) {
  const { clients, selected } = useClients();
  const [templateId, setTemplateId] = useState(initial?.brief ? "veo_promo" : TEMPLATES[0].id);
  const template = TEMPLATE_BY_ID[templateId];
  const [title, setTitle] = useState(initial?.title ?? "");
  const [clientId, setClientId] = useState<string>(selected?.id ?? "");
  const client = clients.find((c) => c.id === clientId) ?? null;

  // 고정 템플릿(르무통) 카피
  const [copy, setCopy] = useState<Record<string, string>>({});
  // 스크립트형
  const [brief, setBrief] = useState<ShortFormBrief>({ ...EMPTY_BRIEF, ...(initial?.brief ?? {}) });
  const [voice, setVoice] = useState(VOICES[0].id);
  const [durationSec, setDurationSec] = useState<DurationPreset["seconds"]>(DEFAULT_DURATION);
  const preset = durationPreset(durationSec);
  const [script, setScript] = useState<ShortFormScript | null>(null);
  const [generating, setGenerating] = useState(false);
  // 소재
  const [platform, setPlatform] = useState<PlatformId>("veo_api");
  const [veoModel, setVeoModel] = useState<VeoModelId>(VEO_MODELS[1].id);
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCopy(Object.fromEntries(template.copyFields.map((f) => [f.key, f.defaultValue])));
    setFiles({});
    setScript(null);
    if (template.kind === "photos") setPlatform("veo_api");
  }, [template]);

  useEffect(() => {
    if (client && !brief.brand) setBrief((b) => ({ ...b, brand: client.name }));
  }, [client, brief.brand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, submitting]);

  const modelInfo = VEO_MODELS.find((m) => m.id === veoModel) ?? VEO_MODELS[1];
  useEffect(() => {
    if (!modelInfo.resolutions.some((r) => r.id === resolution)) setResolution(modelInfo.resolutions[0].id);
  }, [modelInfo, resolution]);

  const isClips = template.kind === "clips";
  const generate = isClips && platform === "veo_api";
  const mode: JobMode = generate ? "generate" : "upload";
  // 샷 목록: 스크립트형은 script.scenes, 고정형은 template.shots
  const shots = useMemo(
    () =>
      template.scripted
        ? (script?.scenes ?? []).map((s) => ({ id: s.id, label: `${SCENE_ROLE_LABEL[s.role]} · ${s.headline.replace(/\n/g, " ")}`, seconds: s.seconds, prompt: s.prompt, refs: [] as string[] }))
        : template.shots,
    [template, script],
  );
  const ready = shots.filter((s) => files[s.id]).length;
  const total = shots.length;
  // 스크립트 생성 전에는 샷 목록이 비어 있으므로 선택한 길이의 장면 계획으로 추산한다 (0원으로 보이면 안 된다)
  const shotSeconds = total ? shots.map((s) => s.seconds) : preset.beats.map((b) => b.seconds);
  const shotCount = shotSeconds.length;
  const clipSeconds = shotSeconds.reduce((a, s) => a + veoClipSeconds(s, resolution), 0);
  const estCost = generate ? clipSeconds * veoUsdPerSec(veoModel, resolution) : 0;
  const costIsEstimate = generate && total === 0;
  const p = PLATFORM_BY_ID[platform];

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError("클립보드 복사에 실패했어요. 프롬프트를 직접 선택해 복사해 주세요.");
    }
  }

  async function runGenerate() {
    if (!brief.product.trim() || !brief.benefit.trim()) return setError("제품·서비스와 핵심 강점은 꼭 입력해 주세요.");
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/shortform/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, brief, clientId: clientId || null, voice, durationSec }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "스크립트 생성에 실패했어요.");
      setScript(json.script as ShortFormScript);
      setFiles({});
      if (!title.trim() && json.script?.title) setTitle(json.script.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스크립트 생성 중 오류가 발생했어요.");
    } finally {
      setGenerating(false);
    }
  }

  function updateScene(idx: number, patch: Partial<ScriptScene>) {
    setScript((s) => (s ? { ...s, scenes: s.scenes.map((sc, i) => (i === idx ? { ...sc, ...patch } : sc)) } : s));
  }
  function removeScene(idx: number) {
    setScript((s) => (s && s.scenes.length > 2 ? { ...s, scenes: s.scenes.filter((_, i) => i !== idx) } : s));
  }

  async function submit() {
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    if (template.scripted && !script) return setError("먼저 AI 스크립트를 생성해 주세요.");
    if (template.scripted && script?.scenes.some((s) => !s.headline.trim())) return setError("헤드라인이 비어 있는 장면이 있어요.");
    if (generate && script?.scenes.some((s) => !s.prompt.trim())) return setError("영상 프롬프트가 비어 있는 장면이 있어요.");
    if (template.kind === "photos" && photos.length < (template.minAssets ?? 2)) {
      return setError(`사진을 ${template.minAssets ?? 2}장 이상 올려 주세요.`);
    }
    if (isClips && !generate && ready < total) {
      return setError(`클립이 ${total - ready}개 비어 있어요. 모든 샷에 클립을 올려야 합성할 수 있어요.`);
    }
    setSubmitting(true);
    setError(null);
    try {
      const id = newJobId();
      const shotPaths: Record<string, string> = {};
      const assetPaths: string[] = [];
      if (isClips && !generate) {
        let i = 0;
        for (const s of shots) {
          i += 1;
          setProgress(`클립 업로드 중 ${i}/${total} · ${s.id}`);
          shotPaths[s.id] = await uploadClip(id, s.id, files[s.id]);
        }
      }
      if (template.kind === "photos") {
        for (let i = 0; i < photos.length; i++) {
          setProgress(`사진 업로드 중 ${i + 1}/${photos.length}`);
          assetPaths.push(await uploadAsset(id, i, photos[i]));
        }
      }
      setProgress("작업 등록 중…");
      const result = await createJob({
        id,
        clientId: clientId || null,
        title: title.trim(),
        platform: template.kind === "photos" ? "photos" : platform,
        template: templateId,
        genMode: mode,
        shots: shotPaths,
        assets: assetPaths,
        copy: template.scripted ? {} : copy,
        brief: template.scripted ? brief : {},
        script: template.scripted && script ? { ...script, voice } : {},
        options: generate ? { veo_model: veoModel, resolution, voice } : { voice },
      });
      if (result.error) throw new Error(missingTableMessage(result.error) ?? result.error.message);
      onCreated(result.data as ShortFormJob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업 등록 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const footerNote = generate
    ? `등록 후 사내 렌더 워커가 Veo로 클립 ${shotCount}개를 생성하고 합성합니다 (약 10~20분). 예상 API 비용 ${costIsEstimate ? "약 " : ""}$${estCost.toFixed(2)}.`
    : template.kind === "photos"
      ? "등록 후 사내 렌더 워커가 내레이션·합성을 처리합니다 (약 3~5분). 영상 생성 API 비용 $0."
      : "등록 후 사내 렌더 워커가 합성합니다 (약 3~5분). API 비용 $0, 플랫폼 크레딧만 소모.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-signal-soft/70 via-white to-violet-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-violet-500 text-white shadow-sm shadow-signal/30">
              <i className="ti ti-sparkles text-[18px]" aria-hidden />
            </span>
            <div>
            <h3 className="text-[17px] font-semibold text-gray-900">새 숏폼 생성</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">브리프를 넣으면 AI가 스크립트를 쓰고, 사진 또는 클립으로 세로형 숏폼을 합성합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="닫기"
          >
            <i className="ti ti-x text-[18px]" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
          {/* 1. 템플릿 · 기본 정보 */}
          <section>
            <StepTitle n={1} title="템플릿 · 기본 정보" desc="어떤 방식으로 만들지 고르세요. 사진형은 API 비용이 없고, 영상형은 Veo 자동 생성 또는 클립 업로드를 선택할 수 있어요." />
            <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
              {TEMPLATES.map((t) => {
                const on = t.id === templateId;
                const icon = t.kind === "photos" ? "photo" : t.scripted ? "sparkles" : "movie";
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTemplateId(t.id)}
                    className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                      on ? "border-transparent bg-signal-soft ring-2 ring-signal shadow-sm" : "border-gray-200 bg-white hover:border-signal/30 hover:shadow-sm"
                    }`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${on ? "bg-gradient-to-br from-signal to-violet-500 text-white shadow-sm shadow-signal/30" : "bg-gray-100 text-gray-600"}`}>
                      <i className={`ti ti-${icon} text-[18px]`} aria-hidden />
                    </span>
                    <p className={`mt-3 text-[13.5px] font-semibold leading-snug ${on ? "text-signal-strong" : "text-gray-900"}`}>{t.name}</p>
                    <p className={`mt-1 text-[11.5px] leading-relaxed ${on ? "text-signal" : "text-gray-500"}`}>{t.description}</p>
                    <p className="mt-2 font-mono text-[10.5px] text-gray-400">
                      {t.brand} · {t.scripted ? DURATION_PRESETS.map((d) => d.seconds).join("·") : `약 ${Math.round(t.durationSec)}`}초 · {t.kind === "photos" ? "사진 → 모션" : "클립 합성"}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="제목">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 르무통 위크 9월 2차" className={INPUT} />
              </Field>
              <Field label="광고주">
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={INPUT}>
                  <option value="">미지정</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!template.scripted &&
                template.copyFields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <input value={copy[f.key] ?? ""} onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.placeholder} className={INPUT} />
                  </Field>
                ))}
            </div>
          </section>

          {/* 2. 브리프 → 스크립트 */}
          {template.scripted && (
            <section>
              <StepTitle n={2} title="브리프 · AI 스크립트" desc="길이를 고르고 브리프를 채워 생성하면 기획 의도와 함께 후킹 → 공감·해결 → 증명 → 혜택·CTA 흐름의 장면별 화면·자막·내레이션(·영상 프롬프트)이 나옵니다. 마음에 안 드는 문장은 직접 고치세요." />
              <DurationPicker value={durationSec} onChange={(v) => setDurationSec(v)} locked={Boolean(script)} />
              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gradient-to-b from-slate-50 to-white p-4">
                  {BRIEF_FIELDS.map((f) => (
                    <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                      {f.multiline ? (
                        <textarea rows={2} value={brief[f.key]} onChange={(e) => setBrief((b) => ({ ...b, [f.key]: e.target.value }))} placeholder={f.placeholder} className={TEXTAREA} />
                      ) : (
                        <input value={brief[f.key]} onChange={(e) => setBrief((b) => ({ ...b, [f.key]: e.target.value }))} placeholder={f.placeholder} className={INPUT} />
                      )}
                    </Field>
                  ))}
                  <Field label="내레이션 음성">
                    <select value={voice} onChange={(e) => setVoice(e.target.value)} className={INPUT}>
                      {VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={runGenerate}
                    disabled={generating || submitting}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 text-[15px] font-semibold text-white shadow-md shadow-signal/25 transition hover:brightness-110 disabled:opacity-50"
                  >
                    <i className={`ti ${generating ? "ti-loader-2 animate-spin" : "ti-sparkles"} text-[16px]`} aria-hidden />
                    {generating ? "스크립트 쓰는 중… (30초~1분)" : script ? `${durationSec}초로 다시 생성` : `${durationSec}초 AI 스크립트 생성`}
                  </button>
                  <p className="text-[13px] text-gray-500">Claude API(텍스트) 호출 1회. 수치·할인율은 브리프에 적은 값만 씁니다.</p>
                </div>

                <div className="min-h-[200px] rounded-xl border border-gray-200 bg-white">
                  {!script ? (
                    <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-6 text-center text-gray-400">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-soft text-signal">
                        <i className="ti ti-script text-[22px]" aria-hidden />
                      </span>
                      <p className="mt-2 text-[15px]">브리프를 채우고 생성 버튼을 누르면 여기에 장면별 스크립트가 나옵니다.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-[13px] text-gray-600">
                          <span className="font-semibold text-gray-900">{script.brand}</span> · {script.scenes.length}장면 + 엔드카드 · 약 {Math.round(scriptDurationSec(script))}초
                          {script.targetSeconds ? <span className="ml-1.5 rounded-full bg-signal-soft px-2 py-0.5 text-[10.5px] font-medium text-signal">{script.targetSeconds}초 기획</span> : null}
                        </p>
                        <span className="text-[13px] text-gray-400">직접 편집 가능</span>
                      </div>
                      <div className="space-y-1.5 bg-gradient-to-r from-signal-soft to-violet-50/60 px-4 py-3">
                        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-signal-strong">
                          <i className="ti ti-bulb text-[15px]" aria-hidden /> 기획 의도 · 스토리라인
                        </p>
                        <textarea
                          rows={3}
                          value={script.concept ?? ""}
                          onChange={(e) => setScript({ ...script, concept: e.target.value })}
                          placeholder="문제 제기 → 공감 → 제품 해결 흐름 요약"
                          className={TEXTAREA}
                        />
                      </div>
                      <SceneTimeline scenes={script.scenes} endSeconds={script.endSeconds ?? 4} />
                      {script.scenes.map((sc, i) => (
                        <div key={sc.id} className="space-y-2 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${ROLE_TONE[sc.role].dot}`}>{i + 1}</span>
                            <select
                              value={sc.role}
                              onChange={(e) => updateScene(i, { role: e.target.value as ScriptScene["role"] })}
                              className={`h-7 rounded-md border-0 px-2 text-[11.5px] font-medium ring-1 ring-inset ${ROLE_TONE[sc.role].chip}`}
                            >
                              {Object.entries(SCENE_ROLE_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <input
                              value={sc.kicker}
                              onChange={(e) => updateScene(i, { kicker: e.target.value })}
                              placeholder="라벨"
                              className="h-7 w-32 rounded-md border border-gray-200 bg-white px-2 font-mono text-[13px] uppercase text-gray-700"
                            />
                            <span className="ml-auto font-mono text-[10.5px] text-gray-400">{sc.id} · {sc.seconds}s</span>
                            <button type="button" onClick={() => removeScene(i)} className="text-gray-400 hover:text-red-600" title="장면 삭제" aria-label="장면 삭제">
                              <i className="ti ti-trash text-[15px]" aria-hidden />
                            </button>
                          </div>
                          <div className="flex items-start gap-2">
                            <i className="ti ti-movie mt-2 text-[15px] text-gray-400" aria-hidden />
                            <textarea rows={2} value={sc.visual ?? ""} onChange={(e) => updateScene(i, { visual: e.target.value })} placeholder="화면 묘사 (어떤 상황·컷을 보여줄지)" className={TEXTAREA} />
                          </div>
                          <textarea rows={2} value={sc.headline} onChange={(e) => updateScene(i, { headline: e.target.value })} placeholder="자막 헤드라인 (줄바꿈 가능)" className={`${TEXTAREA} font-semibold`} />
                          <input value={sc.sub} onChange={(e) => updateScene(i, { sub: e.target.value })} placeholder="보조 자막" className={INPUT} />
                          <div className="flex items-start gap-2">
                            <i className="ti ti-microphone mt-2 text-[15px] text-gray-400" aria-hidden />
                            <textarea rows={2} value={sc.narration} onChange={(e) => updateScene(i, { narration: e.target.value })} placeholder="내레이션" className={TEXTAREA} />
                          </div>
                          {isClips && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-500">
                                  <i className="ti ti-video text-[13px] text-signal" aria-hidden /> 영상 프롬프트 (영문 · {veoClipSeconds(sc.seconds, resolution)}초 클립 · 9:16)
                                </span>
                                <button type="button" onClick={() => copyText(sc.id, sc.prompt)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10.5px] text-slate-600 ring-1 ring-slate-200 hover:text-signal">
                                  <i className={`ti ${copied === sc.id ? "ti-check" : "ti-copy"}`} aria-hidden /> {copied === sc.id ? "복사됨" : "복사"}
                                </button>
                              </div>
                              <textarea
                                rows={3}
                                value={sc.prompt}
                                onChange={(e) => updateScene(i, { prompt: e.target.value })}
                                className="w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-slate-700 outline-none"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="grid gap-2 px-4 py-3 sm:grid-cols-3">
                        <Field label="엔드카드 헤드라인">
                          <input value={script.cta.headline} onChange={(e) => setScript({ ...script, cta: { ...script.cta, headline: e.target.value } })} className={INPUT} />
                        </Field>
                        <Field label="행동 유도">
                          <input value={script.cta.sub} onChange={(e) => setScript({ ...script, cta: { ...script.cta, sub: e.target.value } })} className={INPUT} />
                        </Field>
                        <Field label="뱃지">
                          <input value={script.cta.badge} onChange={(e) => setScript({ ...script, cta: { ...script.cta, badge: e.target.value } })} className={INPUT} />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 3. 소재 */}
          {template.kind === "photos" ? (
            <section>
              <StepTitle
                n={3}
                title={`제품 사진 (${photos.length}/${template.maxAssets ?? 12})`}
                desc="페이지 주소로 자동 수집, 이미지 보관함에서 가져오기, 직접 올리기 중 편한 방법을 쓰세요. 장면 순서대로 쓰이며 첫 장은 후킹 배경, 이후는 카드·풀블리드로 번갈아 배치됩니다."
              />
              <ImageCollector
                keywords={[brief.brand, brief.product].filter(Boolean).flatMap((v) => v.split(/[\s,·()]+/)).filter((w) => w.length >= 2)}
                remaining={(template.maxAssets ?? 12) - photos.length}
                onAdd={(files) => setPhotos((p) => [...p, ...files].slice(0, template.maxAssets ?? 12))}
              />
              <LibraryPicker
                clientId={clientId || null}
                remaining={(template.maxAssets ?? 12) - photos.length}
                onAdd={(files) => setPhotos((p) => [...p, ...files].slice(0, template.maxAssets ?? 12))}
              />
              <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
                {photos.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 text-[12px] font-semibold text-white">{i + 1}</span>
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-0 transition group-hover:opacity-100">
                      <button type="button" onClick={() => i > 0 && setPhotos((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="text-white" aria-label="앞으로">
                        <i className="ti ti-arrow-left text-[15px]" aria-hidden />
                      </button>
                      <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="text-white" aria-label="삭제">
                        <i className="ti ti-trash text-[15px]" aria-hidden />
                      </button>
                      <button type="button" onClick={() => i < photos.length - 1 && setPhotos((p) => { const n = [...p]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} className="text-white" aria-label="뒤로">
                        <i className="ti ti-arrow-right text-[15px]" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
                {photos.length < (template.maxAssets ?? 12) && (
                  <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500 transition hover:border-signal/50 hover:text-signal">
                    <i className="ti ti-plus text-[20px]" aria-hidden />
                    <span className="mt-1 text-[13px]">사진 추가</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setPhotos((p) => [...p, ...list].slice(0, template.maxAssets ?? 12));
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </section>
          ) : (
            <section>
              <StepTitle n={template.scripted ? 3 : 2} title="클립 소스" desc="Veo API로 자동 생성하거나, 다른 플랫폼에서 만든 클립을 샷별로 올려요." />
              <PlatformSelector value={platform} onChange={setPlatform} compact />
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-gray-500">
                <i className="ti ti-info-circle" aria-hidden /> {p.detail} <span className="text-gray-400">· {p.hint}</span>
              </p>

              {generate ? (
                <div className="mt-4 grid gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-[1fr_140px_auto]">
                  <Field label="Veo 모델">
                    <select value={veoModel} onChange={(e) => setVeoModel(e.target.value as VeoModelId)} className={INPUT}>
                      {VEO_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="해상도">
                    <select value={resolution} onChange={(e) => setResolution(e.target.value as "720p" | "1080p")} className={INPUT}>
                      {modelInfo.resolutions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · ${r.usdPerSec.toFixed(2)}/초
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex flex-col justify-end">
                    <span className="text-[13px] font-medium text-gray-500">예상 비용</span>
                    <span className="font-mono text-[20px] font-semibold text-violet-900">
                      {costIsEstimate ? "약 " : ""}${estCost.toFixed(2)}
                    </span>
                    <span className="text-[10.5px] text-gray-500">
                      {shotCount}샷 · 클립 합계 {clipSeconds}초 × ${veoUsdPerSec(veoModel, resolution).toFixed(2)}/초
                      {costIsEstimate && <span className="block text-amber-700">스크립트를 만들면 실제 장면 수로 다시 계산돼요</span>}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-violet-800 sm:col-span-3">
                    워커가 샷별로 생성해 저장하므로 실패해도 이미 만든 샷은 재과금되지 않아요. 프롬프트는 위 스크립트에서 수정하세요.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <p className="text-[12.5px] text-gray-600">
                      샷별 클립 업로드 <span className="font-mono text-gray-400">({ready}/{total})</span> — 프롬프트를 복사해 플랫폼에서 생성하고 mp4를 올려요. 비율·해상도는 합성 때 자동으로 맞춥니다.
                    </p>
                    {total > 0 && (
                      <button
                        type="button"
                        onClick={() => copyText("all", shots.map((s, i) => `[${i + 1}. ${s.id}]\n${s.prompt}`).join("\n\n"))}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <i className={`ti ${copied === "all" ? "ti-check text-emerald-600" : "ti-copy"}`} aria-hidden />
                        {copied === "all" ? "복사됨" : "프롬프트 전체 복사"}
                      </button>
                    )}
                  </div>
                  {total === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-[12.5px] text-gray-500">먼저 AI 스크립트를 생성하면 샷 목록이 나옵니다.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                      {shots.map((s, i) => {
                        const f = files[s.id];
                        const open = openPrompt === s.id;
                        return (
                          <li key={s.id} className={`px-4 py-3 transition-colors ${f ? "bg-emerald-50/40" : "bg-white"}`}>
                            <div className="flex items-center gap-3">
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${f ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                                {f ? <i className="ti ti-check" aria-hidden /> : i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-semibold text-gray-900">
                                  {s.label} <span className="ml-1 font-mono text-[13px] font-normal text-gray-400">{s.id} · {s.seconds}s</span>
                                </p>
                                <p className="truncate text-[13px] text-gray-500">{f ? `${f.name} · ${(f.size / 1048576).toFixed(1)}MB` : "클립 없음"}</p>
                              </div>
                              <button type="button" onClick={() => setOpenPrompt(open ? null : s.id)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] text-gray-600 transition hover:bg-gray-100">
                                <i className={`ti ${open ? "ti-chevron-up" : "ti-file-text"}`} aria-hidden /> 프롬프트
                              </button>
                              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 transition hover:border-signal/50 hover:text-signal">
                                <i className="ti ti-upload" aria-hidden /> {f ? "교체" : "mp4 선택"}
                                <input
                                  type="file"
                                  accept="video/mp4,video/quicktime"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) setFiles((prev) => ({ ...prev, [s.id]: file }));
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                            {open && (
                              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-[13px] text-slate-500">레퍼런스 자산: {s.refs.length ? s.refs.map((r) => `${r}.jpg`).join(", ") : "없음"}</span>
                                  <button type="button" onClick={() => copyText(s.id, s.prompt)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[13px] text-slate-600 ring-1 ring-slate-200 transition hover:text-signal">
                                    <i className={`ti ${copied === s.id ? "ti-check" : "ti-copy"}`} aria-hidden /> {copied === s.id ? "복사됨" : "복사"}
                                  </button>
                                </div>
                                <p className="font-mono text-[11.5px] leading-relaxed text-slate-700">{s.prompt}</p>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="min-w-0 text-[13px] text-gray-500">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : progress ? (
              <span className="inline-flex items-center gap-1.5 text-signal">
                <i className="ti ti-loader-2 animate-spin" aria-hidden /> {progress}
              </span>
            ) : (
              <span>{footerNote}</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-4 text-[15px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50">
              취소
            </button>
            <button type="button" onClick={submit} disabled={submitting || generating} className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[15px] font-medium text-white shadow-sm shadow-signal/25 transition hover:brightness-110 disabled:opacity-50">
              <i className={`ti ${submitting ? "ti-loader-2 animate-spin" : "ti-wand"} text-[16px]`} aria-hidden />
              {generate ? `제작 요청 (${costIsEstimate ? "약 " : ""}$${estCost.toFixed(2)})` : "제작 요청"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepTitle({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="mb-3">
      <h4 className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signal-soft text-[13px] font-semibold text-signal ring-1 ring-signal/20">{n}</span>
        {title}
      </h4>
      <p className="mt-1 text-[13px] text-gray-500">{desc}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

// 숏폼 길이 선택 — 라디오 카드 3종. 카드 안 막대는 장면 계획(역할별 색·길이 비율).
function DurationPicker({ value, onChange, locked }: { value: DurationPreset["seconds"]; onChange: (v: DurationPreset["seconds"]) => void; locked: boolean }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-700">숏폼 길이</span>
        {locked && <span className="text-[13px] text-gray-400">길이를 바꾸면 다시 생성해야 반영돼요</span>}
      </div>
      <div role="radiogroup" aria-label="숏폼 길이" className="grid gap-3 sm:grid-cols-3">
        {DURATION_PRESETS.map((d) => {
          const on = d.seconds === value;
          const total = d.beats.reduce((a, b) => a + b.seconds, 0) + d.endSeconds;
          return (
            <button
              key={d.seconds}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(d.seconds)}
              className={`relative flex flex-col rounded-xl border p-3.5 text-left transition-all ${
                on ? "border-transparent bg-signal-soft ring-2 ring-signal shadow-sm" : "border-gray-200 bg-white hover:border-signal/30 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-signal" : "border-gray-300"}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
                </span>
                <span className={`font-display text-[20px] font-semibold leading-none ${on ? "text-signal-strong" : "text-gray-900"}`}>
                  {d.seconds}
                  <span className="ml-0.5 text-[13px] font-medium">초</span>
                </span>
                <span className={`text-[12.5px] font-semibold ${on ? "text-signal" : "text-gray-700"}`}>{d.name}</span>
                {d.recommended && (
                  <span className="whitespace-nowrap ml-auto rounded-full bg-gradient-to-r from-signal to-violet-500 px-2 py-0.5 text-[12px] font-semibold text-white">추천</span>
                )}
              </div>
              <p className={`mt-2 text-[11.5px] leading-snug ${on ? "text-signal-strong/80" : "text-gray-500"}`}>{d.fit}</p>
              <div className="mt-3 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {d.beats.map((b, i) => (
                  <span key={i} className={ROLE_TONE[b.role].bar} style={{ width: `${(b.seconds / total) * 100}%` }} />
                ))}
                <span className="bg-slate-300" style={{ width: `${(d.endSeconds / total) * 100}%` }} />
              </div>
              <p className="mt-1.5 font-mono text-[10.5px] text-gray-400">{d.beats.length}장면 + 엔드카드</p>
            </button>
          );
        })}
      </div>
      <RoleLegend />
    </div>
  );
}

function RoleLegend() {
  const items: [SceneRole, string][] = [
    ["hook", "후킹"],
    ["benefit", "공감·해결"],
    ["proof", "증명"],
    ["offer", "혜택·CTA"],
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-gray-500">
      {items.map(([r, label]) => (
        <span key={r} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${ROLE_TONE[r].dot}`} /> {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-slate-300" /> 엔드카드
      </span>
    </div>
  );
}

// 생성된 스크립트의 장면 흐름 막대 — 편집하면 길이 비율이 바로 반영된다.
function SceneTimeline({ scenes, endSeconds }: { scenes: ScriptScene[]; endSeconds: number }) {
  const total = scenes.reduce((a, s) => a + s.seconds, 0) + endSeconds;
  let t = 0;
  return (
    <div className="px-4 py-3">
      <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-lg">
        {scenes.map((s, i) => {
          const start = t;
          t += s.seconds;
          return (
            <span
              key={s.id}
              title={`${i + 1}. ${SCENE_ROLE_LABEL[s.role]} · ${start}~${t}초`}
              className={`flex items-center justify-center text-[10.5px] font-semibold text-white ${ROLE_TONE[s.role].bar}`}
              style={{ width: `${(s.seconds / total) * 100}%` }}
            >
              {i + 1}
            </span>
          );
        })}
        <span className="flex items-center justify-center bg-slate-300 text-[12px] font-medium text-white" style={{ width: `${(endSeconds / total) * 100}%` }}>
          END
        </span>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[12px] text-gray-400">
        <span>0s</span>
        <span>{total}s</span>
      </div>
    </div>
  );
}
