"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClients } from "@/features/clients/ClientContext";
import { fmtBudget } from "@/features/clients/clientData";

export default function HomePage() {
  const { clients, selectClient } = useClients();
  const router = useRouter();

  function pick(id: string) {
    selectClient(id);
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="font-display text-[23px] font-semibold text-ink">광고주 목록</h2>
        <p className="mt-1 text-[13px] text-ink-muted">광고주를 선택하면 해당 광고주의 대시보드로 이동해요.</p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface py-12 text-center">
          <p className="text-[14px] text-ink-muted">등록된 광고주가 없어요.</p>
          <Link href="/clients" className="mt-2 inline-block text-[13px] text-signal hover:underline">
            광고주 등록하러 가기 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className="rounded-card border border-line bg-surface p-4 text-left transition hover:border-signal hover:shadow-sm"
            >
              <div className="text-[15px] font-semibold text-ink">{c.name}</div>
              <div className="mt-2 space-y-1 text-[13px] text-ink-soft">
                <div>업종 · {c.industry ?? "정보 없음"}</div>
                <div>월예산 · {fmtBudget(c.monthly_budget)}</div>
                <div>담당자 · {c.manager ?? "정보 없음"}</div>
              </div>
              {c.memo && (
                <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{c.memo}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
