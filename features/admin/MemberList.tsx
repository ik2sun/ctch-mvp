"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Status } from "@/lib/supabase/profile";

// 회원 관리 — 구글 @nmg.co.kr 로그인 기준(2026-10-04 개편). 승인·역할 선택 없음:
// 회사 계정은 로그인하면 자동으로 보기 권한, 소유자만 관리자. 할 수 있는 건 차단/차단 해제뿐.
export type Member = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  status: Status;
  isOwner: boolean;
  company: boolean; // @nmg.co.kr — 아니면 예전 비밀번호 가입 계정(지금은 로그인 불가)
  firstAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
};

const ONLINE_MS = 10 * 60 * 1000; // 최근 활동은 5분 간격 기록 → 10분 안이면 '접속 중'
const DAY_MS = 24 * 60 * 60 * 1000;

function activityOf(m: Member): string | null {
  const a = m.lastSeenAt ? Date.parse(m.lastSeenAt) : 0;
  const b = m.lastSignInAt ? Date.parse(m.lastSignInAt) : 0;
  const t = Math.max(a, b);
  return t ? new Date(t).toISOString() : null;
}

function fullTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function relTime(iso: string | null, now: number | null): string {
  if (!iso) return "기록 없음";
  if (now === null) return new Date(iso).toLocaleDateString("ko-KR");
  const diff = now - Date.parse(iso);
  if (diff < ONLINE_MS) return "지금 접속 중";
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}분 전`;
  if (diff < DAY_MS) return `${Math.round(diff / 3600000)}시간 전`;
  if (diff < 2 * DAY_MS) return "어제";
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function Avatar({ m }: { m: Member }) {
  const [broken, setBroken] = useState(false);
  const label = (m.name || m.email || "?").trim().slice(0, 1).toUpperCase();
  if (m.avatar && !broken) {
    // 구글 프로필 사진(lh3.googleusercontent.com) — next/image 도메인 설정 없이 그대로
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />;
  }
  return <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-signal-soft text-[13px] font-semibold text-signal">{label}</span>;
}

export function MemberList({ members, currentUserId, seenReady }: { members: Member[]; currentUserId: string; seenReady: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null); // 상대 시간은 브라우저에서만(서버·클라이언트 시각 차로 화면이 어긋나지 않게)
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const company = useMemo(
    () => members.filter((m) => m.company).sort((a, b) => (activityOf(b) ?? "").localeCompare(activityOf(a) ?? "")),
    [members],
  );
  const legacy = useMemo(() => members.filter((m) => !m.company), [members]);

  const within = (m: Member, ms: number) => {
    const a = activityOf(m);
    return !!a && now !== null && now - Date.parse(a) < ms;
  };
  const active = company.filter((m) => m.status !== "rejected");
  const stats = [
    { label: "로그인한 회사 계정", value: active.length, icon: "users" },
    { label: "지금 접속 중", value: now === null ? "—" : active.filter((m) => within(m, ONLINE_MS)).length, icon: "point-filled" },
    { label: "최근 7일 접속", value: now === null ? "—" : active.filter((m) => within(m, 7 * DAY_MS)).length, icon: "calendar-week" },
    { label: "차단", value: company.filter((m) => m.status === "rejected").length, icon: "ban" },
  ];

  async function run(m: Member, action: "block" | "unblock") {
    if (action === "block" && !confirm(`${m.name || m.email} 계정을 차단할까요? 차단하면 CTCH에 들어올 수 없고 데이터도 볼 수 없어요.`)) return;
    setBusyId(m.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: m.id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "처리에 실패했어요.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[15px] text-bad">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface px-5 py-4">
            <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <i className={`ti ti-${s.icon} text-[15px]`} aria-hidden />
              {s.label}
            </p>
            <p className="mt-1.5 text-[26px] font-semibold tabular-nums text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas px-6 py-3.5">
          <p className="text-[15px] font-semibold text-ink">
            회사 계정 <span className="font-normal text-ink-muted">{company.length}명 · 최근 활동 순</span>
          </p>
          <p className="text-[13px] text-ink-muted">
            최근 활동 = CTCH 화면을 마지막으로 연 시각(5분 단위 기록){!seenReady && " — 0026 마이그레이션을 실행하면 표시돼요. 지금은 마지막 로그인 기준"}
          </p>
        </div>
        {company.length === 0 ? (
          <p className="py-10 text-center text-[15px] text-ink-muted">아직 로그인한 회사 계정이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[15px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ink-muted">
                  <th className="px-6 py-2.5 font-medium">사람</th>
                  <th className="px-3 py-2.5 font-medium">권한</th>
                  <th className="px-3 py-2.5 font-medium">최근 활동</th>
                  <th className="px-3 py-2.5 font-medium">마지막 로그인</th>
                  <th className="px-3 py-2.5 font-medium">처음 로그인</th>
                  <th className="px-6 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {company.map((m) => {
                  const blocked = m.status === "rejected";
                  const act = activityOf(m);
                  const online = !blocked && within(m, ONLINE_MS);
                  return (
                    <tr key={m.id} className={`border-b border-line last:border-0 ${blocked ? "bg-canvas/60" : ""}`}>
                      <td className="px-6 py-3">
                        <div className={`flex items-center gap-3 ${blocked ? "opacity-60" : ""}`}>
                          <Avatar m={m} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {m.name || m.email?.split("@")[0]}
                              {m.id === currentUserId && <span className="ml-1.5 text-[13px] font-normal text-ink-muted">(나)</span>}
                            </p>
                            <p className="truncate text-[13px] text-ink-muted">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {m.isOwner ? (
                          <span className="whitespace-nowrap rounded-full bg-signal-soft px-2.5 py-1 text-[13px] font-medium text-signal">관리자</span>
                        ) : blocked ? (
                          <span className="whitespace-nowrap rounded-full bg-bad/10 px-2.5 py-1 text-[13px] font-medium text-bad">차단됨</span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-canvas px-2.5 py-1 text-[13px] font-medium text-ink-soft">보기 전용</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3" title={fullTime(act)}>
                        <span className={`inline-flex items-center gap-1.5 ${online ? "font-medium text-good" : "text-ink"}`}>
                          {online && <span className="h-2 w-2 rounded-full bg-good" aria-hidden />}
                          {relTime(act, now)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-soft">{fullTime(m.lastSignInAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-soft">{new Date(m.firstAt).toLocaleDateString("ko-KR")}</td>
                      <td className="px-6 py-3 text-right">
                        {!m.isOwner && m.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => run(m, blocked ? "unblock" : "block")}
                            disabled={busyId === m.id}
                            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-50 ${
                              blocked ? "border-line text-ink-soft hover:border-signal hover:text-signal" : "border-line text-ink-muted hover:border-bad/40 hover:text-bad"
                            }`}
                          >
                            {busyId === m.id ? "처리 중…" : blocked ? "차단 해제" : "차단"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {legacy.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-6">
          <button type="button" onClick={() => setLegacyOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
            <span>
              <span className="text-[15px] font-semibold text-ink-soft">
                이전 가입 방식 계정 <span className="font-normal text-ink-muted">{legacy.length}명</span>
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                비밀번호 가입 시절 계정이에요. 지금은 회사 구글 계정으로만 로그인할 수 있어서 이 계정들은 접속할 수 없어요.
              </span>
            </span>
            <i className={`ti ti-chevron-down text-[16px] text-ink-muted transition-transform ${legacyOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {legacyOpen && (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {legacy.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[15px]">
                  <span className="truncate text-ink-muted">{m.email}</span>
                  <span className="text-[13px] tabular-nums text-ink-muted">
                    가입 {new Date(m.firstAt).toLocaleDateString("ko-KR")} · 마지막 로그인 {m.lastSignInAt ? new Date(m.lastSignInAt).toLocaleDateString("ko-KR") : "기록 없음"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
