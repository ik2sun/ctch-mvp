// 광고주 메일 동기화(CTCH Gmail 연결) — 서버 전용.
// Gmail 연동에 동의한 담당자 메일함 전체에서 프로젝트 수집 조건(특정인·키워드, any/all)으로 검색 → pm_emails에 저장.
// 민감 메일(급여·인사·경영지원 등)은 검색에서 빼고(mailText.buildQuery) 저장 직전에 한 번 더 거른다(mailStore.saveMails).
// 같은 메일이 여러 담당자 메일함에 있으면 1건만 두고 mailboxes에 메일함을 더한다(mailStore.saveMails — MCP 가져오기와 공용).
import { createAdminClient } from "@/lib/supabase/admin";
import { freshGmailToken, type MailAccountRow } from "@/lib/gmail/auth";
import { getMessage, listMessageIds, mapLimit } from "@/lib/gmail/client";
import { buildQuery } from "./mailText";
import { saveMails, searchAfter } from "./mailStore";
import { loadBlock } from "./store";
import type { BlockList } from "./mailText";
import type { PmSettings, SyncResult } from "./types";

const MAX_PER_MAILBOX = 150; // 한 번에 메일함당 최대(서버 시간 한도 안에서)

async function syncMailbox(clientId: string, s: PmSettings, acc: MailAccountRow, block: BlockList): Promise<SyncResult> {
  const db = createAdminClient();
  const result: SyncResult = { mailbox: acc.email, found: 0, added: 0, merged: 0, blocked: 0 };
  try {
    const { after, first, floor } = await searchAfter(db, clientId, acc.email);
    const q = buildQuery(s, after, block);
    if (!q) return result;
    const token = await freshGmailToken(acc);
    // ① 새 메일(마지막 수집 이후) ② 남은 한도로 최근 90일 중 아직 못 가져온 옛 메일(가장 오래된 수집 메일 이전)을 이어서
    const ids = await listMessageIds(token, q, MAX_PER_MAILBOX);
    if (first && ids.length < MAX_PER_MAILBOX && first.slice(0, 10) > floor) {
      const before = new Date(new Date(first).getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "/");
      const older = await listMessageIds(token, `${buildQuery(s, floor, block)} before:${before}`, MAX_PER_MAILBOX - ids.length);
      for (const id of older) if (!ids.includes(id)) ids.push(id);
    }
    result.found = ids.length;
    const settled = await mapLimit(ids, 4, (id) => getMessage(token, id)); // 동시 4개 — Gmail 사용자별 분당 한도 여유
    const mails = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const saved = await saveMails(db, clientId, acc.email, s, mails, block);
    result.added = saved.added;
    result.merged = saved.merged;
    result.blocked = saved.blocked;
    await db.from("pm_mail_accounts").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("member_id", acc.member_id);
  } catch (e) {
    result.error = e instanceof Error ? e.message : "수집 실패";
    await db.from("pm_mail_accounts").update({ last_error: result.error.slice(0, 500) }).eq("member_id", acc.member_id);
  }
  return result;
}

// Gmail 연동에 동의한 담당자 메일함 전부에서 이 프로젝트 조건에 맞는 메일을 모은다(연동 = 수집 동의, 프로젝트별 허용 단계 없음)
export async function syncClientMail(clientId: string, s: PmSettings): Promise<SyncResult[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("pm_mail_accounts").select("*");
  if (error) throw new Error(error.message);
  const block = await loadBlock();
  return Promise.all(((data ?? []) as MailAccountRow[]).map((a) => syncMailbox(clientId, s, a, block)));
}
