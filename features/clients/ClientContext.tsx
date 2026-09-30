"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { listClients, type Client } from "./clientData";

type ClientContextType = {
  clients: Client[];
  selected: Client | null;
  selectClient: (id: string | null) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const ClientContext = createContext<ClientContextType | null>(null);

const STORAGE_KEY = "ctch_selected_client";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await listClients();
    setClients(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // 마지막 선택 광고주 복원
    if (typeof window !== "undefined") {
      setSelectedId(localStorage.getItem(STORAGE_KEY));
    }
  }, [refresh]);

  const selectClient = useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // "선택 안 함" 상태는 두지 않는다 — 저장된 광고주가 없거나 삭제됐으면 첫 번째 광고주로 자동 선택
  useEffect(() => {
    if (loading || clients.length === 0) return;
    if (!clients.some((c) => c.id === selectedId)) selectClient(clients[0].id);
  }, [clients, selectedId, loading, selectClient]);

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  return (
    <ClientContext.Provider
      value={{ clients, selected, selectClient, refresh, loading }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClients() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClients must be used within ClientProvider");
  return ctx;
}
