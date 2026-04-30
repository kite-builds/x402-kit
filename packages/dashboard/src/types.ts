/**
 * Shape returned by the server's `/__x402/metrics` endpoint.
 * Mirrors `UsageLogger.getSummary()` in the `x402-kit` server package.
 */
export interface MetricsSummary {
  totalRequests: number;
  paidRequests: number;
  rejectedRequests: number;
  totalRevenueUsd: string;
  uniquePayers: number;
  routes: RouteMetrics[];
}

export interface RouteMetrics {
  route: string;
  method: string;
  count: number;
  revenueUsd: string;
}

/**
 * One row from the `/__x402/events` endpoint.
 * Mirrors `UsageEvent` in the server package.
 */
export interface UsageEventRow {
  timestamp: number;
  route: string;
  method: string;
  payer: string | null;
  amountUsd: string;
  network: string;
  status: "paid" | "rejected" | "free";
  reason: string | null;
  txHash: string | null;
  responseMs: number;
}

export interface EventsResponse {
  events: UsageEventRow[];
}
