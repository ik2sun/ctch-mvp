// 프로젝트(광고주) 메일 수집 공용 로직 — 순수 함수(상대 경로 import만: scripts/pm-mail.ts가 tsx로 그대로 불러 쓴다).
// 수집 규칙: 연동에 동의한 담당자의 전체 메일함(스팸·휴지통·임시보관 제외)에서 '특정인'(주소 또는 도메인)·'키워드' 조건에 맞는 메일 — 내부 메일 포함.
//   조건: any = 특정인 또는 키워드 하나라도 / all = 특정인 AND 키워드(교집합)
// 민감 메일 차단(원칙): 급여·인사·경영지원 등은 기본 차단 목록(코드, 끌 수 없음) + 관리자 추가 목록(pm_mail_block)으로
//   ① 수집 조건에 못 쓰게 ② Gmail 검색에서 제외 ③ 저장 직전 한 번 더 거른다.

export type MatchMode = "any" | "all";
export type MailRules = { mailDomains: string[]; mailAddresses: string[]; mailKeywords: string[]; mailMatch?: MatchMode };
export type BlockList = { keywords: string[]; senders: string[] }; // senders: 주소 또는 도메인

// 가져오기 파일 한 건(Claude가 MCP 결과를 이 모양으로 정리) — CTCH Gmail 동기화도 같은 모양
export type ImportMail = {
  messageId?: string; // RFC Message-ID 헤더(있으면 메일함끼리 중복 판정에 가장 정확)
  threadId?: string;
  from: string; // "이름 <addr>" 또는 addr
  to?: string[] | string;
  cc?: string[] | string;
  subject?: string;
  date: string; // ISO 또는 메일 Date 헤더
  body?: string;
  snippet?: string;
};

export const NMG_DOMAIN = "nmg.co.kr";
export const BODY_LIMIT = 6000;

// ── 민감 메일 기본 차단(원칙 — 끌 수 없음) ─────────────────────────
// 제목·본문·보낸 사람 이름에 들어 있으면 수집하지 않는 단어
export const SENSITIVE_KEYWORDS = [
  "급여", "급여명세", "임금", "연봉", "상여", "성과급", "원천징수", "연말정산", "4대보험", "국민연금", "건강보험료",
  "퇴직금", "퇴직연금", "퇴사", "인사평가", "인사고과", "인사발령", "승진", "징계", "근로계약", "연봉계약",
  "주민등록번호", "주민번호", "건강검진", "payroll", "salary", "payslip",
];
// 보낸 사람·받는 사람 이름이나 주소에 이 말이 있으면(부서 메일) 수집하지 않음
export const SENSITIVE_SENDER_WORDS = ["경영지원", "인사팀", "인사부", "인사총무", "총무", "재무", "회계", "급여", "노무", "hr@", "payroll", "accounting", "finance@"];

// 특정인에 '도메인 전체'로 넣을 수 없는 회사·공용 도메인 — 넣으면 사내 전체·개인 메일이 다 걸린다(개별 주소는 가능)
export const BROAD_DOMAINS = [
  NMG_DOMAIN,
  "gmail.com", "googlemail.com", "google.com", "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.kr", "icloud.com", "me.com", "korea.com",
];
const isBroadDomain = (d: string) => BROAD_DOMAINS.some((b) => d === b || d.endsWith(`.${b}`));

const low = (s: string) => s.toLowerCase();
export const mergeBlock = (extra?: BlockList | null): BlockList => ({
  keywords: [...new Set([...SENSITIVE_KEYWORDS, ...(extra?.keywords ?? [])].map(low))],
  senders: [...new Set((extra?.senders ?? []).map(low))],
});

// 저장 전 규칙 검사 — 막힌 항목 목록(빈 배열이면 통과)
export function ruleProblems(s: MailRules, block?: BlockList | null): string[] {
  const b = mergeBlock(block);
  const out: string[] = [];
  for (const d of s.mailDomains) {
    if (isBroadDomain(d)) out.push(`'@${d}' 전체는 넣을 수 없어요(회사·공용 메일 도메인). 사람별 주소로 넣어 주세요.`);
    else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) out.push(`도메인 '${d}' 형식이 아니에요.`);
  }
  for (const k of s.mailKeywords) {
    if (k.replace(/\s/g, "").length < 2) out.push(`키워드 '${k}'가 너무 짧아요(2자 이상).`);
    if (b.keywords.some((x) => low(k).includes(x))) out.push(`키워드 '${k}'는 민감 정보 차단 대상이라 쓸 수 없어요.`);
  }
  for (const a of s.mailAddresses) if (isSensitiveAddr(a, "", b)) out.push(`'${a}'는 민감 메일 차단 대상(경영지원·인사·재무 등)이라 넣을 수 없어요.`);
  const people = s.mailDomains.length + s.mailAddresses.length;
  if (!people && !s.mailKeywords.length) out.push("특정인이나 키워드를 하나 이상 넣어 주세요.");
  if ((s.mailMatch ?? "any") === "all" && (!people || !s.mailKeywords.length)) out.push("'둘 다 맞을 때' 조건은 특정인과 키워드를 모두 넣어야 해요.");
  return out;
}

function isSensitiveAddr(addr: string, name: string, b: BlockList): boolean {
  const a = low(addr);
  const n = low(name);
  if (b.senders.some((x) => (x.includes("@") ? a === x : a.endsWith(`@${x}`) || a.endsWith(`.${x}`)))) return true;
  return SENSITIVE_SENDER_WORDS.some((w) => a.includes(w) || (n && n.includes(w)));
}

// 민감 메일 판정 — 보낸 사람·받는 사람(이름·주소)과 제목·본문
export function isSensitiveMail(m: { from: string; fromName?: string | null; to: string[]; cc: string[]; subject: string; body: string }, block?: BlockList | null): boolean {
  const b = mergeBlock(block);
  if (isSensitiveAddr(m.from, m.fromName ?? "", b)) return true;
  if ([...m.to, ...m.cc].some((x) => isSensitiveAddr(x, "", b))) return true;
  const text = low(`${m.subject}\n${m.body}`);
  return b.keywords.some((k) => text.includes(k));
}

// 규칙 지문 — 메일함 주인이 가져오기를 허용한 규칙과 지금 규칙이 같은지 비교(바뀌면 허용이 풀림)
export function rulesFingerprint(s: MailRules): string {
  const norm = (a: string[]) => [...new Set(a.map((x) => x.trim().toLowerCase()))].sort();
  return JSON.stringify({ d: norm(s.mailDomains), a: norm(s.mailAddresses), k: norm(s.mailKeywords), m: s.mailMatch ?? "any" });
}

const quote = (s: string) => (/[\s"(){}]/.test(s) ? `"${s.replace(/"/g, "")}"` : s);

// Gmail 검색식 — 전체 메일함. {…} = OR, 묶음 사이 공백 = AND. 민감 단어·발신자는 검색에서 제외(-)
export function buildQuery(s: MailRules, afterDate: string, block?: BlockList | null): string | null {
  if (ruleProblems(s, block).length) return null;
  const people: string[] = [];
  for (const d of s.mailDomains) people.push(`from:${d}`, `to:${d}`, `cc:${d}`);
  for (const a of s.mailAddresses) people.push(`from:${a}`, `to:${a}`, `cc:${a}`);
  const kws = s.mailKeywords.map(quote);
  const cond =
    (s.mailMatch ?? "any") === "all"
      ? `{${people.join(" ")}} {${kws.join(" ")}}`
      : `{${[...people, ...kws].join(" ")}}`;
  const b = mergeBlock(block);
  // 공백·쉼표가 섞인 값은 검색식을 깨므로 빼고(저장·불러올 때 이미 나눔), 주소 형태만 -from:으로
  const exclude = [...b.keywords.map((k) => `-${quote(k)}`), ...b.senders.filter((x) => /^[^\s,;]+$/.test(x)).map((x) => `-from:${x}`)].join(" ");
  return `${cond} after:${afterDate.replace(/-/g, "/")} ${exclude} -in:chats -in:spam -in:trash -in:drafts`;
}

// 저장 직전 재확인(방어) — 조건에 맞는지(any/all). 검색식이 맞아도 MCP 가져오기 파일처럼 사람이 만든 입력이 섞일 수 있어 다시 본다
export function matchesRules(from: string, to: string[], cc: string[], subject: string, body: string, s: MailRules): boolean {
  const hitPerson = (addr: string) => s.mailDomains.some((d) => addr.endsWith(`@${d}`) || addr.endsWith(`.${d}`)) || s.mailAddresses.includes(addr);
  const person = [from, ...to, ...cc].some(hitPerson);
  const text = low(`${subject}\n${body}`);
  const kw = s.mailKeywords.some((k) => text.includes(low(k)));
  const hasPeople = s.mailDomains.length + s.mailAddresses.length > 0;
  const hasKw = s.mailKeywords.length > 0;
  if ((s.mailMatch ?? "any") === "all") return hasPeople && hasKw && person && kw;
  return (hasPeople && person) || (hasKw && kw);
}

// 답장 인용부(이전 메일 전문)를 잘라 같은 내용이 스레드마다 반복 저장되지 않게 한다
const QUOTE_MARKERS = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*원본 메시지\s*-{2,}/im,
  /^On .{5,200}wrote:\s*$/im,
  /^20\d\d[.\-/년].{0,80}(작성|wrote).{0,10}:\s*$/im,
  /^(From|보낸 사람)\s*:.+\n(Sent|Date|보낸 날짜)\s*:/im,
  /^>.*(\n>.*){2,}/m,
];

export function stripQuoted(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    if (m && m.index > 0 && m.index < cut) cut = m.index;
  }
  // 본문 없이 인용만 있는 메일(전달 등)은 잘라 내면 비므로 원문을 둔다
  const head = text.slice(0, cut).trim();
  return (head || text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function addrList(v: string[] | string | undefined): string[] {
  const s = Array.isArray(v) ? v.join(", ") : v ?? "";
  return [...new Set([...s.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)].map((m) => m[0].toLowerCase()))];
}

export function parseFrom(v: string): { addr: string; name: string | null } {
  const addr = addrList(v)[0] ?? "";
  const name = v.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || null;
  return { addr, name: name && name.toLowerCase() !== addr ? name : null };
}

export function direction(from: string, to: string[], cc: string[], s: MailRules): "inbound" | "outbound" | "internal" {
  const isClient = (addr: string) => s.mailDomains.some((d) => addr.endsWith(`@${d}`) || addr.endsWith(`.${d}`)) || s.mailAddresses.includes(addr);
  if (isClient(from)) return "inbound";
  if (from.endsWith(`@${NMG_DOMAIN}`) && [...to, ...cc].some(isClient)) return "outbound";
  return "internal";
}

// 메일함끼리 같은 메일 판정 키 — Message-ID가 없으면 보낸 사람·보낸 시각(분)·제목으로 만든다
export function dedupKey(m: { messageId?: string; fromAddr: string; sentAt: string | null; subject: string }): string {
  const mid = m.messageId?.trim();
  if (mid) return mid.startsWith("<") ? mid : `<${mid}>`;
  const minute = m.sentAt ? m.sentAt.slice(0, 16) : "";
  const subj = m.subject.replace(/^\s*((re|fw|fwd|답장|전달)\s*:\s*)+/i, "").trim().toLowerCase();
  return `k:${m.fromAddr}|${minute}|${subj}`;
}
