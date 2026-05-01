# openai-paywall (x402-kit example)

A paywalled, OpenAI-compatible chat-completions proxy. Each `POST /v1/chat/completions`
request is billed in USDC via [x402-kit](../..). The proxy then forwards the body to a
configurable upstream (the real OpenAI API by default) and streams the response back.

This is the agentic-payments use case x402 was designed for: an autonomous agent pays a
flat per-request fee in USDC and gets back a signed model response — no API-key sharing,
no human in the loop.

## Run it locally

```bash
cd examples/openai-paywall
npm install
OPENAI_API_KEY=sk-... npm run dev
```

The server listens on `:3402`. Hit a free probe to confirm:

```bash
curl http://localhost:3402/
```

Try a paid call without payment — you'll get an HTTP 402 with the price + payTo:

```bash
curl -i -X POST http://localhost:3402/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

Pay once (an x402-aware client like `x402-fetch` handles this transparently) and the same
request now proxies straight to OpenAI.

## What you can do with this

- Resell access to your fine-tuned model without distributing API keys.
- Front a self-hosted LLM (vLLM, llama.cpp) with USDC settlement.
- Charge agents that don't have credit cards (they don't).
- Compose with `@x402-kit/dashboard` to track per-payer spend in real time.

## Configuration

Edit [`x402-kit.yaml`](./x402-kit.yaml) to change the per-request price or add routes.
The proxy reads two env vars:

| Var | Default | What |
|---|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com` | Upstream base URL — point at vLLM, OpenRouter, etc. |
| `OPENAI_API_KEY`  | (required for live calls) | Upstream credential — never sent to the client |

## Tests

```bash
npm test
```

Covers: request body forwarding, upstream auth header, status passthrough, content-type
passthrough (incl. SSE for streaming), and 502 on upstream failure.
