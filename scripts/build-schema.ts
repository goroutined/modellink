#!/usr/bin/env bun

import path from "node:path";
import { readFile } from "node:fs/promises";

import { zodToJsonSchema } from "zod-to-json-schema";

import {
  Catalog,
  PublicSchemas,
  SCHEMA_VERSION,
} from "../packages/core/src/public-schema.js";

const root = path.join(import.meta.dirname, "..");
const output = path.join(root, "schema.json");
const check = Bun.argv.includes("--check");
const { Catalog: _catalogDefinition, ...definitions } = PublicSchemas;
const generated = zodToJsonSchema(Catalog, {
  name: "Catalog",
  definitions,
  definitionPath: "definitions",
  target: "jsonSchema7",
  $refStrategy: "root",
  effectStrategy: "input",
});

normalizePublishedOutput(generated);

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://goroutined.github.io/modellink/schema.json",
  title: "ModelLink Public Data Schema",
  description:
    "Public JSON contract for ModelLink catalog, provider, model and package manifest data.",
  "x-modellink-schema-version": SCHEMA_VERSION,
  ...Object.fromEntries(
    Object.entries(generated).filter(([key]) => key !== "$schema"),
  ),
};
const contents = JSON.stringify(schema, null, 2) + "\n";

if (check) {
  const current = await readFile(output, "utf8").catch(() => undefined);
  if (current !== contents) {
    throw new Error("schema.json is stale; run `bun run schema` and commit the result");
  }
  console.log(`schema.json is current (schema version ${SCHEMA_VERSION})`);
} else {
  await Bun.write(output, contents);
  console.log(`Generated schema.json (schema version ${SCHEMA_VERSION})`);
}

function normalizePublishedOutput(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) normalizePublishedOutput(item);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const node = value as Record<string, unknown>;
  const properties = node.properties;
  if (properties !== null && typeof properties === "object") {
    const type = (properties as Record<string, unknown>).type;
    if (type !== null && typeof type === "object") {
      const discriminator = type as Record<string, unknown>;
      if (
        discriminator.const === "context" &&
        discriminator.default === "context"
      ) {
        delete discriminator.default;
        const required = Array.isArray(node.required) ? node.required : [];
        if (!required.includes("type")) node.required = ["type", ...required];
      }
    }
  }

  for (const child of Object.values(node)) normalizePublishedOutput(child);
}
