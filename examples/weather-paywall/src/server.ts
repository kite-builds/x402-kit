import express, { type Request, type Response } from "express";
import { install } from "x402-kit";
import { resolve } from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 3402);

const handle = install(app, {
  config: resolve(import.meta.dirname, "..", "x402-kit.yaml"),
  analyticsAuthToken: process.env.X402_KIT_ADMIN_TOKEN,
});

interface OpenMeteoCurrent {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const json = (await r.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
  const hit = json.results?.[0];
  if (!hit) return null;
  return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
}

app.get("/weather", async (req: Request, res: Response) => {
  const city = String(req.query.city ?? "Oslo");
  const geo = await geocode(city);
  if (!geo) return res.status(404).json({ error: "city not found" });
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code`,
  );
  const data = (await wRes.json()) as OpenMeteoCurrent;
  res.json({ city: geo.name, current: data.current ?? null });
});

app.get("/forecast", async (req: Request, res: Response) => {
  const city = String(req.query.city ?? "Oslo");
  const geo = await geocode(city);
  if (!geo) return res.status(404).json({ error: "city not found" });
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=temperature_2m_max,temperature_2m_min&forecast_days=5`,
  );
  const data = (await wRes.json()) as OpenMeteoCurrent;
  res.json({ city: geo.name, daily: data.daily ?? null });
});

app.get("/", (_req, res) => {
  res.json({
    name: "weather-paywall",
    powered_by: "x402-kit",
    paywalled_routes: Object.keys(handle.config.routes),
    free_routes: ["GET /", "GET /__x402/health"],
    docs: "send a request to /weather?city=Oslo — server replies 402 with payment instructions",
  });
});

const server = app.listen(port, () => {
  console.log(`weather-paywall listening on http://localhost:${port}`);
  console.log(`  paywalled: ${Object.keys(handle.config.routes).join(", ")}`);
  console.log(`  receiving payments at ${handle.config.payTo} on ${handle.config.network}`);
});

const shutdown = (): void => {
  server.close();
  handle.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
