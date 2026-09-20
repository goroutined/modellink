# ModelLink 数据格式与迁移指南

本文档面向直接消费 ModelLink JSON 的应用、SDK、命令行工具和数据服务，说明公开文件、字段语义以及从 [models.dev](https://models.dev) 迁移时需要处理的差异。

ModelLink 的原则是：保留 models.dev 的核心 JSON 结构，在此基础上增加中国区协议、人民币价格、积分与订阅套餐等字段。下游应采用“读取认识的字段、忽略未知字段”的方式解析，以便兼容后续扩展。

> 重要：可选字段缺失表示“当前没有足够的服务商级证据”或“该字段不适用”，不等于 `false`、`0`、免费或无限制。

## 公开文件

| 文件 | 顶层结构 | 适用场景 |
| --- | --- | --- |
| `api.json` | `Record<providerId, Provider>` | 查询服务商、调用 ID、协议、价格和服务商实际能力 |
| `models.json` | `Record<canonicalModelId, ModelMetadata>` | 查询与服务商无关的基础模型事实 |
| `catalog.json` | `{ models, providers }` | 一次下载完整目录 |
| `schema.json` | JSON Schema | 生成类型或验证公开 JSON 的结构 |
| `manifest.json` | `Manifest` | npm 数据包的版本、来源与文件完整性校验 |

在线最新数据：

```text
https://goroutined.github.io/modellink/api.json
https://goroutined.github.io/modellink/models.json
https://goroutined.github.io/modellink/catalog.json
https://goroutined.github.io/modellink/schema.json
```

`manifest.json` 位于版本化的 [`@modellink/data`](https://www.npmjs.com/package/@modellink/data) 包内，不在 GitHub Pages 根路径提供。`docs/site-data.json` 和 `docs/data.js` 只服务 ModelLink 展示页面，不属于稳定的下游数据契约。

### ID 与 Map Key

- `api.json` 的 Map Key 是 Provider ID，例如 `deepseek`、`alibaba-cn`。
- `models.json` 的 Map Key 是 canonical model ID，格式通常为 `<lab>/<model>`，例如 `deepseek/deepseek-v4-pro`。
- `Provider.models` 的 Map Key 是该服务商接受的模型调用 ID。它可能与 canonical model ID 不同，也可能包含 `/`。
- 每个对象内的 `id` 与它所在 Map 的 Key 相同，下游可以直接以 Map Key 建立索引。
- Provider Model 是基础模型事实与服务商覆盖合并后的完整结果；源码字段 `base_model` 和 `base_model_omit` 不会出现在 JSON 中。

当前 JSON 不公开 Provider Model 到 canonical model 的结构化反向引用。需要跨服务商聚合时，不应仅凭名称或 `family` 猜测；可以使用 ModelLink 页面内部索引作为展示参考，但不要把它视为稳定 API。

### `@modellink/data` 0.2.0 Provider ID 迁移

`0.2.0` 统一中国区 Provider 的地区后缀，并修正了与 models.dev 同名但实际指向
国际站的问题。使用旧 ID 的下游需要按下表迁移：

| `0.1.x` ID | `0.2.0` ID | models.dev 对应关系 |
|---|---|---|
| `alibaba-coding-plan` | `alibaba-coding-plan-cn` | 相同 |
| `alibaba-token-plan` | `alibaba-token-plan-cn` | 相同 |
| `minimax` | `minimax-cn` | 相同 |
| `minimax-token-plan` | `minimax-token-plan-cn` | ModelLink 独有的 Token Plan，不等同于 models.dev 的 `minimax-cn-coding-plan` |
| `moonshot` | `moonshotai-cn` | 相同 |
| `siliconflow` | `siliconflow-cn` | 相同 |
| `xiaomi-mimo` | `xiaomi` | 相同 |
| `xiaomi-mimo-token-plan` | `xiaomi-token-plan-cn` | 相同 |

Provider ID 的规范形式为 `{vendor}-cn` 或 `{vendor}-{plan}-cn`。只有服务商同时存在
国际区和中国区语义时才增加地区后缀；中国区是唯一或默认语义时不机械增加 `-cn`。
Provider ID 的迁移不会改变其模型调用 ID。

## 通用约定

### 可选值与未知值

对于可选布尔能力，ModelLink 区分以下三种状态：

```json
{
  "tool_call": true,
  "structured_output": false
}
```

- `true`：官方资料明确证明支持。
- `false`：官方资料明确证明不支持、固定、忽略或不可调。
- 字段缺失：未知，或没有精确到该 Provider 与调用 ID 的证据。

Provider Model 中的 `attachment`、`modalities`、`limit.context`、`open_weights` 和日期等字段为了维持完整模型记录而是必填值，不能表达第三种状态。它们表示当前目录解析后的结果；涉及生产调用边界时，仍应结合该模型的 `doc` 和服务商实时响应处理，不要将目录数据视为永久 SLA。

下游应使用存在性判断，不要使用 `value || false` 抹平未知状态：

```ts
function capability(value: boolean | undefined) {
  if (value === true) return "supported"
  if (value === false) return "unsupported"
  return "unknown"
}
```

### 日期

日期使用 `YYYY-MM` 或 `YYYY-MM-DD`：

- `knowledge`：知识截止日期。
- `release_date`：首次公开发布日期。
- `last_updated`：当前型号最近更新时间。

不要假设只有年月的值代表该月第一天。

### Token 与价格单位

- `limit.*` 均为原始 Token 数量，不是 `K`、`M` 简写。
- `cost.*` 沿用 models.dev，单位为美元/百万 Token。
- `cost_cn.*` 单位为人民币元/百万 Token，来自中国区官方人民币价格，不由美元换算。
- `cost_points.*` 使用服务商套餐积分，并由 `per_tokens` 明确每组价格对应的 Token 数量。
- 缺少任何价格对象不表示免费；免费必须以明确的 `0` 表示。

## `models.json`

`models.json` 只描述基础模型本身，不描述某个服务商如何托管、收费或调用。

### `ModelMetadata`

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | `string` | canonical model ID |
| `name` | `string` | 展示名称 |
| `description` | `string` | 模型简介 |
| `family` | `string?` | 同类型模型家族；可以包含多个尺寸或档位 |
| `series` | `string?` | 同一模型的时间版本系列，不用于聚合同家族的不同型号 |
| `attachment` | `boolean?` | 是否接受附件 |
| `reasoning` | `boolean?` | 是否具备推理/思考能力 |
| `tool_call` | `boolean?` | 是否具备工具调用能力 |
| `structured_output` | `boolean?` | 是否支持结构化输出 |
| `temperature` | `boolean?` | 是否允许调整 temperature |
| `knowledge` | `string?` | 知识截止日期 |
| `release_date` | `string?` | 首次发布日期 |
| `last_updated` | `string?` | 最近更新时间 |
| `modalities` | `Modalities?` | 基础模型输入与输出模态 |
| `open_weights` | `boolean?` | 是否公开权重 |
| `limit` | `Limit?` | 基础模型公开的 Token 限制 |
| `license` | `string?` | 权重或模型许可证 |
| `links` | `ModelLink[]?` | 公告、论文、文档等链接 |
| `weights` | `ModelWeights[]?` | 权重下载信息 |
| `benchmarks` | `BenchmarkResult[]?` | 可追溯的评测结果 |

### `Modalities`

```ts
type Modality = "text" | "audio" | "image" | "video" | "pdf"

interface Modalities {
  input: Modality[]
  output: Modality[]
}
```

`attachment` 是调用层面的附件能力摘要，`modalities.input` 是已确认的具体输入类型。需要上传图片、视频或 PDF 时，应同时检查目标 Provider Model 的实际字段，不能只看基础模型。

### `Limit`

```ts
interface Limit {
  context: number
  input?: number
  output?: number
}
```

- `context`：总上下文窗口。
- `input`：最大输入 Token；缺失表示没有独立、精确的最大输入证据。
- `output`：最大输出 Token；缺失表示没有独立、精确的最大输出证据。

`context` 不能减去 `output` 来推导 `input`，各服务商对三个值的定义可能不同。

### 链接、权重与评测

```ts
interface ModelLink {
  label?: string
  url: string
  type?: "announcement" | "blog" | "docs" | "license" |
         "model_card" | "paper" | "weights" | "other"
}

interface ModelWeights {
  label?: string
  url: string
  format?: string
  quantization?: string
}

interface BenchmarkResult {
  name: string
  score: number | string
  metric?: string
  harness?: string
  variant?: string
  dataset?: string
  version?: string
  source?: string
  date?: string
}
```

评测结果只有在 `harness`、`variant`、数据集版本等条件相同时才适合直接比较。

## `api.json` 中的 Provider

```ts
interface Provider {
  id: string
  env: string[]
  npm: string
  protocol: string
  api?: string
  endpoints?: ProviderEndpoint[]
  name: string
  doc: string
  links?: ProviderLinks
  plans_cn?: PlanCN[]
  credits_cn?: CreditsCN
  models: Record<string, ProviderModel>
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | Provider ID，与 `api.json` 的 Map Key 一致 |
| `env` | 常见鉴权环境变量名称，只是接入提示，不代表客户端必须使用环境变量 |
| `npm` | models.dev 兼容字段，表示可用的 AI SDK Provider 包；协议判断不能只依赖它 |
| `protocol` | 默认接入协议 |
| `api` | 默认 Base URL；某些非 OpenAI 默认协议可以缺失 |
| `endpoints` | 全部已确认协议与对应 Base URL |
| `name` | 中文或官方服务名称 |
| `doc` | models.dev 兼容的服务商主要文档入口 |
| `links` | 按用途区分的模型、价格、API Key 与控制台入口 |
| `plans_cn` | 人民币订阅套餐 |
| `credits_cn` | 官方积分与人民币固定兑换关系 |
| `models` | 调用 ID 到完整 Provider Model 的映射 |

### Provider 官方入口

```ts
interface ProviderLinks {
  models?: string
  pricing?: string
  api_key?: string
  console?: string
}
```

| 字段 | 点击后的预期用途 |
| --- | --- |
| `models` | 查看服务商当前全部可用模型及模型说明 |
| `pricing` | 查看价格、套餐，或进入服务商提供的官方购买入口 |
| `api_key` | 首次接入指引：如何获取并配置该服务的 API Key，优先指向快速开始或认证教程；套餐可能使用专属密钥 |
| `console` | 登录服务商后台，管理 API Key 和账户 |

这些字段全部可选。不存在真正达到对应目的的官方页面时，字段直接缺失；不得使用空字符串、`null`、搜索结果页或无关首页占位。`doc` 为兼容入口，不替代上述结构化语义；相同 URL 可以因承担不同用途而同时出现。`ProviderModel.doc` 仍只表示精确调用型号的详情或参数依据。

### 协议与 Endpoint

当前标准协议值：

| `protocol` | 含义 |
| --- | --- |
| `openai-compatible` | OpenAI Chat Completions 兼容协议 |
| `anthropic-compatible` | Anthropic Messages 兼容协议 |
| `openai-responses` | OpenAI Responses 兼容协议 |

```ts
interface ProviderEndpoint {
  id: string
  protocol: "openai-compatible" | "anthropic-compatible" | "openai-responses"
  api: string
  default?: true
}
```

当 `endpoints` 存在时：

- 恰好一个 endpoint 带有 `default: true`。
- 默认 endpoint 的 `protocol`、`api` 与 Provider 顶层字段一致。
- Provider Model 的 `endpoints` 是 endpoint ID 数组，用来限制该调用 ID 实际支持的协议。
- Provider Model 未声明 `endpoints` 时，表示没有模型级白名单；可以使用 Provider 默认 endpoint，其他 endpoint 是否可用仍应由调用方谨慎处理。

推荐选择逻辑：

```ts
function usableEndpoints(provider: Provider, model: ProviderModel) {
  if (!provider.endpoints) {
    return provider.api
      ? [{ id: "default", protocol: provider.protocol, api: provider.api }]
      : []
  }
  if (!model.endpoints) {
    const fallback = provider.endpoints.find(endpoint => endpoint.default)
    return fallback ? [fallback] : []
  }
  const allowed = new Set(model.endpoints)
  return provider.endpoints.filter(endpoint => allowed.has(endpoint.id))
}
```

## Provider Model

Provider Model 位于 `provider.models[modelId]`，表示某个调用 ID 在该服务商上的真实能力、限制和价格。它是已经展开的结果，不需要下游再次与 `models.json` 合并。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | `string` | 服务商实际调用 ID |
| `name` | `string` | 展示名称 |
| `description` | `string` | 模型简介 |
| `family` | `string?` | 模型家族 |
| `series` | `string?` | 同一模型的时间版本系列 |
| `attachment` | `boolean` | 服务商接口是否支持附件 |
| `reasoning` | `boolean?` | 服务商型号是否支持推理 |
| `reasoning_options` | `ReasoningOption[]?` | 服务商与协议精确的推理控制 |
| `tool_call` | `boolean?` | 工具调用能力 |
| `interleaved` | `true \| { field }?` | 思考内容是否通过独立字段交错返回 |
| `structured_output` | `boolean?` | 结构化输出能力 |
| `temperature` | `boolean?` | temperature 是否可调 |
| `knowledge` | `string?` | 知识截止日期 |
| `release_date` | `string` | 模型发布日期 |
| `last_updated` | `string` | 最近更新时间 |
| `modalities` | `Modalities` | 此服务商接口确认支持的模态 |
| `open_weights` | `boolean` | 是否公开权重 |
| `limit` | `Limit` | 此服务商型号的 Token 限制 |
| `doc` | `string?` | 精确模型详情或参数文档 |
| `endpoints` | `string[]?` | 可用的 Provider endpoint ID |
| `cost` | `Cost?` | models.dev 兼容的美元价格 |
| `cost_cn` | `CostCN?` | 中国区人民币价格 |
| `cost_points` | `PointCost?` | 套餐积分消耗 |
| `status` | `"alpha" \| "beta" \| "deprecated"?` | 此服务商上的生命周期 |
| `experimental` | `Experimental?` | 实验模式的价格或请求覆盖 |
| `provider` | `ProviderOverride?` | 单模型请求方式覆盖 |

### 推理控制

`reasoning` 只表示能力；如何启用、选择强度或限制预算由 `reasoning_options` 表示：

```ts
type ReasoningOption =
  | {
      type: "toggle"
      field?: string
      endpoints?: string[]
    }
  | {
      type: "effort"
      values: Array<null | "none" | "minimal" | "low" | "medium" |
                    "high" | "xhigh" | "max">
      default?: null | "none" | "minimal" | "low" | "medium" |
                "high" | "xhigh" | "max"
      field?: string
      endpoints?: string[]
    }
  | {
      type: "budget_tokens"
      min?: number
      max?: number
      field?: string
      endpoints?: string[]
    }
```

- `field` 是请求体字段路径，例如 `reasoning_effort`、`thinking.type`。
- `endpoints` 引用 Provider endpoint ID；缺失表示没有记录协议限制。
- `default` 只在官网精确说明默认值时出现。
- `values` 只记录真正有效的档位，不记录服务商的兼容别名。
- `budget_tokens.min = -1` 是部分接口使用的特殊官方哨兵值，不代表负 Token。

`interleaved` 为对象时，`field` 当前可能为 `reasoning_content` 或 `reasoning_details`。字段缺失时，不应猜测思考内容的响应路径。

## 价格

### `cost` 与 `cost_cn`

```ts
interface CostValues {
  label?: string
  input: number
  output: number
  reasoning?: number
  cache_read?: number
  cache_write?: number
  input_audio?: number
  output_audio?: number
}

interface Cost extends CostValues {
  context_over_200k?: CostValues
  tiers?: CostTier[]
}

interface CostCNValues extends CostValues {
  thinking?: Omit<CostValues, "reasoning">
}

interface CostCN extends CostCNValues {
  context_over_200k?: CostCNValues
  tiers?: CostCNTier[]
}
```

- `input`、`output`：输入与输出单价。
- `reasoning`：单独计费的推理 Token 单价，不等同于“思考模式价格”。
- `cache_read`、`cache_write`：缓存命中读取和缓存写入单价。
- `input_audio`、`output_audio`：音频 Token 单价。
- `cost_cn.thinking`：思考模式采用另一整套输入、输出或缓存价格时使用。
- `context_over_200k`：models.dev 的兼容输出字段；新消费者应优先支持 `tiers`。

### 阶梯选择器

每个 tier 的 `label` 与价格字段同级，用于描述该价格档；匹配条件统一放在 `when` 中：

```ts
type CostTierSelector =
  | { type: "context"; size: number }
  | {
      type: "conditional"
      input?: TokenRange
      output?: TokenRange
      time?: {
        timezone: string
        windows: Array<{
          days: Weekday[]
          start: string
          end: string
          holiday?: "exclude_cn_statutory"
        }>
      }
    }

interface CostTier extends CostValues {
  when: CostTierSelector
}

interface CostCNTier extends CostCNValues {
  when: CostTierSelector
}

interface TokenRange {
  gt?: number
  gte?: number
  lt?: number
  lte?: number
}
```

- `context`：`size` 是该价格档开始生效的上下文阈值。
- `conditional.input/output`：按实际输入或输出 Token 范围选择。
- `gt/gte`、`lt/lte` 分别表示开区间和闭区间边界；同一侧不会同时出现两种边界。
- `time.timezone` 使用 IANA 时区，例如 `Asia/Shanghai`。
- 时间窗口开始时间包含、结束时间不包含；跨午夜窗口可能出现 `start > end`；`end` 可以是 `24:00`。
- `days` 必须显式列出适用的星期。
- `holiday = "exclude_cn_statutory"` 表示该窗口仅在中国法定节假日之外匹配。ModelLink 不维护具体节假日日期；调用方需要注入自己的节假日 resolver。resolver 缺失或无法判断当年日期时，应返回“价格未知”，不能静默套用顶层价格。
- 顶层价格是默认回退价格。顶层 `label` 是该回退档的展示名，例如“闲时”或“非高峰”。存在 `tiers` 时，精确计价应先匹配 `tiers[].when`；未匹配时才使用顶层值。
- 多个 `tiers` 可以覆盖全部时间。在这种情况下顶层值只是安全兜底，实际计价不会走到。

不要假定数组顺序就是价格高低。对于条件重叠的异常数据，调用方应停止自动估价并展示官方文档，而不是自行选择最便宜的一档。

### `cost_points`

```ts
interface PointCost {
  label?: string
  per_tokens: number
  input: number
  output: number
  cache_read?: number
  tiers?: PointCostTier[]
}

interface PointCostTier {
  label?: string
  input: number
  output: number
  cache_read?: number
  when: CostTierSelector
}
```

例如 `per_tokens = 1000`、`input = 2` 表示每 1000 个输入 Token 消耗 2 积分。积分不是人民币；只有 Provider 同时给出 `credits_cn` 时，才能根据官方固定兑换关系换算。

积分价格与人民币价格使用同一套 `tiers + when` 语义：顶层积分值是非高峰或默认扣减，`tiers` 记录高峰等例外扣减。顶层 `label` 用于页面展示默认档名称。

### 套餐与积分兑换

```ts
interface PlanCN {
  name: string
  price_month: number
  usage?: string
  quota_windows?: string[]
}

interface CreditsCN {
  points: number
  cny: number
  valid_days?: number
}
```

- `price_month` 单位为人民币元/月。
- `quota_windows` 保留服务商官方窗口描述，不应假设所有套餐都按自然月重置。
- `credits_cn` 表示 `points` 积分对应 `cny` 元，不代表模型的 Token 价格。
- `valid_days` 仅在官网给出可精确记录的天数时出现。

## 请求覆盖与实验模式

```ts
interface ProviderOverride {
  npm?: string
  api?: string
  shape?: "responses" | "completions"
  body?: Record<string, JsonValue>
  headers?: Record<string, string>
}

interface Experimental {
  modes?: Record<string, {
    cost?: CostValues
    cost_cn?: CostValues
    provider?: {
      body?: Record<string, JsonValue>
      headers?: Record<string, string>
    }
  }>
}
```

`provider` 是 models.dev 兼容的单模型请求覆盖。它不等同于顶层 Provider：

- `api` 可以替换该模型的 Base URL。
- `shape` 指明使用 Responses 或 Completions 请求形状。
- `body`、`headers` 是调用该模型必须附加的静态值。
- `experimental.modes` 描述命名实验模式；调用方只有显式选择某个 mode 时才应应用其中覆盖。

## `catalog.json`

`catalog.json` 没有定义新的模型字段，只是组合另两个文件：

```ts
interface Catalog {
  models: Record<string, ModelMetadata>
  providers: Record<string, Provider>
}
```

以下关系恒成立：

```ts
catalog.models    // 与 models.json 相同
catalog.providers // 与 api.json 相同
```

需要同时搜索基础模型与服务商时使用它；只需要调用目录的客户端优先下载体积更小的 `api.json`。

## `schema.json`

`schema.json` 是提交在 ModelLink 仓库中并随 GitHub Pages、npm 数据包共同分发的公开结构契约：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://goroutined.github.io/modellink/schema.json",
  "x-modellink-schema-version": 2,
  "$ref": "#/definitions/Catalog"
}
```

根 `$ref` 默认验证 `catalog.json`。其他文件和可复用对象通过以下引用提供：

```text
schema.json#/definitions/Models
schema.json#/definitions/Providers
schema.json#/definitions/Catalog
schema.json#/definitions/Manifest
schema.json#/definitions/ModelMetadata
schema.json#/definitions/ProviderModel
schema.json#/definitions/Provider
schema.json#/definitions/Protocol
schema.json#/definitions/ProviderEndpoint
schema.json#/definitions/ProviderLinks
schema.json#/definitions/ReasoningOption
schema.json#/definitions/JsonValue
```

`x-modellink-schema-version` 表示公开对象结构的兼容级别；Schema 文件的 SHA-256 表示该版本的精确内容。ModelLink 公开对象是严格结构，新增字段也可能要求严格验证器或代码生成客户端重新生成，因此本次加入 `Provider.links` 后版本升级为 `2`。仅描述、注释等不改变可读取结构的更新可以只改变哈希而不升级版本。

`schema.json` 面向数据读取和代码生成，描述公开字段、必填性、可选性、基础类型、对象结构与枚举。它不是 ModelLink 的数据审计规则，不保证价格、日期、模型能力或跨字段关系的真实性；这些内容由仓库数据、运行时 Schema、目录构建校验和维护流程保证。

因此 Schema 验证通过只表示 JSON 可以按照当前公开契约读取，不代表每个字段都已完成最新官网审计。下游不需要复刻仓库的数据审核逻辑，也不应使用 `false`、`0` 或自行推导的值替代缺失的可选字段。

### 验证与复用定义

下面的 TypeScript 示例直接验证完整 Catalog；`addSchema` 后也可以用同一个 `$id` 引用任意独立定义：

```ts
import Ajv from "ajv"
import addFormats from "ajv-formats"

const schema = await fetch("https://goroutined.github.io/modellink/schema.json").then(r => r.json())
const catalog = await fetch("https://goroutined.github.io/modellink/catalog.json").then(r => r.json())

const ajv = new Ajv({ strict: false })
addFormats(ajv)
ajv.addSchema(schema)

const validateCatalog = ajv.compile({ $ref: schema.$id })
if (!validateCatalog(catalog)) throw new Error(ajv.errorsText(validateCatalog.errors))

const validateProvider = ajv.compile({
  $ref: `${schema.$id}#/definitions/Provider`,
})
```

代码生成器可将整个文件作为输入，也可只选择 `Provider`、`ProviderLinks`、`ProviderModel`、`ModelMetadata`、`Protocol`、`ProviderEndpoint` 或 `ReasoningOption` 等定义。`Models` 和 `Providers` 都是以 ID 为键的 Map，而不是固定字段对象。

公开 Schema 的 `$ref` 只指向 `definitions` 下的稳定顶层定义，不依赖某个对象内部属性的 JSON Pointer。这可以避免下游代码生成器把仓库生成过程中的内部复用路径误认为公共类型名。

可选布尔值必须保留三态语义：字段缺失表示“未知”，`false` 表示服务商明确不支持或固定不可调，`true` 表示已有明确支持信息。不要在反序列化时把缺失值默认成 `false`。

### 判断 Schema 是否更新

客户端应同时保存支持的兼容版本和上次使用的 Schema 哈希：

```ts
if (manifest.schema_version > SUPPORTED_SCHEMA_VERSION) {
  throw new Error("ModelLink Schema 版本高于客户端支持范围")
}

const schemaChanged =
  manifest.files["schema.json"].sha256 !== cachedSchemaSha256
```

`schema_version` 变化代表可能存在破坏性修改；版本相同但 SHA-256 变化通常表示新增说明、可选字段或其他兼容更新，代码生成项目可据此提示重新生成类型。

## `manifest.json`

版本化 npm 数据包包含：

```ts
interface Manifest {
  version: string
  schema_version: number
  generated_at: string
  source: {
    repository: string
    revision: string
  }
  files: Record<"api.json" | "models.json" | "catalog.json" | "schema.json", {
    sha256: string
    size: number
  }>
}
```

- `version`：`@modellink/data` 的 SemVer 版本。
- `schema_version`：与 `schema.json` 的 `x-modellink-schema-version` 相同，当前为 `3`。客户端遇到高于自身支持范围的版本时应停止自动加载并保留旧数据。
- `generated_at`：构建时的 ISO 8601 时间，不代表每个模型的更新时间。
- `source.revision`：生成该包的 Git commit SHA。
- `files.*.sha256`：文件原始字节的 SHA-256 十六进制值。
- `files.*.size`：文件原始字节数。

推荐先通过 npm Registry 元数据比较 `version`，变化后再下载 `.tgz`，校验 Registry 的 `dist.integrity`，最后使用 Manifest 逐文件校验。完整更新流程见 [README](./README.md#获取数据)。

## 与 models.dev 对照

本节以 models.dev 官方仓库 `dev` 分支在 2026-09-01 的 [`3b0487c`](https://github.com/anomalyco/models.dev/tree/3b0487c2b809973b61c1562885b11782c0b3820c) 为对照基准。models.dev 会持续演进，迁移代码仍应忽略未知字段。

### 保持一致的核心结构

| 项目 | models.dev | ModelLink |
| --- | --- | --- |
| `/api.json` | Provider Map | 同形，字段超集 |
| `/models.json` | canonical model Map | 同形，字段超集 |
| `/catalog.json` | `{ models, providers }` | 相同 |
| Provider 的 `models` | 调用 ID Map | 相同 |
| 模型核心能力、日期、模态、限制 | 支持 | 保留 |
| `cost` | 美元/百万 Token | 保留兼容，但中国区数据可以缺失 |
| `reasoning_options` | toggle/effort/budget | 保留并增加协议、字段和默认值信息 |
| `provider`、`experimental`、`status` | 支持 | 保留 |

### ModelLink 扩展或语义调整

| 字段/规则 | 差异 | 下游处理建议 |
| --- | --- | --- |
| `Provider.protocol` | ModelLink 新增默认协议 | 优先使用，不要从 `npm` 推断 |
| `Provider.endpoints` | ModelLink 新增多协议 Base URL | 选择 endpoint 后再检查模型 `endpoints` |
| `ProviderModel.endpoints` | ModelLink 新增模型级协议白名单 | 过滤 Provider endpoints |
| `cost_cn` | ModelLink 新增人民币官方价格 | 国内展示优先读取；不要由 `cost` 换算 |
| `cost_points` | ModelLink 新增订阅积分消耗 | 与人民币价格分开展示 |
| `plans_cn`、`credits_cn` | ModelLink 新增套餐和兑换关系 | 作为 Provider 信息处理 |
| `series` | ModelLink 新增同一模型版本系列 | 不要把 `family` 当作版本系列 |
| `doc`（Provider Model） | ModelLink 增加精确型号文档 | 审计或展示模型详情时优先使用 |
| `reasoning_options.field/endpoints/default` | ModelLink 增加调用细节 | 按 endpoint 应用，不做协议间推导 |
| 条件/分时 tier | ModelLink 扩展 `tiers` 选择器 | 支持 Token 范围与时间窗口 |
| Provider Model 的部分能力与 `limit.output` | ModelLink 允许缺失 | 缺失按未知处理 |
| `reasoning_options` | ModelLink 不要求所有 `reasoning=true` 都有控制项 | 能思考不代表可由 API 控制 |

### 不会出现在输出中的源码字段

| 字段 | 作用 |
| --- | --- |
| `base_model` | Provider TOML 继承 canonical model |
| `base_model_omit` | 删除缺少该 Provider 精确证据的继承字段 |

它们属于构建实现，而不是消费端契约。不要等待或依赖这些字段出现在 `api.json`。

## 从 models.dev 迁移

### 最小迁移

如果应用只使用 Provider Map 的核心字段，可以先直接替换地址：

```diff
- https://models.dev/api.json
+ https://goroutined.github.io/modellink/api.json
```

同时完成三项检查：

1. JSON 解码器允许出现未知字段。
2. 可选布尔字段支持 `undefined`，不会自动变成 `false`。
3. 缺少 `cost` 时不会显示“免费”，而是尝试 `cost_cn`、`cost_points` 或显示“价格未知”。

### 推荐的价格选择

```ts
function priceKind(model: ProviderModel) {
  if (model.cost_cn) return { kind: "cny", value: model.cost_cn }
  if (model.cost_points) return { kind: "points", value: model.cost_points }
  if (model.cost) return { kind: "usd", value: model.cost }
  return { kind: "unknown" }
}
```

不要把三种价格相加，也不要在没有 `credits_cn` 时把积分换算成人民币。

### 推荐的接入选择

1. 如果客户端指定协议，在 `provider.endpoints` 中寻找相应协议。
2. 用 `model.endpoints` 过滤模型未确认支持的入口。
3. 客户端未指定协议时使用 `default: true` 的 endpoint。
4. 老数据没有 `endpoints` 时回退到顶层 `protocol` + `api`。
5. 最后应用 `model.provider` 中的模型级请求覆盖。

### canonical model 与调用 ID

```ts
const canonical = catalog.models["deepseek/deepseek-v4-pro"]
const provider = catalog.providers["alibaba-cn"]
const offering = provider.models["deepseek-v4-pro-0813"]
```

三者用途不同：

- canonical ID 用于描述模型本身。
- Provider ID 用于选择服务。
- Provider Model ID 是发给该服务商 API 的实际模型名。

不要把 canonical ID 自动当作调用 ID，也不要假设不同 Provider 使用相同调用 ID。

## 兼容性建议

- 对新增可选字段保持前向兼容，忽略暂不认识的字段。
- 对枚举使用“已知值 + unknown fallback”，避免新协议或新状态导致整个目录无法读取。
- 缓存上一次校验通过的数据；网络或完整性校验失败时不要清空目录。
- 使用 Manifest `schema_version` 防御未来破坏性变化，使用 npm `version` 判断内容更新。
- 展示布尔能力时区分“是 / 否 / 未知”。
- 展示 Token 限制时只显示实际存在的字段，不通过数学关系补齐缺失值。
- 自动估价无法完整匹配 tier 时，返回“需按官方规则计算”，不要给出看似精确的错误价格。

## Schema 来源

机器可读契约是仓库根目录的 [`schema.json`](./schema.json)，它由 [`packages/core/src/schema.ts`](./packages/core/src/schema.ts) 和 [`packages/core/src/public-schema.ts`](./packages/core/src/public-schema.ts) 生成。本指南解释消费语义。修改 TypeScript Schema 后运行 `bun run schema` 更新文件，`bun run check:schema` 可以只检查是否过期。贡献或修改源数据时请另见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
