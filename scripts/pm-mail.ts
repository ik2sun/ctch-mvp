// 캠페인 매니저 메일 가져오기 — Claude Code(Gmail MCP)가 읽은 메일을 CTCH DB(pm_emails)에 넣는 로컬 스크립트.
// 실행: npx --yes tsx scripts/pm-mail.ts <명령>   (.env.local의 SUPABASE_SERVICE_ROLE_KEY 사용, 로컬 전용)
//   clients [검색어]                              광고주 목록(id·이름)
//   rules <광고주명|id> [--mailbox 이메일]        메일 규칙 + Gmail 검색식(그 메일함의 마지막 수집일 - 2일부터, 처음이면 90일)
//   import <광고주명|id> <파일.json> --mailbox 이메일   가져오기(같은 메일은 1건으로 합치고 메일함만 추가)
// 절차는 .claude/skills/ctch-mail-import/SKILL.md. CTCH 화면의 'Gmail 연결 → 메일 동기화'와 같은 저장 로직(mailStore.saveMails)이라 두 방식을 섞어 써도 같은 메일은 1건
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildQuery, type BlockList, type ImportMail, type MailRules } from "../features/perf-manager/mailText";
import { saveMails, searchAfter } from "../features/perf-manager/mailStore";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 환경변수로 직접 줄 수도 있음 */
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(JSON.stringify({ error: ".env.local에 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 없어요." }));
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const fail = (msg: string): never => {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
};
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MIGRATION = "pm_ 테이블이 없어요. supabase/migrations/0022_campaign_manager.sql을 SQL Editor에서 먼저 실행하세요.";

async function findClient(q: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(q);
  const { data, error } = isId ? await db.from("clients").select("id, name").eq("id", q) : await db.from("clients").select("id, name").ilike("name", `%${q}%`);
  if (error) fail(error.message);
  if (!data?.length) fail(`광고주 '${q}'를 찾지 못했어요. clients 명령으로 이름을 확인하세요.`);
  const exact = data!.find((c) => c.name === q);
  if (!exact && data!.length > 1) fail(`'${q}'에 해당하는 광고주가 여러 곳이에요: ${data!.map((c) => c.name).join(", ")} — 정확한 이름이나 id로 다시 실행하세요.`);
  return exact ?? data![0];
}

async function loadRules(clientId: string): Promise<MailRules> {
  const { data, error } = await db.from("pm_client_settings").select("*").eq("client_id", clientId).maybeSingle();
  if (error) fail(/pm_|schema cache/.test(error.message) ? MIGRATION : error.message);
  return { mailDomains: data?.mail_domains ?? [], mailAddresses: data?.mail_addresses ?? [], mailKeywords: data?.mail_keywords ?? [], mailMatch: data?.mail_match === "all" ? "all" : "any" };
}

// 민감 메일 추가 차단 목록(관리자 추가분). 기본 차단 목록은 mailText에 있어 항상 적용
async function loadBlock(): Promise<BlockList> {
  const { data } = await db.from("pm_mail_block").select("kind, value");
  // 한 칸에 여러 개를 넣은 값도 나눠 쓴다(store.splitBlockValue와 같은 규칙)
  const split = (kind: string, re: RegExp) => (data ?? []).filter((r) => r.kind === kind).flatMap((r) => String(r.value).split(re).map((x) => x.trim().toLowerCase().replace(/^@/, "")).filter((x) => x.length >= 2));
  return { keywords: split("keyword", /[,;\n]+/), senders: split("sender", /[,;\s]+/) };
}

async function main() {
  const [cmd, a1, a2] = process.argv.slice(2);

  if (cmd === "clients") {
    let q = db.from("clients").select("id, name, industry").order("name");
    if (a1) q = q.ilike("name", `%${a1}%`);
    const { data, error } = await q;
    if (error) fail(error.message);
    return out(data);
  }

  if (cmd === "rules") {
    if (!a1) fail("rules <광고주명|id> [--mailbox 이메일]");
    const c = await findClient(a1);
    const rules = await loadRules(c.id);
    const mailbox = flag("mailbox");
    const { after, last } = mailbox ? await searchAfter(db, c.id, mailbox) : { after: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), last: null };
    const query = buildQuery(rules, after, await loadBlock());
    return out({
      clientId: c.id,
      clientName: c.name,
      rules,
      mailbox: mailbox ?? null,
      lastCollectedAt: last,
      after,
      gmailQuery: query,
      note: query ? "이 검색식으로 Gmail MCP를 검색하세요(받은편지함·보낸편지함, 민감 단어·발신자 제외 포함)." : "수집 조건이 비었거나 잘못됐어요 — CTCH 캠페인 매니저 화면에서 특정인·키워드를 먼저 저장하세요.",
    });
  }

  if (cmd === "import") {
    const mailbox = flag("mailbox")?.toLowerCase() ?? "";
    if (!a1 || !a2 || !mailbox) fail("import <광고주명|id> <파일.json> --mailbox 이메일");
    const c = await findClient(a1);
    const rules = await loadRules(c.id);
    let items: ImportMail[];
    try {
      const parsed = JSON.parse(readFileSync(a2, "utf8"));
      items = Array.isArray(parsed) ? parsed : parsed.emails;
      if (!Array.isArray(items)) throw new Error();
    } catch {
      return fail(`${a2}: JSON 배열(또는 {emails: [...]})이 아니에요.`);
    }

    try {
      const r = await saveMails(db, c.id, mailbox, rules, items, await loadBlock());
      return out({ clientName: c.name, mailbox, ...r });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return fail(/pm_|schema cache/.test(m) ? MIGRATION : m);
    }
  }

  fail("명령: clients [검색어] | rules <광고주> [--mailbox 이메일] | import <광고주> <파일.json> --mailbox 이메일");
}

main();
