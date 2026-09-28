# 贡献指南

感谢你帮助 ModelLink 完善中国 AI 模型与服务商数据。欢迎的贡献包括：新增模型与服务商、修正价格与能力数据、补充官方文档链接，以及通过 Issue 报告数据问题。

项目使用 [Bun](https://bun.sh/) 进行开发，首次运行先安装依赖：

```bash
bun install
```

## 数据来源与证据原则

这是 ModelLink 最重要的规则，先读这一节再动手。

Provider 数据必须逐项取自该服务商当前官网：模型是否可用以当前模型列表为准；调用 ID、能力、默认模式和限制以对应模型详情页为准；人民币价格以对应中国地域的官方价格页为准。模型研发方官网只能补充 canonical model 信息，不能证明某个 Provider 当前提供该模型。

- 开发者社区文章、搜索结果摘要、API 示例、models.dev 和第三方聚合站只能用于发现线索或兼容性对比，**不得直接作为录入依据**；
- 官网未明确公布的字段保持为空，页面会显示 `-`，**不得推算或猜测**；
- 可选能力布尔区分三态：`true` 官方明确支持、`false` 官方明确不支持、缺失表示未知；
- 限时活动价、折扣预告不录入，只记录当前有效的常规价格；官方公告未来调价且给出明确生效日期与数值时，按[价格录入](#价格)中的 `date` 规则处理；
- 模型收录范围以"当前正式可调用且适合 Agent"为准：价格页折叠为"历史模型"但仍在正式列表、有当前价格且无下线公告的模型应收录；官网明确停用或即将下线的模型按"（即将下线）"展示名约定保留至行真正消失。

## 仓库结构

数据源使用 TOML，文件路径决定 ID，TOML 中不写 `id`：

```text
labs/<lab-id>/
  lab.toml
  logo.svg

models/<lab-id>/<model-id>.toml

providers/<provider-id>/
  provider.toml
  logo.svg
  models/<provider-model-id>.toml
```

- `labs/`：模型研发组织。
- `models/`：与服务商无关的 canonical model metadata。
- `providers/`：具体 API 服务及其模型、价格、限制和调用方式。按量 API、Coding Plan、Token Plan 等接入地址、模型名称或计费方式不同的服务，分别建立独立 Provider。
- 第三方 provider 使用 `base_model = "<lab>/<model>"` 继承模型事实，只声明真实差异。

`protocol`、`endpoints`、`links`、`cost_cn`、`cost_points`、`plans_cn` 和 `series` 是 ModelLink 扩展字段。不要手工编辑 `docs/` 下的生成产物（`api.json`、`models.json`、`catalog.json`、logos 等），它们由 `bun run build` 生成并由 CI 重建。

## 添加 canonical model

在模型研发组织下创建 `models/<lab-id>/<model-id>.toml`。完整模型至少应包含名称、描述、发布日期、更新时间、能力布尔值、模态和上下文限制。示例见 `models/alibaba/qwen3-32b.toml`。

同一产品线存在多个需要独立审计的真实版本时，使用 `series` 建立展示关系：

```toml
series = "deepseek-v4-pro"
```

同一研发机构下、`series` 相同的 canonical model 会在页面中聚合展示，但发布 JSON 仍保留每个完整模型。只有独立发布、能力明显变化、存在独立调用 ID 或独立权重的版本才应拆成 canonical model；服务商别名和普通价格调整不创建新版本。

## 添加 provider

```text
providers/<provider-id>/
  provider.toml
  logo.svg
  models/.../*.toml
```

`provider.toml` 包含名称、认证环境变量、AI SDK 包、文档地址与 API 地址。`npm` 仅用于保持 models.dev 兼容，不作为协议判断依据。

面向用户的明确入口通过可选 `links` 记录：

```toml
[links]
models = "https://example.com/models"
pricing = "https://example.com/pricing"
api_key = "https://example.com/docs/create-api-key"
console = "https://console.example.com/api-keys"
```

- `models` 必须能查看当前可用模型或完整模型目录，不能使用单个模型详情页。
- `pricing` 指向价格、套餐或官方购买说明。
- `api_key` 面向首次接入用户：优先选择快速开始、密钥申请或认证教程，明确说明在哪里获取密钥、如何配置或发起调用。
- `console` 指向管理 API Key 与账户的后台。
- 没有真正达到对应目的的官方页面时省略字段，不用无关页面占位。

同一服务支持多种协议时，用 `endpoints` 记录全部协议与 Base URL，且恰好一个 endpoint 与顶层字段一致：

```toml
[[endpoints]]
id = "openai"
protocol = "openai-compatible"
api = "https://api.example.com/v1"
default = true

[[endpoints]]
id = "anthropic"
protocol = "anthropic-compatible"
api = "https://api.example.com/anthropic"

[[endpoints]]
id = "responses"
protocol = "openai-responses"
api = "https://api.example.com/v1"
```

协议标识固定使用 `openai-compatible`、`anthropic-compatible` 和 `openai-responses`。不同协议即使共用同一个 Base URL，也应建立不同 endpoint；不要把完整请求路径（如 `/chat/completions`）误写成 SDK 所需的 Base URL。

## 添加 Logo

新增或更新 Logo 时，按以下顺序选择来源：

1. 优先使用 [Lobe Icons](https://github.com/lobehub/lobe-icons) 静态 SVG 包中的单色图标，并固定具体版本；
2. 没有对应品牌或图标明显落后时，使用其他许可明确的开源 SVG，或品牌官网提供且允许用于项目展示的 SVG；
3. 没有可靠来源时省略 `logo.svg`，页面会自动使用通用默认图标。

Logo 必须使用方形 `viewBox` 和 `currentColor`，不得包含脚本、外链、嵌入字体、Base64 图片或其他需要联网加载的资源。Lab 使用模型研发机构的品牌，Provider 使用实际提供 API 或套餐的服务品牌。每个 SVG 顶部记录来源：

```svg
<!-- source: LobeHub/lobe-icons@1.94.0; slug: example; license: MIT -->
```

```svg
<!-- source: official; url: https://example.com/logo.svg; retrieved: 2026-08-26 -->
```

## 添加 provider model

如果 provider 不是模型研发方，必须引用 canonical model，只写 provider 真实不同的字段：

```toml
base_model = "alibaba/qwen3-32b"
endpoints = ["openai", "anthropic"]

[cost_cn]
input = 1
output = 4
```

`cost_cn`、`reasoning_options`、`interleaved`、`status`、provider request shape 和 provider-specific limit 通常属于这一层。可以用 `base_model_omit` 删除不适用于该 provider 的继承字段：

```toml
base_model = "lab/model"
base_model_omit = ["structured_output", "limit.input"]
```

注意：先合并覆盖、再应用 omit。不要同时 omit 一个字段又在文件里显式声明它——omit 会把显式值删掉。

Provider Model 的 `endpoints` 只能引用当前 Provider 已声明的 endpoint ID，并表示该模型经官网确认实际支持的协议。省略时只表示支持 Provider 的默认 endpoint，不得自动继承 Provider 的全部协议。Responses 等模型白名单协议必须逐个模型核对，不能批量推断。

### 合并规则

- 普通对象深度合并；数组和基本类型由 provider 值替换。
- 未声明字段从 canonical model 继承。
- `base_model` 引用不存在时校验失败；`base_model` 与 `base_model_omit` 不进入发布 JSON。

### 模型限制

`limit.context`、`limit.input` 和 `limit.output` 分别记录上下文窗口、最大输入和最大输出。模型同时支持思考和非思考模式时，按照对应 Provider 的默认模式录入（默认开启思考就采用思考模式限制，反之采用非思考模式限制），字段名称保持不变。

### 推理能力与控制参数

Canonical Model 的 `reasoning = true` 只表示模型具备思考能力。具体服务商是否开放开关、推理强度或思考预算，必须在 Provider Model 的 `reasoning_options` 中按该服务商官网单独记录，不能从基础模型或其他服务商继承推断。

思考模型没有 `reasoning_options` 时，表示该服务商下模型固定思考、没有经官网确认的用户可调参数。禁止使用 `values = ["default"]` 等占位值伪造 effort 档位。

```toml
[[reasoning_options]]
type = "effort"
field = "reasoning_effort"
endpoints = ["openai"]
values = ["low", "high", "max"]
default = "high"

[[reasoning_options]]
type = "effort"
field = "output_config.effort"
endpoints = ["anthropic"]
values = ["low", "high", "max"]
default = "high"
```

- `field` 记录请求体中的真实字段路径，例如 `reasoning_effort`、`output_config.effort`、`thinking.type`。
- `endpoints` 只能引用当前 Provider Model 已启用的 endpoint；不同协议的字段、档位或默认值不同就拆成多项记录。
- `values` 只记录会产生不同推理效果的真实档位。`medium -> high`、`xhigh -> max` 等兼容映射不进入结构化数据；`values` 同时是实际请求值，必须保留服务商协议的原始字面量。
- `default` 必须包含在 `values` 中；官网没有明确默认值时省略。
- `budget_tokens` 只在官网明确开放思考预算时填写；已确认上限或下限才填写 `max`、`min`，不得用上下文窗口推算。
- `toggle` 表示允许用户启用和禁用思考。始终开启且不能关闭的模型不要填写 `toggle`。

## 价格

国内 Provider 模型使用 `cost_cn`，单位为人民币元/百万 Token：

```toml
[cost_cn]
input = 1
output = 2
cache_read = 0.02
```

`cost_cn` 必须来自该 Provider 官网对应中国地域、对应调用 ID 的人民币原价；不得使用第三方聚合站或汇率换算。没有经过官网核验的价格不要猜测。

### 未来调价

官方公告未来调价（给出明确生效日期与数值）时，在公告核实后立即录入：当前生效价保留在顶层，新价格写成 `date.from` 指向生效日的 tier，`label` 注明生效日期（如 `2026-10-01 起`）。生效日之前消费者查询自动回退顶层旧价；生效日过后的第一轮数据维护，把该 tier 塌缩回顶层并移除 `date` 条件。没有明确日期或数值的"价格将调整"预告不录入。

### 订阅积分

Coding Plan、Token Plan 等订阅服务按积分抵扣时，使用 `cost_points`，不能将积分系数写入人民币 `cost_cn`：

```toml
[cost_points]
label = "非高峰"
per_tokens = 10_000
input = 3.45
cache_read = 0.85
output = 12

[[cost_points.tiers]]
label = "高峰"
input = 6.9
cache_read = 1.7
output = 24

[cost_points.tiers.when]
type = "conditional"

[cost_points.tiers.when.time]
timezone = "Asia/Shanghai"

[[cost_points.tiers.when.time.windows]]
days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
start = "14:00"
end = "18:00"
```

`per_tokens` 表示积分系数对应的 Token 数量；顶层是默认扣减，`tiers` 记录高峰等例外扣减，阶梯中不重复填写 `per_tokens`。积分消耗随输入或输出数量变化时使用 `[[cost_points.tiers]]`，边界规则与 `cost_cn.tiers` 完全一致。

Provider 官网直接公布固定人民币月费时，通过 `plans_cn` 记录套餐；预付积分包使用 `credit_packages_cn` 记录全部官方档位，并保留 `credits_cn` 单档摘要（通常选最小购买档，且必须精确匹配其中一个积分包）。这些信息只描述订阅和余额，不替代模型的 `cost_cn` 或 `cost_points`。

### 阶梯与时段

价格只按单一输入长度阈值变化时，使用兼容的 `type = "context"` 阶梯。价格同时取决于输入量、输出量或时段时，使用条件阶梯：

```toml
[[cost_cn.tiers]]
input = 2.1
output = 8.4

[cost_cn.tiers.when]
type = "conditional"

[cost_cn.tiers.when.input]
lte = 512_000

[[cost_cn.tiers]]
input = 4.2
output = 16.8

[cost_cn.tiers.when]
type = "conditional"

[cost_cn.tiers.when.input]
gt = 512_000
```

Token 区间支持 `gt`（大于）、`gte`（大于等于）、`lt`（小于）、`lte`（小于等于）。同一侧只能选择一种边界；必须原样表达官网的包含关系，不能用 `lt = 512_001` 间接模拟 `lte = 512_000`。

纯数值阶梯不填 `label`，页面会根据结构化边界自动生成"输入 ≤512K"等条件。只有官网赋予计费条件明确且无法由数值边界概括的业务名称时才使用 `label`，例如"高峰期""低峰期"；标签只负责概括业务模式，结构化条件仍必须完整填写。

如果官网规则有明确默认档，顶层填写默认价格并设置 `label`，`tiers` 只保留例外档；如果官网是"上下文阈值 × 时段"这类完整矩阵，则保留多个 `tiers` 覆盖全部组合，顶层价格只是安全兜底。

时间条件：同一价格可包含多个窗口，开始时间包含、结束时间不包含，`start > end` 表示跨午夜，`days` 必须显式列出，`end` 允许 `24:00`：

```toml
[cost_cn]
label = "闲时"
input = 1
output = 4
cache_read = 0.02

[[cost_cn.tiers]]
label = "高峰"
input = 2
output = 8
cache_read = 0.04

[cost_cn.tiers.when]
type = "conditional"

[cost_cn.tiers.when.time]
timezone = "Asia/Shanghai"

[[cost_cn.tiers.when.time.windows]]
days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
start = "09:00"
end = "12:00"
holiday = "exclude_cn_statutory"

[[cost_cn.tiers.when.time.windows]]
days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
start = "14:00"
end = "18:00"
holiday = "exclude_cn_statutory"
```

`holiday = "exclude_cn_statutory"` 只能用于官网明确说明中国法定节假日按非高峰或例外处理的服务商，且必须搭配 `Asia/Shanghai`。ModelLink 不维护节假日日期，由调用方注入 resolver。

### 思考模式差价

同一调用 ID 在普通模式和思考模式下采用不同单价时，在 `thinking` 中记录思考模式的完整价格，不要写成独立的推理 Token 价格：

```toml
[cost_cn]
input = 2
output = 8

[cost_cn.thinking]
input = 2
output = 20
```

## 本地校验与提交

提交数据前运行完整检查：

```bash
bun run check
```

常用命令：

```bash
bun run validate  # 校验 TOML、引用和最终模型约束
bun run test      # 运行继承、扩展和输出测试
bun run build     # 生成兼容 JSON、完整目录和 logo
```

关于测试的约定：日常增删模型和服务商只需修改 TOML，不需要在测试中同步维护模型清单、数量或价格——`validate` 检查全量数据结构，生成机制由独立的虚构样例测试覆盖。官网数据是否准确由官方资料核验与人工审核保证，测试通过不等于官方证据完整；不要为了通过测试修改正确的业务数据。

## 维护者附注

合并到 `main` 后，发布工作流自动构建候选数据包，比较 npm 最新版哈希，仅在数据或 Schema 实际变化时发布（通常递增 patch），发布前用 `modellink-go` 模拟 Registry 下载、校验、类型解码与从上一版升级，任何一步失败不会发布。贡献者不需要准备 Go 环境。
