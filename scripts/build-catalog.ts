#!/usr/bin/env bun

import path from "node:path";
import { mkdir } from "node:fs/promises";

import { generateCatalog } from "../packages/core/src/generate.js";

function sortRecord<T>(record: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, T>;
}

const root = path.join(import.meta.dirname, "..");
const generated = await generateCatalog(root);
const providers = sortRecord(
  Object.fromEntries(
    Object.entries(generated.providers).map(([id, provider]) => [
      id,
      { ...provider, models: sortRecord(provider.models) },
    ]),
  ),
);
const models = sortRecord(generated.models);
const catalog = { models, providers };
const modelProviders: Record<string, Array<{ provider_id: string; model_id: string }>> = {};
const labs: Record<string, { id: string; name: string; description?: string }> = {};

for await (const labPath of new Bun.Glob("*/lab.toml").scan({
  cwd: path.join(root, "labs"),
  absolute: true,
})) {
  const id = path.basename(path.dirname(labPath));
  const authored = Bun.TOML.parse(await Bun.file(labPath).text()) as {
    name?: string;
    description?: string;
  };
  labs[id] = {
    id,
    name: authored.name ?? id,
    ...(authored.description === undefined ? {} : { description: authored.description }),
  };
}

for await (const modelPath of new Bun.Glob("*/models/**/*.toml").scan({
  cwd: path.join(root, "providers"),
  absolute: true,
})) {
  const relative = path.relative(path.join(root, "providers"), modelPath).split(path.sep);
  const providerID = relative[0];
  if (providerID === undefined) continue;
  const modelID = relative.slice(2).join("/").slice(0, -5);
  const authored = await Bun.file(modelPath).text();
  const baseModel = /^base_model\s*=\s*"([^"]+)"/m.exec(authored)?.[1];
  if (baseModel === undefined) continue;
  (modelProviders[baseModel] ??= []).push({ provider_id: providerID, model_id: modelID });
}

for (const offerings of Object.values(modelProviders)) {
  offerings.sort((left, right) =>
    left.provider_id.localeCompare(right.provider_id) || left.model_id.localeCompare(right.model_id));
}

await Bun.write(path.join(root, "docs", "api.json"), JSON.stringify(providers, null, 2) + "\n");
await Bun.write(path.join(root, "docs", "models.json"), JSON.stringify(models, null, 2) + "\n");
await Bun.write(path.join(root, "docs", "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
const siteData = { labs: sortRecord(labs), model_providers: sortRecord(modelProviders) };
await Bun.write(path.join(root, "docs", "site-data.json"), JSON.stringify(siteData, null, 2) + "\n");
await Bun.write(
  path.join(root, "docs", "data.js"),
  `globalThis.MODELLINK_SITE = ${JSON.stringify({ catalog, siteData })};\n`,
);

await mkdir(path.join(root, "docs", "logos", "labs"), { recursive: true });
for await (const logoPath of new Bun.Glob("*/logo.svg").scan({
  cwd: path.join(root, "labs"),
  absolute: true,
})) {
  const labID = path.basename(path.dirname(logoPath));
  await Bun.write(path.join(root, "docs", "logos", "labs", `${labID}.svg`), Bun.file(logoPath));
}

for await (const logoPath of new Bun.Glob("*/logo.svg").scan({
  cwd: path.join(root, "providers"),
  absolute: true,
})) {
  const providerID = path.basename(path.dirname(logoPath));
  await Bun.write(path.join(root, "docs", "logos", `${providerID}.svg`), Bun.file(logoPath));
}

console.log(
  `Built ${Object.keys(models).length} models and ${Object.keys(providers).length} providers`,
);
