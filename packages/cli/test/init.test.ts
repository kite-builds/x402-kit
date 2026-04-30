import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { init, validateProjectName } from "../dist/index.js";

async function makeTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "x402-kit-cli-"));
}

test("init scaffolds a complete project tree", async () => {
  const cwd = await makeTmp();
  try {
    const result = await init({ name: "my-paywall", cwd });
    assert.equal(result.projectDir, join(cwd, "my-paywall"));

    const expectFiles = [
      "x402-kit.yaml",
      "package.json",
      "tsconfig.json",
      "README.md",
      ".gitignore",
      "src/server.ts",
    ];
    for (const f of expectFiles) {
      assert.ok(
        result.filesWritten.includes(f),
        `expected ${f} in filesWritten`,
      );
      const s = await stat(join(result.projectDir, f));
      assert.ok(s.isFile(), `${f} should be a file`);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init produces a valid x402-kit.yaml that parses and contains the route", async () => {
  const cwd = await makeTmp();
  try {
    const result = await init({
      name: "yaml-check",
      cwd,
      payTo: "0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf",
      network: "base",
      facilitatorUrl: "https://facilitator.x402.org",
    });
    const yamlText = await readFile(
      join(result.projectDir, "x402-kit.yaml"),
      "utf8",
    );
    const parsed = YAML.parse(yamlText) as {
      payTo: string;
      network: string;
      facilitatorUrl: string;
      dbPath: string;
      routes: Record<string, { price: string }>;
    };
    assert.equal(parsed.payTo, "0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf");
    assert.equal(parsed.network, "base");
    assert.equal(parsed.facilitatorUrl, "https://facilitator.x402.org");
    assert.equal(parsed.dbPath, "./yaml-check.db");
    assert.ok(parsed.routes["GET /hello"], "expected GET /hello route");
    assert.equal(parsed.routes["GET /hello"].price, "0.01");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init produces a valid package.json with x402-kit dependency", async () => {
  const cwd = await makeTmp();
  try {
    const result = await init({ name: "pkg-check", cwd });
    const pkgText = await readFile(
      join(result.projectDir, "package.json"),
      "utf8",
    );
    const pkg = JSON.parse(pkgText) as {
      name: string;
      dependencies: Record<string, string>;
      type: string;
    };
    assert.equal(pkg.name, "pkg-check");
    assert.equal(pkg.type, "module");
    assert.ok(pkg.dependencies["x402-kit"], "x402-kit must be a dependency");
    assert.ok(pkg.dependencies["express"], "express must be a dependency");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init refuses to overwrite a non-empty directory without force", async () => {
  const cwd = await makeTmp();
  try {
    const target = join(cwd, "occupied");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "existing.txt"), "do not touch", "utf8");

    await assert.rejects(
      () => init({ name: "occupied", cwd }),
      /already exists and is not empty/,
    );

    const existing = await readFile(join(target, "existing.txt"), "utf8");
    assert.equal(existing, "do not touch");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init rejects invalid project names", async () => {
  await assert.rejects(() => init({ name: "Bad Name" }), /invalid project name/);
  await assert.rejects(() => init({ name: "" }), /project name is required/);
  await assert.rejects(() => init({ name: "../escape" }), /invalid project name/);
});

test("validateProjectName accepts npm-style names", () => {
  validateProjectName("foo");
  validateProjectName("foo-bar");
  validateProjectName("foo_bar");
  validateProjectName("foo.bar");
  validateProjectName("foo123");
  assert.throws(() => validateProjectName("Foo"));
  assert.throws(() => validateProjectName("-foo"));
  assert.throws(() => validateProjectName(".foo"));
  assert.throws(() => validateProjectName("a/b"));
});

test("server stub references the x402-kit package and the project name", async () => {
  const cwd = await makeTmp();
  try {
    const result = await init({ name: "stub-check", cwd });
    const stub = await readFile(
      join(result.projectDir, "src", "server.ts"),
      "utf8",
    );
    assert.match(stub, /from "x402-kit"/);
    assert.match(stub, /stub-check listening/);
    assert.match(stub, /x402-kit\.yaml/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
