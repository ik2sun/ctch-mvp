import { NextResponse } from "next/server";
import { addBlock, listMailboxes, loadBlock, loadMemory, loadOwners, loadSettings, mailStats, removeBlock, requireClientAccess, RuleError, saveOwners, saveSettings } from "@/features/perf-manager/store";
import { SENSITIVE_KEYWORDS, SENSITIVE_SENDER_WORDS } from "@/features/perf-manager/mailText";
import { isOwnerEmail } from "@/lib/workspaceEmail";
import type { BlockInfo, CampaignOwner, PmSettings } from "@/features/perf-manager/types";

// 캠페인 매니저 화면 데이터 — 메일 수집 조건·담당자·연결 메일함(이 광고주 가져오기 허용 상태)·수집 현황·메일 정리·민감 메일 차단 목록.
// 수집 조건·담당자 저장은 워크스페이스 구성원 누구나(담당자가 직접 관리). 조건을 바꾸면 메일함 가져오기 허용이 자동으로 풀린다.
// 민감 메일 차단 목록은 관리자(SUPERADMIN_EMAIL)에게만 내려주고 편집도 관리자만 — 다른 구성원 화면에는 카드 자체가 없다(기본 차단은 누구에게나 항상 적용).
async function blockInfo(email: string | undefined): Promise<BlockInfo | null> {
  if (!isOwnerEmail(email)) return null;
  return { defaults: { keywords: SENSITIVE_KEYWORDS, senderWords: SENSITIVE_SENDER_WORDS }, extra: await loadBlock(), canEdit: isOwnerEmail(email) };
}

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const access = await requireClientAccess(clientId);
  if (access instanceof NextResponse) return access;
  try {
    const [settings, owners, stats, mem, block] = await Promise.all([
      loadSettings(access.client.id),
      loadOwners(access.client.id),
      mailStats(access.client.id),
      loadMemory(access.client.id),
      blockInfo(access.user.email),
    ]);
    const mailboxes = await listMailboxes(access.user.id, access.client.id, settings);
    return NextResponse.json({ settings, owners, mailboxes, stats, memory: mem?.memory ?? null, memoryMeta: mem?.meta ?? null, block, me: access.user.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "불러오지 못했어요.", me: access.user.email }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    clientId?: string;
    settings?: Partial<PmSettings>;
    owners?: CampaignOwner[];
    block?: { op: "add" | "remove"; kind: "keyword" | "sender"; value: string };
  } | null;
  const access = await requireClientAccess(body?.clientId);
  if (access instanceof NextResponse) return access;
  try {
    if (body?.block) {
      if (!isOwnerEmail(access.user.email)) return NextResponse.json({ error: "민감 메일 차단 목록은 관리자만 바꿀 수 있어요." }, { status: 403 });
      const { op, kind, value } = body.block;
      if (!["keyword", "sender"].includes(kind) || !value?.trim()) return NextResponse.json({ error: "차단할 단어나 주소를 입력하세요." }, { status: 400 });
      let purged = 0;
      if (op === "add") purged = (await addBlock(kind, value, access.user.email ?? "")).purged;
      else await removeBlock(kind, value);
      return NextResponse.json({ block: await blockInfo(access.user.email), purged, stats: await mailStats(access.client.id) });
    }
    // 부분 저장 — 화면이 보낸 칸만 바꾸고 나머지는 그대로(수집 조건 / 추가 설정을 따로 저장)
    if (body?.settings) await saveSettings(access.client.id, { ...(await loadSettings(access.client.id)), ...body.settings }, access.user.email ?? "");
    if (Array.isArray(body?.owners)) await saveOwners(access.client.id, body.owners);
    const [settings, owners] = await Promise.all([loadSettings(access.client.id), loadOwners(access.client.id)]);
    const mailboxes = await listMailboxes(access.user.id, access.client.id, settings);
    return NextResponse.json({ settings, owners, mailboxes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "저장하지 못했어요." }, { status: e instanceof RuleError ? 400 : 500 });
  }
}
