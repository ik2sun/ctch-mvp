// 캠페인 매니저 저장소 — 서버 전용. pm_* 테이블은 RLS 정책이 없어 service_role로만 읽고 쓴다.
// 접근 확인: 로그인 + 이 광고주를 읽을 수 있는지(워크스페이스 소유자의 광고주 = 0021 RLS로 승인된 구성원만 읽힘).
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataOwnerId } from "@/lib/workspace";
import { isWorkspaceEmail } from "@/lib/workspaceEmail";
import { isSensitiveMail, ruleProblems, rulesFingerprint, type BlockList, type MatchMode } from "./mailText";
import { EMPTY_SETTINGS, type CampaignOwner, type MailboxInfo, type MemberSide, type MailStats, type MemoryMeta, type PmMemory, type PmSettings } from "./types";

export type ClientProfile = { id: string; name: string; industry: string | null; monthly_budget: number | null; manager: string | null; memo: string | null };

export type Access = { supabase: SupabaseClient; user: User; client: ClientProfile; ownerId: string };

// 로그인 + 워크스페이스 구성원 + 광고주 소유 확인. 실패하면 응답을 돌려준다
export async function requireClientAccess(clientId: string | null | undefined): Promise<Access | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isWorkspaceEmail(user.email)) return NextResponse.json({ error: "@nmg.co.kr 계정만 쓸 수 있어요." }, { status: 403 });
  if (!clientId) return NextResponse.json({ error: "광고주를 선택하세요." }, { status: 400 });
  const ownerId = await dataOwnerId(user);
  const { data } = await supabase.from("clients").select("id, name, industry, monthly_budget, manager, memo").eq("id", clientId).eq("user_id", ownerId).maybeSingle();
  if (!data) return NextResponse.json({ error: "광고주를 찾을 수 없어요." }, { status: 403 });
  return { supabase, user, client: data as ClientProfile, ownerId };
}

// 테이블·칸이 없을 때만(그 밖의 오류는 원문 그대로) 어느 마이그레이션을 실행하면 되는지 안내
const TABLE_MISSING = /Could not find the table|relation .* does not exist|column .* does not exist|Could not find the '.*' column/i;
export function migrationHint(e: { message?: string } | null | undefined): string | null {
  if (!e?.message || !TABLE_MISSING.test(e.message)) return null;
  const file = /pm_mail_shares/.test(e.message) ? "0023_pm_mail_shares.sql" : /pm_mail_block|mail_match/.test(e.message) ? "0024_pm_mail_rules_block.sql" : "0022_campaign_manager.sql";
  return `캠페인 매니저 테이블이 없어요. supabase/migrations/${file}을 SQL Editor에서 실행해 주세요.`;
}

const clean = (arr: unknown, lower = true): string[] =>
  Array.isArray(arr)
    ? [...new Set(arr.map((x) => String(x ?? "").trim()).filter(Boolean).map((x) => (lower ? x.toLowerCase() : x)))].slice(0, 50)
    : [];

export async function loadSettings(clientId: string): Promise<PmSettings> {
  const { data, error } = await createAdminClient().from("pm_client_settings").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(migrationHint(error) ?? error.message);
  if (!data) return { ...EMPTY_SETTINGS };
  return {
    mailDomains: data.mail_domains ?? [],
    mailAddresses: data.mail_addresses ?? [],
    mailKeywords: data.mail_keywords ?? [],
    mailMatch: data.mail_match === "all" ? "all" : "any",
    competitors: data.competitors ?? [],
    marketNotes: data.market_notes ?? "",
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

export class RuleError extends Error {}

export async function saveSettings(clientId: string, s: Partial<PmSettings>, by: string) {
  const row = {
    client_id: clientId,
    // 도메인은 @·공백 제거(사람들이 @lemouton.co.kr 처럼 넣는다)
    mail_domains: clean(s.mailDomains).map((d) => d.replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "")),
    mail_addresses: clean(s.mailAddresses).filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)),
    mail_keywords: clean(s.mailKeywords, false),
    mail_match: s.mailMatch === "all" ? "all" : "any",
    competitors: clean(s.competitors, false),
    market_notes: (s.marketNotes ?? "").slice(0, 4000),
    updated_at: new Date().toISOString(),
    updated_by: by,
  };
  // 회사·공용 도메인 전체, 민감 단어·부서 주소, 빈 조건은 거절
  const problems = ruleProblems({ mailDomains: row.mail_domains, mailAddresses: row.mail_addresses, mailKeywords: row.mail_keywords, mailMatch: row.mail_match as MatchMode }, await loadBlock());
  if (problems.length) throw new RuleError(problems.join(" "));
  const { error } = await createAdminClient().from("pm_client_settings").upsert(row, { onConflict: "client_id" });
  if (error) throw new Error(migrationHint(error) ?? error.message);
}

// ── 민감 메일 추가 차단 목록(워크스페이스 공통, 관리자만 편집) ──
// 테이블(0024)이 아직 없으면 빈 목록 — 기본 차단 목록(코드)은 항상 적용된다
export async function loadBlock(): Promise<BlockList> {
  const { data, error } = await createAdminClient().from("pm_mail_block").select("kind, value").order("created_at");
  if (error) return { keywords: [], senders: [] };
  // 한 칸에 여러 개를 쉼표·공백으로 넣은 예전 값도 나눠 쓴다(하나로 두면 Gmail 검색식이 깨져 아무것도 안 걸림)
  const split = (kind: string) => (data ?? []).filter((r) => r.kind === kind).flatMap((r) => splitBlockValue(r.value as string, kind === "sender"));
  return { keywords: [...new Set(split("keyword"))], senders: [...new Set(split("sender"))] };
}

// 차단 입력값 나누기 — 주소·도메인은 쉼표·공백·세미콜론, 단어는 쉼표·세미콜론 기준
export function splitBlockValue(v: string, sender: boolean): string[] {
  return v
    .split(sender ? /[,;\s]+/ : /[,;\n]+/)
    .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
    .filter((x) => x.length >= 2);
}

// 추가하면 이미 모은 메일 중 걸리는 것도 지운다(전 광고주)
export async function addBlock(kind: "keyword" | "sender", value: string, by: string): Promise<{ purged: number }> {
  const values = splitBlockValue(value, kind === "sender"); // 여러 개를 한 번에 넣어도 한 줄씩 저장
  if (!values.length) throw new RuleError("2자 이상 입력하세요.");
  const db = createAdminClient();
  const { error } = await db.from("pm_mail_block").upsert(values.map((v) => ({ kind, value: v, created_by: by })), { onConflict: "kind,value", ignoreDuplicates: true });
  if (error) throw new Error(migrationHint(error) ?? error.message);
  const block = await loadBlock();
  let purged = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("pm_emails").select("id, from_addr, from_name, to_addrs, cc_addrs, subject, body").range(from, from + 999);
    if (!data?.length) break;
    const hit = data
      .filter((m) => isSensitiveMail({ from: m.from_addr ?? "", fromName: m.from_name, to: m.to_addrs ?? [], cc: m.cc_addrs ?? [], subject: m.subject ?? "", body: m.body ?? "" }, block))
      .map((m) => m.id as string);
    if (hit.length) {
      await db.from("pm_emails").delete().in("id", hit);
      purged += hit.length;
      from -= hit.length; // 지운 만큼 다음 페이지가 당겨짐
    }
    if (data.length < 1000) break;
  }
  return { purged };
}

export async function removeBlock(kind: "keyword" | "sender", value: string) {
  const { error } = await createAdminClient().from("pm_mail_block").delete().eq("kind", kind).eq("value", value.trim().toLowerCase());
  if (error) throw new Error(migrationHint(error) ?? error.message);
}

export async function loadOwners(clientId: string): Promise<CampaignOwner[]> {
  const { data, error } = await createAdminClient().from("pm_campaign_owners").select("*").eq("client_id", clientId).order("created_at");
  if (error) throw new Error(migrationHint(error) ?? error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name ?? "",
    matchText: r.match_text ?? "",
    media: r.media,
    side: (["nmg", "client", "partner"].includes(r.side) ? r.side : "nmg") as MemberSide,
    collect: r.collect !== false,
  }));
}

const isAddr = (x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);

export function normalizeMembers(members: CampaignOwner[]) {
  return members
    .map((o) => {
      let email = String(o.ownerEmail ?? "").trim().toLowerCase();
      if (email && !email.includes("@")) email = `@${email}`; // 'lemouton.co.kr' → 회사 전체
      return {
        owner_email: email,
        owner_name: String(o.ownerName ?? "").trim() || null,
        side: (["nmg", "client", "partner"].includes(o.side) ? o.side : email.endsWith("@nmg.co.kr") ? "nmg" : "client") as MemberSide,
        match_text: String(o.matchText ?? "").trim(),
        media: o.media && ["meta", "naver", "gfa", "kakao"].includes(o.media) ? o.media : null,
        collect: o.collect !== false,
      };
    })
    .filter((r) => isAddr(r.owner_email) || /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(r.owner_email))
    .slice(0, 100);
}

// 메일 수집의 '특정인' = collect인 멤버(주소 → mailAddresses, '@도메인' → mailDomains)
export function peopleFromMembers(members: ReturnType<typeof normalizeMembers>) {
  const c = members.filter((m) => m.collect);
  return {
    mailAddresses: [...new Set(c.filter((m) => !m.owner_email.startsWith("@")).map((m) => m.owner_email))],
    mailDomains: [...new Set(c.filter((m) => m.owner_email.startsWith("@")).map((m) => m.owner_email.slice(1)))],
  };
}

// 멤버 표는 통째로 바꾼다(화면에서 편집한 목록 = 정답)
export async function saveOwners(clientId: string, members: CampaignOwner[]) {
  // 캠페인 담당 지정용 — 0022 칸만 쓴다(이메일·이름·포함 문자·매체)
  const rows = normalizeMembers(members).map(({ owner_email, owner_name, match_text, media }) => ({ client_id: clientId, owner_email, owner_name, match_text, media }));
  const db = createAdminClient();
  const del = await db.from("pm_campaign_owners").delete().eq("client_id", clientId);
  if (del.error) throw new Error(migrationHint(del.error) ?? del.error.message);
  if (rows.length) {
    const ins = await db.from("pm_campaign_owners").insert(rows);
    if (ins.error) throw new Error(migrationHint(ins.error) ?? ins.error.message);
  }
}

// 캠페인 이름 → 담당 멤버(가장 긴 포함 문자 우선, 매체 지정이 있으면 매체도 맞아야 함, 없으면 '*'). 포함 문자가 빈 멤버는 담당 아님
export function ownerFor(owners: CampaignOwner[], media: string, campaignName: string): CampaignOwner | null {
  const name = campaignName.toLowerCase();
  const assigned = owners.filter((o) => o.matchText && (!o.media || o.media === media));
  const hits = assigned
    .filter((o) => o.matchText !== "*" && name.includes(o.matchText.toLowerCase()))
    .sort((a, b) => b.matchText.length - a.matchText.length || (b.media ? 1 : 0) - (a.media ? 1 : 0));
  return hits[0] ?? assigned.find((o) => o.matchText === "*") ?? null;
}

// 수집 조건의 사람(광고주·NMG 주소, @도메인) → 멤버 목록. 캠페인 담당 지정은 화면에서 없앴으므로(2026-10-02) 담당은 메일 맥락으로 AI가 판단
export function peopleAsMembers(s: PmSettings): CampaignOwner[] {
  const nmg = (e: string) => e.endsWith("@nmg.co.kr");
  return [
    ...s.mailAddresses.map((e) => ({ ownerEmail: e, ownerName: "", matchText: "", media: null, side: (nmg(e) ? "nmg" : "client") as MemberSide, collect: true })),
    ...s.mailDomains.map((d) => ({ ownerEmail: `@${d}`, ownerName: "", matchText: "", media: null, side: "client" as MemberSide, collect: true })),
  ];
}

// 멤버 목록 → 대화·메일 정리 프롬프트용 텍스트
export function membersText(owners: CampaignOwner[]): string {
  const side: Record<string, string> = { nmg: "NMG", client: "광고주", partner: "파트너" };
  return owners
    .map((o) => {
      const role = !o.matchText ? "" : o.matchText === "*" ? "나머지 캠페인 전부 담당" : `캠페인 이름에 '${o.matchText}' 포함 시 담당`;
      return `- [${side[o.side] ?? o.side}] ${o.ownerName ? `${o.ownerName} ` : ""}<${o.ownerEmail}>${role ? ` · ${role}` : ""}${o.media ? ` (${o.media})` : ""}`;
    })
    .join("\n");
}

// 연결된 메일함 + 이 광고주 공유 허락 상태(허락한 규칙 지문이 지금 규칙과 같아야 shared)
export async function listMailboxes(viewerId: string, clientId?: string, rules?: PmSettings): Promise<MailboxInfo[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("pm_mail_accounts").select("member_id, email, name, linked_at, last_synced_at, last_error").order("linked_at");
  if (error) throw new Error(migrationHint(error) ?? error.message);
  const shares = new Map<string, string>();
  if (clientId) {
    const { data: sh, error: shErr } = await db.from("pm_mail_shares").select("member_id, rules_hash").eq("client_id", clientId);
    if (shErr) throw new Error(migrationHint(shErr) ?? shErr.message);
    for (const r of sh ?? []) shares.set(r.member_id as string, r.rules_hash as string);
  }
  const fp = rules ? rulesFingerprint(rules) : null;
  return (data ?? []).map((r) => {
    const h = shares.get(r.member_id as string);
    return {
      email: r.email,
      name: r.name,
      linkedAt: r.linked_at,
      lastSyncedAt: r.last_synced_at,
      lastError: r.last_error,
      mine: r.member_id === viewerId,
      shared: !!h && h === fp,
      shareStale: !!h && h !== fp,
    };
  });
}

// 내 메일함을 이 광고주에 공유(허락 시점 규칙 지문 저장) / 해제
export async function hasMailShare(memberId: string, clientId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("pm_mail_shares").select("member_id").eq("member_id", memberId).eq("client_id", clientId).maybeSingle();
  return !!data;
}

export async function setMailShare(memberId: string, clientId: string, on: boolean, rules: PmSettings) {
  const db = createAdminClient();
  const res = on
    ? await db.from("pm_mail_shares").upsert({ member_id: memberId, client_id: clientId, rules_hash: rulesFingerprint(rules), shared_at: new Date().toISOString() }, { onConflict: "member_id,client_id" })
    : await db.from("pm_mail_shares").delete().eq("member_id", memberId).eq("client_id", clientId);
  if (res.error) throw new Error(migrationHint(res.error) ?? res.error.message);
}

// 이 광고주에서 내 메일함으로 들어온 메일 지우기 — 내 메일함에서만 온 메일은 삭제, 다른 메일함에도 있으면 내 메일함 표시만 뺀다
export async function removeMyMails(clientId: string, mailbox: string): Promise<{ deleted: number; detached: number }> {
  const db = createAdminClient();
  const box = mailbox.toLowerCase();
  const { data, error } = await db.from("pm_emails").select("id, mailboxes").eq("client_id", clientId).contains("mailboxes", [box]).limit(5000);
  if (error) throw new Error(error.message);
  const only = (data ?? []).filter((r) => ((r.mailboxes as string[]) ?? []).every((m) => m === box)).map((r) => r.id as string);
  const shared = (data ?? []).filter((r) => !only.includes(r.id as string));
  for (let i = 0; i < only.length; i += 200) {
    const { error: e } = await db.from("pm_emails").delete().in("id", only.slice(i, i + 200));
    if (e) throw new Error(e.message);
  }
  for (const r of shared) await db.from("pm_emails").update({ mailboxes: ((r.mailboxes as string[]) ?? []).filter((m) => m !== box) }).eq("id", r.id);
  return { deleted: only.length, detached: shared.length };
}

export async function mailStats(clientId: string): Promise<MailStats> {
  const db = createAdminClient();
  const { count } = await db.from("pm_emails").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  const { data: last } = await db.from("pm_emails").select("sent_at").eq("client_id", clientId).order("sent_at", { ascending: false }).limit(1);
  const { data: boxes } = await db.from("pm_emails").select("mailboxes, created_at").eq("client_id", clientId).limit(5000);
  const by = new Map<string, { count: number; lastImportedAt: string | null }>();
  for (const r of boxes ?? [])
    for (const m of (r.mailboxes as string[]) ?? []) {
      const v = by.get(m) ?? { count: 0, lastImportedAt: null };
      v.count++;
      if (!v.lastImportedAt || r.created_at > v.lastImportedAt) v.lastImportedAt = r.created_at;
      by.set(m, v);
    }
  return { count: count ?? 0, lastAt: last?.[0]?.sent_at ?? null, byMailbox: [...by].map(([email, v]) => ({ email, ...v })).sort((a, b) => b.count - a.count) };
}

export async function loadMemory(clientId: string): Promise<{ memory: PmMemory; meta: MemoryMeta } | null> {
  const { data, error } = await createAdminClient().from("pm_memory").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(migrationHint(error) ?? error.message);
  if (!data) return null;
  return { memory: data.memory as PmMemory, meta: { builtAt: data.built_at, emailCount: data.email_count, lastEmailAt: data.last_email_at, builtBy: data.built_by } };
}
