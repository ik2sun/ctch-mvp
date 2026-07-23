"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type Role, type Status } from "@/lib/supabase/profile";

export type Member = {
  id: string;
  email: string | null;
  status: Status;
  role: Role;
  created_at: string;
};

async function patchMember(body: { userId: string; action: "approve" | "reject" | "setRole"; role?: Role }) {
  const res = await fetch("/api/admin/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "처리에 실패했어요.");
}

function PendingRow({ member, busy, onApprove, onReject }: {
  member: Member;
  busy: boolean;
  onApprove: (id: string, role: Role) => void;
  onReject: (id: string) => void;
}) {
  const [role, setRole] = useState<Role>("viewer");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{member.email}</p>
        <p className="text-[11px] text-ink-muted">{new Date(member.created_at).toLocaleDateString("ko-KR")} 가입 신청</p>
      </div>
      <div className="flex items-center gap-1.5">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={busy}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none focus:border-signal"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onApprove(member.id, role)}
          disabled={busy}
          className="rounded-lg bg-good/10 px-2.5 py-1.5 text-[12px] font-medium text-good transition hover:bg-good/15 disabled:opacity-50"
        >
          승인
        </button>
        <button
          onClick={() => onReject(member.id)}
          disabled={busy}
          className="rounded-lg bg-bad/10 px-2.5 py-1.5 text-[12px] font-medium text-bad transition hover:bg-bad/15 disabled:opacity-50"
        >
          거절
        </button>
      </div>
    </div>
  );
}

function ApprovedRow({ member, busy, isSelf, onSetRole }: {
  member: Member;
  busy: boolean;
  isSelf: boolean;
  onSetRole: (id: string, role: Role) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">
          {member.email} {isSelf && <span className="text-ink-faint">(나)</span>}
        </p>
        <p className="text-[11px] text-ink-muted">{new Date(member.created_at).toLocaleDateString("ko-KR")} 가입</p>
      </div>
      {member.role === "superadmin" ? (
        <span className="rounded-full bg-signal-soft px-2 py-1 text-[11px] font-medium text-signal">
          {ROLE_LABEL.superadmin}
        </span>
      ) : (
        <select
          value={member.role}
          onChange={(e) => onSetRole(member.id, e.target.value as Role)}
          disabled={busy}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none focus:border-signal"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function MemberList({
  pending,
  approved,
  rejected,
  currentUserId,
}: {
  pending: Member[];
  approved: Member[];
  rejected: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);

  async function run(userId: string, body: { action: "approve" | "reject" | "setRole"; role?: Role }) {
    setBusyId(userId);
    setError(null);
    try {
      await patchMember({ userId, ...body });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{error}</p>
      )}

      {/* 승인 대기 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="mb-3 text-[13px] font-medium text-ink-soft">
          승인 대기 <span className="font-normal text-ink-muted">{pending.length}명</span>
        </p>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-muted">대기 중인 가입 요청이 없어요.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((m) => (
              <PendingRow
                key={m.id}
                member={m}
                busy={busyId === m.id}
                onApprove={(id, role) => run(id, { action: "approve", role })}
                onReject={(id) => run(id, { action: "reject" })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 승인된 회원 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="mb-3 text-[13px] font-medium text-ink-soft">
          승인된 회원 <span className="font-normal text-ink-muted">{approved.length}명</span>
        </p>
        {approved.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-muted">승인된 회원이 없어요.</p>
        ) : (
          <div className="space-y-2">
            {approved.map((m) => (
              <ApprovedRow
                key={m.id}
                member={m}
                busy={busyId === m.id}
                isSelf={m.id === currentUserId}
                onSetRole={(id, role) => run(id, { action: "setRole", role })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 거절된 회원 */}
      {rejected.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-5">
          <button
            onClick={() => setRejectedOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[13px] font-medium text-ink-soft"
          >
            거절된 회원 <span className="font-normal text-ink-muted">{rejected.length}명</span>
            <i className={`ti ti-chevron-down text-[14px] transition-transform ${rejectedOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {rejectedOpen && (
            <div className="mt-3 space-y-2">
              {rejected.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5">
                  <p className="truncate text-[13px] text-ink-muted">{m.email}</p>
                  <button
                    onClick={() => run(m.id, { action: "approve", role: "viewer" })}
                    disabled={busyId === m.id}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft transition hover:border-signal hover:text-signal disabled:opacity-50"
                  >
                    다시 승인
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
