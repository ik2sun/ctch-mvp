import { createClient } from "@/lib/supabase/client";
import type { ShortFormBrief, ShortFormScript } from "./shortFormScript";

// 숏폼 합성 작업(shortform_jobs) + 저장소(shortform 버킷) 접근.
// 웹은 브리프→스크립트 생성, 사진/클립 업로드, 작업 등록까지만 하고
// 실제 Veo 클립 생성·TTS·합성은 short-form/worker/render_worker.py 가 사내 PC에서 처리한다.
// 예외: gen_mode=final 은 Higgsfield 등 외부 편집기에서 끝낸 완성본을 올린 것으로, 워커를 거치지 않고 바로 done 으로 등록한다.

export type JobStatus = "queued" | "rendering" | "done" | "failed";
export type JobMode = "upload" | "generate" | "final";

export type JobOptions = {
  veo_model?: string;
  resolution?: "720p" | "1080p";
  voice?: string;
};

export type ShortFormJob = {
  id: string;
  user_id: string;
  created_by: string | null;
  client_id: string | null;
  title: string;
  platform: string;              // veo_api | veo_flow | higgsfield | runway | luma | photos | other(완성본 제작 도구)
  template: string;              // veo_promo | photo_promo | lemouton_veo
  gen_mode: JobMode;
  shots: Record<string, string>; // { shotId: "clips/<job>/<shot>.mp4" }
  assets: string[];              // 사진형: ["assets/<job>/01.jpg", ...]
  copy: Record<string, string>;  // 고정 템플릿 카피 필드
  brief: Partial<ShortFormBrief>;
  script: Partial<ShortFormScript>;
  options: JobOptions;
  status: JobStatus;
  progress: string | null;
  cost_usd: number;
  error: string | null;
  log: string | null;
  video_path: string | null;
  poster_path: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
};

export const BUCKET = "shortform";
const supabase = createClient();

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "대기 중",
  rendering: "제작 중",
  done: "완료",
  failed: "실패",
};

export function missingTableMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const missing = error.code === "PGRST205" || Boolean(error.message?.includes("Could not find the table"));
  if (missing) return "Supabase에 shortform_jobs 테이블이 아직 없어요. supabase/migrations/0012_shortform_jobs.sql을 SQL Editor에서 먼저 실행해 주세요.";
  const oldSchema = error.code === "PGRST204" || Boolean(error.message?.match(/column .* (gen_mode|brief|script|assets|options)/));
  if (oldSchema) return "shortform_jobs 테이블에 새 컬럼이 없어요. supabase/migrations/0014_shortform_generate.sql을 SQL Editor에서 실행해 주세요.";
  return null;
}

export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function listJobs(clientId?: string | null) {
  let q = supabase.from("shortform_jobs").select("*").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  return q;
}

export async function uploadClip(jobId: string, shotId: string, file: File): Promise<string> {
  const path = `clips/${jobId}/${shotId}.mp4`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "video/mp4", upsert: true });
  if (error) throw new Error(`${shotId} 업로드 실패: ${error.message}`);
  return path;
}

export async function uploadAsset(jobId: string, index: number, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `assets/${jobId}/${String(index + 1).padStart(2, "0")}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw new Error(`사진 ${index + 1} 업로드 실패: ${error.message}`);
  return path;
}

// 완성본(외부 편집기에서 끝낸 최종 mp4) — renders/<job>.<ext> 에 올린다. 워커 결과물과 같은 위치.
export async function uploadRender(jobId: string, file: File): Promise<string> {
  const ext = file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "mov" : "mp4";
  const path = `renders/${jobId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "video/mp4", upsert: true });
  if (error) throw new Error(`영상 업로드 실패: ${error.message}`);
  return path;
}

export async function uploadPoster(jobId: string, blob: Blob): Promise<string> {
  const path = `renders/${jobId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`썸네일 업로드 실패: ${error.message}`);
  return path;
}

export async function createJob(input: {
  id: string;
  clientId: string | null;
  title: string;
  platform: string;
  template: string;
  genMode: JobMode;
  shots: Record<string, string>;
  assets: string[];
  copy: Record<string, string>;
  brief: Partial<ShortFormBrief>;
  script: Partial<ShortFormScript>;
  options: JobOptions;
  final?: { videoPath: string; posterPath: string | null; durationSec: number | null };
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return supabase
    .from("shortform_jobs")
    .insert({
      id: input.id,
      user_id: user.id,
      created_by: user.email ?? null,
      client_id: input.clientId,
      title: input.title,
      platform: input.platform,
      template: input.template,
      gen_mode: input.genMode,
      shots: input.shots,
      assets: input.assets,
      copy: input.copy,
      brief: input.brief,
      script: input.script,
      options: input.options,
      status: input.final ? "done" : "queued",
      ...(input.final
        ? { video_path: input.final.videoPath, poster_path: input.final.posterPath, duration_sec: input.final.durationSec }
        : {}),
    })
    .select("*")
    .single();
}

export async function requeueJob(id: string) {
  return supabase.from("shortform_jobs").update({ status: "queued", error: null, progress: null }).eq("id", id);
}

export async function deleteJob(job: ShortFormJob) {
  const paths = [...Object.values(job.shots ?? {}), ...(job.assets ?? []), job.video_path, job.poster_path].filter(
    Boolean,
  ) as string[];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  return supabase.from("shortform_jobs").delete().eq("id", job.id);
}

export function newJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
