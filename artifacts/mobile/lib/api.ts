import { getClerkInstance } from "@clerk/expo";

const BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!domain) return "/api";
  return `https://${domain}/api`;
})();

async function getToken(): Promise<string | null> {
  try {
    const clerk = getClerkInstance();
    return (await clerk.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${BASE}${path}`, { ...init, headers });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${c}`;
}
