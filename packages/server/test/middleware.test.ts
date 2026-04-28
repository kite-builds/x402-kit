import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { install } from "../dist/index.js";
import { internals } from "../dist/middleware.js";
import type {
  PaymentPayload,
  PaymentRequiredResponse,
  VerifyResponse,
  SettleResponse,
} from "../dist/types.js";

const PAY_TO = "0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf";
const PAYER = "0x1111111111111111111111111111111111111111";

function encodePayload(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function buildValidPayload(amount: string): PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      signature: "0x" + "ab".repeat(65),
      authorization: {
        from: PAYER,
        to: PAY_TO,
        value: amount,
        validAfter: String(now - 60),
        validBefore: String(now + 600),
        nonce: "0x" + "cd".repeat(32),
      },
    },
  };
}

interface FacilitatorMock {
  port: number;
  close: () => Promise<void>;
  verifyResponses: VerifyResponse[];
  settleResponses: SettleResponse[];
  verifyCalls: number;
  settleCalls: number;
}

async function startFacilitatorMock(
  verifyResponses: VerifyResponse[],
  settleResponses: SettleResponse[],
): Promise<FacilitatorMock> {
  const app = express();
  app.use(express.json());
  const state: FacilitatorMock = {
    port: 0,
    close: async () => {},
    verifyResponses,
    settleResponses,
    verifyCalls: 0,
    settleCalls: 0,
  };
  app.post("/verify", (_req, res) => {
    state.verifyCalls += 1;
    const next = state.verifyResponses.shift();
    res.json(next ?? { isValid: false, invalidReason: "no mock response" });
  });
  app.post("/settle", (_req, res) => {
    state.settleCalls += 1;
    const next = state.settleResponses.shift();
    res.json(next ?? { success: false, errorReason: "no mock response" });
  });
  await new Promise<void>((r) => {
    const server = app.listen(0, () => {
      state.port = (server.address() as AddressInfo).port;
      state.close = () =>
        new Promise<void>((rr) => server.close(() => rr()));
      r();
    });
  });
  return state;
}

interface AppHandle {
  port: number;
  close: () => Promise<void>;
  facilitator: FacilitatorMock;
}

async function startTestApp(facilitator: FacilitatorMock, dbPath: string): Promise<AppHandle> {
  const app = express();
  const handle = install(app, {
    config: {
      payTo: PAY_TO,
      network: "base-sepolia",
      facilitatorUrl: `http://localhost:${facilitator.port}`,
      dbPath,
      routes: {
        "GET /premium": { price: "0.10", description: "premium content" },
      },
    },
  });
  app.get("/premium", (_req, res) => res.json({ secret: "42" }));
  return await new Promise<AppHandle>((r) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      r({
        port,
        facilitator,
        close: async () => {
          await new Promise<void>((rr) => server.close(() => rr()));
          handle.close();
        },
      });
    });
  });
}

test("priceToAtomic converts USD strings to USDC atomic units", () => {
  assert.equal(internals.priceToAtomic("0.10"), "100000");
  assert.equal(internals.priceToAtomic("1"), "1000000");
  assert.equal(internals.priceToAtomic("0.000001"), "1");
  assert.equal(internals.priceToAtomic("12.345678"), "12345678");
  assert.equal(internals.priceToAtomic("0"), "0");
});

test("missing X-PAYMENT header returns 402 with payment requirements", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const res = await fetch(`http://localhost:${app.port}/premium`);
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.equal(body.x402Version, 1);
    assert.equal(body.accepts.length, 1);
    const req = body.accepts[0];
    assert.equal(req.scheme, "exact");
    assert.equal(req.network, "base-sepolia");
    assert.equal(req.payTo, PAY_TO);
    assert.equal(req.maxAmountRequired, "100000");
    assert.match(req.resource, /\/premium$/);
    assert.equal(fac.verifyCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("malformed X-PAYMENT header returns 402 with reason", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": "this is not valid base64 json" },
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.equal(body.error, "malformed X-PAYMENT header");
    assert.equal(fac.verifyCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("payment with mismatched payTo is rejected before facilitator call", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const payload = buildValidPayload("100000");
    payload.payload.authorization.to = "0x9999999999999999999999999999999999999999";
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": encodePayload(payload) },
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.match(body.error ?? "", /authorization\.to does not match payTo/);
    assert.equal(fac.verifyCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("payment below required amount is rejected before facilitator call", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const payload = buildValidPayload("50000");
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": encodePayload(payload) },
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.match(body.error ?? "", /below maxAmountRequired/);
    assert.equal(fac.verifyCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("expired authorization is rejected before facilitator call", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const payload = buildValidPayload("100000");
    payload.payload.authorization.validBefore = String(
      Math.floor(Date.now() / 1000) - 1,
    );
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": encodePayload(payload) },
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.match(body.error ?? "", /expired/);
    assert.equal(fac.verifyCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("facilitator-rejected payment returns 402 with facilitator reason", async () => {
  const fac = await startFacilitatorMock(
    [{ isValid: false, invalidReason: "signature mismatch" }],
    [],
  );
  const app = await startTestApp(fac, ":memory:");
  try {
    const payload = buildValidPayload("100000");
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": encodePayload(payload) },
    });
    assert.equal(res.status, 402);
    const body = (await res.json()) as PaymentRequiredResponse;
    assert.equal(body.error, "signature mismatch");
    assert.equal(fac.verifyCalls, 1);
    assert.equal(fac.settleCalls, 0);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("valid payment passes through, calls /settle after response, and is logged", async () => {
  const fac = await startFacilitatorMock(
    [{ isValid: true, payer: PAYER }],
    [
      {
        success: true,
        payer: PAYER,
        transaction: "0xdeadbeef",
        network: "base-sepolia",
      },
    ],
  );
  const app = await startTestApp(fac, ":memory:");
  try {
    const payload = buildValidPayload("100000");
    const res = await fetch(`http://localhost:${app.port}/premium`, {
      headers: { "x-payment": encodePayload(payload) },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { secret: string };
    assert.equal(body.secret, "42");

    // /settle is called after response is sent — give it a tick to run.
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fac.verifyCalls, 1);
    assert.equal(fac.settleCalls, 1);

    // Analytics endpoint reflects the paid request.
    const metrics = await fetch(`http://localhost:${app.port}/__x402/metrics`);
    const m = (await metrics.json()) as {
      paidRequests: number;
      totalRevenueUsd: string;
    };
    assert.equal(m.paidRequests, 1);
    assert.match(m.totalRevenueUsd, /^0\.10/);
  } finally {
    await app.close();
    await fac.close();
  }
});

test("non-paywalled routes pass through and are logged as free", async () => {
  const fac = await startFacilitatorMock([], []);
  const app = await startTestApp(fac, ":memory:");
  try {
    const res = await fetch(`http://localhost:${app.port}/__x402/health`);
    assert.equal(res.status, 200);
    const events = await fetch(`http://localhost:${app.port}/__x402/events`);
    const body = (await events.json()) as { events: Array<{ status: string; route: string }> };
    const free = body.events.filter((e) => e.status === "free");
    assert.ok(free.length > 0, "expected at least one free event in the log");
  } finally {
    await app.close();
    await fac.close();
  }
});
