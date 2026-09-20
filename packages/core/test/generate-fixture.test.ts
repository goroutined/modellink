import { describe, expect, test } from "bun:test";
import { generateCatalog } from "../src/generate.js";
import { canonical, provider, withCatalogFixture } from "./fixtures.js";

const modelPath = "providers/example/models/vendor/call.toml";
const reference = 'base_model = "example/model"\n';

describe("catalog generation with independent fixtures", () => {
  test("derives IDs from paths, deep-merges objects and replaces arrays without mutating canonical data", async () => {
    await withCatalogFixture({
      [modelPath]: reference + `
name = "Provider Model"
temperature = false
[limit]
output = 1024
[modalities]
input = ["text"]
[cost_cn]
input = 2
output = 4
`,
    }, async (root) => {
      const catalog = await generateCatalog(root);
      const base = catalog.models["example/model"]!;
      const result = catalog.providers.example!.models["vendor/call"]!;
      expect(base.id).toBe("example/model");
      expect(catalog.providers.example!.id).toBe("example");
      expect(result.id).toBe("vendor/call");
      expect(result.name).toBe("Provider Model");
      expect(result.limit).toEqual({ context: 8192, input: 6144, output: 1024 });
      expect(result.modalities).toEqual({ input: ["text"], output: ["text"] });
      expect(result.temperature).toBe(false);
      expect(result.cost_cn).toEqual({ input: 2, output: 4 });
      expect(result.endpoints).toBeUndefined(); // Default only, not all provider endpoints.
      expect(base.name).toBe("Example Model");
      expect(base.temperature).toBe(true);
      expect(base.limit?.output).toBe(2048);
      expect(base.modalities?.input).toEqual(["text", "image"]);
      expect(base.weights).toBeDefined();
      for (const field of ["base_model", "base_model_omit", "license", "links", "weights", "benchmarks"]) {
        expect(result).not.toHaveProperty(field);
      }
    });
  });

  test("omits unknown optional fields and prunes empty nested objects", async () => {
    await withCatalogFixture({
      [modelPath]: reference + `
base_model_omit = ["temperature", "limit.input", "interleaved.field", "cost_cn.cache_read", "absent.field"]
[interleaved]
field = "reasoning_content"
[cost_cn]
cache_read = 1
`,
    }, async (root) => {
      const result = (await generateCatalog(root)).providers.example!.models["vendor/call"]!;
      expect(result.temperature).toBeUndefined();
      expect(result.limit).toEqual({ context: 8192, output: 2048 });
      expect(result.interleaved).toBeUndefined();
      expect(result.cost_cn).toBeUndefined();
      expect(result.structured_output).toBe(false); // False is not missing.
    });
  });

  test("rejects unresolved canonical references and omissions of required fields", async () => {
    for (const input of ['base_model = "missing/model"', reference + 'base_model_omit = ["limit.context"]']) {
      await withCatalogFixture({ [modelPath]: input }, async (root) => {
        await expect(generateCatalog(root)).rejects.toThrow();
      });
    }
  });

  test("accepts standalone provider models without a canonical reference", async () => {
    const standalone = canonical
      .replace('license = "MIT"', "")
      .replace('links = [{ url = "https://example.com/model-card", type = "model_card" }]', "")
      .replace('weights = [{ url = "https://example.com/weights" }]', "")
      .replace('benchmarks = [{ name = "Example benchmark", score = 1 }]', "");
    await withCatalogFixture({ [modelPath]: standalone }, async (root) => {
      expect((await generateCatalog(root)).providers.example!.models["vendor/call"]!.id).toBe("vendor/call");
    });
  });

  test("validates model and reasoning endpoint references, including default-only access", async () => {
    const option = (endpoint: string) => `
[[reasoning_options]]
type = "toggle"
field = "thinking.type"
endpoints = ["${endpoint}"]
`;
    for (const input of [
      reference + 'endpoints = ["missing"]',
      reference + option("missing"),
      reference + option("anthropic"),
    ]) {
      await withCatalogFixture({ [modelPath]: input }, async (root) => {
        await expect(generateCatalog(root)).rejects.toThrow();
      });
    }
    for (const input of [
      reference + option("openai"),
      reference + 'endpoints = ["anthropic"]\n' + option("anthropic"),
    ]) {
      await withCatalogFixture({ [modelPath]: input }, async (root) => {
        expect((await generateCatalog(root)).providers.example!.models["vendor/call"]!.reasoning_options).toHaveLength(1);
      });
    }
    await withCatalogFixture({
      "providers/example/provider.toml": provider.split("[[endpoints]]")[0]!,
      [modelPath]: reference + 'endpoints = ["openai"]',
    }, async (root) => {
      await expect(generateCatalog(root)).rejects.toThrow("does not");
    });
  });

  test("rejects duplicate provider names regardless of case", async () => {
    await withCatalogFixture({
      "providers/other/provider.toml": provider.replace("Example Provider", "EXAMPLE PROVIDER"),
    }, async (root) => {
      await expect(generateCatalog(root)).rejects.toThrow("Duplicate provider name");
    });
  });

  test("normalizes authored default selectors and legacy USD tiers, but preserves CNY tiers", async () => {
    await withCatalogFixture({ [modelPath]: reference + `
[cost]
input = 1
output = 3
[[cost.tiers]]
input = 2
output = 6
[cost.tiers.when]
size = 200000
[cost_cn]
input = 2
output = 6
[[cost_cn.tiers]]
input = 3
output = 9
[cost_cn.tiers.when]
size = 200000
` }, async (root) => {
      const result = (await generateCatalog(root)).providers.example!.models["vendor/call"]!;
      expect(result.cost?.tiers?.[0]?.when).toEqual({ type: "context", size: 200000 });
      expect(result.cost?.context_over_200k).toEqual({ input: 2, output: 6 });
      expect(result.cost_cn).not.toHaveProperty("context_over_200k");
      expect(result.cost_cn?.tiers?.[0]?.when).toEqual({ type: "context", size: 200000 });
    });
  });
});
