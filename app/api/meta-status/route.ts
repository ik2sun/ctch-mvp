import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 매체 연동 상태 점검 — 가벼운 호출 1회로 토큰·계정 유효성 확인
const API_VERSION = "v21.0";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "광고주가 필요해요." }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("name, meta_account_id, naver_customer_id, google_customer_id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });

  const token = process.env.META_ACCESS_TOKEN;
  const media: {
    key: string;
    label: string;
    connected: boolean;
    status: "ok" | "expired" | "error" | "none";
    detail: string;
  }[] = [];

  // 메타
  if (!client.meta_account_id) {
    media.push({ key: "meta", label: "메타", connected: false, status: "none", detail: "계정 ID 미등록" });
  } else if (!token) {
    media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "서버 토큰 없음" });
  } else {
    const accountId = client.meta_account_id as string;
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${act}?fields=name,account_status&access_token=${token}`,
      );
      const json = await res.json();
      if (json.error) {
        const code = json.error.code as number;
        const expired = code === 190;
        media.push({
          key: "meta",
          label: "메타",
          connected: false,
          status: expired ? "expired" : "error",
          detail: expired ? "토큰 만료 — 재발급 필요" : String(json.error.message ?? "연결 실패"),
        });
      } else {
        media.push({
          key: "meta",
          label: "메타",
          connected: true,
          status: "ok",
          detail: (json.name as string) ?? act,
        });
      }
    } catch {
      media.push({ key: "meta", label: "메타", connected: false, status: "error", detail: "연결 확인 실패" });
    }
  }

  // 네이버·구글은 계정 등록 여부만 (연동 코드는 이후 단계)
  media.push({
    key: "naver",
    label: "네이버",
    connected: !!client.naver_customer_id,
    status: client.naver_customer_id ? "ok" : "none",
    detail: client.naver_customer_id ? "계정 등록됨 (연동 예정)" : "미등록",
  });
  media.push({
    key: "google",
    label: "구글",
    connected: !!client.google_customer_id,
    status: client.google_customer_id ? "ok" : "none",
    detail: client.google_customer_id ? "계정 등록됨 (연동 예정)" : "미등록",
  });

  return NextResponse.json({ media, clientName: client.name });
}
