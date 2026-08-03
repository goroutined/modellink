#!/usr/bin/env bun

import path from "node:path";
import { ZodError } from "zod";

import { generateCatalog } from "../src/generate.js";

try {
  const catalog = await generateCatalog(path.join(import.meta.dirname, "..", "..", ".."));
  const modelCount = Object.keys(catalog.models).length;
  const providerCount = Object.keys(catalog.providers).length;
  const offeringCount = Object.values(catalog.providers)
    .reduce((sum, provider) => sum + Object.keys(provider.models).length, 0);
  console.log(`Valid: ${modelCount} models, ${providerCount} providers, ${offeringCount} offerings`);
} catch (error) {
  if (error instanceof ZodError) {
    console.error("Validation error:", error.errors);
    console.error("When parsing:", error.cause);
    process.exit(1);
  }
  throw error;
}
