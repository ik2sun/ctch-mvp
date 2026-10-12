// AI 매니저 자료실 — 목록·업로드 주소·학습·삭제. 워크스페이스 구성원 누구나(광고주 접근 확인)
import { NextResponse } from "next/server";
import { requireClientAccess } from "@/features/perf-manager/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_BUCKET, DOC_DIR, deleteDoc, ingestDoc, listDocs } from "@/features/perf-manager/docs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KINDS = ["pdf", "pptx", "docx", "xlsx", "google", "text"];

export async function GET(req: Request) {
  const a = await requireClientAccess(new URL(req.url).searchParams.get("clientId"));
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json({ docs: await listDocs(a.client.id) });
  } catch (e) {
    return NextResponse.json({ docs: [], setupError: (e as Error).message });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    clientId?: string;
    ext?: string;
    scope?: "client" | "global";
    fileName?: string;
    kind?: string;
    text?: string;
    filePath?: string;
  };
  const a = await requireClientAccess(body.clientId);
  if (a instanceof NextResponse) return a;

  if (body.action === "uploadUrl") {
    // 원본은 브라우저 → 저장소로 직접(Vercel 본문 4.5MB 제한 회피)
    const ext = String(body.ext ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${DOC_DIR}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await createAdminClient().storage.from(DOC_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: `업로드 주소를 만들지 못했어요 — ${error?.message ?? ""}` }, { status: 500 });
    return NextResponse.json({ bucket: DOC_BUCKET, path, token: data.token });
  }

  if (body.action === "ingest") {
    const kind = String(body.kind ?? "");
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "지원하지 않는 문서 형식이에요." }, { status: 400 });
    const filePath = body.filePath ? String(body.filePath) : null;
    if (filePath && !filePath.startsWith(`${DOC_DIR}/`)) return NextResponse.json({ error: "잘못된 파일 경로예요." }, { status: 400 });
    try {
      const doc = await ingestDoc({
        clientId: body.scope === "global" ? null : a.client.id,
        fileName: String(body.fileName ?? "문서").slice(0, 200),
        kind,
        text: typeof body.text === "string" ? body.text.slice(0, 600_000) : undefined,
        filePath,
        by: a.user.email ?? "",
      });
      return NextResponse.json({ doc });
    } catch (e) {
      return NextResponse.json({ error: `학습하지 못했어요 — ${(e as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "알 수 없는 요청이에요." }, { status: 400 });
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const a = await requireClientAccess(u.searchParams.get("clientId"));
  if (a instanceof NextResponse) return a;
  try {
    await deleteDoc(String(u.searchParams.get("id") ?? ""), a.client.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
