import { z } from "zod";

import { ModelFamily } from "./family";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(JsonValue),
  ]),
);

const ReasoningEffortValue = z.preprocess(
  (value) => (value === "null" ? null : value),
  z.union([
    z.null(),
    z.enum([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]),
  ]),
);

const ReasoningOptionEndpoint = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Endpoint ID must use lowercase kebab-case");

const ReasoningOptionMetadata = {
  field: z
    .string()
    .min(1, "Reasoning control field cannot be empty")
    .describe("Request body field used by this reasoning control.")
    .optional(),
  endpoints: z
    .array(ReasoningOptionEndpoint)
    .min(1, "Reasoning option endpoints cannot be empty")
    .refine((endpoints) => new Set(endpoints).size === endpoints.length, {
      message: "Reasoning option endpoints cannot contain duplicates",
    })
    .describe("Provider endpoint IDs where this reasoning control applies.")
    .optional(),
};

export const ReasoningOption = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("toggle"),
        ...ReasoningOptionMetadata,
      })
      .strict(),
    z
      .object({
        type: z.literal("effort"),
        values: z
          .array(ReasoningEffortValue)
          .min(1, "Reasoning effort values cannot be empty")
          .describe("Supported reasoning effort values; JSON null disables reasoning when supported."),
        default: ReasoningEffortValue.describe(
          "Default reasoning effort when the provider documents one.",
        ).optional(),
        ...ReasoningOptionMetadata,
      })
      .strict(),
    z
      .object({
        type: z.literal("budget_tokens"),
        min: z
          .number()
          .int()
          .min(-1, "Minimum reasoning budget cannot be less than -1")
          .describe("Minimum reasoning token budget; -1 may represent automatic allocation.")
          .optional(),
        max: z
          .number()
          .int()
          .min(0, "Maximum reasoning budget cannot be negative")
          .describe("Maximum reasoning token budget.")
          .optional(),
        ...ReasoningOptionMetadata,
      })
      .strict(),
  ])
  .refine(
    (data) =>
      data.type !== "effort" ||
      data.default === undefined ||
      data.values.includes(data.default),
    {
      message: "Default reasoning effort must be included in values",
      path: ["default"],
    },
  )
  .refine(
    (data) =>
      data.type !== "budget_tokens" ||
      data.min === undefined ||
      data.max === undefined ||
      data.min <= data.max,
    {
      message:
        "Minimum reasoning budget cannot exceed maximum reasoning budget",
      path: ["min"],
    },
  )
  .describe(
    "Provider-specific reasoning control; type discriminates toggle, effort and token-budget forms.",
  );

const Cost = z.object({
  input: z.number().min(0, "Input price cannot be negative"),
  output: z.number().min(0, "Output price cannot be negative"),
  reasoning: z.number().min(0, "Reasoning price cannot be negative").optional(),
  cache_read: z
    .number()
    .min(0, "Cache read price cannot be negative")
    .optional(),
  cache_write: z
    .number()
    .min(0, "Cache write price cannot be negative")
    .optional(),
  input_audio: z
    .number()
    .min(0, "Audio input price cannot be negative")
    .optional(),
  output_audio: z
    .number()
    .min(0, "Audio output price cannot be negative")
    .optional(),
}).strict();

const ThinkingCost = Cost.omit({ reasoning: true }).strict();

const CnyCost = Cost.extend({
  thinking: ThinkingCost.optional(),
}).strict();

const TokenRange = z
  .object({
    gte: z.number().int().min(0, "Token range minimum cannot be negative").optional(),
    gt: z.number().int().min(0, "Token range minimum cannot be negative").optional(),
    lt: z.number().int().min(0, "Token range maximum cannot be negative").optional(),
    lte: z.number().int().min(0, "Token range maximum cannot be negative").optional(),
  })
  .strict()
  .superRefine((range, context) => {
    if (
      range.gte === undefined &&
      range.gt === undefined &&
      range.lt === undefined &&
      range.lte === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token range must define gt, gte, lt, or lte",
      });
    }
    if (range.gte !== undefined && range.gt !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token range cannot define both gt and gte",
        path: ["gt"],
      });
    }
    if (range.lt !== undefined && range.lte !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token range cannot define both lt and lte",
        path: ["lte"],
      });
    }

    const lower = range.gte ?? range.gt;
    const upper = range.lt ?? range.lte;
    if (lower === undefined || upper === undefined) return;
    const includesEqualBoundary =
      lower === upper && range.gte !== undefined && range.lte !== undefined;
    if (lower > upper || (lower === upper && !includesEqualBoundary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token range lower bound must not exceed upper bound",
      });
    }
  });

const Weekday = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const DailyTimeWindow = z
  .object({
    days: z.array(Weekday).min(1, "Time window must contain at least one day").optional(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm"),
    end: z
      .string()
      .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Time must use HH:mm; only 24:00 is allowed past 23:59"),
  })
  .strict();

const DailyTimeCondition = z
  .object({
    timezone: z.string().min(1, "Timezone cannot be empty"),
    windows: z.array(DailyTimeWindow).min(1, "At least one time window is required"),
  })
  .strict();

export const CostTierSelector = z.union([
  z
    .object({
      type: z.literal("context").default("context"),
      size: z.number().int().min(0, "Context tier size cannot be negative"),
    })
    .strict(),
  z
    .object({
      type: z.literal("conditional"),
      input: TokenRange.optional(),
      output: TokenRange.optional(),
      time: DailyTimeCondition.optional(),
      label: z.string().min(1, "Tier label cannot be empty").optional(),
    })
    .strict()
    .refine(
      (tier) =>
        tier.input !== undefined ||
        tier.output !== undefined ||
        tier.time !== undefined,
      { message: "Conditional tier must define input, output, or time" },
    ),
]);

const CostTier = Cost.extend({
  tier: CostTierSelector,
}).strict();

const CnyCostTier = CnyCost.extend({
  tier: CostTierSelector,
}).strict();

const AuthoredCost = Cost.extend({
  context_over_200k: z.never().optional(),
  tiers: z.array(CostTier).optional(),
}).strict();

const OutputCost = Cost.extend({
  context_over_200k: Cost.optional(),
  tiers: z.array(CostTier).optional(),
}).strict();

const AuthoredCnyCost = CnyCost.extend({
  context_over_200k: z.never().optional(),
  tiers: z.array(CnyCostTier).optional(),
}).strict();

const OutputCnyCost = CnyCost.extend({
  context_over_200k: CnyCost.optional(),
  tiers: z.array(CnyCostTier).optional(),
}).strict();

const PointCostValues = z.object({
    input: z.number().min(0, "Input point cost cannot be negative"),
    output: z.number().min(0, "Output point cost cannot be negative"),
    cache_read: z.number().min(0, "Cache read point cost cannot be negative").optional(),
  }).strict();

const PointCostTier = PointCostValues.extend({
  tier: CostTierSelector,
}).strict();

const PointCost = PointCostValues.extend({
    per_tokens: z.number().int().positive("Point cost token unit must be positive"),
    tiers: z.array(PointCostTier).optional(),
    off_peak_multiplier: z
      .number()
      .positive("Off-peak multiplier must be positive")
      .max(1, "Off-peak multiplier cannot exceed 1")
      .optional(),
    peak_window: z
      .object({
        days: z.array(Weekday).min(1, "Peak window must contain at least one day"),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm"),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm"),
        timezone: z.string().min(1, "Timezone cannot be empty"),
      })
      .strict()
      .optional(),
  }).strict();

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, {
    message: "Must be in YYYY-MM or YYYY-MM-DD format",
  })
  .refine(
    (value) => {
      const [year, month, day] = value.split("-").map(Number);
      if (month === undefined || month < 1 || month > 12) return false;
      if (day === undefined) return true;

      const leapYear =
        year !== undefined &&
        year % 4 === 0 &&
        (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ];
      return day >= 1 && day <= daysInMonth[month - 1]!;
    },
    {
      message: "Must be a valid calendar date",
    },
  );

const Modality = z.enum(["text", "audio", "image", "video", "pdf"]);

const Modalities = z
  .object({
    input: z.array(Modality).describe("Input modalities accepted by the model."),
    output: z.array(Modality).describe("Output modalities produced by the model."),
  })
  .strict()
  .describe("Input and output modalities exposed by this model endpoint.");

const LimitBase = z
  .object({
    context: z
      .number()
      .int()
      .min(0, "Context window must be a non-negative integer")
      .describe("Maximum context window in tokens."),
    input: z
      .number()
      .int()
      .min(0, "Input tokens must be a non-negative integer")
      .describe("Maximum input length in tokens when separately documented.")
      .optional(),
  })
  .strict();

const ModelLimit = LimitBase.extend({
  output: z
    .number()
    .int()
    .min(0, "Output tokens must be a non-negative integer")
    .describe("Maximum output length in tokens when documented.")
    .optional(),
})
  .strict()
  .describe("Token limits published for the base model.");

const ProviderModelLimit = LimitBase.extend({
  output: z
    .number()
    .int()
    .min(0, "Output tokens must be a non-negative integer")
    .describe("Maximum output length in tokens when documented.")
    .optional(),
})
  .strict()
  .describe("Token limits exposed by this provider model endpoint.");

const UrlString = z.string().url("Must be a valid URL");

export const Protocol = z.enum([
  "openai-compatible",
  "anthropic-compatible",
  "openai-responses",
]).describe("Protocol used to call a provider endpoint.");

export const ProviderEndpoint = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, "Endpoint ID must use lowercase kebab-case")
      .describe("Stable endpoint ID referenced by provider models."),
    protocol: Protocol,
    api: UrlString.describe("Base API URL for this endpoint."),
    default: z
      .literal(true)
      .describe("Marks the endpoint represented by the provider-level protocol and API fields.")
      .optional(),
  })
  .strict()
  .describe("A protocol-specific API endpoint exposed by a provider.");

export const ProviderLinks = z
  .object({
    models: UrlString.describe("Official catalog of models available from this provider.").optional(),
    pricing: UrlString.describe("Official pricing, subscription plan, or purchase page.").optional(),
    api_key: UrlString.describe("Official instructions for applying for and configuring an API key.").optional(),
    console: UrlString.describe("Official console used to manage API keys and the provider account.").optional(),
  })
  .strict()
  .describe("Purpose-specific official links for integrating with this provider.");

export const ModelLink = z
  .object({
    label: z.string().min(1, "Link label cannot be empty").optional(),
    url: UrlString,
    type: z
      .enum([
        "announcement",
        "blog",
        "docs",
        "license",
        "model_card",
        "paper",
        "weights",
        "other",
      ])
      .optional(),
  })
  .strict();

export const ModelWeights = z
  .object({
    label: z.string().min(1, "Weights label cannot be empty").optional(),
    url: UrlString,
    format: z.string().min(1, "Weights format cannot be empty").optional(),
    quantization: z
      .string()
      .min(1, "Weights quantization cannot be empty")
      .optional(),
  })
  .strict();

export const BenchmarkResult = z
  .object({
    name: z.string().min(1, "Benchmark name cannot be empty"),
    score: z.union([z.number(), z.string().min(1)]),
    metric: z.string().min(1, "Benchmark metric cannot be empty").optional(),
    harness: z.string().min(1, "Benchmark harness cannot be empty").optional(),
    variant: z.string().min(1, "Benchmark variant cannot be empty").optional(),
    dataset: z.string().min(1, "Benchmark dataset cannot be empty").optional(),
    version: z.string().min(1, "Benchmark version cannot be empty").optional(),
    source: UrlString.optional(),
    date: DateString.optional(),
  })
  .strict();

const AttachmentCapability = z
  .boolean()
  .describe("Whether attachments are supported. Missing on optional metadata means unknown.");
const ReasoningCapability = z
  .boolean()
  .describe("Whether reasoning is supported. Missing means unknown; false means explicitly unsupported.");
const ToolCallCapability = z
  .boolean()
  .describe("Whether tool calling is supported. Missing means unknown; false means explicitly unsupported.");
const StructuredOutputCapability = z
  .boolean()
  .describe("Whether structured output is supported. Missing means unknown; false means explicitly unsupported.");
const TemperatureCapability = z
  .boolean()
  .describe("Whether temperature is explicitly adjustable. Missing means unknown; false means fixed or unsupported.");

const ModelMetadataBase = z.object({
  id: z.string(),
  name: z.string().min(1, "Model name cannot be empty"),
  description: z.string().min(1, "Model description cannot be empty"),
  family: ModelFamily.optional(),
  series: z.string().min(1, "Model series cannot be empty").optional(),
  attachment: AttachmentCapability.optional(),
  reasoning: ReasoningCapability.optional(),
  tool_call: ToolCallCapability.optional(),
  structured_output: StructuredOutputCapability.optional(),
  temperature: TemperatureCapability.optional(),
  knowledge: DateString.optional(),
  release_date: DateString.optional(),
  last_updated: DateString.optional(),
  modalities: Modalities.optional(),
  open_weights: z.boolean().optional(),
  limit: ModelLimit.optional(),
  license: z.string().min(1, "License cannot be empty").optional(),
  links: z.array(ModelLink).optional(),
  weights: z.array(ModelWeights).optional(),
  benchmarks: z.array(BenchmarkResult).optional(),
});

export const ModelMetadata = ModelMetadataBase.strict();

export type ModelMetadata = z.infer<typeof ModelMetadata>;

const ModelBase = z.object({
  id: z.string(),
  name: z.string().min(1, "Model name cannot be empty"),
  description: z.string().min(1, "Model description cannot be empty"),
  family: ModelFamily.optional(),
  series: z.string().min(1, "Model series cannot be empty").optional(),
  attachment: AttachmentCapability,
  reasoning: ReasoningCapability.optional(),
  reasoning_options: z
    .array(ReasoningOption)
    .describe("Provider-specific controls for enabling or configuring reasoning.")
    .optional(),
  tool_call: ToolCallCapability.optional(),
  interleaved: z
    .union([
      z.literal(true),
      z
        .object({
          field: z.enum(["reasoning_content", "reasoning_details"]),
        })
        .strict(),
    ])
    .describe("Whether reasoning content is returned alongside output, optionally naming its response field.")
    .optional(),
  structured_output: StructuredOutputCapability.optional(),
  temperature: TemperatureCapability.optional(),
  knowledge: DateString.optional(),
  release_date: DateString,
  last_updated: DateString,
  modalities: Modalities,
  open_weights: z.boolean(),
  limit: ProviderModelLimit,
  doc: UrlString.optional(),
  endpoints: z
    .array(z.string().regex(/^[a-z][a-z0-9-]*$/, "Endpoint ID must use lowercase kebab-case"))
    .min(1, "Model endpoints cannot be empty")
    .refine((endpoints) => new Set(endpoints).size === endpoints.length, {
      message: "Model endpoints cannot contain duplicates",
    })
    .describe("Provider endpoint IDs enabled for this model; missing means the provider default endpoint.")
    .optional(),
  cost_points: PointCost.describe(
    "Plan point consumption per the number of tokens declared by per_tokens.",
  ).optional(),
  status: z.enum(["alpha", "beta", "deprecated"]).optional(),
  experimental: z
    .object({
      modes: z
        .record(
          z
            .object({
              cost: Cost.optional(),
              cost_cn: Cost.optional(),
              provider: z
                .object({
                  body: z.record(JsonValue).optional(),
                  headers: z.record(z.string()).optional(),
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .optional(),
    })
    .strict()
    .optional(),
  provider: z
    .object({
      npm: z.string().optional(),
      api: z.string().optional(),
      shape: z.enum(["responses", "completions"]).optional(),
      body: z.record(JsonValue).optional(),
      headers: z.record(z.string()).optional(),
    })
    .strict()
    .optional(),
});

function refineModel<
  Output extends z.infer<typeof ModelShape> | z.infer<typeof AuthoredModelShape>,
  Def extends z.ZodTypeDef,
  Input,
>(schema: z.ZodType<Output, Def, Input>) {
  return schema
    .refine(
      (data) => {
        return data.reasoning !== false || data.reasoning_options === undefined;
      },
      {
        message: "Cannot set reasoning_options when reasoning is false",
        path: ["reasoning_options"],
      },
    )
    .refine(
      (data) => {
        return !(
          data.reasoning === false &&
          (data.cost?.reasoning !== undefined ||
            data.cost_cn?.reasoning !== undefined ||
            data.cost_cn?.thinking !== undefined)
        );
      },
      {
        message: "Cannot set reasoning price when reasoning is false",
        path: ["cost_cn", "reasoning"],
      },
    )
    .refine(
      (data) => {
        const tiers = data.cost?.tiers;
        if (tiers === undefined) return true;

        const selectors = tiers.map((tier) => JSON.stringify(tier.tier));
        return new Set(selectors).size === selectors.length;
      },
      {
        message: "Cost tiers must not have duplicate selectors",
        path: ["cost", "tiers"],
      },
    )
    .refine(
      (data) => {
        const tiers = data.cost_cn?.tiers;
        if (tiers === undefined) return true;

        const selectors = tiers.map((tier) => JSON.stringify(tier.tier));
        return new Set(selectors).size === selectors.length;
      },
      {
        message: "CNY cost tiers must not have duplicate selectors",
        path: ["cost_cn", "tiers"],
      },
    );
}

export const ModelShape = z
  .object({
    ...ModelBase.shape,
    cost: OutputCost.describe("Prices in USD per million tokens.").optional(),
    cost_cn: OutputCnyCost.describe("Prices in CNY per million tokens.").optional(),
  })
  .strict();

export const AuthoredModelShape = z
  .object({
    ...ModelBase.shape,
    cost: AuthoredCost.describe("Prices in USD per million tokens.").optional(),
    cost_cn: AuthoredCnyCost.describe("Prices in CNY per million tokens.").optional(),
  })
  .strict();

export const Model = refineModel(ModelShape);

export const AuthoredModel = refineModel(AuthoredModelShape);

export type Model = z.infer<typeof Model>;

export const Provider = z
  .object({
    id: z.string(),
    env: z.array(z.string()).min(1, "Provider env cannot be empty"),
    npm: z.string().min(1, "Provider npm module cannot be empty"),
    protocol: Protocol.describe("Default protocol used by this provider."),
    api: z.string().describe("Base API URL for the default endpoint.").optional(),
    endpoints: z
      .array(ProviderEndpoint)
      .min(1, "Provider endpoints cannot be empty")
      .describe("All protocol-specific endpoints exposed by this provider.")
      .optional(),
    name: z.string().min(1, "Provider name cannot be empty"),
    plans_cn: z
      .array(
        z
          .object({
            name: z.string().min(1, "Plan name cannot be empty"),
            price_month: z.number().min(0, "Monthly plan price cannot be negative"),
            usage: z.string().min(1, "Plan usage description cannot be empty").optional(),
            quota_windows: z
              .array(z.string().min(1, "Quota window cannot be empty"))
              .optional(),
          })
          .strict(),
      )
      .describe("Subscription plans published for users in China.")
      .optional(),
    credits_cn: z
      .object({
        points: z.number().int().positive("Credit points must be positive"),
        cny: z.number().positive("Credit CNY value must be positive"),
        valid_days: z.number().int().positive("Credit validity must be positive").optional(),
      })
      .strict()
      .optional(),
    doc: z
      .string()
      .min(
        1,
        "Please provide a link to the provider documentation where models are listed",
      ),
    links: ProviderLinks.optional(),
    models: z.record(Model),
  })
  .strict()
  .refine(
    (data) => {
      const hasApi = data.api !== undefined;
      return data.protocol !== "openai-compatible" || hasApi;
    },
    {
      message: "'api' is required when protocol is openai-compatible",
      path: ["api"],
    },
  )
  .superRefine((data, context) => {
    if (data.endpoints === undefined) return;

    const endpointIDs = data.endpoints.map((endpoint) => endpoint.id);
    if (new Set(endpointIDs).size !== endpointIDs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider endpoint IDs must be unique",
        path: ["endpoints"],
      });
    }

    const defaults = data.endpoints.filter(
      (endpoint) => endpoint.default === true,
    );
    if (defaults.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider endpoints must contain exactly one default endpoint",
        path: ["endpoints"],
      });
      return;
    }

    const defaultEndpoint = defaults[0];
    if (
      defaultEndpoint !== undefined &&
      (defaultEndpoint.protocol !== data.protocol ||
        defaultEndpoint.api !== data.api)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Default endpoint must match provider protocol and api",
        path: ["endpoints"],
      });
    }
  });

export type Provider = z.infer<typeof Provider>;
