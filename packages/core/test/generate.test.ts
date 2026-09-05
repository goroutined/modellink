import { describe, expect, test } from "bun:test";
import path from "node:path";

import { generateCatalog } from "../src/generate.js";
import { CostTierSelector, Provider, ReasoningOption } from "../src/schema.js";

const root = path.join(import.meta.dirname, "..", "..", "..");

describe("catalog generation", () => {
  test("accepts timezone-aware weekly price windows", () => {
    expect(
      CostTierSelector.parse({
        type: "conditional",
        time: {
          timezone: "Asia/Shanghai",
          windows: [
            {
              days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
              start: "00:30",
              end: "08:30",
            },
            { days: ["saturday", "sunday"], start: "00:00", end: "24:00" },
            { start: "18:00", end: "00:00" },
          ],
        },
      }),
    ).toEqual({
      type: "conditional",
      time: {
        timezone: "Asia/Shanghai",
        windows: [
          {
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            start: "00:30",
            end: "08:30",
          },
          { days: ["saturday", "sunday"], start: "00:00", end: "24:00" },
          { start: "18:00", end: "00:00" },
        ],
      },
    });
    expect(() =>
      CostTierSelector.parse({
        type: "conditional",
        time: {
          timezone: "Asia/Shanghai",
          windows: [{ start: "24:00", end: "24:00" }],
        },
      }),
    ).toThrow();
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

  test("validates endpoint-scoped reasoning controls and effort defaults", () => {
    expect(
      ReasoningOption.parse({
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "high",
      }),
    ).toEqual({
      type: "effort",
      field: "reasoning_effort",
      endpoints: ["openai"],
      values: ["low", "high", "max"],
      default: "high",
    });
    expect(() =>
      ReasoningOption.parse({
        type: "effort",
        values: ["low", "high"],
        default: "max",
      }),
    ).toThrow();
    expect(() =>
      ReasoningOption.parse({ type: "effort", values: ["default"] }),
    ).toThrow();
    expect(
      ReasoningOption.parse({
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["none", "low", "medium", "high"],
      }),
    ).toEqual({
      type: "effort",
      field: "reasoning.effort",
      endpoints: ["responses"],
      values: ["none", "low", "medium", "high"],
    });
  });

  test("keeps canonical models separate and expands provider models", async () => {
    const catalog = await generateCatalog(root);
    const canonical = catalog.models["alibaba/qwen3.6-27b"];
    const offering =
      catalog.providers["siliconflow-cn"]?.models["Qwen/Qwen3.6-27B"];

    expect(canonical?.name).toBe("Qwen3.6 27B");
    expect(canonical?.limit).toEqual({ context: 262_144 });
    expect(offering?.name).toBe("Qwen3.6 27B");
    expect(offering).not.toHaveProperty("cost");
    expect(offering?.cost_cn).toEqual({ input: 3, output: 18 });
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
        "deepseek-v4-flash-0731",
        "deepseek-v4-pro",
        "deepseek-v4-pro-0813",
        "kimi/kimi-k3",
        "glm-5.2",
        "MiniMax/MiniMax-M3",
        "xiaomi/mimo-v2.5-pro",
      ].sort(),
    );
    for (const model of Object.values(
      catalog.providers["alibaba-cn"]?.models ?? {},
    )) {
      expect(model.doc).toStartWith(
        "https://bailian.console.aliyun.com/cn-beijing/",
      );
    }

    const qwen37Flash =
      catalog.providers["alibaba-cn"]?.models["qwen3.7-flash"];
    expect(qwen37Flash?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 131_072,
    });

    const qwen37Plus = catalog.providers["alibaba-cn"]?.models["qwen3.7-plus"];
    expect(qwen37Plus?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 131_072,
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
    expect(qwen38Max?.reasoning_options).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "medium", "xhigh"],
        default: "xhigh",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "medium", "xhigh"],
        default: "xhigh",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
        default: "xhigh",
      },
      {
        type: "budget_tokens",
        field: "thinking_budget",
        endpoints: ["openai"],
        max: 262_144,
      },
      {
        type: "budget_tokens",
        field: "thinking.budget_tokens",
        endpoints: ["anthropic"],
        max: 262_144,
      },
    ]);

    const alibabaDeepseekPro =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-pro"];
    const alibabaDeepseekPro0813 =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-pro-0813"];
    const alibabaDeepseekFlash0731 =
      catalog.providers["alibaba-cn"]?.models["deepseek-v4-flash-0731"];
    expect(alibabaDeepseekPro?.limit).toEqual({
      context: 1_000_000,
      input: 1_000_000,
      output: 393_216,
    });
    expect(alibabaDeepseekPro?.structured_output).toBe(true);
    expect(alibabaDeepseekPro0813?.structured_output).toBe(true);
    expect(alibabaDeepseekPro0813?.cost_cn).toMatchObject({
      input: 4.5,
      output: 13.5,
      cache_read: 0.45,
    });
    expect(
      alibabaDeepseekPro0813?.cost_cn?.tiers?.map((tier) => tier.cache_read),
    ).toEqual([0.45, 0.9]);
    expect(alibabaDeepseekFlash0731?.structured_output).toBe(true);
    expect(alibabaDeepseekFlash0731?.cost_cn).toMatchObject({
      input: 1.5,
      output: 4.5,
      cache_read: 0.15,
    });
    expect(
      alibabaDeepseekFlash0731?.cost_cn?.tiers?.map((tier) => tier.cache_read),
    ).toEqual([0.15, 0.3]);
    expect(alibabaDeepseekPro?.reasoning_options).toEqual([
      { type: "toggle", field: "enable_thinking", endpoints: ["openai"] },
      { type: "toggle", field: "thinking.type", endpoints: ["anthropic"] },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["high", "max"],
        default: "max",
      },
    ]);

    const kimiK3 = catalog.providers["alibaba-cn"]?.models["kimi/kimi-k3"];
    expect(kimiK3).not.toHaveProperty("reasoning_options");
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
    expect(kimiK3?.temperature).toBe(false);
    expect(catalog.models["moonshot/kimi-k3"]?.temperature).toBe(false);

    const glm52 = catalog.providers["alibaba-cn"]?.models["glm-5.2"];
    expect(glm52?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 131_072,
    });
    expect(glm52?.cost_cn).toEqual({ input: 8, output: 28, cache_read: 2 });
    expect(glm52?.reasoning_options).toContainEqual({
      type: "effort",
      field: "reasoning_effort",
      endpoints: ["openai"],
      values: ["high", "max"],
      default: "high",
    });

    const zhipuGlm47 = catalog.providers.zhipuai?.models["glm-4.7"];
    const zhipuGlm47FlashX =
      catalog.providers.zhipuai?.models["glm-4.7-flashx"];
    const zhipuGlm45Air = catalog.providers.zhipuai?.models["glm-4.5-air"];
    const zhipuGlm45AirX = catalog.providers.zhipuai?.models["glm-4.5-airx"];
    expect(
      catalog.providers.zhipuai?.models["glm-5.3"]?.reasoning_options,
    ).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "max",
      },
    ]);
    const zhipuGlm53Flash =
      catalog.providers.zhipuai?.models["glm-5.3-flash"];
    expect(zhipuGlm53Flash?.endpoints).toEqual(["openai"]);
    expect(zhipuGlm53Flash?.limit).toEqual({
      context: 1_048_576,
      output: 131_072,
    });
    expect(zhipuGlm53Flash?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
    expect(zhipuGlm53Flash?.reasoning_options).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "max",
      },
    ]);
    expect(zhipuGlm53Flash).not.toHaveProperty("cost_cn");
    expect(zhipuGlm47FlashX?.endpoints).toEqual(["openai"]);
    expect(zhipuGlm47FlashX?.cost_cn).toEqual({
      input: 0.5,
      output: 3,
      cache_read: 0.1,
    });
    expect(zhipuGlm45Air?.cost_cn?.tiers).toHaveLength(3);
    expect(zhipuGlm45Air?.cost_cn?.tiers?.[2]).toEqual({
      input: 1.2,
      output: 8,
      cache_read: 0.24,
      tier: {
        type: "conditional",
        input: { gte: 32_000, lt: 128_000 },
      },
    });
    expect(zhipuGlm45AirX?.endpoints).toEqual(["openai"]);
    expect(zhipuGlm45AirX).not.toHaveProperty("cost_cn");
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
    expect(minimaxM3?.temperature).toBe(false);

    const canonicalMinimaxM3 = catalog.models["minimax/minimax-m3"];
    expect(canonicalMinimaxM3?.limit).toEqual({
      context: 1_000_000,
    });
    expect(canonicalMinimaxM3?.temperature).toBe(true);
    expect(canonicalMinimaxM3?.open_weights).toBe(true);
    expect(canonicalMinimaxM3?.license).toBe("minimax-community");
    expect(canonicalMinimaxM3?.weights).toEqual([
      {
        label: "Hugging Face",
        url: "https://huggingface.co/MiniMaxAI/MiniMax-M3",
      },
    ]);

    for (const [providerID, modelID] of [
      ["alibaba-cn", "MiniMax/MiniMax-M3"],
      ["minimax-cn", "MiniMax-M3"],
      ["minimax-token-plan-cn", "MiniMax-M3"],
      ["volcengine-agent-plan", "minimax-m3"],
      ["volcengine-coding-plan", "minimax-m3"],
    ] as const) {
      expect(catalog.providers[providerID]?.models[modelID]?.open_weights).toBe(
        true,
      );
    }

    const minimaxApi = catalog.providers["minimax-cn"];
    expect(minimaxApi?.api).toBe("https://api.minimaxi.com/v1");
    expect(minimaxApi?.name).toBe("MiniMax");
    expect(minimaxApi?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.minimaxi.com/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.minimaxi.com/anthropic",
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://api.minimaxi.com/v1",
      },
    ]);
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
    expect(minimaxApi?.models["MiniMax-M3"]?.limit).toEqual({
      context: 1_000_000,
    });
    expect(minimaxApi?.models["MiniMax-M3"]?.endpoints).toEqual([
      "openai",
      "anthropic",
      "responses",
    ]);
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
      "MiniMax-M2": {
        input: 2.1,
        output: 8.4,
        cache_read: 0.21,
        cache_write: 2.625,
      },
      "MiniMax-M2.1": {
        input: 2.1,
        output: 8.4,
        cache_read: 0.21,
        cache_write: 2.625,
      },
      "MiniMax-M2.1-highspeed": {
        input: 4.2,
        output: 16.8,
        cache_read: 0.21,
        cache_write: 2.625,
      },
      "MiniMax-M2.5": {
        input: 2.1,
        output: 8.4,
        cache_read: 0.21,
        cache_write: 2.625,
      },
      "MiniMax-M2.5-highspeed": {
        input: 4.2,
        output: 16.8,
        cache_read: 0.21,
        cache_write: 2.625,
      },
      "MiniMax-M2.7": {
        input: 2.1,
        output: 8.4,
        cache_read: 0.42,
        cache_write: 2.625,
      },
      "MiniMax-M2.7-highspeed": {
        input: 4.2,
        output: 16.8,
        cache_read: 0.42,
        cache_write: 2.625,
      },
    } as const;
    for (const [id, cost] of Object.entries(minimaxModelPrices)) {
      const model = minimaxApi?.models[id];
      expect(model?.cost_cn).toEqual(cost);
      expect(model).not.toHaveProperty("reasoning_options");
      expect(model?.interleaved).toEqual({ field: "reasoning_details" });
    }

    const minimaxTokenPlan = catalog.providers["minimax-token-plan-cn"];
    expect(minimaxTokenPlan?.api).toBe("https://api.minimax.cn/v1");
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
    expect(minimaxTokenPlan?.models["MiniMax-M3"]).not.toHaveProperty(
      "cost_cn",
    );
    expect(minimaxTokenPlan?.models["MiniMax-M3"]).not.toHaveProperty(
      "cost_points",
    );
    expect(minimaxTokenPlan?.models["MiniMax-M3"]?.limit).toEqual({
      context: 1_000_000,
    });

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
    const deepseekVision =
      catalog.models["deepseek/deepseek-v4-flash-vision-exp"];
    expect(deepseekVision?.series).toBe("deepseek-v4-flash-vision");
    expect(deepseekVision?.release_date).toBe("2026-08-21");
    expect(deepseekVision?.limit).toEqual({
      context: 1_000_000,
      output: 384_000,
    });
    expect(deepseekVision?.modalities).toEqual({
      input: ["text", "image"],
      output: ["text"],
    });
    expect(deepseekVision?.attachment).toBe(true);
    expect(deepseekVision?.open_weights).toBe(false);
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
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://api.deepseek.com",
      },
    ]);
    expect(deepseek?.models["deepseek-v4-flash"]?.endpoints).toEqual([
      "openai",
      "anthropic",
      "responses",
    ]);
    expect(deepseek?.models["deepseek-v4-flash"]?.cost_cn).toMatchObject({
      input: 1.5,
      output: 4.5,
      cache_read: 0.05,
    });
    expect(deepseek?.models["deepseek-v4-flash"]?.cost_cn?.tiers).toHaveLength(
      2,
    );
    expect(
      deepseek?.models["deepseek-v4-flash"]?.cost_cn?.tiers?.[1],
    ).toMatchObject({
      input: 3,
      output: 9,
      cache_read: 0.1,
      tier: { type: "conditional", label: "高峰" },
    });
    expect(deepseek?.models["deepseek-v4-flash"]?.series).toBe(
      "deepseek-v4-flash",
    );
    expect(deepseek?.models["deepseek-v4-flash"]?.name).toBe(
      "DeepSeek V4 Flash 0731",
    );
    expect(deepseek?.models["deepseek-v4-flash"]).not.toHaveProperty("cost");

    const deepseekV4Pro = deepseek?.models["deepseek-v4-pro"];
    expect(deepseekV4Pro?.name).toBe("DeepSeek V4 Pro 0813");
    expect(deepseekV4Pro?.last_updated).toBe("2026-08-13");
    expect(deepseekV4Pro?.series).toBe("deepseek-v4-pro");
    expect(deepseekV4Pro?.reasoning_options).toEqual([
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "anthropic"],
      },
      { type: "toggle", field: "reasoning.effort", endpoints: ["responses"] },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["low", "high", "max"],
        default: "high",
      },
    ]);
    expect(deepseekV4Pro?.cost_cn).toMatchObject({
      input: 4.5,
      output: 13.5,
      cache_read: 0.15,
    });
    expect(deepseekV4Pro?.cost_cn?.tiers?.[1]).toMatchObject({
      input: 9,
      output: 27,
      cache_read: 0.3,
      tier: { type: "conditional", label: "高峰" },
    });

    const deepseekVisionOffering =
      deepseek?.models["deepseek-v4-flash-vision-exp"];
    expect(deepseekVisionOffering?.doc).toBe(
      "https://api-docs.deepseek.com/zh-cn/guides/vision/",
    );
    expect(deepseekVisionOffering?.endpoints).toEqual([
      "openai",
      "anthropic",
      "responses",
    ]);
    expect(deepseekVisionOffering?.reasoning_options).toEqual(
      deepseek?.models["deepseek-v4-flash"]?.reasoning_options,
    );
    expect(deepseekVisionOffering?.cost_cn).toMatchObject({
      input: 1.5,
      output: 4.5,
      cache_read: 0.05,
    });
    expect(deepseekVisionOffering?.cost_cn?.tiers?.[1]).toMatchObject({
      input: 3,
      output: 9,
      cache_read: 0.1,
      tier: { type: "conditional", label: "高峰" },
    });

    const volcengine = catalog.providers.volcengine;
    expect(volcengine?.api).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(volcengine?.protocol).toBe("openai-compatible");
    expect(volcengine?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://ark.cn-beijing.volces.com/api/v3",
        default: true,
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://ark.cn-beijing.volces.com/api/v3",
      },
    ]);
    expect(Object.keys(volcengine?.models ?? {}).sort()).toEqual(
      [
        "deepseek-v4-flash-260425",
        "deepseek-v4-flash-ga-260731",
        "deepseek-v4-pro-260425",
        "deepseek-v4-pro-ga-260813",
        "doubao-seed-2-1-pro-260628",
        "doubao-seed-2-1-turbo-260628",
        "doubao-seed-2-0-lite-260215",
        "doubao-seed-2-0-lite-260428",
        "doubao-seed-2-0-mini-260215",
        "doubao-seed-2-0-mini-260428",
        "doubao-seed-2-0-pro-260215",
        "doubao-seed-evolving",
        "glm-5-2-260617",
      ].sort(),
    );
    const deepseekV4ProGa = volcengine?.models["deepseek-v4-pro-ga-260813"];
    expect(deepseekV4ProGa?.name).toBe("DeepSeek V4 Pro GA");
    expect(deepseekV4ProGa?.release_date).toBe("2026-08-13");
    expect(deepseekV4ProGa?.cost_cn).toBeUndefined();
    expect(deepseekV4ProGa?.structured_output).toBe(true);
    expect(
      volcengine?.models["deepseek-v4-flash-ga-260731"]?.structured_output,
    ).toBe(true);
    const doubaoSeed21Pro = volcengine?.models["doubao-seed-2-1-pro-260628"];
    expect(doubaoSeed21Pro?.limit).toEqual({
      context: 262_144,
      input: 262_144,
      output: 262_144,
    });
    expect(doubaoSeed21Pro?.modalities).toEqual({
      input: ["text", "image", "video", "pdf"],
      output: ["text"],
    });
    const volcengineSeedEffortOptions: Array<
      ReturnType<typeof ReasoningOption.parse>
    > = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "responses"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["minimal", "low", "medium", "high"],
        default: "high",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["minimal", "low", "medium", "high"],
        default: "high",
      },
    ];
    expect(doubaoSeed21Pro?.endpoints).toEqual(["openai", "responses"]);
    expect(doubaoSeed21Pro?.reasoning_options).toEqual(
      volcengineSeedEffortOptions,
    );
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
    expect(doubaoSeedEvolving?.endpoints).toEqual(["openai", "responses"]);
    expect(doubaoSeedEvolving?.reasoning_options).toEqual(
      volcengineSeedEffortOptions,
    );
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
    expect(doubaoSeed21Turbo?.endpoints).toEqual(["openai", "responses"]);
    expect(doubaoSeed21Turbo?.reasoning_options).toEqual(
      volcengineSeedEffortOptions,
    );
    expect(doubaoSeed21Turbo?.tool_call).toBe(true);
    expect(doubaoSeed21Turbo?.structured_output).toBe(true);
    expect(doubaoSeed21Turbo?.cost_cn).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.6,
    });
    expect(doubaoSeed21Turbo?.cost_cn).not.toHaveProperty("cache_write");

    const volcengineSeed20EffortOptions: Array<
      ReturnType<typeof ReasoningOption.parse>
    > = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "responses"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["minimal", "low", "medium", "high"],
        default: "medium",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["minimal", "low", "medium", "high"],
        default: "medium",
      },
    ];
    const volcengineSeed20Cases = [
      [
        "doubao-seed-2-0-lite-260428",
        undefined,
        [
          [0.6, 3.6, 0.12],
          [0.9, 5.4, 0.18],
          [1.8, 10.8, 0.36],
        ],
      ],
      [
        "doubao-seed-2-0-mini-260428",
        undefined,
        [
          [0.2, 2, 0.04],
          [0.4, 4, 0.08],
          [0.8, 8, 0.16],
        ],
      ],
      [
        "doubao-seed-2-0-pro-260215",
        false,
        [
          [3.2, 16, 0.64],
          [4.8, 24, 0.96],
          [9.6, 48, 1.92],
        ],
      ],
      [
        "doubao-seed-2-0-lite-260215",
        undefined,
        [
          [0.6, 3.6, 0.12],
          [0.9, 5.4, 0.18],
          [1.8, 10.8, 0.36],
        ],
      ],
      [
        "doubao-seed-2-0-mini-260215",
        undefined,
        [
          [0.2, 2, 0.04],
          [0.4, 4, 0.08],
          [0.8, 8, 0.16],
        ],
      ],
    ] as const;
    const seed20TierConditions = [
      { input: { gte: 0, lte: 32_000 } },
      { input: { gt: 32_000, lte: 128_000 } },
      { input: { gt: 128_000, lte: 256_000 } },
    ] as const;
    for (const [id, temperature, rates] of volcengineSeed20Cases) {
      const offering = volcengine?.models[id];
      expect(offering?.endpoints).toEqual(["openai", "responses"]);
      expect(offering?.reasoning_options).toEqual(
        volcengineSeed20EffortOptions,
      );
      expect(offering?.temperature).toBe(temperature);
      expect(offering?.limit).toEqual({
        context: 262_144,
        input: 229_376,
        output: 131_072,
      });
      expect(offering?.cost_cn).toEqual({
        input: rates[0][0],
        output: rates[0][1],
        cache_read: rates[0][2],
        tiers: rates.map(([input, output, cacheRead], index) => ({
          input,
          output,
          cache_read: cacheRead,
          tier: {
            type: "conditional",
            ...seed20TierConditions[index],
          },
        })),
      });
    }
    expect(
      volcengine?.models["doubao-seed-2-0-lite-260428"]?.modalities.input,
    ).toEqual(["text", "audio", "image", "video", "pdf"]);
    expect(
      volcengine?.models["doubao-seed-2-0-mini-260428"]?.modalities.input,
    ).toEqual(["text", "audio", "image", "video", "pdf"]);
    expect(
      volcengine?.models["doubao-seed-2-0-lite-260215"]?.modalities.input,
    ).toEqual(["text", "image", "video", "pdf"]);
    expect(
      volcengine?.models["doubao-seed-2-0-mini-260215"]?.modalities.input,
    ).toEqual(["text", "image", "video", "pdf"]);
    for (const id of [
      "bytedance/doubao-seed-2.0-pro",
      "bytedance/doubao-seed-2.0-lite",
      "bytedance/doubao-seed-2.0-mini",
    ]) {
      expect(catalog.models[id]?.temperature).toBeUndefined();
    }
    expect(
      volcengine?.models["doubao-seed-2-0-pro-260215"]?.structured_output,
    ).toBe(true);
    expect(
      volcengine?.models["doubao-seed-2-0-lite-260215"]?.release_date,
    ).toBe("2026-02-15");

    for (const id of [
      "deepseek-v4-flash-260425",
      "deepseek-v4-flash-ga-260731",
      "deepseek-v4-pro-260425",
      "deepseek-v4-pro-ga-260813",
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-1-turbo-260628",
      "doubao-seed-evolving",
      "glm-5-2-260617",
    ]) {
      expect(volcengine?.models[id]).not.toHaveProperty("temperature");
    }

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
    const volcengineDeepseekPreviewEffortOptions: Array<
      ReturnType<typeof ReasoningOption.parse>
    > = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "responses"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["high", "max"],
        default: "high",
      },
    ];
    expect(volcengineDeepseekV4Pro?.endpoints).toEqual(["openai", "responses"]);
    expect(volcengineDeepseekV4Pro?.reasoning_options).toEqual(
      volcengineDeepseekPreviewEffortOptions,
    );
    expect(volcengineDeepseekV4Pro?.tool_call).toBe(true);
    expect(volcengineDeepseekV4Pro?.structured_output).toBe(false);
    expect(volcengineDeepseekV4Pro?.cost_cn).toEqual({
      input: 9,
      output: 27,
      cache_read: 0.3,
    });
    expect(volcengineDeepseekV4Pro?.cost_cn).not.toHaveProperty("cache_write");
    expect(volcengineDeepseekV4Pro?.doc).toBe(
      "https://ark.volcengine.com/region:cn-beijing/model/detail?Id=deepseek-v4-pro",
    );

    const volcengineDeepseekV4Flash =
      volcengine?.models["deepseek-v4-flash-260425"];
    expect(volcengineDeepseekV4Flash?.limit).toEqual({
      context: 1_048_576,
      input: 1_048_576,
      output: 393_216,
    });
    expect(volcengineDeepseekV4Flash?.cost_cn).toEqual({
      input: 3,
      output: 9,
      cache_read: 0.1,
    });
    expect(volcengineDeepseekV4Flash?.endpoints).toEqual([
      "openai",
      "responses",
    ]);
    expect(volcengineDeepseekV4Flash?.reasoning_options).toEqual(
      volcengineDeepseekPreviewEffortOptions,
    );
    expect(volcengineDeepseekV4Flash?.doc).toBe(
      "https://ark.volcengine.com/region:cn-beijing/model/detail?Id=deepseek-v4-flash",
    );

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
    const volcengineDeepseekGaEffortOptions: Array<
      ReturnType<typeof ReasoningOption.parse>
    > = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "responses"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["low", "high", "max"],
        default: "high",
      },
    ];
    expect(volcengineDeepseekV4FlashGa?.endpoints).toEqual([
      "openai",
      "responses",
    ]);
    expect(volcengineDeepseekV4FlashGa?.reasoning_options).toEqual(
      volcengineDeepseekGaEffortOptions,
    );
    expect(volcengineDeepseekV4FlashGa?.tool_call).toBe(true);
    expect(volcengineDeepseekV4FlashGa?.structured_output).toBe(true);
    expect(volcengineDeepseekV4FlashGa?.cost_cn).toEqual({
      input: 3,
      output: 9,
      cache_read: 0.1,
    });
    expect(volcengineDeepseekV4FlashGa?.doc).toBe(
      "https://ark.volcengine.com/region:cn-beijing/model/detail?name=deepseek-v4-flash-ga",
    );
    expect(deepseekV4ProGa?.endpoints).toEqual(["openai", "responses"]);
    expect(deepseekV4ProGa?.reasoning_options).toEqual(
      volcengineDeepseekGaEffortOptions,
    );
    expect(deepseekV4ProGa?.doc).toBe(
      "https://ark.volcengine.com/region:cn-beijing/model/detail?name=deepseek-v4-pro-ga",
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
    const volcengineGlmEffortOptions: Array<
      ReturnType<typeof ReasoningOption.parse>
    > = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "responses"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["high", "max"],
        default: "high",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["high", "max"],
        default: "high",
      },
    ];
    expect(volcengineGlm52?.endpoints).toEqual(["openai", "responses"]);
    expect(volcengineGlm52?.reasoning_options).toEqual(
      volcengineGlmEffortOptions,
    );
    expect(volcengineGlm52?.tool_call).toBe(true);
    expect(volcengineGlm52?.structured_output).toBe(false);
    expect(volcengineGlm52?.cost_cn).toEqual({
      input: 8,
      output: 28,
      cache_read: 2,
    });
    expect(volcengineGlm52?.doc).toBe(
      "https://ark.volcengine.com/region:cn-beijing/model/detail?Id=glm-5-2",
    );

    const zhipuCodingPlan = catalog.providers["zhipuai-coding-plan"];
    expect(zhipuCodingPlan?.api).toBe(
      "https://open.bigmodel.cn/api/coding/paas/v4",
    );
    expect(zhipuCodingPlan?.protocol).toBe("openai-compatible");
    expect(zhipuCodingPlan?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://open.bigmodel.cn/api/coding/paas/v4",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://open.bigmodel.cn/api/anthropic",
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://open.bigmodel.cn/api/v1",
      },
    ]);
    expect(Object.keys(zhipuCodingPlan?.models ?? {}).sort()).toEqual([
      "glm-5.3",
      "glm-5.3-flash",
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
    expect(zhipuCodingPlan?.models["glm-5.3-flash"]?.cost_points).toEqual({
      per_tokens: 10_000,
      input: 2.3,
      cache_read: 0.56,
      output: 8,
      off_peak_multiplier: 0.5,
      peak_window: peakWindow,
    });
    const zhipuCodingPlanReasoningOptions = ReasoningOption.array().parse([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high", "max"],
        default: "max",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "high", "max"],
        default: "max",
      },
      {
        type: "effort",
        field: "reasoning.effort",
        endpoints: ["responses"],
        values: ["low", "high", "max"],
        default: "max",
      },
    ]);
    expect(zhipuCodingPlan?.models["glm-5.3"]?.reasoning_options).toEqual(
      zhipuCodingPlanReasoningOptions,
    );
    expect(
      zhipuCodingPlan?.models["glm-5.3-flash"]?.reasoning_options,
    ).toEqual(zhipuCodingPlanReasoningOptions);
    expect(zhipuCodingPlan?.models["glm-5.3"]).not.toHaveProperty("cost_cn");
    expect(zhipuCodingPlan?.models["glm-5.3-flash"]).not.toHaveProperty(
      "cost_cn",
    );

    const codingPlan = catalog.providers["volcengine-coding-plan"];
    expect(codingPlan?.api).toBe(
      "https://ark.cn-beijing.volces.com/api/coding/v3",
    );
    expect(codingPlan?.protocol).toBe("openai-compatible");
    expect(codingPlan?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://ark.cn-beijing.volces.com/api/coding/v3",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://ark.cn-beijing.volces.com/api/coding",
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://ark.cn-beijing.volces.com/api/coding/v3",
      },
    ]);
    expect(Object.keys(codingPlan?.models ?? {}).sort()).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "doubao-seed-2.0-lite",
      "doubao-seed-2.1-turbo",
      "doubao-seed-evolving",
      "glm-5.3",
      "glm-5.3-flash",
      "kimi-k2.7-code",
      "minimax-m3",
    ]);

    const codingPlanDoc = "https://www.volcengine.com/docs/82379/1925114";
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
        id: "doubao-seed-2.1-turbo",
        limit: { context: 256_000, output: 65_536 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "doubao-seed-evolving",
        limit: { context: 1_024_000, output: 262_144 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      {
        id: "glm-5.3",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "glm-5.3-flash",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text", "image", "video"], output: ["text"] },
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
      if (expected.id.startsWith("deepseek-")) {
        expect(model?.reasoning_options).toEqual([{ type: "toggle" }]);
      } else {
        expect(model).not.toHaveProperty("reasoning_options");
      }
      expect(model).not.toHaveProperty("interleaved");
      expect(model?.tool_call).toBe(true);
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("structured_output");
      expect(model).not.toHaveProperty("cost_cn");
      expect(model?.doc).toBe(codingPlanDoc);
    }

    const codingPlanDoubao20Lite = codingPlan?.models["doubao-seed-2.0-lite"];
    expect(codingPlanDoubao20Lite?.limit).toEqual({ context: 256_000 });
    expect(codingPlanDoubao20Lite?.modalities).toEqual({
      input: ["text", "image"],
      output: ["text"],
    });
    expect(codingPlanDoubao20Lite).not.toHaveProperty("reasoning_options");
    expect(codingPlanDoubao20Lite).not.toHaveProperty("interleaved");
    expect(codingPlanDoubao20Lite).not.toHaveProperty("temperature");
    expect(codingPlanDoubao20Lite).not.toHaveProperty("structured_output");
    expect(codingPlanDoubao20Lite?.tool_call).toBe(true);
    expect(codingPlanDoubao20Lite?.doc).toBe(codingPlanDoc);

    const codingPlanKimiK27 = codingPlan?.models["kimi-k2.7-code"];
    expect(codingPlanKimiK27?.limit).toEqual({
      context: 256_000,
      output: 32_000,
    });
    expect(codingPlanKimiK27?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
    expect(codingPlanKimiK27).not.toHaveProperty("reasoning_options");
    expect(codingPlanKimiK27).not.toHaveProperty("interleaved");
    expect(codingPlanKimiK27?.tool_call).toBe(true);
    expect(codingPlanKimiK27).not.toHaveProperty("temperature");
    expect(codingPlanKimiK27).not.toHaveProperty("structured_output");
    expect(codingPlanKimiK27).not.toHaveProperty("cost_cn");
    expect(codingPlanKimiK27?.doc).toBe(codingPlanDoc);

    const agentPlan = catalog.providers["volcengine-agent-plan"];
    expect(agentPlan?.api).toBe(
      "https://ark.cn-beijing.volces.com/api/plan/v3",
    );
    expect(agentPlan?.protocol).toBe("openai-compatible");
    expect(agentPlan?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://ark.cn-beijing.volces.com/api/plan/v3",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://ark.cn-beijing.volces.com/api/plan",
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://ark.cn-beijing.volces.com/api/plan/v3",
      },
    ]);
    expect(Object.keys(agentPlan?.models ?? {}).sort()).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "doubao-seed-2.0-lite",
      "doubao-seed-2.0-mini",
      "doubao-seed-2.1-turbo",
      "doubao-seed-evolving",
      "glm-5.3",
      "glm-5.3-flash",
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
        id: "glm-5.3",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text"], output: ["text"] },
      },
      {
        id: "glm-5.3-flash",
        limit: { context: 1_024_000, output: 131_072 },
        modalities: { input: ["text", "image", "video"], output: ["text"] },
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
      if (expected.id === "glm-5.3") {
        expect(model?.reasoning).toBe(true);
        expect(model).not.toHaveProperty("reasoning_options");
      } else {
        expect(model).not.toHaveProperty("reasoning");
      }
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("tool_call");
      expect(model).not.toHaveProperty("structured_output");
      expect(model?.doc).toBe(agentPlanDoc);
    }
  });

  test("records the current Alibaba Coding Plan whitelist and limits", async () => {
    const catalog = await generateCatalog(root);
    const codingPlan = catalog.providers["alibaba-coding-plan-cn"];

    expect(codingPlan?.api).toBe("https://coding.dashscope.aliyuncs.com/v1");
    expect(codingPlan?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://coding.dashscope.aliyuncs.com/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      },
    ]);
    expect(codingPlan?.plans_cn).toEqual([
      {
        name: "Pro",
        price_month: 200,
        usage: "个人交互式 AI 编程工具与 OpenClaw",
        quota_windows: [
          "5 小时滚动窗口：6,000 次请求",
          "每周：45,000 次请求",
          "每月：90,000 次请求",
        ],
      },
    ]);
    expect(Object.keys(codingPlan?.models ?? {}).sort()).toEqual(
      [
        "qwen3.7-plus",
        "qwen3.6-plus",
        "kimi-k2.5",
        "glm-5",
        "MiniMax-M2.5",
        "qwen3.5-plus",
        "qwen3-max-2026-01-23",
        "qwen3-coder-next",
        "qwen3-coder-plus",
        "glm-4.7",
      ].sort(),
    );

    const expectedContexts = {
      "qwen3.7-plus": 1_000_000,
      "qwen3.6-plus": 1_000_000,
      "qwen3.5-plus": 1_000_000,
      "kimi-k2.5": 262_144,
      "glm-5": 202_752,
      "MiniMax-M2.5": 196_608,
      "qwen3-max-2026-01-23": 262_144,
      "qwen3-coder-next": 262_144,
      "qwen3-coder-plus": 1_000_000,
      "glm-4.7": 202_752,
    } as const;
    for (const [id, context] of Object.entries(expectedContexts)) {
      const model = codingPlan?.models[id];
      expect(model?.limit.context).toBe(context);
      expect(model?.endpoints).toEqual(["openai", "anthropic"]);
      expect(model).not.toHaveProperty("cost_cn");
      expect(model).not.toHaveProperty("cost_points");
    }

    expect(codingPlan?.models["kimi-k2.5"]?.limit.output).toBe(16_384);
    expect(codingPlan?.models["kimi-k2.5"]).not.toHaveProperty("temperature");
    expect(codingPlan?.models["MiniMax-M2.5"]?.limit).toEqual({
      context: 196_608,
    });
    expect(codingPlan?.models["qwen3-coder-next"]?.reasoning).toBe(false);
    expect(codingPlan?.models["qwen3-coder-next"]?.tool_call).toBe(true);
    expect(codingPlan?.models["qwen3-coder-plus"]?.reasoning).toBe(false);
    expect(codingPlan?.models["qwen3-coder-plus"]).not.toHaveProperty(
      "temperature",
    );
    for (const id of ["glm-4.7", "glm-5"] as const) {
      const model = codingPlan?.models[id];
      expect(model?.structured_output).toBe(false);
      expect(model?.limit).toEqual({
        context: 202_752,
        input: 169_984,
        output: 16_384,
      });
    }
    expect(
      codingPlan?.models["qwen3-max-2026-01-23"]?.limit.output,
    ).toBe(65_536);
    for (const id of [
      "qwen3.5-plus",
      "qwen3.6-plus",
      "qwen3.7-plus",
    ] as const) {
      expect(codingPlan?.models[id]?.limit.input).toBe(983_616);
    }
    expect(codingPlan?.models["qwen3.7-plus"]?.reasoning_options).toEqual([
      { type: "toggle" },
      { type: "budget_tokens", max: 262_144 },
    ]);

    expect(catalog.models["alibaba/qwen3.6-plus"]?.limit).toEqual({
      context: 1_000_000,
      input: 983_616,
      output: 65_536,
    });
    expect(catalog.models["moonshot/kimi-k2.5"]?.release_date).toBe(
      "2026-01-27",
    );
    expect(catalog.models["moonshot/kimi-k2.5"]?.open_weights).toBe(true);
  });

  test("records the current Tencent TokenHub language-model whitelist", async () => {
    const catalog = await generateCatalog(root);
    const tokenHub = catalog.providers["tencent-tokenhub"];

    expect(tokenHub?.api).toBe("https://tokenhub.tencentmaas.com/v1");
    expect(tokenHub?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://tokenhub.tencentmaas.com/v1",
        default: true,
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://tokenhub.tencentmaas.com/v1",
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://tokenhub.tencentmaas.com/v1",
      },
    ]);
    expect(Object.keys(tokenHub?.models ?? {}).sort()).toEqual(
      [
        "hy3",
        "hy-mt2-pro",
        "hy-mt2-plus",
        "hy-mt2-lite",
        "hunyuan-role-latest",
        "hy-role",
        "deepseek-v4-flash-202605",
        "deepseek/deepseek-v4-flash-0731",
        "deepseek/deepseek-v4-flash",
        "deepseek-v4-pro-202606",
        "deepseek/deepseek-v4-pro-0813",
        "deepseek/deepseek-v4-pro",
        "deepseek/deepseek-v4-flash-vision-exp",
        "deepseek-v4-flash-0731",
        "deepseek-v4-pro-0813",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "glm-5.3-flash",
        "glm-5.3",
        "glm-5.2",
        "glm-5.1",
        "glm-5v-turbo",
        "glm-5-turbo",
        "glm-5",
        "kimi-k2.7-code-highspeed",
        "kimi-k3",
        "kimi-k2.7-code",
        "kimi-k2.6",
        "minimax-m3",
        "minimax-m2.7",
        "mimo-v2.5-pro",
      ].sort(),
    );
    expect(tokenHub?.models).not.toHaveProperty("hy3-preview");
    expect(tokenHub?.models).not.toHaveProperty("kimi-k2.5");

    expect(tokenHub?.models["hy-mt2-pro"]?.endpoints).toEqual(["openai"]);
    expect(tokenHub?.models["hy3"]?.limit).toEqual({
      context: 262_144,
      input: 196_608,
      output: 131_072,
    });
    expect(tokenHub?.models["minimax-m3"]?.limit).toEqual({
      context: 1_000_000,
      input: 1_000_000,
      output: 524_288,
    });
    expect(tokenHub?.models["minimax-m3"]?.cost_cn?.tiers).toEqual([
      {
        input: 2.1,
        output: 8.4,
        cache_read: 0.42,
        tier: { type: "conditional", input: { lte: 512_000 } },
      },
      {
        input: 4.2,
        output: 16.8,
        cache_read: 0.84,
        tier: { type: "conditional", input: { gt: 512_000 } },
      },
    ]);
    expect(
      tokenHub?.models["deepseek-v4-flash-202605"]?.cost_cn?.tiers?.[1],
    ).toMatchObject({
      input: 3,
      output: 9,
      cache_read: 0.1,
      tier: { type: "conditional", label: "高峰时段" },
    });
    expect(
      tokenHub?.models["deepseek-v4-flash-202605"]?.cost_cn?.tiers?.[0]
        ?.tier,
    ).toMatchObject({
      type: "conditional",
      time: {
        windows: expect.arrayContaining([
          {
            days: ["saturday", "sunday"],
            start: "00:00",
            end: "24:00",
          },
        ]),
      },
    });
    expect(tokenHub?.models["deepseek-v4-flash-0731"]?.cost_cn?.tiers).toHaveLength(2);
    expect(tokenHub?.models["deepseek-v4-pro-0813"]?.cost_cn?.tiers).toHaveLength(2);
    expect(tokenHub?.models["glm-5.3-flash"]?.cost_cn).toEqual({
      input: 0.8,
      output: 2.8,
      cache_read: 0.23,
    });
    expect(tokenHub?.models["glm-5v-turbo"]?.modalities.input).toEqual([
      "text",
      "image",
      "video",
      "pdf",
    ]);
    expect(tokenHub?.models["glm-5.3-flash"]).toMatchObject({
      tool_call: true,
      limit: { context: 1_000_000, output: 131_072 },
      modalities: {
        input: ["text", "image", "video", "pdf"],
        output: ["text"],
      },
    });
    expect(tokenHub?.models["glm-5.3-flash"]).not.toHaveProperty(
      "structured_output",
    );
    expect(tokenHub?.models["glm-5.3-flash"]).not.toHaveProperty(
      "limit.input",
    );
    for (const id of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
      expect(tokenHub?.models[id]?.reasoning_options).toEqual([
        { type: "toggle", field: "thinking.type", endpoints: ["openai"] },
        {
          type: "effort",
          values: ["high", "max"],
          default: "high",
          field: "reasoning_effort",
          endpoints: ["openai"],
        },
      ]);
    }
    expect(
      tokenHub?.models["deepseek-v4-flash-202605"]?.reasoning_options,
    ).toEqual([
      { type: "toggle", field: "thinking.type", endpoints: ["openai"] },
      {
        type: "effort",
        values: ["high", "max"],
        default: "high",
        field: "reasoning_effort",
        endpoints: ["openai"],
      },
    ]);
    expect(tokenHub?.models["glm-5.2"]?.reasoning_options).toEqual([
      { type: "toggle", field: "thinking.type", endpoints: ["openai"] },
      {
        type: "effort",
        values: ["high", "max"],
        default: "max",
        field: "reasoning_effort",
        endpoints: ["openai"],
      },
    ]);
    expect(tokenHub?.models["glm-5.3"]?.reasoning_options).toEqual([
      {
        type: "effort",
        values: ["low", "high", "max"],
        default: "max",
        field: "reasoning_effort",
        endpoints: ["openai"],
      },
    ]);
    expect(tokenHub?.models["hy3"]?.reasoning_options).toEqual([
      { type: "toggle", field: "thinking.type", endpoints: ["openai"] },
      {
        type: "effort",
        values: ["low", "high"],
        default: "high",
        field: "reasoning_effort",
        endpoints: ["openai"],
      },
      {
        type: "effort",
        values: ["none", "low", "medium", "high"],
        field: "reasoning.effort",
        endpoints: ["responses"],
      },
    ]);
    for (const id of [
      "glm-5",
      "glm-5-turbo",
      "glm-5.1",
      "glm-5.2",
      "glm-5v-turbo",
      "glm-5.3-flash",
    ]) {
      expect(tokenHub?.models[id]).not.toHaveProperty("temperature");
    }
    expect(tokenHub?.models["glm-5.3"]?.temperature).toBe(true);
    expect(tokenHub?.models["mimo-v2.5-pro"]?.temperature).toBeUndefined();
    expect(tokenHub?.models["mimo-v2.5-pro"]?.interleaved).toBeUndefined();
    expect(
      tokenHub?.models["deepseek/deepseek-v4-flash-vision-exp"]
        ?.temperature,
    ).toBe(true);
    expect(
      tokenHub?.models["deepseek/deepseek-v4-flash-vision-exp"]
        ?.interleaved,
    ).toEqual({ field: "reasoning_content" });
    expect(tokenHub?.models).not.toHaveProperty("qwen3.5-flash");
    expect(tokenHub?.models).not.toHaveProperty("qwen3.5-plus");
    expect(
      tokenHub?.models["deepseek/deepseek-v4-flash-vision-exp"]?.modalities,
    ).toEqual({ input: ["text", "image"], output: ["text"] });
  });

  test("records the current Baidu Qianfan API and plan whitelists", async () => {
    const catalog = await generateCatalog(root);
    const api = catalog.providers["baidu-qianfan"];
    const tokenPlan = catalog.providers["baidu-token-plan"];
    const codingPlan = catalog.providers["baidu-coding-plan"];

    expect(api?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://qianfan.baidubce.com/v2",
        default: true,
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://qianfan.baidubce.com/v2",
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://qianfan.baidubce.com/anthropic",
      },
    ]);
    expect(Object.keys(api?.models ?? {}).sort()).toEqual(
      [
        "ernie-5.1",
        "ernie-5.0",
        "ernie-5.0-thinking-latest",
        "ernie-4.5-turbo-32k",
        "ernie-4.5-turbo-128k",
        "ernie-4.5-turbo-20260402",
        "ernie-4.5-turbo-vl",
        "ernie-4.5-turbo-vl-32k",
        "ernie-x1.1",
        "internvl3-38b",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "qwen3.5-397b-a17b",
        "qwen3.5-122b-a10b",
        "qwen3.5-35b-a3b",
        "qwen3.5-27b",
        "glm-5.3-flash",
        "glm-5.3",
        "glm-5.2",
        "glm-5.1",
        "glm-5",
        "kimi-k2.6",
      ].sort(),
    );
    expect(api?.models).not.toHaveProperty("deepseek-v3.2");
    expect(api?.models).not.toHaveProperty("ernie-5.0-thinking-preview");
    expect(api?.models["deepseek-v4-pro"]?.cost_cn).toEqual({
      input: 12,
      output: 24,
      cache_read: 1,
    });
    expect(api?.models["deepseek-v4-flash"]?.reasoning_options).toEqual([
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai"],
      },
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["high", "max"],
        default: "high",
      },
    ]);
    expect(api?.models["deepseek-v4-flash"]?.temperature).toBe(false);
    expect(api?.models["deepseek-v4-pro"]?.reasoning_options).toEqual(
      api?.models["deepseek-v4-flash"]?.reasoning_options,
    );
    expect(api?.models["deepseek-v4-pro"]?.temperature).toBe(false);
    expect(api?.models["deepseek-v4-flash"]).not.toHaveProperty("tool_call");
    expect(api?.models["deepseek-v4-flash"]).not.toHaveProperty("interleaved");
    expect(api?.models["deepseek-v4-flash"]?.structured_output).toBe(true);
    expect(api?.models["ernie-5.0"]?.temperature).toBe(false);
    expect(api?.models["ernie-5.0"]?.tool_call).toBe(true);
    expect(api?.models["ernie-5.0"]).not.toHaveProperty("structured_output");
    expect(api?.models["ernie-5.0"]?.interleaved).toEqual({
      field: "reasoning_content",
    });
    expect(api?.models["ernie-5.0-thinking-latest"]?.temperature).toBe(false);
    expect(api?.models["ernie-5.0-thinking-latest"]).not.toHaveProperty("tool_call");
    expect(api?.models["ernie-5.0-thinking-latest"]).not.toHaveProperty("interleaved");
    expect(api?.models["ernie-x1.1"]?.temperature).toBe(false);
    expect(api?.models["ernie-x1.1"]?.tool_call).toBe(true);
    expect(api?.models["ernie-x1.1"]).not.toHaveProperty("structured_output");
    expect(api?.models["ernie-x1.1"]).not.toHaveProperty("interleaved");
    expect(api?.models["ernie-5.1"]?.tool_call).toBe(true);
    expect(api?.models["ernie-5.1"]).not.toHaveProperty("reasoning");
    expect(api?.models["ernie-5.1"]).not.toHaveProperty("temperature");
    expect(api?.models["ernie-5.1"]).not.toHaveProperty("structured_output");
    expect(api?.models["ernie-5.1"]).not.toHaveProperty("reasoning_options");
    expect(api?.models["ernie-5.1"]).not.toHaveProperty("interleaved");
    expect(api?.models["glm-5"]?.tool_call).toBe(true);
    expect(api?.models["glm-5"]?.structured_output).toBe(true);
    expect(api?.models["glm-5"]).not.toHaveProperty("temperature");
    expect(api?.models["glm-5"]).not.toHaveProperty("reasoning_options");
    expect(api?.models["glm-5"]).not.toHaveProperty("interleaved");
    expect(api?.models["glm-5.1"]?.structured_output).toBe(true);
    expect(api?.models["glm-5.1"]).not.toHaveProperty("tool_call");
    expect(api?.models["glm-5.1"]).not.toHaveProperty("interleaved");
    expect(api?.models["glm-5.2"]).not.toHaveProperty("structured_output");
    expect(api?.models["glm-5.3"]).not.toHaveProperty("structured_output");
    expect(api?.models["glm-5.3-flash"]).toMatchObject({
      reasoning: true,
      endpoints: ["openai"],
      limit: {
        context: 1_000_000,
        input: 1_000_000,
        output: 131_072,
      },
      cost_cn: {
        input: 0.8,
        output: 2.8,
        cache_read: 0.23,
      },
    });
    expect(api?.models["glm-5.3-flash"]).not.toHaveProperty("temperature");
    expect(api?.models["glm-5.3-flash"]).not.toHaveProperty("tool_call");
    expect(api?.models["glm-5.3-flash"]).not.toHaveProperty(
      "structured_output",
    );
    expect(api?.models["kimi-k2.6"]?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
    expect(api?.models["kimi-k2.6"]).not.toHaveProperty("temperature");
    expect(api?.models["qwen3.5-27b"]?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
    expect(api?.models["qwen3.5-27b"]).not.toHaveProperty("tool_call");
    expect(api?.models["ernie-4.5-turbo-vl"]?.limit).toEqual({
      context: 128_000,
      input: 123_000,
      output: 16_384,
    });
    expect(api?.models["ernie-4.5-turbo-vl"]?.cost_cn).toEqual({
      input: 3,
      output: 9,
    });
    expect(api?.models["internvl3-38b"]?.modalities).toEqual({
      input: ["text", "image"],
      output: ["text"],
    });
    expect(api?.models["ernie-5.1"]?.cost_cn?.tiers).toEqual([
      {
        input: 4,
        output: 18,
        tier: { type: "conditional", input: { lte: 32_000 } },
      },
      {
        input: 6,
        output: 22,
        tier: {
          type: "conditional",
          input: { gt: 32_000, lte: 128_000 },
        },
      },
    ]);
    expect(api?.models["ernie-x1.1"]).not.toHaveProperty("cost_cn");

    expect(tokenPlan?.credits_cn).toEqual({
      points: 1_000,
      cny: 1,
    });
    expect(Object.keys(tokenPlan?.models ?? {}).sort()).toEqual(
      [
        "deepseek-v3.2",
        "deepseek-v4-flash",
        "deepseek-v4-flash-0731",
        "deepseek-v4-pro",
        "ernie-4.5-turbo-20260402",
        "glm-5",
        "glm-5.1",
        "glm-5.2",
        "kimi-k2.6",
      ].sort(),
    );
    expect(tokenPlan?.models["glm-5.1"]?.cost_points?.tiers?.[1]).toEqual({
      input: 8,
      output: 28,
      cache_read: 2,
      tier: {
        type: "conditional",
        input: { gt: 32_000, lte: 200_000 },
      },
    });
    expect(tokenPlan?.models["deepseek-v3.2"]?.cost_points?.tiers).toEqual([
      {
        input: 2,
        output: 3,
        cache_read: 0.4,
        tier: { type: "conditional", input: { lte: 32_000 } },
      },
      {
        input: 4,
        output: 6,
        cache_read: 0.4,
        tier: {
          type: "conditional",
          input: { gt: 32_000, lte: 128_000 },
        },
      },
    ]);
    expect(tokenPlan?.models["deepseek-v3.2"]?.reasoning).toBe(false);
    expect(tokenPlan?.models["deepseek-v3.2"]?.limit).toEqual({
      context: 131_072,
      input: 98_304,
      output: 32_768,
    });
    expect(tokenPlan?.models["deepseek-v4-flash"]?.limit).toEqual({
      context: 1_155_072,
      input: 1_024_000,
      output: 131_072,
    });
    expect(tokenPlan?.models["deepseek-v4-pro"]?.limit).toEqual({
      context: 1_155_072,
      input: 1_024_000,
      output: 131_072,
    });
    expect(tokenPlan?.models["deepseek-v4-flash"]?.reasoning_options).toEqual(
      api?.models["deepseek-v4-flash"]?.reasoning_options,
    );
    expect(tokenPlan?.models["deepseek-v4-flash"]).not.toHaveProperty(
      "tool_call",
    );
    expect(tokenPlan?.models["deepseek-v4-flash"]).not.toHaveProperty(
      "interleaved",
    );
    expect(tokenPlan?.models["glm-5"]).not.toHaveProperty("temperature");
    expect(tokenPlan?.models["glm-5"]).not.toHaveProperty("interleaved");
    expect(tokenPlan?.models["glm-5"]?.limit).toEqual({
      context: 335_872,
      input: 204_800,
      output: 131_072,
    });
    expect(tokenPlan?.models["glm-5.1"]).not.toHaveProperty("tool_call");
    expect(tokenPlan?.models["glm-5.1"]?.limit).toEqual({
      context: 333_824,
      input: 202_752,
      output: 131_072,
    });
    expect(tokenPlan?.models["kimi-k2.6"]).not.toHaveProperty("temperature");
    expect(tokenPlan?.models["kimi-k2.6"]).not.toHaveProperty("tool_call");
    expect(tokenPlan?.models["kimi-k2.6"]).not.toHaveProperty(
      "structured_output",
    );
    expect(tokenPlan?.models["kimi-k2.6"]).not.toHaveProperty("interleaved");
    expect(tokenPlan?.models["deepseek-v4-flash-0731"]).not.toHaveProperty(
      "cost_points",
    );
    expect(tokenPlan?.models["deepseek-v4-flash-0731"]).not.toHaveProperty(
      "reasoning",
    );
    expect(tokenPlan?.models["glm-5.2"]?.limit).toEqual({
      context: 1_000_000,
      input: 1_000_000,
      output: 131_072,
    });
    expect(tokenPlan?.models["glm-5.2"]).not.toHaveProperty("cost_points");
    expect(
      tokenPlan?.models["ernie-4.5-turbo-20260402"]?.cost_points,
    ).toEqual({
      per_tokens: 1_000,
      input: 0.8,
      output: 3.2,
      cache_read: 0.2,
    });

    expect(codingPlan?.api).toBe("https://qianfan.baidubce.com/v2/coding");
    expect(Object.keys(codingPlan?.models ?? {}).sort()).toEqual(
      [
        "deepseek-v3.2",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "glm-5.1",
        "glm-5",
        "ernie-4.5-turbo-20260402",
        "kimi-k2.5",
      ].sort(),
    );
    expect(codingPlan?.models["deepseek-v4-pro"]?.limit).toEqual({
      context: 1_155_072,
      input: 1_024_000,
      output: 131_072,
    });
    expect(codingPlan?.models["deepseek-v4-pro"]?.reasoning_options).toEqual(
      tokenPlan?.models["deepseek-v4-pro"]?.reasoning_options,
    );
    expect(codingPlan?.plans_cn?.map((plan) => plan.price_month)).toEqual([
      40, 200,
    ]);
    expect(codingPlan?.models["deepseek-v3.2"]?.reasoning).toBe(false);
    expect(codingPlan?.models["deepseek-v3.2"]?.limit).toEqual({
      context: 131_072,
      input: 98_304,
      output: 32_768,
    });
    expect(codingPlan?.models["deepseek-v4-flash"]?.temperature).toBe(false);
    expect(codingPlan?.models["deepseek-v4-flash"]?.structured_output).toBe(
      true,
    );
    expect(codingPlan?.models["deepseek-v4-flash"]?.reasoning_options).toEqual(
      api?.models["deepseek-v4-flash"]?.reasoning_options,
    );
    expect(codingPlan?.models["deepseek-v4-flash"]).not.toHaveProperty(
      "tool_call",
    );
    expect(codingPlan?.models["deepseek-v4-flash"]).not.toHaveProperty(
      "interleaved",
    );
    expect(codingPlan?.models["deepseek-v4-flash"]?.limit).toEqual({
      context: 1_155_072,
      input: 1_024_000,
      output: 131_072,
    });
    expect(codingPlan?.models["ernie-4.5-turbo-20260402"]?.temperature).toBe(
      true,
    );
    expect(codingPlan?.models["ernie-4.5-turbo-20260402"]?.limit).toEqual({
      context: 138_240,
      input: 125_952,
      output: 12_288,
    });
    expect(codingPlan?.models["glm-5"]?.tool_call).toBe(true);
    expect(codingPlan?.models["glm-5"]?.structured_output).toBe(true);
    expect(codingPlan?.models["glm-5"]?.limit).toEqual({
      context: 335_872,
      input: 204_800,
      output: 131_072,
    });
    expect(codingPlan?.models["glm-5.1"]).not.toHaveProperty("tool_call");
    expect(codingPlan?.models["glm-5.1"]?.structured_output).toBe(true);
    expect(codingPlan?.models["glm-5.1"]?.limit).toEqual({
      context: 333_824,
      input: 202_752,
      output: 131_072,
    });
    expect(codingPlan?.models["kimi-k2.5"]?.attachment).toBe(false);
    expect(codingPlan?.models["kimi-k2.5"]?.modalities).toEqual({
      input: ["text"],
      output: ["text"],
    });
    expect(codingPlan?.models["kimi-k2.5"]?.temperature).toBe(false);
    expect(codingPlan?.models["kimi-k2.5"]?.tool_call).toBe(true);
    expect(codingPlan?.models["kimi-k2.5"]).not.toHaveProperty(
      "structured_output",
    );
    expect(codingPlan?.models["kimi-k2.5"]?.reasoning_options).toEqual([
      { type: "toggle", field: "thinking.type", endpoints: ["openai"] },
    ]);
    expect(codingPlan?.models["kimi-k2.5"]?.limit).toEqual({
      context: 294_912,
      input: 229_376,
      output: 65_536,
    });
  });

  test("records the current Xiaomi MiMo API and Token Plan", async () => {
    const catalog = await generateCatalog(root);
    const api = catalog.providers.xiaomi;
    const tokenPlan = catalog.providers["xiaomi-token-plan-cn"];
    const endpointProtocols = [
      {
        id: "openai",
        protocol: "openai-compatible",
        default: true,
      },
      {
        id: "responses",
        protocol: "openai-responses",
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
      },
    ] as const;

    expect(Object.keys(api?.models ?? {}).sort()).toEqual([
      "mimo-v2.5",
      "mimo-v2.5-pro",
    ]);
    expect(Object.keys(tokenPlan?.models ?? {}).sort()).toEqual([
      "mimo-v2.5",
      "mimo-v2.5-pro",
    ]);
    expect(
      api?.endpoints?.map(({ api: _api, ...endpoint }) => endpoint),
    ).toEqual([...endpointProtocols]);
    expect(
      tokenPlan?.endpoints?.map(({ api: _api, ...endpoint }) => endpoint),
    ).toEqual([...endpointProtocols]);
    expect(api?.api).toBe("https://api.xiaomimimo.com/v1");
    expect(tokenPlan?.api).toBe(
      "https://token-plan-cn.xiaomimimo.com/v1",
    );

    const expectedReasoningOptions = [
      {
        type: "toggle",
        field: "thinking.type",
        endpoints: ["openai", "anthropic"],
      },
      {
        type: "toggle",
        field: "reasoning.effort",
        endpoints: ["responses"],
      },
    ] as const;
    for (const provider of [api, tokenPlan]) {
      for (const model of Object.values(provider?.models ?? {})) {
        expect(model.endpoints).toEqual(["openai", "responses", "anthropic"]);
        expect(model.limit).toEqual({
          context: 1_048_576,
          output: 131_072,
        });
        expect(model.temperature).toBe(true);
        expect(model.reasoning_options).toEqual(
          expectedReasoningOptions.map((option) => ({
            ...option,
            endpoints: [...option.endpoints],
          })),
        );
      }
    }

    expect(api?.models["mimo-v2.5-pro"]?.cost_cn).toEqual({
      input: 3,
      output: 6,
      cache_read: 0.025,
    });
    expect(api?.models["mimo-v2.5"]?.cost_cn).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.02,
    });
    expect(tokenPlan?.models["mimo-v2.5-pro"]?.cost_points).toEqual({
      per_tokens: 1,
      input: 300,
      output: 600,
      cache_read: 2.5,
      off_peak_multiplier: 0.8,
      peak_window: {
        days: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
        start: "08:00",
        end: "00:00",
        timezone: "Asia/Shanghai",
      },
    });
    expect(tokenPlan?.models["mimo-v2.5"]?.cost_points).toMatchObject({
      per_tokens: 1,
      input: 100,
      output: 200,
      cache_read: 2,
      off_peak_multiplier: 0.8,
    });

    expect(catalog.models["xiaomi/mimo-v2.5"]?.modalities).toEqual({
      input: ["text", "image", "video", "audio"],
      output: ["text"],
    });
    expect(catalog.models["xiaomi/mimo-v2.5"]?.open_weights).toBe(true);
    expect(catalog.models["xiaomi/mimo-v2.5-pro"]?.open_weights).toBe(true);
  });

  test("records the current StepFun API and Step Plan whitelists", async () => {
    const catalog = await generateCatalog(root);
    const api = catalog.providers.stepfun;
    const stepPlan = catalog.providers["stepfun-step-plan"];

    expect(api?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.stepfun.com/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.stepfun.com",
      },
    ]);
    expect(Object.keys(api?.models ?? {}).sort()).toEqual([
      "step-3.5-flash",
      "step-3.5-flash-2603",
      "step-3.7-flash",
    ]);
    expect(api?.models["step-3.7-flash"]?.cost_cn).toEqual({
      input: 1.35,
      output: 8.1,
      cache_read: 0.27,
    });
    expect(api?.models["step-3.7-flash"]?.reasoning_options).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "medium", "high"],
        default: "medium",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "medium", "high"],
        default: "medium",
      },
    ]);
    expect(api?.models["step-3.7-flash"]?.structured_output).toBe(true);
    expect(api?.models["step-3.5-flash-2603"]?.reasoning_options).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "high"],
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "high"],
      },
    ]);
    expect(api?.models["step-3.5-flash"]).not.toHaveProperty(
      "reasoning_options",
    );

    expect(stepPlan?.api).toBe("https://api.stepfun.com/step_plan/v1");
    expect(Object.keys(stepPlan?.models ?? {}).sort()).toEqual([
      "step-3.5-flash",
      "step-3.5-flash-2603",
      "step-3.7-flash",
      "step-router-v1",
    ]);
    expect(stepPlan?.models["step-3.7-flash"]?.structured_output).toBe(true);
    expect(stepPlan?.models["step-3.7-flash"]?.reasoning_options).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["low", "medium", "high"],
        default: "medium",
      },
      {
        type: "effort",
        field: "output_config.effort",
        endpoints: ["anthropic"],
        values: ["low", "medium", "high"],
        default: "medium",
      },
    ]);
    expect(stepPlan?.models["step-router-v1"]).toMatchObject({
      name: "Step Router V1",
      description:
        "阶跃星辰 Step Plan 专属智能路由模型，自动在 DeepSeek V4 Pro 与 Step 3.7 Flash 之间调度，并按实际命中的模型计费。",
      attachment: false,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      temperature: true,
      open_weights: false,
      endpoints: ["openai", "anthropic"],
      limit: { context: 256_000, output: 250_000 },
      modalities: { input: ["text"], output: ["text"] },
    });
    expect(stepPlan?.models["step-router-v1"]).not.toHaveProperty(
      "reasoning_options",
    );
    expect(stepPlan?.models["step-router-v1"]).not.toHaveProperty("cost_cn");
    expect(stepPlan?.plans_cn).toEqual([
      { name: "Flash Mini", price_month: 49, usage: "每月 400M Credits" },
      { name: "Flash Plus", price_month: 99, usage: "每月 1,600M Credits" },
      { name: "Flash Pro", price_month: 199, usage: "每月 8,000M Credits" },
      { name: "Flash Max", price_month: 699, usage: "每月 40,000M Credits" },
    ]);

    expect(catalog.models["stepfun/step-3.5-flash"]?.limit).toEqual({
      context: 256_000,
    });
    expect(catalog.models["stepfun/step-3.7-flash"]?.modalities).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
    });
  });

  test("records the current SiliconFlow Agent model whitelist and prices", async () => {
    const catalog = await generateCatalog(root);
    const provider = catalog.providers["siliconflow-cn"];

    expect(catalog.providers).not.toHaveProperty("siliconflow");
    expect(provider?.name).toBe("硅基流动");
    expect(provider?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.siliconflow.cn/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.siliconflow.cn/v1",
      },
    ]);
    expect(Object.keys(provider?.models ?? {}).sort()).toEqual(
      [
        "deepseek-ai/DeepSeek-V4-Flash",
        "deepseek-ai/DeepSeek-V4-Pro",
        "zai-org/GLM-5.2",
        "zai-org/GLM-5.3",
        "Pro/zai-org/GLM-5.1",
        "moonshotai/Kimi-K2.7-Code",
        "Pro/moonshotai/Kimi-K2.6",
        "MiniMaxAI/MiniMax-M2.5",
        "Pro/MiniMaxAI/MiniMax-M2.5",
        "stepfun-ai/Step-3.5-Flash",
        "meituan-longcat/LongCat-2.0",
        "nex-agi/Nex-N2-Pro",
        "Qwen/Qwen3.6-35B-A3B",
        "Qwen/Qwen3.6-27B",
        "Qwen/Qwen3.5-397B-A17B",
        "Qwen/Qwen3.5-122B-A10B",
        "Qwen/Qwen3.5-35B-A3B",
        "Qwen/Qwen3.5-27B",
      ].sort(),
    );
    expect(provider?.models["zai-org/GLM-5.3"]).toMatchObject({
      tool_call: true,
      limit: { context: 1_048_576 },
      cost_cn: { input: 8, output: 28, cache_read: 2 },
    });
    expect(provider?.models["zai-org/GLM-5.3"]?.reasoning).toBeUndefined();
    expect(provider?.models["zai-org/GLM-5.3"]?.temperature).toBeUndefined();
    expect(provider?.models["zai-org/GLM-5.3"]?.structured_output).toBeUndefined();
    expect(provider?.models["zai-org/GLM-5.3"]?.limit.output).toBeUndefined();
    expect(provider?.models["deepseek-ai/DeepSeek-V4-Flash"]?.cost_cn).toEqual({
      input: 1.5,
      output: 4.5,
      cache_read: 0.15,
      tiers: [
        {
          input: 1.5,
          output: 4.5,
          cache_read: 0.15,
          tier: {
            type: "conditional",
            label: "闲时",
            time: {
              timezone: "Asia/Shanghai",
              windows: [{ start: "02:00", end: "08:00" }],
            },
          },
        },
        {
          input: 3,
          output: 9,
          cache_read: 0.3,
          tier: {
            type: "conditional",
            label: "其他时间",
            time: {
              timezone: "Asia/Shanghai",
              windows: [
                { start: "00:00", end: "02:00" },
                { start: "08:00", end: "24:00" },
              ],
            },
          },
        },
      ],
    });
    expect(
      provider?.models["deepseek-ai/DeepSeek-V4-Flash"]?.reasoning_options,
    ).toEqual([
      {
        type: "effort",
        field: "reasoning_effort",
        endpoints: ["openai"],
        values: ["high", "max"],
        default: "high",
      },
    ]);
    expect(provider?.models["Pro/zai-org/GLM-5.1"]?.cost_cn?.tiers).toEqual([
      {
        input: 6,
        output: 24,
        cache_read: 1.3,
        tier: { type: "conditional", input: { gte: 0, lt: 32_000 } },
      },
      {
        input: 8,
        output: 28,
        cache_read: 2,
        tier: { type: "conditional", input: { gte: 32_000 } },
      },
    ]);
    expect(
      provider?.models["Qwen/Qwen3.5-397B-A17B"]?.cost_cn?.tiers,
    ).toEqual([
      {
        input: 1.2,
        output: 7.2,
        tier: { type: "conditional", input: { gte: 0, lt: 128_000 } },
      },
      {
        input: 3,
        output: 18,
        tier: { type: "conditional", input: { gte: 128_000 } },
      },
    ]);
    for (const modelID of [
      "Qwen/Qwen3.5-397B-A17B",
      "Qwen/Qwen3.5-122B-A10B",
      "Qwen/Qwen3.5-35B-A3B",
      "Qwen/Qwen3.5-27B",
    ]) {
      expect(provider?.models[modelID]).not.toHaveProperty("reasoning_options");
    }
    expect(
      provider?.models["Qwen/Qwen3.6-35B-A3B"],
    ).not.toHaveProperty("reasoning_options");
    expect(
      provider?.models["Qwen/Qwen3.6-35B-A3B"]?.modalities,
    ).toEqual({
      input: ["text", "image"],
      output: ["text"],
    });
    expect(provider?.models["deepseek-ai/DeepSeek-V4-Pro"]?.limit).toEqual({
      context: 1_048_576,
    });
    expect(provider?.models["Pro/zai-org/GLM-5.1"]?.limit).toEqual({
      context: 202_752,
    });
    expect(provider?.models["stepfun-ai/Step-3.5-Flash"]).toMatchObject({
      structured_output: false,
      limit: { context: 262_144 },
    });
    expect(provider?.models["stepfun-ai/Step-3.5-Flash"]).not.toHaveProperty(
      "reasoning",
    );
    expect(provider?.models["stepfun-ai/Step-3.5-Flash"]).not.toHaveProperty(
      "interleaved",
    );
    expect(provider?.models["Pro/MiniMaxAI/MiniMax-M2.5"]?.cost_cn).toEqual({
      input: 2.1,
      output: 8.4,
      cache_read: 0.21,
    });
    for (const modelID of [
      "MiniMaxAI/MiniMax-M2.5",
      "Pro/MiniMaxAI/MiniMax-M2.5",
    ]) {
      expect(provider?.models[modelID]).not.toHaveProperty("reasoning");
      expect(provider?.models[modelID]).not.toHaveProperty("interleaved");
    }
    expect(provider?.models["meituan-longcat/LongCat-2.0"]?.cost_cn).toEqual({
      input: 5,
      output: 20,
      cache_read: 0.1,
    });
    expect(provider?.models["meituan-longcat/LongCat-2.0"]).toMatchObject({
      structured_output: true,
      limit: { context: 1_048_576 },
    });
    expect(
      provider?.models["meituan-longcat/LongCat-2.0"]?.limit,
    ).not.toHaveProperty("output");
    expect(provider?.models["nex-agi/Nex-N2-Pro"]).toMatchObject({
      attachment: true,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      limit: { context: 262_144 },
      modalities: { input: ["text", "image"], output: ["text"] },
      cost_cn: { input: 1.75, output: 7, cache_read: 0.175 },
    });
    expect(provider?.models["nex-agi/Nex-N2-Pro"]).not.toHaveProperty(
      "temperature",
    );
    for (const model of Object.values(provider?.models ?? {})) {
      expect(model).not.toHaveProperty("temperature");
    }
  });

  test("records the current PPIO Agent model whitelist and prices", async () => {
    const catalog = await generateCatalog(root);
    const provider = catalog.providers.ppio;

    expect(provider?.name).toBe("PPIO 派欧云");
    expect(provider?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.ppio.com/openai/v1",
        default: true,
      },
      {
        id: "responses",
        protocol: "openai-responses",
        api: "https://api.ppio.com/openai/v1",
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.ppio.com/anthropic",
      },
    ]);
    expect(Object.keys(provider?.models ?? {}).sort()).toEqual(
      [
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-flash-0731",
        "deepseek/deepseek-v4-pro",
        "deepseek/deepseek-v4-pro-0813",
        "zai-org/glm-5.3",
        "zai-org/glm-5.3-flash",
        "zai-org/glm-5.2",
        "moonshotai/kimi-k3",
        "moonshotai/kimi-k2.7-code",
        "minimax/minimax-m3",
        "xiaomimimo/mimo-v2.5",
        "xiaomimimo/mimo-v2.5-pro",
        "qwen/qwen3.8-max",
        "qwen/qwen3.8-2.4t-a95b",
        "qwen/qwen3.8-27b",
        "qwen/qwen3.8-flash",
        "qwen/qwen3.6-plus",
        "qwen/qwen3.6-35b-a3b",
        "qwen/qwen3.6-27b",
        "qwen/qwen3-coder-next",
      ].sort(),
    );

    expect(provider?.models["deepseek/deepseek-v4-flash"]?.endpoints).toEqual([
      "openai",
      "anthropic",
    ]);
    expect(
      provider?.models["deepseek/deepseek-v4-flash-0731"]?.endpoints,
    ).toEqual(["openai", "anthropic", "responses"]);
    expect(provider?.models["qwen/qwen3.6-plus"]?.endpoints).toEqual([
      "openai",
      "responses",
    ]);
    expect(provider?.models["qwen/qwen3.6-35b-a3b"]?.endpoints).toEqual([
      "openai",
    ]);
    expect(
      provider?.models["qwen/qwen3.8-2.4t-a95b"]?.endpoints,
    ).toEqual(["openai", "responses"]);
    expect(provider?.models["zai-org/glm-5.3-flash"]?.endpoints).toEqual([
      "openai",
      "anthropic",
      "responses",
    ]);

    expect(provider?.models["zai-org/glm-5.3"]?.cost_cn).toEqual({
      input: 8,
      output: 28,
      cache_read: 2,
    });
    expect(provider?.models["moonshotai/kimi-k3"]?.limit).toEqual({
      context: 1_048_576,
      output: 1_048_576,
    });
    expect(provider?.models["minimax/minimax-m3"]?.cost_cn?.tiers).toEqual([
      {
        input: 2.1,
        output: 8.4,
        cache_read: 0.42,
        tier: {
          type: "conditional",
          input: { gte: 1, lte: 524_288 },
        },
      },
      {
        input: 4.2,
        output: 16.8,
        cache_read: 0.84,
        tier: {
          type: "conditional",
          input: { gt: 524_288, lte: 1_000_000 },
        },
      },
    ]);
    expect(provider?.models["qwen/qwen3.6-plus"]?.cost_cn).toMatchObject({
      input: 2,
      output: 12,
      cache_read: 0.2,
      cache_write: 2.5,
    });
    expect(provider?.models["qwen/qwen3.6-plus"]?.cost_cn?.tiers?.[1]).toEqual({
      input: 8,
      output: 48,
      cache_read: 0.8,
      cache_write: 10,
      tier: {
        type: "conditional",
        input: { gt: 262_144, lte: 1_000_000 },
      },
    });
    expect(provider?.models["minimax/minimax-m3"]?.structured_output).toBe(
      true,
    );
    expect(
      provider?.models["qwen/qwen3-coder-next"]?.structured_output,
    ).toBe(true);
    for (const model of Object.values(provider?.models ?? {})) {
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("interleaved");
    }
    for (const id of [
      "qwen/qwen3-coder-next",
      "qwen/qwen3.6-plus",
      "qwen/qwen3.8-max",
    ]) {
      expect(provider?.models[id]?.limit).not.toHaveProperty("input");
    }
    expect(provider?.models["qwen/qwen3.8-2.4t-a95b"]).toMatchObject({
      attachment: false,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      limit: { context: 1_000_000, output: 131_072 },
      modalities: { input: ["text"], output: ["text"] },
      cost_cn: { input: 12, output: 36, cache_read: 1.5 },
    });
    expect(provider?.models["qwen/qwen3.8-27b"]).toMatchObject({
      attachment: true,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      endpoints: ["openai", "anthropic", "responses"],
      limit: { context: 1_000_000, output: 131_072 },
      modalities: {
        input: ["text", "image", "video"],
        output: ["text"],
      },
      cost_cn: { input: 3, output: 12, cache_read: 0.6 },
    });
    expect(provider?.models["qwen/qwen3.8-27b"]?.limit).not.toHaveProperty(
      "input",
    );
    expect(provider?.models["qwen/qwen3.8-flash"]).toMatchObject({
      attachment: true,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      endpoints: ["openai", "anthropic", "responses"],
      limit: { context: 1_000_000, output: 131_072 },
      modalities: {
        input: ["text", "image", "video"],
        output: ["text"],
      },
      cost_cn: { input: 0.8, output: 2.7, cache_read: 0.1 },
    });
    expect(provider?.models["qwen/qwen3.8-flash"]).not.toHaveProperty(
      "temperature",
    );
    expect(provider?.models["qwen/qwen3.8-flash"]?.limit).not.toHaveProperty(
      "input",
    );
    expect(provider?.models["zai-org/glm-5.3-flash"]).toMatchObject({
      attachment: true,
      reasoning: true,
      tool_call: true,
      structured_output: true,
      limit: { context: 1_048_576, output: 131_072 },
      modalities: {
        input: ["text", "image", "video"],
        output: ["text"],
      },
      cost_cn: { input: 0.8, output: 2.8, cache_read: 0.23 },
    });
  });

  test("records the current Huawei Cloud MaaS catalog and CNY prices", async () => {
    const catalog = await generateCatalog(root);
    const provider = catalog.providers["huawei-cloud-maas"];

    expect(provider?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://api.modelarts-maas.com/openai/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://api.modelarts-maas.com/anthropic",
      },
    ]);
    expect(Object.keys(provider?.models ?? {}).sort()).toEqual(
      [
        "openpangu-2.0-pro",
        "openpangu-2.0-flash",
        "glm-5.2",
        "glm-5.1",
        "kimi-k2.6",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "qwen3-32b",
        "qwen3-30b-a3b",
      ].sort(),
    );
    expect(provider?.models["openpangu-2.0-pro"]?.cost_cn).toEqual({
      input: 3.2,
      output: 14.5,
      cache_read: 0.8,
      tiers: [
        {
          input: 4.8,
          output: 17.6,
          cache_read: 1.2,
          tier: { type: "conditional", input: { gte: 32_768 } },
        },
      ],
    });
    expect(provider?.models["glm-5.2"]?.cost_cn?.tiers?.[1]).toMatchObject({
      input: 5.6,
      output: 19.6,
      tier: { type: "conditional", label: "时段 2" },
    });
    expect(provider?.models["qwen3-32b"]?.cost_cn).toEqual({
      input: 2,
      output: 8,
      thinking: { input: 2, output: 20 },
    });
    expect(provider?.models["glm-5.2"]?.reasoning_options).toContainEqual({
      type: "effort",
      field: "reasoning_effort",
      endpoints: ["openai", "anthropic"],
      values: ["none", "high", "max"],
      default: "max",
    });
    expect(provider?.models["kimi-k2.6"]).toMatchObject({
      attachment: false,
      modalities: { input: ["text"], output: ["text"] },
    });
    expect(provider?.models["qwen3-30b-a3b"]).toMatchObject({
      endpoints: ["openai", "anthropic"],
      tool_call: false,
      reasoning_options: [
        {
          type: "toggle",
          field: "chat_template_kwargs.enable_thinking",
          endpoints: ["openai"],
        },
      ],
    });
    expect(provider?.models["qwen3-30b-a3b"]?.structured_output).toBeUndefined();
    expect(provider?.models["qwen3-32b"]).toMatchObject({
      endpoints: ["openai", "anthropic"],
      reasoning_options: [
        {
          type: "toggle",
          field: "chat_template_kwargs.enable_thinking",
          endpoints: ["openai"],
        },
      ],
    });
    expect(provider?.models["openpangu-2.0-pro"]?.structured_output).toBeUndefined();
    expect(provider?.models["openpangu-2.0-flash"]?.structured_output).toBeUndefined();
  });

  test("records the current Gitee AI API catalog", async () => {
    const catalog = await generateCatalog(root);
    const gitee = catalog.providers["gitee-ai"];

    expect(Object.keys(gitee?.models ?? {}).sort()).toEqual(
      [
        "GLM-5.3",
        "GLM-5.3-Flash",
        "kimi-k3",
        "qwen3.8-max",
        "qwen3.8-max-0902",
        "qwen3.8-max-2026-09-02",
        "qwen3.8-flash",
        "qwen3.8-27b",
        "DeepSeek-V4-Pro",
        "DeepSeek-V4-Flash",
        "DeepSeek-V4-Pro-0813",
        "deepseek-v4-flash-0731",
        "MiniMax-M3",
        "MiMo-V2.5-Pro",
        "Kimi-K2.7-Code",
        "Step-3.7-Flash",
      ].sort(),
    );
    expect(gitee?.models["GLM-5.3"]?.cost_cn).toEqual({
      input: 8,
      output: 28,
    });
    expect(gitee?.models["qwen3.8-27b"]?.cost_cn).toEqual({
      input: 3,
      output: 12,
    });
    for (const model of Object.values(gitee?.models ?? {})) {
      expect(model.structured_output).toBeUndefined();
    }
    expect(gitee?.models["qwen3.8-flash"]).toMatchObject({
      tool_call: true,
      limit: { context: 1_000_000 },
      modalities: {
        input: ["text", "image", "video"],
        output: ["text"],
      },
      cost_cn: { input: 0.8, output: 2.7 },
    });
    expect(gitee?.models["qwen3.8-flash"]?.reasoning).toBeUndefined();
    expect(
      gitee?.models["qwen3.8-flash"]?.structured_output,
    ).toBeUndefined();
    expect(gitee?.models["GLM-5.3"]).toMatchObject({
      limit: { context: 1_000_000, output: 128_000 },
    });
    expect(gitee?.models["GLM-5.3"]?.reasoning).toBeUndefined();
    expect(gitee?.models["GLM-5.3"]?.structured_output).toBeUndefined();
    expect(gitee?.models["GLM-5.3-Flash"]).toMatchObject({
      tool_call: true,
      limit: { context: 1_000_000, output: 128_000 },
      modalities: { input: ["text"], output: ["text"] },
      cost_cn: { input: 0.8, output: 2.8, cache_read: 0.23 },
    });
    expect(gitee?.models["GLM-5.3-Flash"]?.reasoning).toBeUndefined();
    expect(gitee?.models["DeepSeek-V4-Pro"]?.reasoning).toBe(true);
    expect(gitee?.models["DeepSeek-V4-Pro"]?.limit.output).toBeUndefined();
    expect(gitee?.models["DeepSeek-V4-Flash"]?.reasoning).toBeUndefined();
    expect(gitee?.models["DeepSeek-V4-Flash"]?.limit.output).toBeUndefined();
    expect(gitee?.models["Kimi-K2.7-Code"]?.modalities.input).toEqual([
      "text",
      "image",
    ]);
    expect(gitee?.models["qwen3.8-27b"]?.temperature).toBe(false);
    expect(gitee?.models["qwen3.8-max"]?.temperature).toBe(false);
    for (const id of ["qwen3.8-max-0902", "qwen3.8-max-2026-09-02"]) {
      expect(gitee?.models[id]).toMatchObject({
        id,
        limit: { context: 1_000_000, output: 128_000 },
        cost_cn: { input: 12, output: 36 },
      });
      expect(gitee?.models[id]?.reasoning).toBeUndefined();
      expect(gitee?.models[id]?.temperature).toBeUndefined();
      expect(gitee?.models[id]?.tool_call).toBeUndefined();
      expect(gitee?.models[id]?.structured_output).toBeUndefined();
    }
    expect(gitee?.models["kimi-k3"]?.temperature).toBeUndefined();
    expect(catalog.providers.modelscope).toBeUndefined();
  });

  test("records Tencent plans and Spark X2 call surfaces separately", async () => {
    const catalog = await generateCatalog(root);

    expect(
      Object.keys(catalog.providers["tencent-coding-plan"]?.models ?? {}).sort(),
    ).toEqual(["glm-5", "glm-5-0", "tc-code-latest"]);
    expect(
      Object.keys(catalog.providers["tencent-token-plan"]?.models ?? {}),
    ).toHaveLength(25);
    for (const id of [
      "glm-5.3",
      "glm-5-3",
      "glm-5.3-flash",
      "kimi-k3",
      "kimi-k2.7-code",
      "minimax-m3",
      "minimax-m-3-0",
      "hy3-202608",
    ]) {
      expect(catalog.providers["tencent-token-plan"]?.models).toHaveProperty([id]);
    }
    expect(catalog.providers["tencent-token-plan"]?.models).not.toHaveProperty(
      "hy4-preview",
    );
    expect(catalog.providers["tencent-token-plan"]?.plans_cn).toEqual([
      { name: "通用 Lite", price_month: 39, usage: "每订阅月 780 积分" },
      { name: "通用 Standard", price_month: 99, usage: "每订阅月 1,980 积分" },
      { name: "通用 Pro", price_month: 299, usage: "每订阅月 5,980 积分" },
      { name: "通用 Max", price_month: 599, usage: "每订阅月 11,980 积分" },
      {
        name: "Hy Lite",
        price_month: 28,
        usage: "每订阅月 560 积分，适用于 Hy Token Plan 模型",
      },
      {
        name: "Hy Standard",
        price_month: 78,
        usage: "每订阅月 1,560 积分，适用于 Hy Token Plan 模型",
      },
      {
        name: "Hy Pro",
        price_month: 238,
        usage: "每订阅月 4,760 积分，适用于 Hy Token Plan 模型",
      },
      {
        name: "Hy Max",
        price_month: 468,
        usage: "每订阅月 9,360 积分，适用于 Hy Token Plan 模型",
      },
    ]);
    expect(
      catalog.providers["tencent-token-plan"]?.models["glm-5.3"]?.cost_points,
    ).toEqual({ per_tokens: 1_000_000, input: 160, output: 560, cache_read: 40 });
    expect(
      catalog.providers["tencent-token-plan"]?.models["kimi-k2.7-code"]
        ?.cost_points,
    ).toEqual({ per_tokens: 1_000_000, input: 130, output: 540, cache_read: 26 });
    expect(
      catalog.providers["tencent-token-plan"]?.models["hy3-202608"]?.cost_points,
    ).toEqual({ per_tokens: 1_000_000, input: 20, output: 80, cache_read: 5 });
    expect(
      catalog.providers["tencent-coding-plan"]?.models["glm-5"]
        ?.structured_output,
    ).toBe(false);
    expect(
      catalog.providers["tencent-coding-plan"]?.models["glm-5-0"]
        ?.structured_output,
    ).toBe(false);
    for (const id of [
      "deepseek-v4-flash-202605",
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-flash",
      "deepseek-v4-pro-202606",
      "deepseek/deepseek-v4-pro-0813",
      "deepseek/deepseek-v4-pro",
    ]) {
      expect(
        catalog.providers["tencent-token-plan"]?.models[id]?.limit.output,
      ).toBe(393_216);
    }
    expect(
      catalog.providers["tencent-token-plan"]?.models["glm-5.2"]?.limit,
    ).toEqual({ context: 1_000_000, input: 1_000_000, output: 131_072 });
    expect(
      catalog.providers["tencent-token-plan"]?.models["glm-5-2"]?.limit,
    ).toEqual({ context: 1_000_000, input: 1_000_000, output: 131_072 });
    expect(
      catalog.providers["tencent-token-plan"]?.models["glm-5"]
        ?.structured_output,
    ).toBe(false);
    expect(
      catalog.providers["tencent-token-plan"]?.models["glm-5-0"]
        ?.structured_output,
    ).toBe(false);
    for (const id of [
      "deepseek-v4-flash-202605",
      "deepseek-v4-pro-202606",
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-pro-0813",
      "glm-5",
      "glm-5-0",
      "glm-5-1",
      "glm-5-2",
      "glm-5.1",
      "glm-5.2",
      "minimax-m-2-7",
      "minimax-m2.7",
    ]) {
      expect(
        catalog.providers["tencent-token-plan"]?.models[id]?.temperature,
      ).toBeUndefined();
    }
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"],
    ).toMatchObject({
      attachment: false,
      limit: { context: 204_800 },
      modalities: { input: ["text"], output: ["text"] },
    });
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"]
        ?.reasoning,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"]
        ?.temperature,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"]
        ?.tool_call,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"]
        ?.structured_output,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-token-plan"]?.models["tc-code-latest"]
        ?.limit.output,
    ).toBeUndefined();
    for (const id of ["glm-5", "glm-5-0"]) {
      expect(
        catalog.providers["tencent-coding-plan"]?.models[id]?.temperature,
      ).toBeUndefined();
    }
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"],
    ).toMatchObject({
      attachment: false,
      limit: { context: 204_800 },
      modalities: { input: ["text"], output: ["text"] },
    });
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"]
        ?.reasoning,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"]
        ?.temperature,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"]
        ?.tool_call,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"]
        ?.structured_output,
    ).toBeUndefined();
    expect(
      catalog.providers["tencent-coding-plan"]?.models["tc-code-latest"]
        ?.limit.output,
    ).toBeUndefined();
    expect(catalog.providers["iflytek-spark-x2"]?.models["spark-x"]?.cost_cn).toEqual({
      input: 3,
      output: 3,
    });
    expect(
      catalog.providers["iflytek-spark-x2-flash"]?.models["spark-x"]?.cost_cn,
    ).toEqual({ input: 1, output: 2 });
  });

  test("records Infini-AI, SenseNova, and CTYun Xirang conservatively", async () => {
    const catalog = await generateCatalog(root);
    const infini = catalog.providers["infini-ai"];
    const sensenova = catalog.providers.sensenova;
    const ctyun = catalog.providers["ctyun-xirang"];

    expect(infini?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://cloud.infini-ai.com/maas/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://cloud.infini-ai.com/maas",
      },
    ]);
    expect(Object.keys(infini?.models ?? {}).sort()).toEqual(
      [
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "glm-5.1",
        "glm-5.2",
        "kimi-k2.6",
        "kimi-k2.7-code",
        "minimax-m2.7",
        "mimo-v2.5-pro",
        "qwen3.6-27b",
        "qwen3.6-35b-a3b",
      ].sort(),
    );

    expect(sensenova?.api).toBe("https://token.sensenova.cn/v1");
    expect(sensenova?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://token.sensenova.cn/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://token.sensenova.cn",
      },
    ]);
    expect(Object.keys(sensenova?.models ?? {}).sort()).toEqual(
      [
        "sensenova-6.8-flash-lite",
        "deepseek-v4-flash",
        "deepseek-v4-pro",
        "glm-5.2",
        "kimi-k3",
      ].sort(),
    );
    expect(sensenova?.models["sensenova-6.8-flash-lite"]?.limit).toEqual({
      context: 256_000,
      output: 65_536,
    });
    expect(sensenova?.models["deepseek-v4-flash"]?.limit).toEqual({
      context: 1_000_000,
      output: 65_536,
    });
    expect(sensenova?.models["deepseek-v4-pro"]?.limit).toEqual({
      context: 1_000_000,
      output: 393_216,
    });
    expect(sensenova?.models["kimi-k3"]?.limit).toEqual({
      context: 1_000_000,
      output: 131_072,
    });
    expect(sensenova?.models["kimi-k3"]?.modalities.input).toEqual([
      "text",
      "image",
    ]);
    expect(sensenova?.models["kimi-k3"]?.structured_output).toBeUndefined();

    expect(ctyun?.api).toBe("https://ai.ctaigw.cn/v1");
    expect(Object.keys(ctyun?.models ?? {}).sort()).toEqual(
      [
        "DeepSeek-V3.2-Standard",
        "DeepSeek-V4-Flash",
        "GLM-5",
        "GLM-5.1",
        "Qwen3.5-122B-A10B",
        "Qwen3.5-397B-A17B",
      ].sort(),
    );
    expect(ctyun?.models["DeepSeek-V3.2-Standard"]?.reasoning).toBe(true);
    expect(ctyun?.models["DeepSeek-V3.2-Standard"]?.limit).toEqual({
      context: 131_072,
      output: 16_384,
    });
    expect(ctyun?.models["DeepSeek-V3.2-Standard"]?.doc).toBe(
      "https://www.ctyun.cn/document/11061839/11091746",
    );
    expect(ctyun?.models["GLM-5.1"]?.limit).toEqual({
      context: 204_800,
      output: 131_072,
    });
    expect(ctyun?.models["Qwen3.5-122B-A10B"]?.limit).toEqual({
      context: 262_144,
      output: 65_536,
    });
    expect(ctyun?.models["Qwen3.5-397B-A17B"]).toMatchObject({
      attachment: true,
      reasoning: true,
      limit: { context: 65_536, output: 16_384 },
      modalities: { input: ["text", "image"], output: ["text"] },
      doc: "https://www.ctyun.cn/document/11061839/11091746",
    });
    for (const modelID of [
      "DeepSeek-V4-Flash",
      "GLM-5",
      "Qwen3.5-122B-A10B",
      "Qwen3.5-397B-A17B",
    ]) {
      const model = ctyun?.models[modelID];
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("tool_call");
      expect(model).not.toHaveProperty("structured_output");
    }
    for (const modelID of ["DeepSeek-V4-Flash", "GLM-5"]) {
      expect(ctyun?.models[modelID]).not.toHaveProperty("reasoning");
      expect(ctyun?.models[modelID]?.limit).not.toHaveProperty("output");
    }
  });

  test("records CTYun Coding Plan separately from the general TokenHub API", async () => {
    const catalog = await generateCatalog(root);
    const provider = catalog.providers["ctyun-coding-plan"];

    expect(provider?.api).toBe("https://ai.ctaigw.cn/coding/v1");
    expect(provider?.endpoints).toEqual([
      {
        id: "openai",
        protocol: "openai-compatible",
        api: "https://ai.ctaigw.cn/coding/v1",
        default: true,
      },
      {
        id: "anthropic",
        protocol: "anthropic-compatible",
        api: "https://ai.ctaigw.cn/coding",
      },
    ]);
    expect(provider?.plans_cn).toEqual([
      {
        name: "2500 万 Tokens",
        price_month: 29,
        usage: "入门体验，适合首次体验 AI 工具能力",
      },
      {
        name: "8000 万 Tokens",
        price_month: 89,
        usage: "日常使用，适合处理基础的开发任务",
      },
      {
        name: "1.8 亿 Tokens",
        price_month: 199,
        usage: "轻量开发，适合处理较为复杂的开发任务",
      },
      {
        name: "3.8 亿 Tokens",
        price_month: 399,
        usage: "专业开发，适合处理复杂项目的开发任务",
      },
      {
        name: "6.8 亿 Tokens",
        price_month: 699,
        usage: "高频 AI 开发，适合处理复杂项目的持续迭代任务",
      },
    ]);
    expect(Object.keys(provider?.models ?? {}).sort()).toEqual(
      ["DeepSeek-V4-Flash-0731", "GLM-5.1"].sort(),
    );
    for (const model of Object.values(provider?.models ?? {})) {
      expect(model.endpoints).toEqual(["openai", "anthropic"]);
      expect(model).not.toHaveProperty("temperature");
      expect(model).not.toHaveProperty("structured_output");
    }
    expect(provider?.models["DeepSeek-V4-Flash-0731"]).not.toHaveProperty(
      "reasoning",
    );
    expect(provider?.models["DeepSeek-V4-Flash-0731"]?.limit).not.toHaveProperty(
      "output",
    );
    expect(provider?.models["GLM-5.1"]?.limit).toEqual({
      context: 204_800,
      output: 131_072,
    });
    expect(provider?.models["GLM-5.1"]).not.toHaveProperty("reasoning");
    expect(provider?.models["GLM-5.1"]).not.toHaveProperty("tool_call");
  });

  test("records Baichuan's current general-purpose API models", async () => {
    const catalog = await generateCatalog(root);
    const baichuan = catalog.providers.baichuan;

    expect(baichuan?.api).toBe("https://api.baichuan-ai.com/v1");
    expect(Object.keys(baichuan?.models ?? {}).sort()).toEqual(
      [
        "Baichuan4-Turbo",
        "Baichuan4-Air",
        "Baichuan4",
        "Baichuan3-Turbo-128k",
        "Baichuan3-Turbo",
        "Baichuan2-Turbo",
      ].sort(),
    );
    expect(baichuan?.models["Baichuan4-Turbo"]?.tool_call).toBe(true);
    expect(baichuan?.models["Baichuan4-Air"]?.tool_call).toBe(true);
    expect(baichuan?.models["Baichuan3-Turbo-128k"]?.tool_call).toBe(false);
    for (const id of ["Baichuan4-Turbo", "Baichuan4-Air", "Baichuan3-Turbo-128k"]) {
      expect(baichuan?.models[id]?.structured_output).toBe(true);
      expect(baichuan?.models[id]).not.toHaveProperty("reasoning");
    }
    expect(baichuan?.models["Baichuan4-Turbo"]?.cost_cn).toEqual({
      input: 15,
      output: 15,
    });
    expect(baichuan?.models["Baichuan4-Air"]?.cost_cn).toEqual({
      input: 0.98,
      output: 0.98,
    });
    expect(baichuan?.models["Baichuan3-Turbo-128k"]?.cost_cn).toEqual({
      input: 24,
      output: 24,
    });
    expect(baichuan?.models["Baichuan4"]?.cost_cn).toEqual({
      input: 100,
      output: 100,
    });
    expect(baichuan?.models["Baichuan3-Turbo"]?.cost_cn).toEqual({
      input: 12,
      output: 12,
    });
    expect(baichuan?.models["Baichuan2-Turbo"]?.cost_cn).toEqual({
      input: 8,
      output: 8,
    });
    expect(baichuan?.models["Baichuan2-Turbo"]?.tool_call).toBe(true);
    expect(baichuan?.models["Baichuan2-Turbo"]?.structured_output).toBe(false);
    expect(baichuan?.models["Baichuan3-Turbo"]?.temperature).toBe(true);
    expect(baichuan?.models["Baichuan3-Turbo"]?.tool_call).toBe(true);
    expect(baichuan?.models["Baichuan3-Turbo"]?.structured_output).toBe(true);
    expect(baichuan?.models["Baichuan4"]?.temperature).toBe(true);
    expect(baichuan?.models["Baichuan4"]?.tool_call).toBe(true);
    expect(baichuan?.models["Baichuan4"]?.structured_output).toBe(true);
    expect(baichuan?.models["Baichuan4"]?.attachment).toBe(false);
    expect(baichuan?.models["Baichuan4"]?.modalities.input).toEqual(["text"]);
  });

  test("records the current Alibaba, Kimi, JD, Intern, and 360 additions", async () => {
    const catalog = await generateCatalog(root);

    expect(
      Object.keys(catalog.providers["alibaba-token-plan-cn"]?.models ?? {}).sort(),
    ).toEqual(
      [
        "qwen3.8-max",
        "qwen3.8-flash",
        "qwen3.7-max",
        "qwen3.7-plus",
        "qwen3.6-flash",
        "deepseek-v4-pro",
        "deepseek-v4-pro-0813",
        "deepseek-v4-flash-0731",
        "glm-5.2",
      ].sort(),
    );
    const alibabaTokenPlan = catalog.providers["alibaba-token-plan-cn"];
    expect(alibabaTokenPlan?.models["qwen3.8-flash"]).toMatchObject({
      endpoints: ["openai", "anthropic"],
      attachment: true,
      tool_call: true,
      structured_output: true,
      limit: { context: 1_000_000, input: 983_616, output: 131_072 },
      modalities: { input: ["text", "image", "video"], output: ["text"] },
    });
    expect(alibabaTokenPlan?.models["deepseek-v4-flash-0731"]).toMatchObject({
      endpoints: ["openai", "anthropic"],
      structured_output: true,
      limit: { output: 393_216 },
    });
    expect(alibabaTokenPlan?.models["deepseek-v4-pro-0813"]?.limit.output).toBe(
      393_216,
    );
    expect(alibabaTokenPlan?.models["deepseek-v4-pro"]).toMatchObject({
      endpoints: ["openai", "anthropic"],
      limit: { output: 393_216 },
    });
    const kimiForCoding = catalog.providers["kimi-for-coding"];
    expect(Object.keys(kimiForCoding?.models ?? {}).sort()).toEqual(
      ["k3", "k3-256k", "kimi-for-coding", "kimi-for-coding-highspeed"].sort(),
    );
    expect(kimiForCoding?.endpoints?.map((endpoint) => endpoint.id)).toEqual([
      "openai",
      "anthropic",
    ]);
    for (const model of Object.values(kimiForCoding?.models ?? {})) {
      expect(model.endpoints).toEqual(["openai", "anthropic"]);
    }
    for (const id of ["k3", "k3-256k"]) {
      expect(kimiForCoding?.models[id]?.reasoning_options).toEqual([
        {
          type: "effort",
          field: "reasoning_effort",
          endpoints: ["openai"],
          values: ["low", "high", "max"],
          default: "high",
        },
      ]);
    }
    expect(kimiForCoding?.models.k3?.limit.output).toBe(1_048_576);
    expect(kimiForCoding?.models["k3-256k"]?.limit).toEqual({
      context: 262_144,
    });
    expect(kimiForCoding?.models["k3-256k"]?.modalities.input).toEqual([
      "text",
      "image",
    ]);
    expect(Object.keys(catalog.providers["jdcloud-token-plan"]?.models ?? {}).sort()).toEqual(
      [
        "GLM-5.1",
        "GLM-5.2",
        "Kimi-K2.6",
        "MiniMax-M3",
        "DeepSeek-V4-Flash",
        "DeepSeek-V4-Flash-0731",
        "DeepSeek-V4-Pro",
        "deepseek-v4-pro-0813",
      ].sort(),
    );
    const jdTokenPlan = catalog.providers["jdcloud-token-plan"];
    expect(jdTokenPlan?.models["DeepSeek-V4-Flash-0731"]).toMatchObject({
      id: "DeepSeek-V4-Flash-0731",
      endpoints: ["openai", "anthropic"],
      limit: { context: 1_000_000, output: 393_216 },
    });
    expect(jdTokenPlan?.models["deepseek-v4-pro-0813"]).toMatchObject({
      id: "deepseek-v4-pro-0813",
      endpoints: ["openai", "anthropic"],
      limit: { context: 1_000_000, output: 393_216 },
    });
    expect(jdTokenPlan?.models).not.toHaveProperty("DeepSeek-V4-Flash-Preview");
    expect(jdTokenPlan?.models).not.toHaveProperty("DeepSeek-V4-Pro-Preview");
    const internlm = catalog.providers.internlm;
    expect(Object.keys(internlm?.models ?? {}).sort()).toEqual(
      [
        "intern-latest",
        "intern-s1",
        "intern-s1-pro",
        "intern-s2-preview-35b",
        "intern-s2-preview-397b",
        "internvl3.5-241b-a28b",
        "internvl3.5-latest",
      ].sort(),
    );
    for (const model of Object.values(internlm?.models ?? {})) {
      expect(model).not.toHaveProperty("structured_output");
    }
    expect(internlm?.models["intern-s2-preview-35b"]).toMatchObject({
      endpoints: ["openai"],
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      limit: { context: 262_144 },
      modalities: { input: ["text", "image"], output: ["text"] },
      reasoning_options: [
        {
          type: "toggle",
          field: "thinking_mode",
          endpoints: ["openai"],
        },
      ],
    });
    expect(internlm?.models["intern-s1"]?.endpoints).toEqual([
      "openai",
      "anthropic",
    ]);
    for (const id of [
      "intern-s1-pro",
      "intern-s2-preview-397b",
      "intern-latest",
    ]) {
      expect(internlm?.models[id]?.endpoints).toEqual(["openai"]);
    }
    expect(internlm?.models["intern-latest"]).not.toHaveProperty("reasoning");
    expect(internlm?.models["intern-latest"]).not.toHaveProperty(
      "reasoning_options",
    );
    for (const id of ["internvl3.5-241b-a28b", "internvl3.5-latest"]) {
      expect(internlm?.models[id]).not.toHaveProperty("reasoning");
    }
    const zhinao = catalog.providers["360-zhinao"];
    expect(Object.keys(zhinao?.models ?? {}).sort()).toEqual(
      [
        "bytedance/doubao-seed-2-1-pro",
        "bytedance/doubao-seed-2-1-turbo",
        "bytedance/doubao-seed-evolving",
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
        "minimax/MiniMax-M3",
        "moonshotai/kimi-k2.7-code",
        "moonshotai/kimi-k2.7-code-highspeed",
        "moonshotai/kimi-k3",
        "qwen/qwen3.7-max",
        "qwen/qwen3.7-plus",
        "qwen/qwen3.8-flash",
        "qwen/qwen3.8-max",
        "stepfun/step-3.7-flash",
        "z-ai/glm-5.2",
        "z-ai/glm-5.3",
        "z-ai/glm-5.3-flash",
      ].sort(),
    );
    expect(zhinao?.models["qwen/qwen3.8-max"]?.cost_cn).toEqual({
      input: 12,
      output: 36,
      cache_read: 1.2,
      cache_write: 15,
    });
    expect(zhinao?.models["deepseek/deepseek-v4-flash"]?.cost_cn).toEqual({
      input: 3,
      output: 9,
      cache_read: 0.3,
      cache_write: 3.75,
    });
    expect(zhinao?.models["deepseek/deepseek-v4-pro"]?.cost_cn).toEqual({
      input: 9,
      output: 27,
      cache_read: 0.9,
      cache_write: 11.25,
    });
    expect(zhinao?.models["minimax/MiniMax-M3"]?.cost_cn?.cache_read).toBe(
      0.42,
    );
    expect(zhinao?.models["moonshotai/kimi-k2.7-code"]).toMatchObject({
      temperature: true,
      endpoints: ["openai", "anthropic"],
      modalities: { input: ["text", "image"], output: ["text"] },
      cost_cn: { input: 6.5, output: 27, cache_read: 1.3, cache_write: 8.125 },
    });
    expect(zhinao?.models["moonshotai/kimi-k3"]).toMatchObject({
      temperature: true,
      endpoints: ["openai", "anthropic", "responses"],
      modalities: { input: ["text", "image"], output: ["text"] },
    });
    expect(zhinao?.models["qwen/qwen3.8-max"]?.modalities.input).toEqual([
      "text",
      "image",
      "video",
      "pdf",
    ]);
    expect(zhinao?.models["z-ai/glm-5.3"]).toMatchObject({
      endpoints: ["openai", "anthropic", "responses"],
      cost_cn: { input: 7.6, output: 26.6, cache_read: 1.9, cache_write: 9.5 },
    });
    expect(zhinao?.models["qwen/qwen3.8-flash"]).toMatchObject({
      endpoints: ["openai", "anthropic", "responses"],
      temperature: true,
      limit: { context: 1_000_000, output: 128_000 },
      modalities: {
        input: ["text", "image", "video", "pdf"],
        output: ["text"],
      },
      cost_cn: { input: 1, output: 3, cache_read: 0.1, cache_write: 1.25 },
    });
    expect(zhinao?.models["z-ai/glm-5.2"]).toMatchObject({
      endpoints: ["openai", "anthropic", "responses"],
      temperature: true,
      limit: { context: 1_000_000, output: 128_000 },
      cost_cn: { input: 8, output: 28, cache_read: 2, cache_write: 10 },
    });
    expect(zhinao?.models["z-ai/glm-5.3-flash"]).toMatchObject({
      endpoints: ["openai", "anthropic", "responses"],
      temperature: true,
      tool_call: true,
      limit: { context: 1_000_000, output: 128_000 },
      modalities: {
        input: ["text", "image", "video", "pdf"],
        output: ["text"],
      },
      cost_cn: { input: 0.4, output: 1.4, cache_read: 0.115, cache_write: 0.5 },
    });
    for (const model of Object.values(zhinao?.models ?? {})) {
      expect(model.reasoning).toBe(true);
      expect(model).not.toHaveProperty("structured_output");
    }
    for (const id of [
      "bytedance/doubao-seed-2-1-pro",
      "bytedance/doubao-seed-2-1-turbo",
      "bytedance/doubao-seed-evolving",
      "qwen/qwen3.7-max",
      "qwen/qwen3.7-plus",
      "qwen/qwen3.8-max",
    ]) {
      expect(zhinao?.models[id]?.limit).not.toHaveProperty("input");
    }
    expect(
      catalog.providers["jdcloud-joybuilder"]?.models["Qwen3.5-35B-A3B"]?.cost_cn?.tiers,
    ).toEqual([
      { input: 0.4, output: 3.2, tier: { type: "conditional", input: { lte: 131_072 } } },
      { input: 1.6, output: 12.8, tier: { type: "conditional", input: { gt: 131_072 } } },
    ]);
    expect(catalog.providers).not.toHaveProperty("china-unicom-yuanjing");
    expect(catalog.providers.longcat?.models["LongCat-2.0"]?.limit).toEqual({
      context: 1_048_576,
      output: 131_072,
    });
  });

  test("assigns stable provider and model identifiers", async () => {
    const catalog = await generateCatalog(root);

    const providerMigrations = {
      "alibaba-coding-plan": "alibaba-coding-plan-cn",
      "alibaba-token-plan": "alibaba-token-plan-cn",
      minimax: "minimax-cn",
      "minimax-token-plan": "minimax-token-plan-cn",
      moonshot: "moonshotai-cn",
      siliconflow: "siliconflow-cn",
      "xiaomi-mimo": "xiaomi",
      "xiaomi-mimo-token-plan": "xiaomi-token-plan-cn",
    } as const;

    for (const [oldID, newID] of Object.entries(providerMigrations)) {
      expect(catalog.providers).not.toHaveProperty(oldID);
      expect(catalog.providers).toHaveProperty(newID);
    }

    for (const [providerID, provider] of Object.entries(catalog.providers)) {
      expect(provider.id).toBe(providerID);
      for (const [modelID, model] of Object.entries(provider.models)) {
        expect(model.id).toBe(modelID);
      }
    }
  });
});
