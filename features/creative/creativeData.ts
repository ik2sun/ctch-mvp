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

export async function deleteCreative(id: string) {
  return supabase.from("creatives").delete().eq("id", id);
}
