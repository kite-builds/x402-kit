import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deploy,
  deriveAppName,
  validateAppName,
  dockerfileContents,
  flyTomlContents,
} from "../dist/index.js";

async function makeTmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "x402-kit-deploy-"));
}

const minimalYaml = `payTo: "0x0000000000000000000000000000000000000000"
network: base-sepolia
routes:
  "GET /hello":
    price: "0.01"
`;

test("deploy writes Dockerfile, fly.toml, and .dockerignore", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), minimalYaml, "utf8");
    const result = await deploy({ cwd, appName: "kite-test" });
    assert.deepEqual(result.filesWritten.sort(), [".dockerignore", "Dockerfile", "fly.toml"]);
    assert.equal(result.appName, "kite-test");
    assert.equal(result.region, "ams");
    assert.equal(result.launched, false);

    for (const f of ["Dockerfile", "fly.toml", ".dockerignore"]) {
      const s = await stat(join(cwd, f));
      assert.ok(s.isFile());
    }

    const fly = await readFile(join(cwd, "fly.toml"), "utf8");
    assert.match(fly, /^app = "kite-test"$/m);
    assert.match(fly, /primary_region = "ams"/);
    assert.match(fly, /internal_port = 3402/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy fails with a clear error if x402-kit.yaml is missing", async () => {
  const cwd = await makeTmp();
  try {
    await assert.rejects(
      () => deploy({ cwd, appName: "kite-test" }),
      /config file not found/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy refuses to overwrite existing files unless --force", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), minimalYaml, "utf8");
    await writeFile(join(cwd, "Dockerfile"), "# user customised", "utf8");
    const r1 = await deploy({ cwd, appName: "kite-test" });
    assert.ok(r1.filesSkipped.includes("Dockerfile"));
    const dock = await readFile(join(cwd, "Dockerfile"), "utf8");
    assert.equal(dock, "# user customised");

    const r2 = await deploy({ cwd, appName: "kite-test", force: true });
    assert.ok(r2.filesWritten.includes("Dockerfile"));
    const dock2 = await readFile(join(cwd, "Dockerfile"), "utf8");
    assert.notEqual(dock2, "# user customised");
    assert.match(dock2, /node:22-bookworm-slim/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy rejects unsupported providers", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), minimalYaml, "utf8");
    await assert.rejects(
      () => deploy({ cwd, provider: "render" as never, appName: "kite-test" }),
      /unsupported provider/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy rejects invalid app names", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), minimalYaml, "utf8");
    await assert.rejects(
      () => deploy({ cwd, appName: "Bad Name" }),
      /invalid Fly app name/,
    );
    await assert.rejects(
      () => deploy({ cwd, appName: "-leading-dash" }),
      /invalid Fly app name/,
    );
    await assert.rejects(
      () => deploy({ cwd, appName: "x".repeat(31) }),
      /invalid Fly app name/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy rejects malformed yaml with a useful error", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), "{ [unclosed: oops\n  - mismatched", "utf8");
    await assert.rejects(
      () => deploy({ cwd, appName: "kite-test" }),
      /failed to parse|did not parse/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy uses --config-file override", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "prod.yaml"), minimalYaml, "utf8");
    const result = await deploy({
      cwd,
      appName: "kite-test",
      configFile: "prod.yaml",
    });
    assert.equal(result.appName, "kite-test");
    assert.ok(result.filesWritten.includes("fly.toml"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deploy emits flyctl next-steps when --launch is not set", async () => {
  const cwd = await makeTmp();
  try {
    await writeFile(join(cwd, "x402-kit.yaml"), minimalYaml, "utf8");
    const result = await deploy({ cwd, appName: "kite-test" });
    const joined = result.nextSteps.join("\n");
    assert.match(joined, /flyctl auth login/);
    assert.match(joined, /flyctl launch.*--name kite-test.*--region ams/);
    assert.match(joined, /flyctl deploy/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("deriveAppName slugifies the directory base name", () => {
  assert.equal(deriveAppName("/tmp/My Paywall"), "my-paywall");
  assert.equal(deriveAppName("/tmp/foo_bar"), "foo-bar");
  assert.equal(deriveAppName("/tmp/abc123"), "abc123");
  assert.throws(() => deriveAppName("/tmp/____"));
});

test("validateAppName matches Fly's rules", () => {
  validateAppName("kite-test");
  validateAppName("a");
  validateAppName("123");
  validateAppName("a".repeat(30));
  assert.throws(() => validateAppName(""));
  assert.throws(() => validateAppName("Bad"));
  assert.throws(() => validateAppName("a".repeat(31)));
  assert.throws(() => validateAppName("-foo"));
  assert.throws(() => validateAppName("foo bar"));
});

test("dockerfileContents and flyTomlContents are stable for a given input", () => {
  assert.equal(dockerfileContents(), dockerfileContents());
  assert.equal(flyTomlContents("a", "ams"), flyTomlContents("a", "ams"));
  assert.notEqual(flyTomlContents("a", "ams"), flyTomlContents("b", "ams"));
  assert.notEqual(flyTomlContents("a", "ams"), flyTomlContents("a", "fra"));
});
