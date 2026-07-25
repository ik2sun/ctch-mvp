"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { buildPresentationHtml } from "@/features/proposal/buildPresentationHtml";
import type { BrandColors, Slide, ThemeId } from "@/features/proposal/types";

type SharedProposal = {
  clientName: string;
  theme: ThemeId;
  brandColors: BrandColors;
  slides: Slide[];
};

export default function ProposalSharePage() {
  const params = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<SharedProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/proposal/share/${params.token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "공유 링크를 열 수 없어요.");
        setProposal(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했어요."));
  }, [params.token]);

  const html = useMemo(
    () => (proposal ? buildPresentationHtml(proposal.slides, proposal.theme, proposal.brandColors) : ""),
    [proposal],
  );

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-[14px] text-ink-soft">
        {error}
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-[14px] text-ink-faint">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      <iframe srcDoc={html} className="h-full w-full" title={`${proposal.clientName} 제안서`} />
    </div>
  );
}
