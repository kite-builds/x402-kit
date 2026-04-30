import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketByTime,
  eventStats,
  topRoutesByRevenue,
} from "../dist/index.js";
import type { UsageEventRow } from "../dist/index.js";

function ev(partial: Partial<UsageEventRow>): UsageEventRow {
  return {
    timestamp: 1700000000000,
    route: "/weather",
    method: "GET",
    payer: null,
    amountUsd: "0.000000",
    network: "base-sepolia",
    status: "free",
    reason: null,
    txHash: null,
    responseMs: 10,
    ...partial,
  };
}

test("eventStats: empty input returns zeros", () => {
  const s = eventStats([]);
  assert.equal(s.totalEvents, 0);
  assert.equal(s.paidCount, 0);
  assert.equal(s.totalRevenueUsd, "0.000000");
  assert.equal(s.uniquePayers, 0);
  assert.equal(s.errorRate, 0);
  assert.equal(s.p50ResponseMs, 0);
  assert.equal(s.p95ResponseMs, 0);
});

test("eventStats: counts, revenue, unique payers, percentiles", () => {
  const events: UsageEventRow[] = [
    ev({ status: "paid", amountUsd: "0.10", payer: "0xAAA", responseMs: 10 }),
    ev({ status: "paid", amountUsd: "0.10", payer: "0xaaa", responseMs: 20 }),
    ev({ status: "paid", amountUsd: "0.50", payer: "0xBBB", responseMs: 30 }),
    ev({ status: "rejected", amountUsd: "0.10", payer: null, responseMs: 5 }),
    ev({ status: "free", amountUsd: "0.000000", payer: null, responseMs: 100 }),
  ];
  const s = eventStats(events);
  assert.equal(s.totalEvents, 5);
  assert.equal(s.paidCount, 3);
  assert.equal(s.rejectedCount, 1);
  assert.equal(s.freeCount, 1);
  assert.equal(s.totalRevenueUsd, "0.700000");
  // 0xAAA and 0xaaa collapse to one
  assert.equal(s.uniquePayers, 2);
  assert.equal(s.errorRate, 0.2);
  // sorted: [5, 10, 20, 30, 100]; p50 idx = ceil(0.5*5)-1 = 2 → 20; p95 idx = ceil(0.95*5)-1 = 4 → 100
  assert.equal(s.p50ResponseMs, 20);
  assert.equal(s.p95ResponseMs, 100);
});

test("topRoutesByRevenue: groups by method+route, sorts by revenue desc", () => {
  const events: UsageEventRow[] = [
    ev({ route: "/a", method: "GET", status: "paid", amountUsd: "0.10" }),
    ev({ route: "/a", method: "GET", status: "paid", amountUsd: "0.10" }),
    ev({ route: "/a", method: "GET", status: "rejected", amountUsd: "0.10" }),
    ev({ route: "/b", method: "GET", status: "paid", amountUsd: "0.50" }),
    ev({ route: "/a", method: "POST", status: "paid", amountUsd: "0.05" }),
  ];
  const top = topRoutesByRevenue(events);
  assert.equal(top.length, 3);
  assert.equal(top[0].route, "/b");
  assert.equal(top[0].revenueUsd, "0.500000");
  assert.equal(top[0].count, 1);
  assert.equal(top[0].paidCount, 1);

  assert.equal(top[1].route, "/a");
  assert.equal(top[1].method, "GET");
  assert.equal(top[1].count, 3);
  assert.equal(top[1].paidCount, 2);
  assert.equal(top[1].revenueUsd, "0.200000");

  assert.equal(top[2].route, "/a");
  assert.equal(top[2].method, "POST");
  assert.equal(top[2].revenueUsd, "0.050000");
});

test("topRoutesByRevenue: respects limit", () => {
  const events: UsageEventRow[] = [
    ev({ route: "/a", status: "paid", amountUsd: "0.10" }),
    ev({ route: "/b", status: "paid", amountUsd: "0.20" }),
    ev({ route: "/c", status: "paid", amountUsd: "0.30" }),
  ];
  const top = topRoutesByRevenue(events, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].route, "/c");
  assert.equal(top[1].route, "/b");
});

test("bucketByTime: groups events into fixed intervals", () => {
  const base = 1700000000000;
  const minute = 60_000;
  const events: UsageEventRow[] = [
    ev({ timestamp: base + 5_000, status: "paid", amountUsd: "0.10" }),
    ev({ timestamp: base + 30_000, status: "free" }),
    ev({ timestamp: base + 65_000, status: "paid", amountUsd: "0.25" }),
    ev({ timestamp: base + 70_000, status: "rejected" }),
  ];
  const buckets = bucketByTime(events, minute);
  assert.equal(buckets.length, 2);

  const first = buckets[0];
  assert.equal(first.startMs % minute, 0);
  assert.equal(first.count, 2);
  assert.equal(first.paidCount, 1);
  assert.equal(first.revenueUsd, "0.100000");
  assert.equal(first.endMs, first.startMs + minute);

  const second = buckets[1];
  assert.equal(second.count, 2);
  assert.equal(second.paidCount, 1);
  assert.equal(second.revenueUsd, "0.250000");
  assert.equal(second.startMs, first.startMs + minute);
});

test("bucketByTime: empty input returns empty array", () => {
  assert.deepEqual(bucketByTime([], 60_000), []);
});

test("bucketByTime: rejects invalid interval", () => {
  assert.throws(() => bucketByTime([], 0), /intervalMs must be > 0/);
  assert.throws(() => bucketByTime([], -1), /intervalMs must be > 0/);
});
