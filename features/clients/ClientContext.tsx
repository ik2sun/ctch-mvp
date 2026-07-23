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

  // 선택된 광고주가 목록에서 사라지면(삭제 등) 선택 해제
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
