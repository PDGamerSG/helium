import { sampleRequest } from "@/lib/sample-api";

/**
 * Proxy to the Helium API (HELIUM_API_URL, default http://localhost:8081). Same-origin requests avoid CORS,
 * and when the API cannot be reached the bundled Orbit sample answers instead. Every response says which one
 * answered in the `x-helium-source` header.
 */

export const dynamic = "force-dynamic";

const API = (process.env.HELIUM_API_URL ?? "http://localhost:8081").replace(/\/$/, "");
const FORCE_SAMPLE = process.env.HELIUM_SOURCE === "sample";
const RETRY_AFTER_MS = 15000;

let downUntil = 0;

type Ctx = { params: Promise<{ path: string[] }> };

const PASS_RESPONSE_HEADERS = ["content-type", "content-range", "accept-ranges", "content-length", "content-disposition"];

async function live(req: Request, path: string[], method: string, body: string | undefined) {
  const url = new URL(req.url);
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const isEvents = path.at(-1) === "events";
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(new DOMException("timeout", "TimeoutError")), method === "POST" ? 120000 : isEvents ? 5000 : 10000);
  const headers: Record<string, string> = { accept: req.headers.get("accept") ?? "*/*" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const range = req.headers.get("range");
  if (range) headers.range = range;
  try {
    const upstream = await fetch(target, { method, body, headers, cache: "no-store", signal: AbortSignal.any([connect.signal, req.signal]) });
    if (isEvents && upstream.ok && upstream.body) {
      clearTimeout(timer);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-helium-source": "live" },
      });
    }
    const buf = await upstream.arrayBuffer();
    clearTimeout(timer);
    const out = new Headers({ "x-helium-source": "live", "cache-control": "no-store" });
    for (const h of PASS_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v && h !== "content-length") out.set(h, v);
    }
    return new Response(buf, { status: upstream.status, headers: out });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

function sampleEvents(req: Request) {
  const enc = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        enc.encode(`retry: 30000\n\ndata: ${JSON.stringify({ event: "sample.connected", payload: { note: "Offline sample: no live events." }, ts: Date.now() })}\n\n`),
      );
      interval = setInterval(() => controller.enqueue(enc.encode(": keepalive\n\n")), 20000);
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(interval);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-helium-source": "sample" } });
}

async function handle(req: Request, ctx: Ctx, method: "GET" | "POST") {
  const { path } = await ctx.params;
  const body = method === "POST" ? await req.text() : undefined;

  if (!FORCE_SAMPLE && Date.now() >= downUntil) {
    try {
      return await live(req, path, method, body);
    } catch (error) {
      if (req.signal.aborted) return new Response(null, { status: 499 });
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      if (method === "POST" && timedOut) {
        return Response.json(
          { error: { code: "upstream_timeout", message: "The Helium API took too long to answer." } },
          { status: 504, headers: { "x-helium-source": "live" } },
        );
      }
      downUntil = Date.now() + RETRY_AFTER_MS;
    }
  }

  if (path.at(-1) === "events") return sampleEvents(req);
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : undefined;
  } catch {
    return Response.json({ error: { code: "bad_json", message: "Request body is not JSON." } }, { status: 400 });
  }
  const url = new URL(req.url);
  const result = sampleRequest(method, path, url.searchParams, parsed);
  return Response.json(result.body, { status: result.status, headers: { "x-helium-source": "sample", "cache-control": "no-store" } });
}

export function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx, "GET");
}

export function POST(req: Request, ctx: Ctx) {
  return handle(req, ctx, "POST");
}
