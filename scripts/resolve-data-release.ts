#!/usr/bin/env bun

import path from "node:path";
import { appendFile, readFile } from "node:fs/promises";

const root = path.join(import.meta.dirname, "..");
const requiredDataFiles = ["api.json", "models.json", "catalog.json"] as const;
const releaseFiles = [...requiredDataFiles, "schema.json"] as const;

if (import.meta.main) {
  await main();
}

async function main() {
  const publishedPath = resolveArgument("--published");
  const candidatePath = resolveArgument("--candidate");
  const policyPath = path.join(root, "packages", "data", "release.json");
  const published = await readManifest(publishedPath, false);
  const candidate = await readManifest(candidatePath, true);
  const minimumVersion = await readMinimumVersion(policyPath);
  const result = resolveRelease(published, candidate, minimumVersion);

  if (process.env.GITHUB_OUTPUT !== undefined) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${result.changed}\nlatest=${result.latest}\nversion=${result.version}\n`,
    );
  }

  console.log(JSON.stringify(result));
}

type Manifest = {
  version: string;
  files: Record<string, { sha256: string; size: number }>;
};

export function resolveRelease(
  published: Manifest,
  candidate: Manifest,
  minimumVersion: string,
) {
  const dataChanged = releaseFiles.some(
    (name) =>
      published.files[name]?.sha256 !== candidate.files[name]?.sha256 ||
      published.files[name]?.size !== candidate.files[name]?.size,
  );
  const minimumRaised = compareStableVersions(minimumVersion, published.version) > 0;
  const changed = dataChanged || minimumRaised;
  const version = changed
    ? maxStableVersion(incrementPatch(published.version), minimumVersion)
    : published.version;
  return { changed, latest: published.version, version };
}

async function readMinimumVersion(file: string) {
  const policy = JSON.parse(await readFile(file, "utf8")) as {
    minimum_version?: unknown;
  };
  if (
    typeof policy.minimum_version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(policy.minimum_version)
  ) {
    throw new Error(`Invalid minimum_version in data release policy: ${file}`);
  }
  return policy.minimum_version;
}

async function readManifest(file: string, requireSchema: boolean): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(file, "utf8")) as Partial<Manifest>;
  if (typeof manifest.version !== "string" || manifest.files === undefined) {
    throw new Error(`Invalid data manifest: ${file}`);
  }
  for (const name of requiredDataFiles) {
    const entry = manifest.files[name];
    if (
      entry === undefined ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    ) {
      throw new Error(`Invalid ${name} entry in data manifest: ${file}`);
    }
  }
  const schema = manifest.files["schema.json"];
  if (
    (requireSchema || schema !== undefined) &&
    (schema === undefined ||
      !/^[0-9a-f]{64}$/.test(schema.sha256) ||
      !Number.isSafeInteger(schema.size) ||
      schema.size < 0)
  ) {
    throw new Error(`Invalid schema.json entry in data manifest: ${file}`);
  }
  return manifest as Manifest;
}

function incrementPatch(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new Error(`Automatic publishing requires a stable SemVer version, received: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function maxStableVersion(left: string, right: string) {
  return compareStableVersions(left, right) >= 0 ? left : right;
}

function compareStableVersions(left: string, right: string) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  for (const index of [0, 1, 2] as const) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function parseStableVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new Error(`Automatic publishing requires a stable SemVer version, received: ${version}`);
  }
  return [Number(match[1]!), Number(match[2]!), Number(match[3]!)];
}

function resolveArgument(name: string) {
  const index = Bun.argv.indexOf(name);
  const value = index === -1 ? undefined : Bun.argv[index + 1];
  if (value === undefined) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return path.resolve(root, value);
}
