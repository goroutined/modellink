#!/usr/bin/env bun

import { createHash } from "node:crypto";
import path from "node:path";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

import "./build-catalog.ts";

const root = path.join(import.meta.dirname, "..");
const output = path.join(root, ".artifacts", "npm");
const version = readArgument("--version") ?? process.env.MODELLINK_DATA_VERSION;

if (version === undefined) {
  throw new Error("Missing data package version. Pass --version <semver>.");
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid data package version: ${version}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const dataFiles = ["api.json", "models.json", "catalog.json"] as const;
const files: Record<string, { sha256: string; size: number }> = {};

for (const name of dataFiles) {
  const source = path.join(root, "docs", name);
  const target = path.join(output, name);
  await copyFile(source, target);
  const contents = await readFile(target);
  files[name] = {
    sha256: createHash("sha256").update(contents).digest("hex"),
    size: contents.byteLength,
  };
}

const revision = process.env.GITHUB_SHA ?? readGitRevision();
const manifest = {
  version,
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: {
    repository: "https://github.com/goroutined/modellink",
    revision,
  },
  files,
};

await Bun.write(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await copyFile(path.join(root, "packages", "data", "README.md"), path.join(output, "README.md"));
await copyFile(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
await Bun.write(
  path.join(output, "package.json"),
  JSON.stringify(
    {
      name: "@modellink/data",
      version,
      description: "中国 AI 模型与推理服务商的版本化 JSON 数据目录",
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/goroutined/modellink.git",
      },
      homepage: "https://goroutined.github.io/modellink/",
      keywords: ["ai", "models", "llm", "china", "catalog", "models.dev"],
      files: ["api.json", "models.json", "catalog.json", "manifest.json", "README.md", "LICENSE"],
      exports: {
        "./api.json": "./api.json",
        "./models.json": "./models.json",
        "./catalog.json": "./catalog.json",
        "./manifest.json": "./manifest.json",
        "./package.json": "./package.json",
      },
      publishConfig: {
        access: "public",
      },
    },
    null,
    2,
  ) + "\n",
);

console.log(`Built @modellink/data ${version} in ${path.relative(root, output)}`);

function readArgument(name: string) {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

function readGitRevision() {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) return "unknown";
  return new TextDecoder().decode(result.stdout).trim();
}
