"use client";

import { useState } from "react";
import { SingleBuilder } from "@/features/utm-builder/SingleBuilder";
import { BulkBuilder } from "@/features/utm-builder/BulkBuilder";

export default function UtmBuilderPage() {
  const [tab, setTab] = useState<"single" | "bulk">("single");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* 탭 */}
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          onClick={() => setTab("single")}
          className={`flex-1 rounded-md py-2 text-[14px] font-medium transition ${
            tab === "single" ? "bg-signal-soft text-signal" : "text-ink-muted hover:text-ink-soft"
          }`}
        >
          단일 생성
        </button>
        <button
          onClick={() => setTab("bulk")}
          className={`flex-1 rounded-md py-2 text-[14px] font-medium transition ${
            tab === "bulk" ? "bg-signal-soft text-signal" : "text-ink-muted hover:text-ink-soft"
          }`}
        >
          벌크 생성
        </button>
      </div>

      {tab === "single" ? <SingleBuilder /> : <BulkBuilder />}
    </div>
  );
}
