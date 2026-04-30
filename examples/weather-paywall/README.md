# weather-paywall

Example x402-kit server. Paywalled Open-Meteo forecasts. Pay 1¢ in USDC for `/weather`, 5¢ for `/forecast`.

## Run locally (testnet)

```bash
npm install
npm run build -w x402-kit
npm run build -w x402-kit-example-weather-paywall
node examples/weather-paywall/dist/server.js
```

Defaults to `x402-kit.yaml` (Base Sepolia).

## Run against mainnet

Point the server at the mainnet config:

```bash
X402_KIT_CONFIG=x402-kit.mainnet.yaml node examples/weather-paywall/dist/server.js
```

## Deploy to Fly.io

From the monorepo root:

```bash
fly launch --config examples/weather-paywall/fly.toml \
           --dockerfile examples/weather-paywall/Dockerfile \
           --copy-config --no-deploy
fly volumes create x402_data --size 1 --region ams
fly deploy
```

The Dockerfile is multi-stage (build → runtime) and builds the workspace from
the monorepo so `x402-kit` resolves without a published version. The runtime
mounts `/data` so the SQLite analytics DB survives restarts.

## Hit it

```bash
curl https://x402-weather.fly.dev/weather?city=Oslo
# 402 Payment Required + payment requirements
```

Pay-and-replay flow is handled by any x402-compatible client (e.g. the SDK in
`@coinbase/x402`).
