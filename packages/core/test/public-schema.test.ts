import { describe, expect, test } from "bun:test";
import path from "node:path";

import Ajv from "ajv";
import addFormats from "ajv-formats";

import { generateCatalog } from "../src/generate.js";
import { withCatalogFixture } from "./fixtures.js";

const root = path.join(import.meta.dirname, "../../..");

describe("public JSON Schema", () => {
  test("validates every published JSON shape", async () => {
    const schema = await Bun.file(path.join(root, "schema.json")).json();
    const catalog = await generateCatalog(root);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(schema);

    expect(validate(ajv, schema.$id, catalog)).toBe(true);
    expect(validate(ajv, `${schema.$id}#/definitions/Models`, catalog.models)).toBe(true);
    expect(validate(ajv, `${schema.$id}#/definitions/Providers`, catalog.providers)).toBe(true);
    expect(
      validate(ajv, `${schema.$id}#/definitions/Manifest`, {
        version: "0.1.0",
        schema_version: 3,
        generated_at: "2026-09-01T00:00:00.000Z",
        source: {
          repository: "https://github.com/goroutined/modellink",
          revision: "0123456789abcdef",
        },
        files: Object.fromEntries(
          ["api.json", "models.json", "catalog.json", "schema.json"].map((name) => [
            name,
            { sha256: "0".repeat(64), size: 0 },
          ]),
        ),
      }),
    ).toBe(true);
  });

  test("rejects wire-shape violations that affect generated clients", async () => {
    const schema = await Bun.file(path.join(root, "schema.json")).json();
    const catalog = await withCatalogFixture({}, generateCatalog);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(schema);

    const unknownProtocol = structuredClone(catalog) as any;
    firstProvider(unknownProtocol).protocol = "unknown-protocol";
    expect(isValid(ajv, schema.$id, unknownProtocol)).toBe(false);

    const fractionalLimit = structuredClone(catalog) as any;
    firstModel(firstProvider(fractionalLimit)).limit.context = 1.5;
    expect(isValid(ajv, schema.$id, fractionalLimit)).toBe(false);

    const unknownModality = structuredClone(catalog) as any;
    firstModel(firstProvider(unknownModality)).modalities.input = ["binary"];
    expect(isValid(ajv, schema.$id, unknownModality)).toBe(false);

    const malformedReasoningOption = structuredClone(catalog) as any;
    firstModel(firstProvider(malformedReasoningOption)).reasoning_options = [
      { type: "effort" },
    ];
    expect(isValid(ajv, schema.$id, malformedReasoningOption)).toBe(false);

    const missingRequiredField = structuredClone(catalog) as any;
    delete firstModel(firstProvider(missingRequiredField)).name;
    expect(isValid(ajv, schema.$id, missingRequiredField)).toBe(false);

    const optionalFieldsMissing = structuredClone(firstModel(firstProvider(catalog))) as any;
    for (const field of [
      "reasoning",
      "reasoning_options",
      "tool_call",
      "structured_output",
      "temperature",
      "knowledge",
      "doc",
      "endpoints",
      "cost",
      "cost_cn",
      "cost_points",
    ]) {
      delete optionalFieldsMissing[field];
    }
    expect(
      isValid(ajv, `${schema.$id}#/definitions/ProviderModel`, optionalFieldsMissing),
    ).toBe(true);

    optionalFieldsMissing.reasoning = false;
    expect(
      isValid(ajv, `${schema.$id}#/definitions/ProviderModel`, optionalFieldsMissing),
    ).toBe(true);
  });

  test("describes stable published output for generated clients", async () => {
    const schema = await Bun.file(path.join(root, "schema.json")).json() as any;
    const definitions = schema.definitions as Record<string, any>;

    expect(schema["x-modellink-schema-version"]).toBe(3);

    for (const name of ["Protocol", "ProviderEndpoint", "ProviderLinks", "ReasoningOption"]) {
      expect(definitions[name]).toBeDefined();
    }

    expect(definitions.ProviderLinks.properties).toEqual({
      models: expect.objectContaining({ type: "string", format: "uri" }),
      pricing: expect.objectContaining({ type: "string", format: "uri" }),
      api_key: expect.objectContaining({ type: "string", format: "uri" }),
      console: expect.objectContaining({ type: "string", format: "uri" }),
    });

    const references = collectObjects(
      schema,
      (value) => typeof value.$ref === "string",
    ).map((value) => value.$ref as string);
    for (const reference of references) {
      expect(reference).toMatch(/^#\/definitions\/[^/]+$/);
    }

    expect(definitions.Models.type).toBe("object");
    expect(definitions.Models.additionalProperties.$ref).toBe(
      "#/definitions/ModelMetadata",
    );
    expect(definitions.Providers.type).toBe("object");
    expect(definitions.Providers.additionalProperties.$ref).toBe(
      "#/definitions/Provider",
    );

    const contextTiers = collectObjects(
      schema,
      (value) => value.properties?.type?.const === "context",
    );
    expect(contextTiers.length).toBeGreaterThan(0);
    for (const tier of contextTiers) {
      expect(tier.required).toContain("type");
      expect(tier.properties.type.default).toBeUndefined();
    }

    const budget = definitions.ReasoningOption.anyOf.find(
      (option: any) => option.properties?.type?.const === "budget_tokens",
    );
    expect(budget.properties.min.type).toBe("integer");
    expect(budget.properties.max.type).toBe("integer");

    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(schema);
    for (const name of Object.keys(definitions)) {
      expect(() =>
        ajv.compile({ $ref: `${schema.$id}#/definitions/${name}` }),
      ).not.toThrow();
    }
    const reasoningOption = `${schema.$id}#/definitions/ReasoningOption`;
    expect(isValid(ajv, reasoningOption, { type: "toggle" })).toBe(true);
    expect(
      isValid(ajv, reasoningOption, {
        type: "effort",
        values: [null, "low", "high"],
      }),
    ).toBe(true);
    expect(
      isValid(ajv, reasoningOption, {
        type: "budget_tokens",
        min: -1,
        max: 4096,
      }),
    ).toBe(true);
    expect(
      isValid(ajv, reasoningOption, {
        type: "effort",
        values: ["null", "high"],
      }),
    ).toBe(false);
  });
});

function validate(ajv: Ajv, reference: string, value: unknown) {
  const validator = ajv.compile({ $ref: reference });
  const valid = validator(value);
  if (!valid) {
    throw new Error(ajv.errorsText(validator.errors, { separator: "\n" }));
  }
  return true;
}

function isValid(ajv: Ajv, reference: string, value: unknown) {
  return ajv.compile({ $ref: reference })(value) === true;
}

function firstProvider(catalog: any) {
  return Object.values(catalog.providers)[0] as any;
}

function firstModel(provider: any) {
  return Object.values(provider.models)[0] as any;
}

function collectObjects(
  value: unknown,
  predicate: (value: Record<string, any>) => boolean,
  result: Record<string, any>[] = [],
) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, predicate, result);
    return result;
  }
  if (value === null || typeof value !== "object") return result;

  const object = value as Record<string, any>;
  if (predicate(object)) result.push(object);
  for (const child of Object.values(object)) {
    collectObjects(child, predicate, result);
  }
  return result;
}
