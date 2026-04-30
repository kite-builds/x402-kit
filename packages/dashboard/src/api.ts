import type { EventsResponse, MetricsSummary } from "./types.js";

export interface ClientOptions {
  /** Base URL of the x402-kit server (e.g. `https://api.example.com`). */
  baseUrl: string;
  /** Optional bearer token if the server gates `/__x402/*` with `analyticsAuthToken`. */
  authToken?: string;
  /** Override fetch (defaults to global fetch). Useful for tests. */
  fetch?: typeof fetch;
}

export class X402DashboardClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.baseUrl) {
      throw new Error("X402DashboardClient: baseUrl is required");
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.authToken = opts.authToken;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error(
        "X402DashboardClient: no fetch available — pass `fetch` in options",
      );
    }
  }

  async getMetrics(opts: { sinceMs?: number } = {}): Promise<MetricsSummary> {
    const url = new URL(`${this.baseUrl}/__x402/metrics`);
    if (opts.sinceMs !== undefined) {
      url.searchParams.set("since", String(opts.sinceMs));
    }
    return this.request<MetricsSummary>(url);
  }

  async getEvents(opts: { limit?: number } = {}): Promise<EventsResponse> {
    const url = new URL(`${this.baseUrl}/__x402/events`);
    if (opts.limit !== undefined) {
      url.searchParams.set("limit", String(opts.limit));
    }
    return this.request<EventsResponse>(url);
  }

  async getHealth(): Promise<{ ok: boolean; ts: number }> {
    const url = new URL(`${this.baseUrl}/__x402/health`);
    return this.request<{ ok: boolean; ts: number }>(url);
  }

  private async request<T>(url: URL): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.authToken) {
      headers["authorization"] = `Bearer ${this.authToken}`;
    }
    const res = await this.fetchImpl(url.toString(), { headers });
    if (!res.ok) {
      const body = await safeText(res);
      throw new X402DashboardError(
        `x402-kit ${url.pathname} returned ${res.status}: ${body}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }
}

export class X402DashboardError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "X402DashboardError";
    this.status = status;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
