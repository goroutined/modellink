import { describe, expect, test } from "bun:test";
import path from "node:path";

import { generateCatalog } from "../src/generate.js";

const root = path.join(import.meta.dirname, "..", "..", "..");

describe("catalog generation", () => {
  test("keeps canonical models separate and expands provider models", async () => {
    const catalog = await generateCatalog(root);
    const canonical = catalog.models["alibaba/qwen3-32b"];
    const offering = catalog.providers["siliconflow-cn"]?.models["Qwen/Qwen3-32B"];

    expect(canonical?.name).toBe("Qwen3 32B");
    expect(offering?.name).toBe("Qwen3 32B on SiliconFlow");
    expect(offering?.cost).toEqual({ input: 0.14, output: 0.57 });
    expect(offering).not.toHaveProperty("base_model");
    expect(offering).not.toHaveProperty("base_model_omit");
    expect(offering).not.toHaveProperty("weights");
    expect(offering).not.toHaveProperty("benchmarks");
  });

  test("catalog providers are the api payload", async () => {
    const catalog = await generateCatalog(root);
    expect(Object.keys(catalog.providers)).toEqual(["alibaba-cn", "siliconflow-cn"]);
  });
});
