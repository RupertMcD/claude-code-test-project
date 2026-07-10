import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "./config";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface Account {
  source: "connected" | "manual";
  id: string;
  name: string | null;
  type: string | null;
  isLiability: boolean;
  balance: number | null;
  currency: string | null;
}
export interface CurrencyTotals {
  assets: number;
  liabilities: number;
  net: number;
}
export interface NetWorth {
  currencies: Record<string, CurrencyTotals>;
  accounts: Account[];
}
export interface Snapshot {
  day: string;
  assets: number;
  liabilities: number;
  net: number;
}
export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
}
export interface ManualAccount {
  id: string;
  name: string;
  kind: string;
  provider: string | null;
  balance: number;
  currency: string;
  asOf: string;
}
export interface ManualInput {
  name: string;
  kind: "ASSET" | "LIABILITY";
  provider?: string;
  balance: number;
  currency?: string;
}

export function useNetWorth() {
  return useQuery({ queryKey: ["net-worth"], queryFn: () => api<NetWorth>("/net-worth") });
}

export function useHistory(currency = "GBP") {
  return useQuery({
    queryKey: ["history", currency],
    queryFn: () => api<Snapshot[]>(`/net-worth/history?currency=${currency}`),
  });
}

export function useAspsps(country = "GB") {
  return useQuery({
    queryKey: ["aspsps", country],
    queryFn: () => api<{ aspsps: Aspsp[] }>(`/aspsps?country=${country}`),
  });
}

export function useCreateManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualInput) =>
      api<ManualAccount>("/manual-accounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net-worth"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

export function useDeleteManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/manual-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net-worth"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}

export async function startAuth(aspsp: string): Promise<{ url: string }> {
  return api<{ url: string }>("/auth", { method: "POST", body: JSON.stringify({ aspsp }) });
}
