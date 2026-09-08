import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Fictional, fixed inputs: tests exercise generator behavior, not live inventory.
export const canonical = `
name = "Example Model"
description = "Synthetic test model"
attachment = true
reasoning = true
temperature = true
tool_call = true
structured_output = false
release_date = "2026-01-01"
last_updated = "2026-01-01"
open_weights = true
license = "MIT"
links = [{ url = "https://example.com/model-card", type = "model_card" }]
weights = [{ url = "https://example.com/weights" }]
benchmarks = [{ name = "Example benchmark", score = 1 }]

[limit]
context = 8192
input = 6144
output = 2048

[modalities]
input = ["text", "image"]
output = ["text"]
`;

export const provider = `
name = "Example Provider"
env = ["EXAMPLE_KEY"]
npm = "@ai-sdk/openai-compatible"
protocol = "openai-compatible"
api = "https://example.com/v1"
doc = "https://example.com/docs"

[[endpoints]]
id = "openai"
protocol = "openai-compatible"
api = "https://example.com/v1"
default = true

[[endpoints]]
id = "anthropic"
protocol = "anthropic-compatible"
api = "https://example.com/anthropic"
`;

export async function withCatalogFixture<T>(
  overrides: Record<string, string>,
  run: (root: string) => Promise<T>,
): Promise<T> {
  // Unique paths also avoid Bun's TOML import cache across test cases.
  const root = await mkdtemp(path.join(os.tmpdir(), "modellink-fixture-"));
  try {
    const files = {
      "models/example/model.toml": canonical,
      "providers/example/provider.toml": provider,
      "providers/example/models/vendor/call.toml": 'base_model = "example/model"',
      ...overrides,
    };
    for (const [relative, content] of Object.entries(files)) {
      const file = path.join(root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
