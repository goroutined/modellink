import { z } from "zod";

import {
  Model,
  ModelMetadata,
  Protocol,
  Provider,
  ProviderEndpoint,
  ReasoningOption,
} from "./schema.js";

export const SCHEMA_VERSION = 1;

export const Models = z.record(ModelMetadata);
export const Providers = z.record(Provider);

export const Catalog = z
  .object({
    models: Models,
    providers: Providers,
  })
  .strict();

export const ManifestFile = z
  .object({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().min(0),
  })
  .strict();

export const Manifest = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string().datetime(),
    source: z
      .object({
        repository: z.string().url(),
        revision: z.string().min(1),
      })
      .strict(),
    files: z
      .object({
        "api.json": ManifestFile,
        "models.json": ManifestFile,
        "catalog.json": ManifestFile,
        "schema.json": ManifestFile,
      })
      .strict(),
  })
  .strict();

export const PublicSchemas = {
  ModelMetadata,
  Protocol,
  ProviderEndpoint,
  ReasoningOption,
  ProviderModel: Model,
  Provider,
  Models,
  Providers,
  Catalog,
  ManifestFile,
  Manifest,
};

export type Catalog = z.infer<typeof Catalog>;
export type Manifest = z.infer<typeof Manifest>;
