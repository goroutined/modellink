import { describe, expect, test } from "bun:test";
import path from "node:path";

import { generateCatalog } from "../src/generate.js";
import { CostTierSelector, Provider } from "../src/schema.js";

const root = path.join(import.meta.dirname, "..", "..", "..");

describe("catalog generation", () => {
  test("accepts timezone-aware daily price windows", () => {
    expect(
      CostTierSelector.parse({
        type: "conditional",
        time: {
          timezone: "Asia/Shanghai",
          windows: [
            { start: "00:30", end: "08:30" },
            { start: "18:00", end: "00:00" },
          ],
        },
      }),
    ).toEqual({
      type: "conditional",
      time: {
        timezone: "Asia/Shanghai",
        windows: [
          { start: "00:30", end: "08:30" },
          { start: "18:00", end: "00:00" },
        ],
      },
    });
  });

  test("accepts explicit inclusive and exclusive token boundaries", () => {
    expect(
      CostTierSelector.parse({
        type: "conditional",
        input: { lte: 512_000 },
      }),
    ).toEqual({ type: "conditional", input: { lte: 512_000 } });
    expect(
      CostTierSelector.parse({
        type: "conditional",
        input: { gt: 512_000 },
      }),
    ).toEqual({ type: "conditional", input: { gt: 512_000 } });
    expect(() =>
      CostTierSelector.parse({
        type: "conditional",
        input: { gt: 512_000, gte: 512_001 },
      }),
    ).toThrow();
    expect(() =>
      CostTierSelector.parse({
        type: "conditional",
        input: { lt: 512_000, lte: 512_000 },
      }),
    ).toThrow();
  });

  test("validates provider endpoints against the legacy default", () => {
    const provider = {
      id: "example",
      name: "Example",
      env: ["EXAMPLE_API_KEY"],
      npm: "@ai-sdk/openai-compatible",
      protocol: "openai-compatible",
      api: "https://api.example.com/v1",
      doc: "https://docs.example.com/models",
      models: {},
      endpoints: [
        {
          id: "openai",
          protocol: "openai-compatible",
          api: "https://api.example.com/v1",
          default: true,
        },
        {
          id: "anthropic",
          protocol: "anthropic-compatible",
          api: "https://api.example.com/anthropic",
        },
      ],
    } as const;

    expect(Provider.parse(provider).endpoints).toHaveLength(2);
    expect(() =>
      Provider.parse({
        ...provider,
        endpoints: provider.endpoints.map((endpoint) => ({
          ...endpoint,
          default: undefined,
        })),
      }),
    ).toThrow();
    expect(() =>
      Provider.parse({
        ...provider,
        api: "https://api.example.com/other",
      }),
    ).toThrow();
  });

  test("keeps canonical models separate and expands provider models", async () => {
    const catalog = await generateCatalog(root);
    const canonical = catalog.models["alibaba/qwen3-32b"];
    const offering = catalog.providers["siliconflow-cn"]?.models["Qwen/Qwen3-32B"];

    expect(canonical?.name).toBe("Qwen3 32B");
    expect(canonical?.limit).toEqual({ context: 131_072, output: 38_912 });
    expect(offering?.name).toBe("Qwen3 32B on SiliconFlow");
    expect(offering).not.toHaveProperty("cost");
    expect(offering).not.toHaveProperty("base_model");
    expect(offering).not.toHaveProperty("base_model_omit");
    expect(offering).not.toHaveProperty("weights");
    expect(offering).not.toHaveProperty("benchmarks");

    expect(
      Object.keys(catalog.providers["alibaba-cn"]?.models ?? {}).sort(),
    ).toEqual(
      [
        "qwen3.7-flash",
        "qwen3.7-plus",
        "qwen3.8-max",
        "deepseek-v4-flash",
        "deepseek-v4-flash-0731",
        "deepseek-v4-pro",
        "deepseek-v4-pro-0813",
        "kimi/kimi-k3",
        "glm-5.2",
        "MiniMax/MiniMax-M3",
        "xiaomi/mimo-v2.5-pro",
      ].sort(),
    );

    const qwen37Flash = catalog.providers["alibaba-cn"]?.models["qwen3.7-flash"];
    expect(qwen37Flash?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 131_072,
    });

    const qwen37Plus = catalog.providers["alibaba-cn"]?.models["qwen3.7-plus"];
    expect(qwen37Plus?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 65_536,
    });
    expect(qwen37Plus?.cost_cn).toMatchObject({
      input: 2,
      output: 8,
      cache_read: 0.4,
      cache_write: 2.5,
    });
    expect(qwen37Plus?.cost_cn?.tiers).toEqual([
      {
        input: 6,
        output: 24,
        cache_read: 1.2,
        cache_write: 7.5,
        tier: { type: "context", size: 256_000 },
      },
    ]);
    expect(qwen37Plus?.cost_cn).not.toHaveProperty("context_over_200k");

    const qwen38Max = catalog.providers["alibaba-cn"]?.models["qwen3.8-max"];
    expect(qwen38Max?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 131_072,
    });
    expect(qwen38Max?.cost_cn).toEqual({
      input: 12,
      output: 36,
      cache_read: 1.5,
      cache_write: 15,
    });
    expect(qwen38Max?.doc).toBe(
      "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/model-market/detail/qwen3.8-max",
    );

    const alibabaDeepseekPro =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-pro"];
    const alibabaDeepseekPro0813 =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-pro-0813"];
    const alibabaDeepseekFlash =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-flash"];
    const alibabaDeepseekFlash0731 =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-flash-0731"];
    expect(alibabaDeepseekPro?.limit).toEqual({
      context: 1_000_000,
      input: 1_000_000,
      output: 393_216,
    });
    expect(alibabaDeepseekFlash?.limit).toEqual({
      context: 1_000_000,
      input: 1_000_000,
      output: 393_216,
    });
    expect(alibabaDeepseekPro?.structured_output).toBe(true);
    expect(alibabaDeepseekPro0813?.structured_output).toBe(true);
    expect(alibabaDeepseekPro0813?.cost_cn).toMatchObject({
      input: 4.5,
      output: 13.5,
      cache_read: 0.15,
    });
    expect(alibabaDeepseekFlash?.structured_output).toBe(true);
    expect(alibabaDeepseekFlash?.cost_cn).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.2,
    });
    expect(alibabaDeepseekFlash0731?.structured_output).toBe(false);
    expect(alibabaDeepseekFlash0731?.cost_cn).toMatchObject({
      input: 1.5,
      output: 4.5,
      cache_read: 0.3,
    });

    const kimiK3 = catalog.providers["alibaba-cn"]?.models["kimi/kimi-k3"];
    expect(kimiK3?.reasoning_options).toEqual([
      { type: "effort", values: ["max"] },
    ]);
    expect(kimiK3?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 1_048_576,
    });
    expect(kimiK3?.cost_cn).toEqual({
      input: 20,
      output: 100,
      cache_read: 2,
    });

    const glm52 = catalog.providers["alibaba-cn"]?.models["glm-5.2"];
    expect(glm52?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 131_072,
    });
    expect(glm52?.cost_cn).toEqual({ input: 8, output: 28, cache_read: 2 });

    const zhipuGlm47 = catalog.providers.zhipuai?.models["glm-4.7"];
    expect(zhipuGlm47?.cost_cn).toEqual({
      input: 2,
      output: 8,
      cache_read: 0.4,
      tiers: [
        {
          input: 2,
          output: 8,
          cache_read: 0.4,
          tier: {
            type: "conditional",
            input: { gte: 0, lt: 32_000 },
            output: { gte: 0, lt: 200 },
          },
        },
        {
          input: 3,
          output: 14,
          cache_read: 0.6,
          tier: {
            type: "conditional",
            input: { gte: 0, lt: 32_000 },
            output: { gte: 200 },
          },
        },
        {
          input: 4,
          output: 16,
          cache_read: 0.8,
          tier: {
            type: "conditional",
            input: { gte: 32_000, lt: 200_000 },
          },
        },
      ],
    });

    const minimaxM3 =
      catalog.providers["alibaba-cn"]?.models["MiniMax/MiniMax-M3"];
    expect(minimaxM3?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
    });
    expect(minimaxM3?.cost_cn).toEqual({
      input: 4.2,
      output: 16.8,
      cache_read: 0.84,
    });

    const canonicalMinimaxM3 = catalog.models["minimax/minimax-m3"];
    expect(canonicalMinimaxM3?.limit).toEqual({ context: 1_000_000 });
    expect(canonicalMinimaxM3?.temperature).toBe(true);

    const minimaxApi = catalog.providers.minimax;
    expect(minimaxApi?.api).toBe("https://api.minimaxi.com/v1");
    expect(minimaxApi?.name).toBe("MiniMax");
    expect(Object.keys(minimaxApi?.models ?? {}).sort()).toEqual([
      "MiniMax-M2",
      "MiniMax-M2.1",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M3",
    ]);
    expect(minimaxApi?.models["MiniMax-M3"]?.interleaved).toEqual({
      field: "reasoning_details",
    });
    expect(minimaxApi?.models["MiniMax-M3"]?.provider).toEqual({
      body: { reasoning_split: true },
    });
    expect(minimaxApi?.models["MiniMax-M3"]?.cost_cn).toEqual({
      input: 2.1,
      output: 8.4,
      cache_read: 0.42,
      tiers: [
        {
          input: 2.1,
          output: 8.4,
          cache_read: 0.42,
          tier: {
            type: "conditional",
            input: { lte: 512_000 },
          },
        },
        {
          input: 4.2,
          output: 16.8,
          cache_read: 0.84,
          tier: {
            type: "conditional",
            input: { gt: 512_000 },
          },
        },
      ],
    });

    const minimaxCanonicalIds = [
      "minimax/minimax-m2",
      "minimax/minimax-m2.1",
      "minimax/minimax-m2.5",
      "minimax/minimax-m2.7",
    ];
    for (const id of minimaxCanonicalIds) {
      const model = catalog.models[id];
      expect(model?.limit).toEqual({ context: 204_800 });
      expect(model?.open_weights).toBe(true);
      expect(model?.tool_call).toBe(true);
      expect(model?.modalities).toEqual({ input: ["text"], output: ["text"] });
    }

    const minimaxModelPrices = {
      "MiniMax-M2": { input: 2.1, output: 8.4, cache_read: 0.21, cache_write: 2.625 },
      "MiniMax-M2.1": { input: 2.1, output: 8.4, cache_read: 0.21, cache_write: 2.625 },
      "MiniMax-M2.1-highspeed": { input: 4.2, output: 16.8, cache_read: 0.21, cache_write: 2.625 },
      "MiniMax-M2.5": { input: 2.1, output: 8.4, cache_read: 0.21, cache_write: 2.625 },
      "MiniMax-M2.5-highspeed": { input: 4.2, output: 16.8, cache_read: 0.21, cache_write: 2.625 },
      "MiniMax-M2.7": { input: 2.1, output: 8.4, cache_read: 0.42, cache_write: 2.625 },
      "MiniMax-M2.7-highspeed": { input: 4.2, output: 16.8, cache_read: 0.42, cache_write: 2.625 },
    } as const;
    for (const [id, cost] of Object.entries(minimaxModelPrices)) {
      const model = minimaxApi?.models[id];
      expect(model?.cost_cn).toEqual(cost);
      expect(model?.reasoning_options).toEqual([
        { type: "effort", values: ["default"] },
      ]);
      expect(model?.interleaved).toEqual({ field: "reasoning_details" });
    }

    const minimaxTokenPlan = catalog.providers["minimax-token-plan"];
    expect(minimaxTokenPlan?.api).toBe("https://api.minimaxi.com/v1");
    expect(minimaxTokenPlan?.plans_cn).toEqual([
      {
        name: "Plus",
        price_month: 49,
        usage: "轻量个人开发与日常试用",
        quota_windows: ["5 小时固定窗口", "周窗口"],
      },
      {
        name: "Max",
        price_month: 119,
        usage: "高频编程 Agent 与多模态调用",
        quota_windows: ["5 小时固定窗口", "周窗口"],
      },
      {
        name: "Ultra",
        price_month: 469,
        usage: "重度 Agent 工作流与更长时间使用",
        quota_windows: ["5 小时固定窗口", "周窗口"],
      },
    ]);
    expect(minimaxTokenPlan?.credits_cn).toEqual({
      points: 1_000,
      cny: 7,
      valid_days: 365,
    });
    expect(Object.keys(minimaxTokenPlan?.models ?? {}).sort()).toEqual([
      "MiniMax-M2.7",
      "MiniMax-M3",
    ]);
    expect(minimaxTokenPlan?.models["MiniMax-M3"]).not.toHaveProperty("cost_cn");
    expect(minimaxTokenPlan?.models["MiniMax-M3"]).not.toHaveProperty("cost_points");

    const mimo =
      catalog.providers["alibaba-cn"]?.models["xiaomi/mimo-v2.5-pro"];
    expect(mimo?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 131_072,
    });
    expect(mimo?.cost_cn).toEqual({ input: 7, output: 21, cache_read: 1.4 });

    const deepseek = catalog.providers.deepseek;
    expect(catalog.models["deepseek/deepseek-v4-flash"]?.series).toBe(
      "deepseek-v4-flash",
    );
    expect(catalog.models["deepseek/deepseek-v4-flash-0731"]?.series).toBe(
      "deepseek-v4-flash",
    );
    expect(catalog.models["deepseek/deepseek-v4-pro"]?.series).toBe(
      "deepseek-v4-pro",
    );
    expect(catalog.models["deepseek/deepseek-v4-pro-0813"]?.series).toBe(
      "deepseek-v4-pro",
    );
    expect(deepseek?.protocol).toBe("openai-compatible");
    expect(deepseek?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.deepseek.com",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.deepseek.com/anthropic",
      },
    ]);
    expect(deepseek?.models["deepseek-v4-flash"]?.endpoints).toEqual([
      "openai",
      "anthropic",
    ]);
    expect(deepseek?.models["deepseek-v4-flash"]?.cost_cn).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.02,
    });
    expect(deepseek?.models["deepseek-v4-flash"]?.series).toBe(
      "deepseek-v4-flash",
    );
    expect(deepseek?.models["deepseek-v4-flash"]).not.toHaveProperty("cost");

    const deepseekV4Pro = deepseek?.models["deepseek-v4-pro"];
    expect(deepseekV4Pro?.name).toBe("DeepSeek V4 Pro 0813");
    expect(deepseekV4Pro?.last_updated).toBe("2026-08-13");
    expect(deepseekV4Pro?.series).toBe("deepseek-v4-pro");
    expect(deepseekV4Pro?.reasoning_options).toEqual([
      { type: "toggle" },
      { type: "effort", values: ["low", "high", "max"] },
    ]);
    expect(deepseekV4Pro?.cost_cn).toEqual({
      input: 3,
      output: 6,
      cache_read: 0.025,
    });

    const volcengine = catalog.providers.volcengine;
    expect(volcengine?.api).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(volcengine?.protocol).toBe("openai-compatible");
    expect(Object.keys(volcengine?.models ?? {}).sort()).toEqual(
      [
        "deepseek-v4-flash-260425",
        "deepseek-v4-flash-ga-260731",
        "deepseek-v4-pro-260425",
        "doubao-seed-2-1-pro-260628",
        "doubao-seed-2-1-turbo-260628",
        "doubao-seed-evolving",
        "glm-5-2-260617",
      ].sort(),
    );
    const doubaoSeed21Pro =
      volcengine?.models["doubao-seed-2-1-pro-260628"];
    expect(doubaoSeed21Pro?.limit).toEqual({
      context: 262_144,
      input: 262_144,
      output: 262_144,
    });
    expect(doubaoSeed21Pro?.modalities).toEqual({
      input: ["text", "image", "video", "pdf"],
      output: ["text"],
    });
    expect(doubaoSeed21Pro?.reasoning_options).toEqual([{ type: "toggle" }]);
    expect(doubaoSeed21Pro?.tool_call).toBe(true);
    expect(doubaoSeed21Pro?.structured_output).toBe(true);
    expect(doubaoSeed21Pro?.cost_cn).toEqual({
      input: 6,
      output: 30,
      cache_read: 1.2,
    });
    expect(doubaoSeed21Pro?.cost_cn).not.toHaveProperty("cache_write");

    const doubaoSeedEvolving = volcengine?.models["doubao-seed-evolving"];
    expect(doubaoSeedEvolving?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 262_144,
    });
    expect(doubaoSeedEvolving?.modalities).toEqual({
      input: ["text", "image", "video", "pdf"],
      output: ["text"],
    });
    expect(doubaoSeedEvolving?.reasoning_options).toEqual([
      { type: "toggle" },
      { type: "effort", values: ["minimal", "low", "medium", "high"] },
    ]);
    expect(doubaoSeedEvolving?.tool_call).toBe(true);
    expect(doubaoSeedEvolving?.structured_output).toBe(true);
    expect(doubaoSeedEvolving?.cost_cn).toEqual({
      input: 6,
      output: 30,
      cache_read: 1.2,
    });
    expect(doubaoSeedEvolving?.cost_cn).not.toHaveProperty("cache_write");

    const doubaoSeed21Turbo =
      volcengine?.models["doubao-seed-2-1-turbo-260628"];
    expect(doubaoSeed21Turbo?.limit).toEqual({
      context: 262_144,
      input: 262_144,
      output: 262_144,
    });
    expect(doubaoSeed21Turbo?.modalities).toEqual({
      input: ["text", "image", "video", "pdf"],
      output: ["text"],
    });
    expect(doubaoSeed21Turbo?.reasoning_options).toEqual([{ type: "toggle" }]);
    expect(doubaoSeed21Turbo?.tool_call).toBe(true);
    expect(doubaoSeed21Turbo?.structured_output).toBe(true);
    expect(doubaoSeed21Turbo?.cost_cn).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.6,
    });
    expect(doubaoSeed21Turbo?.cost_cn).not.toHaveProperty("cache_write");

    const volcengineDeepseekV4Pro =
      volcengine?.models["deepseek-v4-pro-260425"];
    expect(volcengineDeepseekV4Pro?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 393_216,
    });
    expect(volcengineDeepseekV4Pro?.modalities).toEqual({
      input: ["text"],
      output: ["text"],
    });
    expect(volcengineDeepseekV4Pro?.reasoning_options).toEqual([
      { type: "toggle" },
    ]);
    expect(volcengineDeepseekV4Pro?.tool_call).toBe(true);
    expect(volcengineDeepseekV4Pro?.structured_output).toBe(false);
    expect(volcengineDeepseekV4Pro?.cost_cn).toEqual({
      input: 12,
      output: 24,
      cache_read: 1,
    });
    expect(volcengineDeepseekV4Pro?.cost_cn).not.toHaveProperty("cache_write");
    expect(volcengineDeepseekV4Pro?.doc).toBe(
      "https://console.volcengine.com/ark/region:cn-beijing/model/detail?Id=deepseek-v4-pro",
    );

    const volcengineDeepseekV4Flash =
      volcengine?.models["deepseek-v4-flash-260425"];
    expect(volcengineDeepseekV4Flash?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 393_216,
    });
    expect(volcengineDeepseekV4Flash?.cost_cn).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.2,
    });

    const volcengineDeepseekV4FlashGa =
      volcengine?.models["deepseek-v4-flash-ga-260731"];
    expect(volcengineDeepseekV4FlashGa?.name).toBe("DeepSeek V4 Flash GA");
    expect(volcengineDeepseekV4FlashGa?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 393_216,
    });
    expect(volcengineDeepseekV4FlashGa?.modalities).toEqual({
      input: ["text"],
      output: ["text"],
    });
    expect(volcengineDeepseekV4FlashGa?.reasoning_options).toEqual([
      { type: "toggle" },
    ]);
    expect(volcengineDeepseekV4FlashGa?.tool_call).toBe(true);
    expect(volcengineDeepseekV4FlashGa?.structured_output).toBe(false);
    expect(volcengineDeepseekV4FlashGa?.cost_cn).toEqual({
      input: 3,
      output: 9,
      cache_read: 0.1,
    });
    expect(volcengineDeepseekV4FlashGa?.doc).toBe(
      "https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=deepseek-v4-flash-ga",
    );

    const volcengineGlm52 = volcengine?.models["glm-5-2-260617"];
    expect(volcengineGlm52?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 131_072,
    });
    expect(volcengineGlm52?.modalities).toEqual({
      input: ["text"],
      output: ["text"],
    });
    expect(volcengineGlm52?.reasoning_options).toEqual([{ type: "toggle" }]);
    expect(volcengineGlm52?.tool_call).toBe(true);
    expect(volcengineGlm52?.structured_output).toBe(false);
    expect(volcengineGlm52?.cost_cn).toEqual({
      input: 8,
      output: 28,
      cache_read: 2,
    });
    expect(volcengineGlm52?.doc).toBe(
      "https://console.volcengine.com/ark/region:cn-beijing/model/detail?Id=glm-5-2",
    );

    const zhipuCodingPlan = catalog.providers["zhipuai-coding-plan"];
    expect(zhipuCodingPlan?.api).toBe(
      "https://open.bigmodel.cn/api/coding/paas/v4",
    );
    expect(zhipuCodingPlan?.protocol).toBe("openai-compatible");
    expect(Object.keys(zhipuCodingPlan?.models ?? {}).sort()).toEqual([
      "glm-4.7",
      "glm-5-turbo",
      "glm-5.3",
    ]);

    const peakWindow = {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      start: "14:00",
      end: "18:00",
      timezone: "Asia/Shanghai",
    } satisfies {
      days: Array<"monday" | "tuesday" | "wednesday" | "thursday" | "friday">;
      start: string;
      end: string;
      timezone: string;
    };
    expect(zhipuCodingPlan?.models["glm-5.3"]?.cost_points).toEqual({
      per_tokens: 10_000,
      input: 6.9,
      cache_read: 1.7,
      output: 24,
      off_peak_multiplier: 0.5,
      peak_window: peakWindow,
    });
    expect(zhipuCodingPlan?.models["glm-5-turbo"]?.cost_points).toEqual({
      per_tokens: 10_000,
      input: 5.7,
      cache_read: 1.5,
      output: 21,
      off_peak_multiplier: 0.5,
      peak_window: peakWindow,
    });
    expect(zhipuCodingPlan?.models["glm-4.7"]?.cost_points).toEqual({
      per_tokens: 10_000,
      input: 4.6,
      cache_read: 1.2,
      output: 16,
      off_peak_multiplier: 0.5,
      peak_window: peakWindow,
    });
    expect(zhipuCodingPlan?.models["glm-5.3"]?.reasoning_options).toEqual([
      { type: "effort", values: ["low", "high", "max"] },
    ]);
    expect(zhipuCodingPlan?.models["glm-5.3"]).not.toHaveProperty("cost_cn");

    const codingPlan = catalog.providers["volcengine-coding-plan"];
    expect(codingPlan?.api).toBe(
      "https://ark.cn-beijing.volces.com/api/coding/v3",
    );
    expect(codingPlan?.protocol).toBe("openai-compatible");
    expect(Object.keys(codingPlan?.models ?? {}).sort()).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "doubao-seed-2.0-lite",
      "doubao-seed-2.1-turbo",
      "glm-5.2",
      "kimi-k2.7-code",
      "minimax-m3",
    ]);

    const codingPlanDoc =
      "https://www.volcengine.com/docs/82379/1925114";
    const codingPlanModels = [
      {
        id: "deepseek-v4-flash",
        limit: { context: 1_024_000, output: 384_000 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "deepseek-v4-pro",
        limit: { context: 1_024_000, output: 384_000 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "doubao-seed-2.0-lite",
        limit: { context: 256_000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "doubao-seed-2.1-turbo",
        limit: { context: 256_000, output: 65_536 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "glm-5.2",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "minimax-m3",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
    ] as const;

    for (const expected of codingPlanModels) {
      const model = codingPlan?.models[expected.id];
      expect(model?.limit).toEqual(expected.limit);
      expect(model?.modalities).toEqual({
        input: [...expected.modalities.input],
        output: [...expected.modalities.output],
      });
      expect(model?.reasoning_options).toEqual([
        { type: "toggle" },
        { type: "effort", values: ["low", "medium", "high"] },
      ]);
      expect(model?.interleaved).toEqual({ field: "reasoning_content" });
      expect(model?.tool_call).toBe(true);
      expect(model?.structured_output).toBe(false);
      expect(model).not.toHaveProperty("cost_cn");
      expect(model?.doc).toBe(codingPlanDoc);
    }

    const codingPlanKimiK27 = codingPlan?.models["kimi-k2.7-code"];
    expect(codingPlanKimiK27?.limit).toEqual({
      context: 256_000,
      output: 32_000,
    });
    expect(codingPlanKimiK27?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
    expect(codingPlanKimiK27?.reasoning_options).toEqual([
      { type: "effort", values: ["default"] },
    ]);
    expect(codingPlanKimiK27?.tool_call).toBe(true);
    expect(codingPlanKimiK27?.structured_output).toBe(false);
    expect(codingPlanKimiK27).not.toHaveProperty("cost_cn");
    expect(codingPlanKimiK27?.doc).toBe(codingPlanDoc);

    const agentPlan = catalog.providers["volcengine-agent-plan"];
    expect(agentPlan?.api).toBe(
      "https://ark.cn-beijing.volces.com/api/plan/v3",
    );
    expect(agentPlan?.protocol).toBe("openai-compatible");
    expect(Object.keys(agentPlan?.models ?? {}).sort()).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "doubao-seed-2.0-lite",
      "doubao-seed-2.0-mini",
      "doubao-seed-2.1-turbo",
      "doubao-seed-evolving",
      "glm-5.2",
      "kimi-k2.7-code",
      "kimi-k3",
      "minimax-m3",
    ]);

    const agentPlanDoc =
      "https://www.volcengine.com/docs/82379/2366394?lang=zh";
    const agentPlanModels = [
      {
        id: "deepseek-v4-flash",
        limit: { context: 1_024_000, output: 384_000 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "deepseek-v4-pro",
        limit: { context: 1_024_000, output: 384_000 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "doubao-seed-2.0-lite",
        limit: { context: 256_000, output: 131_072 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "doubao-seed-2.0-mini",
        limit: { context: 256_000, output: 131_072 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "doubao-seed-2.1-turbo",
        limit: { context: 256_000, output: 262_144 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "doubao-seed-evolving",
        limit: { context: 1_024_000, output: 262_144 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "glm-5.2",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "kimi-k2.7-code",
        limit: { context: 256_000, output: 32_000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "kimi-k3",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "minimax-m3",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
    ] as const;

    for (const expected of agentPlanModels) {
      const model = agentPlan?.models[expected.id];
      expect(model?.limit).toEqual(expected.limit);
      expect(model?.modalities).toEqual({
        input: [...expected.modalities.input],
        output: [...expected.modalities.output],
      });
      expect(model).not.toHaveProperty("cost_cn");
      expect(model).not.toHaveProperty("reasoning");
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("tool_call");
      expect(model).not.toHaveProperty("structured_output");
      expect(model?.doc).toBe(agentPlanDoc);
    }
  });

  test("assigns stable provider and model identifiers", async () => {
    const catalog = await generateCatalog(root);

    for (const [providerID, provider] of Object.entries(catalog.providers)) {
      expect(provider.id).toBe(providerID);
      for (const [modelID, model] of Object.entries(provider.models)) {
        expect(model.id).toBe(modelID);
      }
    }
  });
});
