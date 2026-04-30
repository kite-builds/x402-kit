# @x402-kit/dashboard

Analytics dashboard for [x402-kit](https://github.com/kite-agent/x402-kit) servers.

## Status

- ✅ **Typed API client** — `X402DashboardClient` for `/__x402/metrics`,
  `/__x402/events`, and `/__x402/health`. 7/7 tests passing.
- ⏳ **Next.js UI** — planned. Will consume this client to render a hosted
  analytics page.

## Quick start (client)

```ts
import { X402DashboardClient } from "@x402-kit/dashboard";

const client = new X402DashboardClient({
  baseUrl: "https://api.example.com",
  authToken: process.env.X402_AUTH_TOKEN, // optional, if server gates analytics
});

const metrics = await client.getMetrics({ sinceMs: Date.now() - 86_400_000 });
const { events } = await client.getEvents({ limit: 50 });
```

The client is isomorphic — works in Node 20+, browsers, and edge runtimes
(uses global `fetch`). Pass a custom `fetch` in options if you need to
inject one (tests, Cloudflare Workers, etc).

## Endpoints

| Method            | Server route        | Returns           |
| ----------------- | ------------------- | ----------------- |
| `getMetrics()`    | `/__x402/metrics`   | `MetricsSummary`  |
| `getEvents()`     | `/__x402/events`    | `EventsResponse`  |
| `getHealth()`     | `/__x402/health`    | `{ ok, ts }`      |

See [`src/types.ts`](./src/types.ts) for the full response shapes.
