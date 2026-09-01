#!/usr/bin/env bun

import path from "node:path";
import { appendFile, readFile } from "node:fs/promises";

const root = path.join(import.meta.dirname, "..");
const publishedPath = resolveArgument("--published");
const candidatePath = resolveArgument("--candidate");
const dataFiles = ["api.json", "models.json", "catalog.json"] as const;

const published = await readManifest(publishedPath);
const candidate = await readManifest(candidatePath);

const changed = dataFiles.some(
  (name) =>
    published.files[name]?.sha256 !== candidate.files[name]?.sha256 ||
    published.files[name]?.size !== candidate.files[name]?.size,
);
const version = changed ? incrementPatch(published.version) : published.version;
const result = {
  changed,
  latest: published.version,
  version,
};

if (process.env.GITHUB_OUTPUT !== undefined) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `changed=${changed}\nlatest=${published.version}\nversion=${version}\n`,
  );
}

console.log(JSON.stringify(result));

type Manifest = {
  version: string;
  files: Record<string, { sha256: string; size: number }>;
};

async function readManifest(file: string): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(file, "utf8")) as Partial<Manifest>;
  if (typeof manifest.version !== "string" || manifest.files === undefined) {
    throw new Error(`Invalid data manifest: ${file}`);
  }
  for (const name of dataFiles) {
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
  return manifest as Manifest;
}

function incrementPatch(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new Error(`Automatic publishing requires a stable SemVer version, received: ${version}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function resolveArgument(name: string) {
  const index = Bun.argv.indexOf(name);
  const value = index === -1 ? undefined : Bun.argv[index + 1];
  if (value === undefined) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return path.resolve(root, value);
}
