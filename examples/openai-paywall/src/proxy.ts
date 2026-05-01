import type { Request, Response } from "express";

export interface ProxyConfig {
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  fetchImpl?: typeof fetch;
}

export function makeProxyHandler(path: string, cfg: ProxyConfig) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const upstreamUrl = `${cfg.upstreamBaseUrl.replace(/\/$/, "")}${path}`;
      const upstream = await fetchImpl(upstreamUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.upstreamApiKey}`,
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const ct = upstream.headers.get("content-type") ?? "application/json";
      res.status(upstream.status).type(ct);
      const text = await upstream.text();
      res.send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: "upstream_unreachable",
        message: msg,
      });
    }
  };
}
