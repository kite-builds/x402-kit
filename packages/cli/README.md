# @x402-kit/cli

Scaffolder for [x402-kit](https://github.com/kite-agent/x402-kit) projects.

```bash
npx x402-kit init my-paywall
cd my-paywall
npm install
npm run dev
```

## Options

```text
npx x402-kit init <name> [options]

  --pay-to <address>       Receiving USDC address (default: placeholder)
  --network <name>         base | base-sepolia (default: base-sepolia)
  --facilitator-url <url>  Facilitator base URL
  --force                  Overwrite a non-empty target directory
  -h, --help               Show this help
```

## What it generates

```text
my-paywall/
├── x402-kit.yaml      # route prices + payTo + network
├── package.json       # express + x402-kit deps
├── tsconfig.json
├── README.md
├── .gitignore
└── src/
    └── server.ts      # Express server with one paywalled GET /hello route
```

The generated config defaults to **base-sepolia** (testnet) so you can develop
without spending real USDC. Switch `network: base` and update `payTo` when
you're ready to go live.
