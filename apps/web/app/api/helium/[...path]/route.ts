/**
 * Same-origin proxy for the internal FastAPI service. HELIUM_API_URL is
 * injected into this service by the Vercel service binding; it is never
 * exposed to browser code.
 */

export const dynamic = "force-dynamic";

const API = (process.env.HELIUM_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const PASS_RESPONSE_HEADERS = ["content-type", "content-range", "accept-ranges", "content-disposition"];

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx, method: "GET" | "POST") {
  const { path } = await ctx.params;
  const incoming = new URL(req.url);
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  const body = method === "POST" ? await req.text() : undefined;
  const headers = new Headers({ accept: req.headers.get("accept") ?? "*/*" });
  if (body !== undefined) headers.set("content-type", req.headers.get("content-type") ?? "application/json");
  const range = req.headers.get("range");
  if (range) headers.set("range", range);

  const upstream = await fetch(target, { method, body, headers, cache: "no-store", signal: req.signal });
  if (path.at(-1) === "events" && upstream.ok && upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  const responseHeaders = new Headers({ "cache-control": "no-store" });
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
}

export function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx, "GET");
}

export function POST(req: Request, ctx: Ctx) {
  return handle(req, ctx, "POST");
}
