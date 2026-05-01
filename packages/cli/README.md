# @x402-kit/cli

Scaffolder + Fly.io deployer for [x402-kit](https://github.com/kite-agent/x402-kit) projects.

```bash
npx x402-kit init my-paywall
cd my-paywall
npm install
npm run dev                  # local
npx x402-kit deploy --launch # public on Fly.io
```

## init — scaffold a project

```text
npx x402-kit init <name> [options]

  --pay-to <address>       Receiving USDC address (default: placeholder)
  --network <name>         base | base-sepolia (default: base-sepolia)
  --facilitator-url <url>  Facilitator base URL
  --force                  Overwrite a non-empty target directory
  -h, --help               Show this help
```

## deploy — generate Dockerfile + fly.toml (and optionally launch)

```text
npx x402-kit deploy [options]

  --provider <name>        fly (default: fly)
  --app-name <name>        Fly app name (default: derived from the directory name)
  --region <code>          Fly region (default: ams)
  --config-file <path>     YAML to read (default: x402-kit.yaml)
  --launch                 Run `flyctl launch` + `flyctl deploy` after writing files
  --force                  Regenerate Dockerfile / fly.toml / .dockerignore
```

Without `--launch`, deploy just writes the three files so you can review them and run flyctl yourself.
With `--launch`, you need `flyctl` on PATH and a one-time `flyctl auth login`.

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
