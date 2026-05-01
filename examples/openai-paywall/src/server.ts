import express from "express";
import { install } from "x402-kit";
import { resolve } from "node:path";
import { makeProxyHandler } from "./proxy.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? 3402);
const configFile = process.env.X402_KIT_CONFIG ?? "x402-kit.yaml";
const handle = install(app, {
  config: resolve(import.meta.dirname, "..", configFile),
  analyticsAuthToken: process.env.X402_KIT_ADMIN_TOKEN,
});

const upstreamBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
const upstreamApiKey = process.env.OPENAI_API_KEY ?? "";

if (!upstreamApiKey) {
  console.warn(
    "warning: OPENAI_API_KEY not set — paid requests will reach the proxy but the upstream call will 401",
  );
}

app.post(
  "/v1/chat/completions",
  makeProxyHandler("/v1/chat/completions", { upstreamBaseUrl, upstreamApiKey }),
);

app.post(
  "/v1/embeddings",
  makeProxyHandler("/v1/embeddings", { upstreamBaseUrl, upstreamApiKey }),
);

app.get("/", (_req, res) => {
  res.json({
    name: "openai-paywall",
    powered_by: "x402-kit",
    paywalled_routes: Object.keys(handle.config.routes),
    free_routes: ["GET /", "GET /__x402/health"],
    docs: "POST /v1/chat/completions — pay first (HTTP 402), then receive the upstream response",
  });
});

const server = app.listen(port, () => {
  console.log(`openai-paywall listening on http://localhost:${port}`);
  console.log(`  paywalled: ${Object.keys(handle.config.routes).join(", ")}`);
  console.log(`  upstream: ${upstreamBaseUrl}`);
});

const shutdown = (): void => {
  server.close();
  handle.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
