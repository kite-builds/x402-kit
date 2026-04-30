# @x402-kit/dashboard-ui

Hosted Next.js dashboard for an x402-kit server. Renders live metrics and recent
events from `/__x402/metrics` and `/__x402/events` using the
[`@x402-kit/dashboard`](../dashboard) typed client.

## What you get

- **Summary cards** — total revenue, paid vs total requests, rejection rate,
  unique payers, p50/p95 latency.
- **Top routes table** — request count and revenue per `(method, route)`.
- **Recent events table** — last 50 events with status pill, amount, payer, and
  response time.

It's a server-rendered Next.js app (App Router). Each page load re-fetches from
the configured x402-kit server; refresh the page to update.

## Run it

```bash
# from repo root, after `npm install`
cd packages/dashboard-ui
cp .env.example .env.local
# edit .env.local: point X402_URL at a running x402-kit server
npm run dev
# open http://localhost:3030
```

## Configuration

| Env var            | Required | Default                 | Notes                                                 |
| ------------------ | -------- | ----------------------- | ----------------------------------------------------- |
| `X402_URL`         | yes      | `http://localhost:3000` | Base URL of the x402-kit server                       |
| `X402_AUTH_TOKEN`  | no       | —                       | Bearer token if the server sets `analyticsAuthToken`  |

## Next steps

- Auto-refresh (currently manual page reload).
- Time-bucket revenue chart (data already aggregated by
  `bucketByTime` in `@x402-kit/dashboard`).
- Per-payer breakdown.

## License

MIT
