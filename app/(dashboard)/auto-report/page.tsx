"use client";

// AI 리포트 > 자동 리포트
import { useClients } from "@/features/clients/ClientContext";
import { AutoReportView } from "@/features/auto-report/AutoReportView";

export default function AutoReportPage() {
  const { selected } = useClients();
  return <AutoReportView client={selected ? { id: selected.id, name: selected.name } : null} />;
}
