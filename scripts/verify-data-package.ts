#!/usr/bin/env bun

import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const root = path.join(import.meta.dirname, "..");
const directory = path.resolve(root, readArgument("--directory") ?? ".artifacts/npm");
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as {
  version: string;
  files: Record<string, { sha256: string; size: number }>;
};
const packageJSON = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

if (packageJSON.name !== "@modellink/data") {
  throw new Error(`Unexpected package name: ${packageJSON.name}`);
}
if (packageJSON.version !== manifest.version) {
  throw new Error(`Package version ${packageJSON.version} does not match manifest ${manifest.version}`);
}

const expectedDataFiles = ["api.json", "catalog.json", "models.json"];
if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expectedDataFiles)) {
  throw new Error("Manifest must describe exactly api.json, catalog.json and models.json");
}

for (const [name, expected] of Object.entries(manifest.files)) {
  const contents = await readFile(path.join(directory, name));
  JSON.parse(contents.toString("utf8"));
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (sha256 !== expected.sha256) {
    throw new Error(`${name} SHA-256 mismatch: ${sha256} != ${expected.sha256}`);
  }
  if (contents.byteLength !== expected.size) {
    throw new Error(`${name} size mismatch: ${contents.byteLength} != ${expected.size}`);
  }
}

const allowed = new Set([
  "LICENSE",
  "README.md",
  "api.json",
  "catalog.json",
  "manifest.json",
  "models.json",
  "package.json",
]);
const unexpected = (await readdir(directory)).filter((name) => !allowed.has(name));
if (unexpected.length > 0) {
  throw new Error(`Unexpected package files: ${unexpected.join(", ")}`);
}

console.log(`Verified @modellink/data ${manifest.version}`);

function readArgument(name: string) {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}
