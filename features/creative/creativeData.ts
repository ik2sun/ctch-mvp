import { createClient } from "@/lib/supabase/client";

export type CreativeKind = "image" | "video";

export type Creative = {
  id: string;
  client_id: string | null;
  kind: CreativeKind;
  prompt: string;
  image_url: string | null;
  video_url: string | null;
  source_image_url: string | null;
  model: string | null;
  created_at: string;
};

export type NewCreative = {
  clientId: string | null;
  kind: CreativeKind;
  prompt: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sourceImageUrl?: string | null;
  model?: string | null;
};

const supabase = createClient();

export async function listCreatives(clientId?: string | null): Promise<Creative[]> {
  let query = supabase.from("creatives").select("*").order("created_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query;
  return data ?? [];
}

export async function saveCreative(input: NewCreative) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  return supabase
    .from("creatives")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      kind: input.kind,
      prompt: input.prompt,
      image_url: input.imageUrl ?? null,
      video_url: input.videoUrl ?? null,
      source_image_url: input.sourceImageUrl ?? null,
      model: input.model ?? null,
    })
    .select("*")
    .single();
}

const IMAGE_BUCKET = "shortform"; // 공용 public 버킷, images/ 접두사 (API 생성 결과·업로드 이미지)

// 외부 도구에서 만든 이미지를 올린다 → 공개 URL
export async function uploadCreativeImage(file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  const path = `images/${id}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw new Error(`${file.name} 업로드 실패: ${error.message}`);
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// 행 삭제 + 우리 버킷(images/)에 있는 파일이면 함께 지운다. Higgsfield CDN URL 은 건드리지 않는다.
export async function deleteCreative(c: Pick<Creative, "id" | "image_url">) {
  const m = c.image_url?.match(new RegExp(`/storage/v1/object/public/${IMAGE_BUCKET}/(images/[^?]+)`));
  if (m) await supabase.storage.from(IMAGE_BUCKET).remove([decodeURIComponent(m[1])]);
  return supabase.from("creatives").delete().eq("id", c.id);
}
