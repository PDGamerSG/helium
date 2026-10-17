"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Which backend answered the most recent request: the live Helium API or the bundled Orbit sample. */
export type Source = "live" | "sample" | "unknown";

let currentSource: Source = "unknown";
const listeners = new Set<() => void>();

function setSource(s: Source) {
  if (s === currentSource) return;
  currentSource = s;
  listeners.forEach((l) => l());
}

export function useSource() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentSource,
    () => "unknown" as Source,
  );
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function messageFrom(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const b = body as { error?: { message?: string; code?: string }; detail?: unknown };
    // Validation failures arrive as a serialised list of field errors; show a sentence instead of the raw list.
    if (b.error?.message)
      return { message: b.error.message.startsWith("[{") ? "The request was missing a required field." : b.error.message, code: b.error.code ?? String(status) };
    if (typeof b.detail === "string") return { message: b.detail, code: String(status) };
    if (Array.isArray(b.detail)) return { message: "The request was not valid.", code: "validation" };
  }
  return { message: status >= 500 ? "The Helium API had a problem answering." : `Request failed (${status}).`, code: String(status) };
}

export async function api<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/helium${path}`, {
      method: init?.method ?? "GET",
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      signal: init?.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "network", "The workspace could not reach its own server.");
  }
  const src = res.headers.get("x-helium-source");
  if (src === "live" || src === "sample") setSource(src);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const { message, code } = messageFrom(body, res.status);
    throw new ApiError(res.status, code, message);
  }
  return body as T;
}

export type Resource<T> = { data: T | undefined; error: ApiError | undefined; loading: boolean; reload: () => void };

/** Fetch a GET resource; keeps the previous data while refetching so views don't jump. */
export function useResource<T>(path: string | null): Resource<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: ApiError } | null>(null);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const key = path === null ? null : `${path}#${nonce}`;

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    const k = `${path}#${nonce}`;
    api<T>(path, { signal: ctrl.signal })
      .then((data) => setResult({ key: k, data }))
      .catch((error) => {
        if (ctrl.signal.aborted) return;
        setResult((r) => ({ key: k, data: r?.data, error: error instanceof ApiError ? error : new ApiError(0, "unknown", String(error)) }));
      });
    return () => ctrl.abort();
  }, [path, nonce]);

  const fresh = result !== null && result.key === key;
  return { data: result?.data, error: fresh ? result.error : undefined, loading: path !== null && !fresh, reload };
}
