import type { UsageEventRow } from "./types.js";

export interface EventStats {
  totalEvents: number;
  paidCount: number;
  rejectedCount: number;
  freeCount: number;
  totalRevenueUsd: string;
  uniquePayers: number;
  p50ResponseMs: number;
  p95ResponseMs: number;
  errorRate: number;
}

export interface RouteAggregate {
  route: string;
  method: string;
  count: number;
  paidCount: number;
  revenueUsd: string;
}

export interface TimeBucket {
  startMs: number;
  endMs: number;
  count: number;
  paidCount: number;
  revenueUsd: string;
}

export function eventStats(events: UsageEventRow[]): EventStats {
  const total = events.length;
  let paid = 0;
  let rejected = 0;
  let free = 0;
  let revenueMicros = 0n;
  const payers = new Set<string>();
  const responseTimes: number[] = [];

  for (const e of events) {
    if (e.status === "paid") paid++;
    else if (e.status === "rejected") rejected++;
    else if (e.status === "free") free++;
    if (e.payer) payers.add(e.payer.toLowerCase());
    if (e.status === "paid") revenueMicros += parseUsdToMicros(e.amountUsd);
    if (typeof e.responseMs === "number" && Number.isFinite(e.responseMs)) {
      responseTimes.push(e.responseMs);
    }
  }

  return {
    totalEvents: total,
    paidCount: paid,
    rejectedCount: rejected,
    freeCount: free,
    totalRevenueUsd: formatMicrosToUsd(revenueMicros),
    uniquePayers: payers.size,
    p50ResponseMs: percentile(responseTimes, 0.5),
    p95ResponseMs: percentile(responseTimes, 0.95),
    errorRate: total === 0 ? 0 : rejected / total,
  };
}

export function topRoutesByRevenue(
  events: UsageEventRow[],
  limit = 10,
): RouteAggregate[] {
  const byKey = new Map<string, RouteAggregate & { _micros: bigint }>();
  for (const e of events) {
    const key = `${e.method} ${e.route}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        route: e.route,
        method: e.method,
        count: 0,
        paidCount: 0,
        revenueUsd: "0.000000",
        _micros: 0n,
      };
      byKey.set(key, row);
    }
    row.count++;
    if (e.status === "paid") {
      row.paidCount++;
      row._micros += parseUsdToMicros(e.amountUsd);
    }
  }
  const rows = Array.from(byKey.values()).map((r) => ({
    route: r.route,
    method: r.method,
    count: r.count,
    paidCount: r.paidCount,
    revenueUsd: formatMicrosToUsd(r._micros),
  }));
  rows.sort((a, b) => {
    const cmp = compareUsd(b.revenueUsd, a.revenueUsd);
    if (cmp !== 0) return cmp;
    return b.count - a.count;
  });
  return rows.slice(0, limit);
}

export function bucketByTime(
  events: UsageEventRow[],
  intervalMs: number,
): TimeBucket[] {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("bucketByTime: intervalMs must be > 0");
  }
  if (events.length === 0) return [];
  const buckets = new Map<number, TimeBucket & { _micros: bigint }>();
  for (const e of events) {
    const start = Math.floor(e.timestamp / intervalMs) * intervalMs;
    let b = buckets.get(start);
    if (!b) {
      b = {
        startMs: start,
        endMs: start + intervalMs,
        count: 0,
        paidCount: 0,
        revenueUsd: "0.000000",
        _micros: 0n,
      };
      buckets.set(start, b);
    }
    b.count++;
    if (e.status === "paid") {
      b.paidCount++;
      b._micros += parseUsdToMicros(e.amountUsd);
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.startMs - b.startMs)
    .map((b) => ({
      startMs: b.startMs,
      endMs: b.endMs,
      count: b.count,
      paidCount: b.paidCount,
      revenueUsd: formatMicrosToUsd(b._micros),
    }));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

function parseUsdToMicros(amount: string): bigint {
  if (!amount) return 0n;
  const trimmed = amount.trim();
  if (!trimmed) return 0n;
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = body.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  const wholeDigits = whole.replace(/[^0-9]/g, "");
  const fracDigits = fracPadded.replace(/[^0-9]/g, "");
  if (!wholeDigits && !fracDigits) return 0n;
  const micros = BigInt(wholeDigits || "0") * 1_000_000n + BigInt(fracDigits || "0");
  return neg ? -micros : micros;
}

function formatMicrosToUsd(micros: bigint): string {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

function compareUsd(a: string, b: string): number {
  const am = parseUsdToMicros(a);
  const bm = parseUsdToMicros(b);
  if (am === bm) return 0;
  return am < bm ? -1 : 1;
}
