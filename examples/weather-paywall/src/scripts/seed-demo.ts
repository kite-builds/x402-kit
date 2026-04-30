#!/usr/bin/env node
import { UsageLogger, type Network, type UsageEvent } from "x402-kit";
import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

interface SeedOptions {
  dbPath: string;
  network: Network;
  events: number;
  reset: boolean;
}

function parseArgs(argv: string[]): SeedOptions {
  let dbPath = "./weather-paywall.db";
  let network: Network = "base";
  let events = 80;
  let reset = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db" && argv[i + 1]) {
      dbPath = argv[++i];
    } else if (a === "--network" && argv[i + 1]) {
      const n = argv[++i];
      if (n !== "base" && n !== "base-sepolia") {
        throw new Error(`--network must be "base" or "base-sepolia"`);
      }
      network = n;
    } else if (a === "--events" && argv[i + 1]) {
      events = Number(argv[++i]);
      if (!Number.isFinite(events) || events <= 0) {
        throw new Error(`--events must be a positive number`);
      }
    } else if (a === "--reset") {
      reset = true;
    } else if (a === "-h" || a === "--help") {
      process.stdout.write(
        [
          "seed-demo — fill the analytics db with realistic synthetic events",
          "",
          "Usage: node dist/scripts/seed-demo.js [options]",
          "",
          "Options:",
          "  --db <path>          SQLite path (default ./weather-paywall.db)",
          "  --network <name>     base | base-sepolia (default base)",
          "  --events <n>         number of events to generate (default 80)",
          "  --reset              delete the db file before seeding",
          "  -h, --help           show this help",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return { dbPath, network, events, reset };
}

const PAYERS: string[] = [
  "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97",
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
  "0x53d284357ec70cE289D6D64134DfAc8E511c8a3D",
  "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
  "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0",
];

const ROUTES: Array<{ method: string; route: string; price: string; weight: number }> = [
  { method: "GET", route: "/weather", price: "0.01", weight: 7 },
  { method: "GET", route: "/forecast", price: "0.05", weight: 3 },
];

const REJECT_REASONS: string[] = [
  "missing X-PAYMENT header",
  "insufficient value",
  "expired authorization",
  "invalid signature",
  "wrong recipient",
];

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function randomTxHash(): string {
  const hex = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < 64; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

function generateEvents(count: number, network: Network): UsageEvent[] {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // last 24h
  const events: UsageEvent[] = [];

  for (let i = 0; i < count; i++) {
    const route = pickWeighted(ROUTES);
    const timestamp = now - Math.floor(Math.random() * windowMs);
    const roll = Math.random();
    // ~80% paid, ~15% rejected, ~5% free (e.g. /__x402/health hits)
    let status: UsageEvent["status"];
    if (roll < 0.8) status = "paid";
    else if (roll < 0.95) status = "rejected";
    else status = "free";

    const payer =
      status === "paid"
        ? PAYERS[Math.floor(Math.random() * PAYERS.length)]
        : status === "rejected" && Math.random() < 0.3
        ? PAYERS[Math.floor(Math.random() * PAYERS.length)]
        : null;

    const responseMs =
      status === "paid"
        ? 180 + Math.floor(Math.random() * 420) // 180–600ms
        : 20 + Math.floor(Math.random() * 80); // 20–100ms

    events.push({
      timestamp,
      route: route.route,
      method: route.method,
      payer,
      amountUsd: status === "paid" ? route.price : "0",
      network,
      status,
      reason:
        status === "rejected"
          ? REJECT_REASONS[Math.floor(Math.random() * REJECT_REASONS.length)]
          : null,
      txHash: status === "paid" ? randomTxHash() : null,
      responseMs,
    });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const dbPath = resolve(opts.dbPath);

  if (opts.reset && existsSync(dbPath)) {
    unlinkSync(dbPath);
    process.stdout.write(`reset: removed ${dbPath}\n`);
  }

  const logger = new UsageLogger(dbPath);
  const events = generateEvents(opts.events, opts.network);
  for (const e of events) logger.log(e);
  logger.close();

  const paid = events.filter((e) => e.status === "paid");
  const rejected = events.filter((e) => e.status === "rejected");
  const revenue = paid.reduce((s, e) => s + Number(e.amountUsd), 0);

  process.stdout.write(
    [
      `seeded ${events.length} events into ${dbPath}`,
      `  paid:     ${paid.length}`,
      `  rejected: ${rejected.length}`,
      `  free:     ${events.length - paid.length - rejected.length}`,
      `  revenue:  $${revenue.toFixed(4)}`,
      `  network:  ${opts.network}`,
      "",
    ].join("\n"),
  );
}

main();
