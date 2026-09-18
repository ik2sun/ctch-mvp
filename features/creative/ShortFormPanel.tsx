"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useClients } from "@/features/clients/ClientContext";
import { Badge, MediaCard, type BadgeTone } from "./MediaCard";
import { VideoModal, type MediaItem } from "./VideoModal";
import { NewShortFormForm } from "./NewShortFormForm";
import { FinalUploadForm } from "./FinalUploadForm";
import { ENGINE_META, SHORT_FORM_PIPELINES, type ShortFormPipeline } from "./shortFormPipelines";
import { TEMPLATE_BY_ID } from "./shortFormTemplates";
import { platformLabel } from "./platforms";
import {
  STATUS_LABEL,
  deleteJob,
  listJobs,
  missingTableMessage,
  publicUrl,
  requeueJob,
  type JobStatus,
  type ShortFormJob,
} from "./shortFormJobs";

const STATUS_TONE: Record<JobStatus, BadgeTone> = { queued: "gray", rendering: "blue", done: "green", failed: "red" };
const STATUS_ICON: Record<JobStatus, string> = { queued: "clock", rendering: "loader-2", done: "circle-check", failed: "alert-circle" };

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 소재 생성 > 숏폼 제작 탭
export function ShortFormPanel() {
  const { selected, clients } = useClients();
  const [jobs, setJobs] = useState<ShortFormJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<MediaItem | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showFinal, setShowFinal] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await listJobs(selected?.id ?? null);
    if (error) {
      setError(missingTableMessage(error) ?? error.message);
      setJobs([]);
    } else {
      setError(null);
      setJobs((data ?? []) as ShortFormJob[]);
    }
    setLoading(false);
  }, [selected?.id]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // 대기/합성 중인 작업이 있으면 12초마다 상태 갱신
  const active = jobs.some((j) => j.status === "queued" || j.status === "rendering");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const clientName = useCallback(
    (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "광고주" : "미지정"),
    [clients],
  );

  const jobItems = useMemo<MediaItem[]>(
    () =>
      jobs.map((j) => {
        const tpl = TEMPLATE_BY_ID[j.template];
        const isFinal = j.gen_mode === "final";
        const video = j.status === "done" ? publicUrl(j.video_path) : null;
        return {
          id: j.id,
          kind: "job",
          title: j.title,
          brand: tpl?.brand ?? clientName(j.client_id),
          date: fmtDate(j.created_at),
          owner: j.created_by?.split("@")[0] ?? null,
          platform: j.gen_mode === "generate" ? "Veo API 자동" : isFinal ? `완성본 · ${platformLabel(j.platform)}` : platformLabel(j.platform),
          poster: publicUrl(j.poster_path),
          video,
          durationSec: j.duration_sec,
          badge: { label: STATUS_LABEL[j.status], tone: STATUS_TONE[j.status], icon: STATUS_ICON[j.status] },
          description: isFinal
            ? `${platformLabel(j.platform)}에서 편집을 끝낸 완성본을 업로드했어요. 워커 합성을 거치지 않았습니다.`
            : tpl
              ? `${tpl.name} 템플릿으로 합성. ${tpl.description}`
              : "템플릿 합성 작업",
          details: [
            { k: "광고주", v: clientName(j.client_id) },
            {
              k: "방식",
              v: isFinal
                ? `완성본 업로드 (${platformLabel(j.platform)})`
                : j.gen_mode === "generate"
                  ? "Veo API 자동 생성"
                  : tpl?.kind === "photos"
                    ? "사진 렌더"
                    : `클립 업로드 (${platformLabel(j.platform)})`,
            },
            ...(isFinal
              ? []
              : [
                  { k: "템플릿", v: j.template },
                  tpl?.kind === "photos" ? { k: "사진", v: `${(j.assets ?? []).length}장` } : { k: "클립", v: `${Object.keys(j.shots ?? {}).length}개` },
                ]),
            ...(j.script?.scenes?.length ? [{ k: "장면", v: `${j.script.scenes.length}개` }] : []),
            ...(j.options?.veo_model ? [{ k: "Veo", v: `${j.options.veo_model.replace("-generate-preview", "")} ${j.options.resolution ?? ""}` }] : []),
            ...(Number(j.cost_usd) > 0 ? [{ k: "API 비용", v: `$${Number(j.cost_usd).toFixed(2)}` }] : []),
            ...(j.progress && j.status === "rendering" ? [{ k: "진행", v: j.progress }] : []),
            ...Object.entries(j.copy ?? {}).map(([k, v]) => ({ k, v })),
            { k: "등록", v: new Date(j.created_at).toLocaleString("ko-KR") },
            { k: "갱신", v: new Date(j.updated_at).toLocaleString("ko-KR") },
          ],
          downloadName: `${j.title}.mp4`,
          errorText: j.status === "failed" ? j.error : null,
          logText: j.log,
          notes:
            j.status === "queued"
              ? ["사내 렌더 워커(short-form/worker/render_worker.py)가 켜져 있어야 합성이 시작됩니다."]
              : undefined,
          actions: [
            ...(j.status === "failed"
              ? [
                  {
                    label: "다시 합성",
                    icon: "refresh",
                    onClick: async () => {
                      await requeueJob(j.id);
                      await refresh();
                      setModal(null);
                    },
                  },
                ]
              : []),
            {
              label: "삭제",
              icon: "trash",
              tone: "danger" as const,
              onClick: async () => {
                if (!confirm(`'${j.title}' 작업과 업로드한 클립을 삭제할까요?`)) return;
                await deleteJob(j);
                await refresh();
                setModal(null);
              },
            },
          ],
        };
      }),
    [jobs, clientName, refresh],
  );

  const refItems = useMemo<MediaItem[]>(() => SHORT_FORM_PIPELINES.map(pipelineToItem), []);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold text-gray-900">숏폼 제작</h2>
            <Badge tone="violet">
              <i className="ti ti-sparkles" aria-hidden /> AI 스크립트
            </Badge>
            <Badge tone="blue">
              <i className="ti ti-device-desktop" aria-hidden /> 사내 워커 렌더
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-gray-500">
            브리프 → AI 스크립트 → 사진 렌더($0) 또는 Veo API 자동 생성 / 클립 업로드로 세로형 숏폼을 만듭니다. 결과물은 카드를 눌러 재생·다운로드하세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFinal(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-[13.5px] font-medium text-gray-700 shadow-sm transition hover:border-signal/40 hover:text-signal"
        >
          <i className="ti ti-upload text-[16px]" aria-hidden /> 완성본 업로드
        </button>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-signal to-violet-600 px-4 text-[13.5px] font-medium text-white shadow-sm shadow-signal/25 transition hover:brightness-110"
        >
          <i className="ti ti-plus text-[16px]" aria-hidden /> 새 숏폼 생성
        </button>
        </div>
      </div>

      {/* 생성 작업 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-gray-900">
            생성 작업 {selected ? <span className="font-normal text-gray-500">— {selected.name}</span> : null}
          </h3>
          <span className="text-xs text-gray-500">{jobs.length}개</span>
        </div>
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{error}</div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="aspect-[9/16] bg-gray-100" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-1/3 rounded bg-gray-100" />
                  <div className="h-3.5 w-3/4 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal-soft text-signal">
              <i className="ti ti-movie text-[22px]" aria-hidden />
            </span>
            <p className="mt-3 text-[14px] font-medium text-gray-900">아직 생성한 숏폼이 없어요</p>
            <p className="mt-1 text-xs text-gray-500">브리프만 넣으면 AI가 스크립트를 쓰고, 사진 또는 Veo 클립으로 합성해 드려요.</p>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-signal px-4 text-[13px] font-medium text-white transition hover:bg-signal-strong"
            >
              <i className="ti ti-plus" aria-hidden /> 첫 숏폼 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {jobItems.map((it, i) => (
              <MediaCard
                key={it.id}
                poster={it.poster}
                title={it.title}
                brand={it.brand}
                meta={jobs[i].status === "rendering" && jobs[i].progress ? jobs[i].progress : `${it.date}${it.owner ? ` · ${it.owner}` : ""}`}
                badge={it.badge}
                duration={it.durationSec ? `${Math.round(it.durationSec)}s` : undefined}
                platform={it.platform}
                playable={Boolean(it.video)}
                progress={jobs[i].status === "rendering" || jobs[i].status === "queued"}
                onClick={() => setModal(it)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 레퍼런스 · 템플릿 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900">레퍼런스 · 템플릿</h3>
            <p className="text-xs text-gray-500">9/4·9/7 세션에서 만든 제작 환경. 재렌더 명령과 핵심 파일은 카드에서 확인.</p>
          </div>
          <span className="text-xs text-gray-500">{refItems.length}개</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {refItems.map((it) => (
            <MediaCard
              key={it.id}
              poster={it.poster}
              title={it.title}
              brand={it.brand}
              meta={`${it.date} · Claude Code`}
              badge={it.badge}
              duration={it.durationSec ? `${Math.round(it.durationSec)}s` : undefined}
              platform={it.platform}
              playable={Boolean(it.video)}
              onClick={() => setModal(it)}
            />
          ))}
        </div>
      </section>

      <VideoModal item={modal} onClose={() => setModal(null)} />
      {showFinal && <FinalUploadForm onClose={() => setShowFinal(false)} onCreated={(job) => setJobs((prev) => [job, ...prev])} />}
      {showNew && (
        <NewShortFormForm
          onClose={() => setShowNew(false)}
          onCreated={(job) => setJobs((prev) => [job, ...prev])}
        />
      )}
    </div>
  );
}

function pipelineToItem(p: ShortFormPipeline): MediaItem {
  const engine = ENGINE_META[p.engine];
  const tone: BadgeTone = p.engine === "veo" ? "violet" : p.engine === "remotion" ? "green" : "amber";
  return {
    id: `ref-${p.id}`,
    kind: "reference",
    title: p.title,
    brand: p.brand,
    date: p.madeOn.replace(/-/g, "."),
    platform: p.engineLabel,
    poster: p.preview.poster,
    video: p.preview.video,
    durationSec: p.durationSec,
    badge: { label: engine.label, tone, icon: engine.icon },
    description: p.summary,
    details: [
      { k: "규격", v: p.size },
      { k: "진입점", v: p.entry },
      { k: "위치", v: p.dir },
      ...p.keyFiles.map((f) => ({ k: f.path, v: f.note })),
    ],
    downloadName: `${p.id}.mp4`,
    commands: p.commands,
    notes: p.notes,
  };
}
