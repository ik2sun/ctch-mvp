"use client";

// AI 리포트 > 소재 분석
import { useClients } from "@/features/clients/ClientContext";
import { CreativeAnalysisView } from "@/features/creative-analysis/CreativeAnalysisView";

export default function CreativeAnalysisPage() {
  const { selected } = useClients();
  return <CreativeAnalysisView selected={selected ? { id: selected.id, name: selected.name, meta_account_id: selected.meta_account_id ?? null } : null} />;
}
