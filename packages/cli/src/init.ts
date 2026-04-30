import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  type ScaffoldVars,
  yamlConfig,
  serverStub,
  projectPackageJson,
  projectTsconfig,
  projectReadme,
  projectGitignore,
} from "./templates.js";

export interface InitOptions {
  name: string;
  cwd?: string;
  payTo?: string;
  network?: "base" | "base-sepolia";
  facilitatorUrl?: string;
  force?: boolean;
}

export interface InitResult {
  projectDir: string;
  filesWritten: string[];
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const PLACEHOLDER_PAY_TO = "0x0000000000000000000000000000000000000000";

export function validateProjectName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("project name is required");
  }
  if (!NAME_RE.test(name)) {
    throw new Error(
      `invalid project name "${name}" — use lowercase letters, digits, '.', '_', '-' and start with [a-z0-9]`,
    );
  }
}

export async function init(opts: InitOptions): Promise<InitResult> {
  validateProjectName(opts.name);

  const cwd = opts.cwd ?? process.cwd();
  const projectDir = resolve(cwd, opts.name);

  if (existsSync(projectDir)) {
    const entries = await readdir(projectDir);
    if (entries.length > 0 && !opts.force) {
      throw new Error(
        `target directory "${projectDir}" already exists and is not empty (pass force to overwrite)`,
      );
    }
  }

  const network = opts.network ?? "base-sepolia";
  const facilitatorUrl =
    opts.facilitatorUrl ?? "https://facilitator.x402.org";
  const payTo = opts.payTo ?? PLACEHOLDER_PAY_TO;

  const vars: ScaffoldVars = {
    projectName: opts.name,
    payTo,
    network,
    facilitatorUrl,
  };

  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, "src"), { recursive: true });

  const files: Array<[string, string]> = [
    ["x402-kit.yaml", yamlConfig(vars)],
    ["package.json", projectPackageJson(vars)],
    ["tsconfig.json", projectTsconfig()],
    ["README.md", projectReadme(vars)],
    [".gitignore", projectGitignore()],
    ["src/server.ts", serverStub(vars)],
  ];

  const written: string[] = [];
  for (const [rel, contents] of files) {
    const full = join(projectDir, rel);
    await writeFile(full, contents, "utf8");
    written.push(rel);
  }

  return { projectDir, filesWritten: written };
}
