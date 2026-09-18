"use client";

import { useState } from "react";
import { ImagePanel } from "@/features/creative/ImagePanel";
import { ShortFormPanel } from "@/features/creative/ShortFormPanel";
import { SegmentedControl } from "@/features/creative/SegmentedControl";

type Tab = "image" | "shortform";
const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: "shortform", label: "숏폼 제작", icon: "movie", hint: "AI 스크립트 · Veo API · 사진 렌더" },
  { id: "image", label: "이미지 생성", icon: "photo", hint: "Higgsfield · Gemini · GPT Image · 업로드" },
];

export default function CreativePage() {
  const [tab, setTab] = useState<Tab>("shortform");

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl value={tab} onChange={setTab} options={TABS} />
          <p className="text-xs text-gray-500">AI 마케팅 에이전트 · 소재 생성</p>
        </div>
        {tab === "shortform" ? <ShortFormPanel /> : <ImagePanel />}
      </div>
    </div>
  );
}
