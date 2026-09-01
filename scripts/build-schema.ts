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
inlineDeepReferences(generated);

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

function inlineDeepReferences(root: Record<string, unknown>): void {
  visit(root);

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;

    const node = value as Record<string, unknown>;
    const reference = node.$ref;
    if (
      typeof reference === "string" &&
      reference.startsWith("#/definitions/") &&
      reference.slice("#/definitions/".length).includes("/")
    ) {
      const target = resolveLocalReference(root, reference);
      const siblings = Object.fromEntries(
        Object.entries(node).filter(([key]) => key !== "$ref"),
      );
      for (const key of Object.keys(node)) delete node[key];
      Object.assign(node, structuredClone(target), siblings);
    }

    for (const child of Object.values(node)) visit(child);
  }
}

function resolveLocalReference(
  root: Record<string, unknown>,
  reference: string,
): Record<string, unknown> {
  let value: unknown = root;
  for (const encoded of reference.slice(2).split("/")) {
    if (value === null || typeof value !== "object") {
      throw new Error(`Cannot resolve JSON Schema reference: ${reference}`);
    }
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`JSON Schema reference is not an object: ${reference}`);
  }
  return value as Record<string, unknown>;
}
