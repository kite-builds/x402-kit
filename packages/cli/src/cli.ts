#!/usr/bin/env node
import { init } from "./init.js";
import { deploy } from "./deploy.js";

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

function printHelp(): void {
  process.stdout.write(
    [
      "x402-kit — scaffold and deploy a paywalled API in seconds",
      "",
      "Usage:",
      "  npx x402-kit init <name> [options]",
      "  npx x402-kit deploy [options]",
      "",
      "init options:",
      "  --pay-to <address>        Receiving USDC address (default: placeholder)",
      "  --network <name>          base | base-sepolia (default: base-sepolia)",
      "  --facilitator-url <url>   Facilitator base URL",
      "  --force                   Overwrite a non-empty target directory",
      "",
      "deploy options:",
      "  --provider <name>         fly (default: fly)",
      "  --app-name <name>         Fly app name (default: derived from directory)",
      "  --region <code>           Fly region (default: ams)",
      "  --config-file <path>      x402-kit YAML to read (default: x402-kit.yaml)",
      "  --launch                  Run flyctl launch + deploy after writing files",
      "  --force                   Overwrite Dockerfile/fly.toml/.dockerignore if present",
      "",
      "Common:",
      "  -h, --help                Show this help",
      "",
      "Examples:",
      "  npx x402-kit init my-paywall --pay-to 0xYourAddr --network base-sepolia",
      "  npx x402-kit deploy --app-name my-paywall",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help || args.flags.h || !args.command) {
    printHelp();
    return args.command ? 0 : 1;
  }

  if (args.command === "init") {
    return runInit(args);
  }

  if (args.command === "deploy") {
    return runDeploy(args);
  }

  process.stderr.write(`unknown command "${args.command}"\n\n`);
  printHelp();
  return 2;
}

async function runInit(args: ParsedArgs): Promise<number> {
  const name = args.positional[0];
  if (!name) {
    process.stderr.write("error: project name is required\n\n");
    printHelp();
    return 2;
  }

  const networkFlag = args.flags["network"];
  let network: "base" | "base-sepolia" | undefined;
  if (networkFlag === "base" || networkFlag === "base-sepolia") {
    network = networkFlag;
  } else if (typeof networkFlag === "string") {
    process.stderr.write(
      `error: --network must be "base" or "base-sepolia" (got "${networkFlag}")\n`,
    );
    return 2;
  }

  try {
    const result = await init({
      name,
      payTo: typeof args.flags["pay-to"] === "string" ? (args.flags["pay-to"] as string) : undefined,
      network,
      facilitatorUrl:
        typeof args.flags["facilitator-url"] === "string"
          ? (args.flags["facilitator-url"] as string)
          : undefined,
      force: Boolean(args.flags["force"]),
    });
    process.stdout.write(
      [
        `✓ scaffolded ${name}/ with ${result.filesWritten.length} files`,
        "",
        "Next steps:",
        `  cd ${name}`,
        "  npm install",
        "  npm run dev",
        "",
      ].join("\n"),
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    return 1;
  }
}

async function runDeploy(args: ParsedArgs): Promise<number> {
  const providerFlag = args.flags["provider"];
  if (typeof providerFlag === "string" && providerFlag !== "fly") {
    process.stderr.write(`error: --provider must be "fly" (got "${providerFlag}")\n`);
    return 2;
  }
  try {
    const result = await deploy({
      provider: "fly",
      appName: typeof args.flags["app-name"] === "string" ? (args.flags["app-name"] as string) : undefined,
      region: typeof args.flags["region"] === "string" ? (args.flags["region"] as string) : undefined,
      configFile:
        typeof args.flags["config-file"] === "string" ? (args.flags["config-file"] as string) : undefined,
      force: Boolean(args.flags["force"]),
      launch: Boolean(args.flags["launch"]),
    });
    const lines: string[] = [];
    if (result.filesWritten.length) {
      lines.push(`✓ wrote ${result.filesWritten.join(", ")}`);
    }
    if (result.filesSkipped.length) {
      lines.push(`• kept existing ${result.filesSkipped.join(", ")} (pass --force to regenerate)`);
    }
    lines.push(`  app: ${result.appName}    region: ${result.region}`);
    lines.push("");
    lines.push(result.launched ? "Live:" : "Next steps:");
    for (const step of result.nextSteps) lines.push(`  ${step}`);
    lines.push("");
    process.stdout.write(lines.join("\n"));
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    return 1;
  }
}

main().then((code) => process.exit(code));
