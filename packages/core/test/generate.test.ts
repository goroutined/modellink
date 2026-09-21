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
              holiday: "exclude_cn_statutory",
            },
            { days: ["saturday", "sunday"], start: "00:00", end: "24:00" },
            {
              days: [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
              ],
              start: "18:00",
              end: "24:00",
            },
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
              holiday: "exclude_cn_statutory",
            },
            { days: ["saturday", "sunday"], start: "00:00", end: "24:00" },
            {
              days: [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
              ],
              start: "18:00",
              end: "24:00",
            },
        ],
      },
    });
    expect(() =>
      CostTierSelector.parse({
        type: "conditional",
        time: {
          timezone: "Asia/Shanghai",
          windows: [
            {
              days: ["monday"],
              start: "24:00",
              end: "24:00",
            },
          ],
        },
      }),
    ).toThrow();

    expect(() =>
      CostTierSelector.parse({
        type: "conditional",
        time: {
          timezone: "UTC",
          windows: [
            {
              days: ["monday"],
              start: "09:00",
              end: "12:00",
              holiday: "exclude_cn_statutory",
            },
          ],
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

  test("accepts multiple credit packages and keeps the legacy summary aligned", () => {
    const provider = {
      id: "example",
      name: "Example",
      env: ["EXAMPLE_API_KEY"],
      npm: "@ai-sdk/openai-compatible",
      protocol: "openai-compatible",
      api: "https://api.example.com/v1",
      doc: "https://docs.example.com/models",
      models: {},
      credits_cn: { points: 4_489, cny: 30, valid_days: 365 },
      credit_packages_cn: [
        { cny: 30, points: 4_489, valid_days: 365 },
        { cny: 150, points: 22_460, valid_days: 365 },
        { cny: 500, points: 74_900, valid_days: 365 },
      ],
    };

    expect(Provider.parse(provider).credit_packages_cn).toHaveLength(3);
    expect(() =>
      Provider.parse({
        ...provider,
        credits_cn: { points: 1_000, cny: 7, valid_days: 365 },
      }),
    ).toThrow();
    expect(() =>
      Provider.parse({
        ...provider,
        credits_cn: { points: 4_489, cny: 30 },
      }),
    ).toThrow();
    expect(() =>
      Provider.parse({
        ...provider,
        credit_packages_cn: [
          ...provider.credit_packages_cn,
          { cny: 30, points: 9_000, valid_days: 365 },
        ],
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


  test("validates current catalog identifiers and published field boundaries", async () => {
    const catalog = await generateCatalog(root);
    for (const [id, model] of Object.entries(catalog.models)) {
      expect(model.id).toBe(id);
    }
    for (const [id, provider] of Object.entries(catalog.providers)) {
      expect(provider.id).toBe(id);
      for (const [modelID, model] of Object.entries(provider.models)) {
        expect(model.id).toBe(modelID);
        for (const field of ["base_model", "base_model_omit", "weights", "benchmarks", "license", "links"]) {
          expect(model).not.toHaveProperty(field);
        }
      }
    }
  });
});
