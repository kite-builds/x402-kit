import { test } from "node:test";
import assert from "node:assert/strict";
import { X402DashboardClient, X402DashboardError } from "../dist/index.js";

interface FakeCall {
  url: string;
  headers: Record<string, string>;
}

function makeFakeFetch(
  responder: (url: string) => { status: number; body: unknown },
): { fetch: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ url, headers });
    const { status, body } = responder(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fakeFetch, calls };
}

test("getMetrics calls /__x402/metrics and returns parsed summary", async () => {
  const summary = {
    totalRequests: 5,
    paidRequests: 4,
    rejectedRequests: 1,
    totalRevenueUsd: "0.400000",
    uniquePayers: 2,
    routes: [
      { route: "/weather", method: "GET", count: 4, revenueUsd: "0.400000" },
    ],
  };
  const { fetch, calls } = makeFakeFetch(() => ({ status: 200, body: summary }));

  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com",
    fetch,
  });
  const result = await client.getMetrics();

  assert.deepEqual(result, summary);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/__x402/metrics");
});

test("getMetrics passes sinceMs as query param", async () => {
  const { fetch, calls } = makeFakeFetch(() => ({
    status: 200,
    body: {
      totalRequests: 0,
      paidRequests: 0,
      rejectedRequests: 0,
      totalRevenueUsd: "0.000000",
      uniquePayers: 0,
      routes: [],
    },
  }));
  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com/",
    fetch,
  });
  await client.getMetrics({ sinceMs: 1700000000000 });

  assert.equal(
    calls[0].url,
    "https://api.example.com/__x402/metrics?since=1700000000000",
  );
});

test("getEvents passes limit and returns events array", async () => {
  const events = [
    {
      timestamp: 1700000000000,
      route: "/weather",
      method: "GET",
      payer: "0xabc",
      amountUsd: "0.10",
      network: "base-sepolia",
      status: "paid" as const,
      reason: null,
      txHash: "0xdeadbeef",
      responseMs: 42,
    },
  ];
  const { fetch, calls } = makeFakeFetch(() => ({
    status: 200,
    body: { events },
  }));
  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com",
    fetch,
  });
  const result = await client.getEvents({ limit: 25 });

  assert.deepEqual(result.events, events);
  assert.equal(
    calls[0].url,
    "https://api.example.com/__x402/events?limit=25",
  );
});

test("authToken is sent as bearer header", async () => {
  const { fetch, calls } = makeFakeFetch(() => ({
    status: 200,
    body: { ok: true, ts: 1 },
  }));
  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com",
    fetch,
    authToken: "secret-token",
  });
  await client.getHealth();

  assert.equal(calls[0].headers["authorization"], "Bearer secret-token");
});

test("non-2xx response throws X402DashboardError with status", async () => {
  const { fetch } = makeFakeFetch(() => ({
    status: 401,
    body: { error: "unauthorized" },
  }));
  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com",
    fetch,
  });

  await assert.rejects(
    () => client.getMetrics(),
    (err: unknown) => {
      assert.ok(err instanceof X402DashboardError);
      assert.equal((err as X402DashboardError).status, 401);
      return true;
    },
  );
});

test("baseUrl is required", () => {
  assert.throws(
    // @ts-expect-error — testing runtime guard
    () => new X402DashboardClient({ baseUrl: "" }),
    /baseUrl is required/,
  );
});

test("trailing slashes on baseUrl are normalized", async () => {
  const { fetch, calls } = makeFakeFetch(() => ({
    status: 200,
    body: { ok: true, ts: 1 },
  }));
  const client = new X402DashboardClient({
    baseUrl: "https://api.example.com///",
    fetch,
  });
  await client.getHealth();

  assert.equal(calls[0].url, "https://api.example.com/__x402/health");
});
