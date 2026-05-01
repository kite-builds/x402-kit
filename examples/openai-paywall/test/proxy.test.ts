import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { makeProxyHandler } from "../src/proxy.ts";

interface FakeUpstream {
  url: URL;
  status: number;
  payload: string;
  contentType?: string;
  receivedHeaders?: Record<string, string>;
  receivedBody?: string;
}

function makeFakeFetch(upstream: FakeUpstream): typeof fetch {
  return (async (input, init) => {
    upstream.url = new URL(typeof input === "string" ? input : input.toString());
    const headers = init?.headers as Record<string, string> | undefined;
    upstream.receivedHeaders = headers;
    upstream.receivedBody = init?.body ? String(init.body) : "";
    return new Response(upstream.payload, {
      status: upstream.status,
      headers: { "content-type": upstream.contentType ?? "application/json" },
    });
  }) as typeof fetch;
}

interface RunningProxy {
  url: string;
  upstream: FakeUpstream;
  close(): Promise<void>;
}

async function startProxy(initial: Partial<FakeUpstream> = {}): Promise<RunningProxy> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const upstream: FakeUpstream = {
    url: new URL("https://placeholder.invalid/"),
    status: initial.status ?? 200,
    payload: initial.payload ?? JSON.stringify({ ok: true }),
    contentType: initial.contentType ?? "application/json",
  };
  const fetchImpl = makeFakeFetch(upstream);
  app.post(
    "/v1/chat/completions",
    makeProxyHandler("/v1/chat/completions", {
      upstreamBaseUrl: "https://upstream.example",
      upstreamApiKey: "sk-test-key",
      fetchImpl,
    }),
  );
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    upstream,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

test("proxy forwards POST body to the upstream URL with a Bearer header", async () => {
  const p = await startProxy({
    payload: JSON.stringify({
      id: "chatcmpl-1",
      choices: [{ message: { role: "assistant", content: "hi" } }],
    }),
  });
  try {
    const res = await fetch(`${p.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    const json = await res.json() as { id: string };
    assert.equal(json.id, "chatcmpl-1");
    assert.equal(p.upstream.url.toString(), "https://upstream.example/v1/chat/completions");
    assert.equal(p.upstream.receivedHeaders?.authorization, "Bearer sk-test-key");
    assert.equal(p.upstream.receivedHeaders?.["content-type"], "application/json");
    const sent = JSON.parse(p.upstream.receivedBody ?? "{}");
    assert.equal(sent.model, "gpt-4");
  } finally {
    await p.close();
  }
});

test("proxy preserves upstream HTTP status code on error responses", async () => {
  const p = await startProxy({
    status: 429,
    payload: JSON.stringify({ error: { code: "rate_limited" } }),
  });
  try {
    const res = await fetch(`${p.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 429);
    const json = (await res.json()) as { error: { code: string } };
    assert.equal(json.error.code, "rate_limited");
  } finally {
    await p.close();
  }
});

test("proxy preserves upstream content-type", async () => {
  const p = await startProxy({
    payload: "data: {\"chunk\":1}\n\ndata: [DONE]\n",
    contentType: "text/event-stream",
  });
  try {
    const res = await fetch(`${p.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await res.text();
    assert.match(text, /\[DONE\]/);
  } finally {
    await p.close();
  }
});

test("proxy returns 502 when upstream throws", async () => {
  const app = express();
  app.use(express.json());
  const erroringFetch: typeof fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  app.post(
    "/v1/chat/completions",
    makeProxyHandler("/v1/chat/completions", {
      upstreamBaseUrl: "https://upstream.example",
      upstreamApiKey: "sk-test",
      fetchImpl: erroringFetch,
    }),
  );
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 502);
    const json = (await res.json()) as { error: string; message: string };
    assert.equal(json.error, "upstream_unreachable");
    assert.match(json.message, /network down/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
