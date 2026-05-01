import { eventStats, topRoutesByRevenue } from "@x402-kit/dashboard";
import { getDashboardClient, getServerConfig } from "../lib/config";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LoadResult =
  | {
      ok: true;
      metrics: Awaited<ReturnType<ReturnType<typeof getDashboardClient>["getMetrics"]>>;
      events: Awaited<ReturnType<ReturnType<typeof getDashboardClient>["getEvents"]>>;
    }
  | { ok: false; error: string };

async function loadData(): Promise<LoadResult> {
  try {
    const client = getDashboardClient();
    const [metrics, events] = await Promise.all([
      client.getMetrics(),
      client.getEvents({ limit: 50 }),
    ]);
    return { ok: true, metrics, events };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function fmtUsd(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `$${n.toFixed(4)}`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function shortAddr(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default async function Page() {
  const { baseUrl } = getServerConfig();
  const result = await loadData();

  return (
    <main>
      <header className="page-header">
        <h1>x402-kit dashboard</h1>
        <span className="target">target: {baseUrl}</span>
      </header>

      {!result.ok ? (
        <div className="error">
          <strong>Failed to load metrics.</strong>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {result.error}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
            Set <code>X402_URL</code> (and optionally <code>X402_AUTH_TOKEN</code>)
            to point at a running x402-kit server.
          </div>
        </div>
      ) : (
        <Render metrics={result.metrics} events={result.events.events} />
      )}

      <footer className="page-footer">
        <span>x402-kit dashboard-ui</span>
        <AutoRefresh />
      </footer>
    </main>
  );
}

function Render({
  metrics,
  events,
}: {
  metrics: Awaited<ReturnType<ReturnType<typeof getDashboardClient>["getMetrics"]>>;
  events: Awaited<ReturnType<ReturnType<typeof getDashboardClient>["getEvents"]>>["events"];
}) {
  const stats = eventStats(events);
  const topRoutes = topRoutesByRevenue(events, 10);

  return (
    <>
      <section>
        <div className="cards">
          <Card label="Total revenue" value={fmtUsd(metrics.totalRevenueUsd)} />
          <Card
            label="Paid requests"
            value={metrics.paidRequests.toLocaleString()}
            sub={`${metrics.totalRequests.toLocaleString()} total`}
          />
          <Card
            label="Rejected"
            value={metrics.rejectedRequests.toLocaleString()}
            sub={`${(stats.errorRate * 100).toFixed(1)}% of recent`}
          />
          <Card label="Unique payers" value={metrics.uniquePayers.toLocaleString()} />
          <Card
            label="Latency p50 / p95"
            value={`${stats.p50ResponseMs}ms`}
            sub={`p95 ${stats.p95ResponseMs}ms`}
          />
        </div>
      </section>

      <section>
        <h2>Top routes</h2>
        {metrics.routes.length === 0 ? (
          <div className="empty">No route data yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="mono">Method</th>
                <th className="mono">Route</th>
                <th className="num">Requests</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {metrics.routes.map((r) => (
                <tr key={`${r.method} ${r.route}`}>
                  <td className="mono">{r.method}</td>
                  <td className="mono">{r.route}</td>
                  <td className="num">{r.count.toLocaleString()}</td>
                  <td className="num">{fmtUsd(r.revenueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Recent events ({events.length})</h2>
        {events.length === 0 ? (
          <div className="empty">No events yet — call a paywalled endpoint and refresh.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="mono">Time (UTC)</th>
                <th className="mono">Method</th>
                <th className="mono">Route</th>
                <th>Status</th>
                <th className="num">Amount</th>
                <th className="mono">Payer</th>
                <th className="num">ms</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.timestamp}-${i}`}>
                  <td className="mono">{fmtTime(e.timestamp)}</td>
                  <td className="mono">{e.method}</td>
                  <td className="mono">{e.route}</td>
                  <td>
                    <span className={`status-pill status-${e.status}`}>{e.status}</span>
                  </td>
                  <td className="num">{e.status === "paid" ? fmtUsd(e.amountUsd) : "—"}</td>
                  <td className="mono">{shortAddr(e.payer)}</td>
                  <td className="num">{e.responseMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {topRoutes.length > 0 ? (
        <section>
          <h2>Recent revenue by route</h2>
          <table>
            <thead>
              <tr>
                <th className="mono">Method</th>
                <th className="mono">Route</th>
                <th className="num">Requests</th>
                <th className="num">Paid</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topRoutes.map((r) => (
                <tr key={`${r.method} ${r.route}`}>
                  <td className="mono">{r.method}</td>
                  <td className="mono">{r.route}</td>
                  <td className="num">{r.count.toLocaleString()}</td>
                  <td className="num">{r.paidCount.toLocaleString()}</td>
                  <td className="num">{fmtUsd(r.revenueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
