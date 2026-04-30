export interface ScaffoldVars {
  projectName: string;
  payTo: string;
  network: string;
  facilitatorUrl: string;
}

export function yamlConfig(v: ScaffoldVars): string {
  return `# x402-kit configuration for ${v.projectName}.
# Each route is paywalled in USDC on the chosen network.
# Switch \`network: base\` and update payTo when going to mainnet.

payTo: "${v.payTo}"
network: ${v.network}
facilitatorUrl: ${v.facilitatorUrl}
dbPath: "./${v.projectName}.db"

routes:
  "GET /hello":
    price: "0.01"
    description: "Example paywalled route — replace with your own"
`;
}

export function serverStub(v: ScaffoldVars): string {
  return `import express, { type Request, type Response } from "express";
import { install } from "x402-kit";
import { resolve } from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 3402);

const handle = install(app, {
  config: resolve(import.meta.dirname, "..", "x402-kit.yaml"),
  analyticsAuthToken: process.env.X402_KIT_ADMIN_TOKEN,
});

app.get("/hello", (_req: Request, res: Response) => {
  res.json({
    message: "Hello from a paywalled route!",
    powered_by: "x402-kit",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "${v.projectName}",
    powered_by: "x402-kit",
    paywalled_routes: Object.keys(handle.config.routes),
    free_routes: ["GET /", "GET /__x402/health"],
    docs: "send a request to /hello — server replies 402 with payment instructions",
  });
});

const server = app.listen(port, () => {
  console.log(\`${v.projectName} listening on http://localhost:\${port}\`);
  console.log(\`  paywalled: \${Object.keys(handle.config.routes).join(", ")}\`);
  console.log(\`  receiving payments at \${handle.config.payTo} on \${handle.config.network}\`);
});

const shutdown = (): void => {
  server.close();
  handle.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
`;
}

export function projectPackageJson(v: ScaffoldVars): string {
  return JSON.stringify(
    {
      name: v.projectName,
      version: "0.1.0",
      private: true,
      type: "module",
      description: `Paywalled API built with x402-kit (${v.network}).`,
      main: "dist/server.js",
      scripts: {
        build: "tsc",
        start: "node dist/server.js",
        dev: "node --watch --experimental-strip-types src/server.ts",
      },
      dependencies: {
        express: "^4.19.0",
        "x402-kit": "^0.1.0",
      },
      devDependencies: {
        "@types/express": "^4.17.0",
        "@types/node": "^22.0.0",
        typescript: "^5.5.0",
      },
      license: "MIT",
    },
    null,
    2,
  ) + "\n";
}

export function projectTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022"],
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
      },
      include: ["src/**/*"],
    },
    null,
    2,
  ) + "\n";
}

export function projectReadme(v: ScaffoldVars): string {
  return `# ${v.projectName}

A paywalled API scaffolded with [x402-kit](https://github.com/kite-agent/x402-kit).
Each request to a paywalled route is settled in USDC on **${v.network}** via the
[x402](https://github.com/coinbase/x402) protocol.

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`

Then hit a free route:

\`\`\`bash
curl http://localhost:3402/
\`\`\`

Or hit a paywalled route — you'll get an HTTP 402 with payment instructions:

\`\`\`bash
curl -i http://localhost:3402/hello
\`\`\`

## Configuration

Edit \`x402-kit.yaml\` to add or change routes, prices, and the receiving address.

\`\`\`yaml
payTo: "${v.payTo}"
network: ${v.network}
routes:
  "GET /hello":
    price: "0.01"
\`\`\`

## Analytics

x402-kit ships built-in analytics. Set \`X402_KIT_ADMIN_TOKEN\` and hit:

- \`GET /__x402/metrics\` — totals + per-route stats
- \`GET /__x402/events\` — recent payment events
- \`GET /__x402/health\` — public health probe

## Going to mainnet

1. Replace the placeholder \`payTo\` with your real address.
2. Change \`network: ${v.network}\` to \`network: base\`.
3. Drop the \`facilitatorUrl\` line (use the default mainnet facilitator).
`;
}

export function projectGitignore(): string {
  return `node_modules/
dist/
*.db
*.db-journal
.env
.DS_Store
`;
}
