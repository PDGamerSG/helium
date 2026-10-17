import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/helium/[...path]/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function proxy(env, upstream) {
  const module = { exports: {} };
  const require = () => ({ sampleRequest: () => ({ status: 200, body: { sample: true } }) });
  new Function("module", "exports", "require", "process", "fetch", compiled)(module, module.exports, require, { env }, upstream);
  return module.exports;
}

const request = () => new Request("https://helium.example/api/helium/tenants/orbit/meetings");
const context = () => ({ params: Promise.resolve({ path: ["tenants", "orbit", "meetings"] }) });

test("a production failure stays explicit and does not switch later requests to sample data", async () => {
  let calls = 0;
  const route = proxy({ HELIUM_API_URL: "https://api.example" }, async () => {
    if (++calls === 1) throw new TypeError("connection failed");
    return Response.json([{ id: "saved-company-meeting" }]);
  });
  const failed = await route.GET(request(), context());
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("x-helium-source"), "live");
  const recovered = await route.GET(request(), context());
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), [{ id: "saved-company-meeting" }]);
  assert.equal(calls, 2);
});

test("a production timeout offers retry instead of stale fixtures", async () => {
  const route = proxy({ HELIUM_API_URL: "https://api.example" }, async () => { throw new DOMException("timeout", "TimeoutError"); });
  const result = await route.GET(request(), context());
  assert.equal(result.status, 504);
  assert.equal((await result.json()).error.code, "upstream_timeout");
});

test("explicit sample mode still works without contacting the API", async () => {
  const route = proxy({ HELIUM_API_URL: "https://api.example", HELIUM_SOURCE: "sample" }, async () => { assert.fail("sample mode contacted the API"); });
  const result = await route.GET(request(), context());
  assert.equal(result.headers.get("x-helium-source"), "sample");
  assert.deepEqual(await result.json(), { sample: true });
});
