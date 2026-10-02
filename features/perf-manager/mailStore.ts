// 광고주 메일 저장 — CTCH Gmail 동기화(mailSync.ts)와 Claude Code MCP 가져오기(scripts/pm-mail.ts)가 같이 쓴다.
// 상대 경로 import만(스크립트가 tsx로 그대로 불러 씀). db는 service_role 클라이언트.
// 같은 메일이 이미 있으면(다른 담당자 메일함에서 먼저 들어옴) mailboxes에 이 메일함만 더한다.
// 수집 조건(특정인·키워드, any/all)에 안 맞는 메일과 민감 메일(급여·인사·경영지원 등, 인용부 포함 원문 기준)은 저장하지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addrList, BODY_LIMIT, dedupKey, direction, isSensitiveMail, matchesRules, parseFrom, stripQuoted, type BlockList, type ImportMail, type MailRules } from "./mailText";

export type SaveResult = { received: number; added: number; merged: number; alreadyHad: number; skipped: number; blocked: number };

export async function saveMails(db: SupabaseClient, clientId: string, mailbox: string, rules: MailRules, items: ImportMail[], block: BlockList): Promise<SaveResult> {
  const box = mailbox.toLowerCase();
  let blocked = 0;
  const rows = items
    .filter((m) => m && m.from && m.date)
    .map((m) => {
      const from = parseFrom(m.from);
      const to = addrList(m.to);
      const cc = addrList(m.cc);
      const t = Date.parse(m.date);
      const sentAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
      const subject = (m.subject ?? "(제목 없음)").slice(0, 500);
      const raw = m.body ?? m.snippet ?? "";
      const body = stripQuoted(raw).slice(0, BODY_LIMIT);
      // 민감 메일은 인용부까지 포함한 원문으로 판정(답장 아래 붙은 급여 안내 등도 걸리게)
      if (isSensitiveMail({ from: from.addr, fromName: from.name, to, cc, subject, body: raw }, block)) {
        blocked++;
        return null;
      }
      return {
        client_id: clientId,
        message_id: dedupKey({ messageId: m.messageId, fromAddr: from.addr, sentAt, subject }),
        thread_id: m.threadId ?? null,
        mailboxes: [box],
        from_addr: from.addr,
        from_name: from.name,
        to_addrs: to,
        cc_addrs: cc,
        subject,
        sent_at: sentAt,
        snippet: (m.snippet || body).slice(0, 300),
        body,
        direction: direction(from.addr, to, cc, rules),
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && matchesRules(r.from_addr, r.to_addrs, r.cc_addrs, r.subject, r.body, rules));
  const uniq = [...new Map(rows.map((r) => [r.message_id, r])).values()];
  const result: SaveResult = { received: items.length, added: 0, merged: 0, alreadyHad: 0, skipped: items.length - rows.length - blocked, blocked };
  if (!uniq.length) return result;

  const byMid = new Map<string, { id: string; mailboxes: string[] }>();
  for (let i = 0; i < uniq.length; i += 100) {
    const { data, error } = await db
      .from("pm_emails")
      .select("id, message_id, mailboxes")
      .eq("client_id", clientId)
      .in("message_id", uniq.slice(i, i + 100).map((r) => r.message_id));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) byMid.set(r.message_id as string, { id: r.id as string, mailboxes: (r.mailboxes as string[]) ?? [] });
  }

  const fresh = [];
  for (const r of uniq) {
    const ex = byMid.get(r.message_id);
    if (!ex) fresh.push(r);
    else if (!ex.mailboxes.includes(box)) {
      const { error } = await db.from("pm_emails").update({ mailboxes: [...ex.mailboxes, box] }).eq("id", ex.id);
      if (error) throw new Error(error.message);
      result.merged++;
    } else result.alreadyHad++;
  }
  for (let i = 0; i < fresh.length; i += 200) {
    // 동시에 다른 가져오기가 같은 메일을 넣었으면 무시(unique client_id+message_id)
    const { error } = await db.from("pm_emails").upsert(fresh.slice(i, i + 200), { onConflict: "client_id,message_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  result.added = fresh.length;
  return result;
}

// 이 메일함에서 마지막으로 들어온 메일 기준 검색 시작일 — 처음은 최근 90일, 이후 마지막 메일 - 2일(늦게 도착·라벨 변경 대비)
// first: 이 메일함에서 가장 오래된 수집 메일 — 한 번에 다 못 가져온 최근 90일 이전분을 다음 동기화가 이어서 채우는 기준(backfillBefore)
export const FIRST_SYNC_DAYS = 90;
export async function searchAfter(db: SupabaseClient, clientId: string, mailbox: string): Promise<{ after: string; last: string | null; first: string | null; floor: string }> {
  const q = (asc: boolean) =>
    db.from("pm_emails").select("sent_at").eq("client_id", clientId).contains("mailboxes", [mailbox.toLowerCase()]).not("sent_at", "is", null).order("sent_at", { ascending: asc }).limit(1);
  const [{ data: newest }, { data: oldest }] = await Promise.all([q(false), q(true)]);
  const last = (newest?.[0]?.sent_at as string | undefined) ?? null;
  const first = (oldest?.[0]?.sent_at as string | undefined) ?? null;
  const floor = new Date(Date.now() - FIRST_SYNC_DAYS * 86400000).toISOString().slice(0, 10);
  const after = last ? new Date(new Date(last).getTime() - 2 * 86400000).toISOString().slice(0, 10) : floor;
  return { after, last, first, floor };
}
