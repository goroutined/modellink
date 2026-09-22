# 贡献指南

感谢你帮助 ModelLink 完善中国 AI 模型与服务商数据。项目使用 [Bun](https://bun.sh/) 进行开发，首次运行先安装依赖：

```bash
bun install
```

提交数据前请运行完整检查：

```bash
bun run check
```

常用命令：

```bash
bun run validate  # 校验 TOML、引用和最终模型约束
bun run test      # 运行继承、扩展和输出测试
bun run build     # 生成兼容 JSON、完整目录和 logo
```

ModelLink 保持 models.dev 核心格式兼容，并通过扩展字段补充中国区协议、人民币价格和订阅套餐等信息。请勿手工编辑构建产物，数据录入规则见下文。

## 测试与数据核验的分工

日常新增、更新或移除模型和服务商，只需修改对应 TOML（以及需要的 Logo），不需要在测试中同步维护模型清单、数量或具体价格。

- `validate` 与真实目录的 Schema 测试检查全量数据的格式、结构、引用和通用一致性，不限定具体模型或服务商枚举。
- 继承、覆盖、`base_model_omit`、路径 ID、协议引用和输出归一化等生成机制，通过独立的虚构样例测试；不要以不断变化的真实模型参数作为固定预期。
- 官网是否提供模型、价格与能力是否准确，交由官方资料核验、人工审核及独立 Checker 处理；测试通过不等于官方证据完整。
- 修改 Schema 或生成逻辑时，补充相应通用机制测试。不要为了通过测试修改正确的模型业务数据，也不要为新增模型增加一份测试白名单。

`bun run check` 调用 `bun run test`，只运行 `packages/core/test` 和 `scripts` 内的项目测试，不运行独立 Checker。

## 发布前 Go 客户端兼容性验证

`bun run check` 只负责本仓库的数据与构建校验，不要求贡献者同时准备 Go 开发环境。
维护者发布影响 `@modellink/data` 的变更前，可以额外用本地
[`modellink-go`](https://github.com/goroutined/modellink-go) 验证未发布 tarball。

先在 ModelLink 仓库构建并打包候选版本：

```bash
bun run build:data -- --version <candidate-version>
bun run verify:data
npm pack .artifacts/npm --pack-destination .artifacts --ignore-scripts
```

再到本地的 `modellink-go` checkout 中执行：

```bash
go run ./internal/cmd/verifydata \
  --tarball /path/to/modellink/modellink-data-<candidate-version>.tgz
```

该命令会启动只监听 `127.0.0.1` 的临时 npm Registry，用真实 Go 客户端完成元数据解析、
下载、integrity 与 manifest 哈希校验、类型解码、缓存重载和目录清单比对。需要模拟老用户
升级时，用 `npm pack @modellink/data@latest --ignore-scripts` 获取已发布包，并传给
`--baseline-tarball`。合并到 `main` 后的发布工作流会自动执行同一验证。
自动发布默认使用 `goroutined/modellink-go` 的 `main` 分支作为验证客户端；修改验证命令后，
应先让对应变更进入远端 `main`，再触发数据包发布。

## 添加 canonical model

在模型研发组织下创建：

```text
models/<lab-id>/<model-id>.toml
```

文件路径会生成 canonical ID `<lab-id>/<model-id>`，不要在 TOML 中写 `id`。

完整模型至少应包含名称、描述、发布日期、更新时间、能力布尔值、模态和上下文限制。示例见 `models/alibaba/qwen3-32b.toml`。

同一产品线存在多个需要独立审计的真实版本时，使用 ModelLink 可选扩展字段 `series` 建立展示关系：

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

兼容层的 `provider.toml` 包含名称、认证环境变量、AI SDK 包、文档地址，以及 OpenAI-compatible provider 的 API 地址。`npm` 仅用于保持 models.dev 兼容，不作为 ModelLink 的协议判断依据。

`doc` 保留为 models.dev 兼容的主要文档入口。面向用户的明确入口通过可选 `links` 记录：

```toml
[links]
models = "https://example.com/models"
pricing = "https://example.com/pricing"
api_key = "https://example.com/docs/create-api-key"
console = "https://console.example.com/api-keys"
```

- `models` 必须能查看当前可用模型或完整模型目录，不能使用单个模型详情页。
- `pricing` 指向价格、套餐或官方购买说明。
- `api_key` 是面向首次接入用户的指引：优先选择对应服务的快速开始、密钥申请或认证教程，明确说明在哪里获取密钥、如何配置或发起调用。不能仅因为页面提到 API Key 就选用产品概览、价格表或泛泛的 FAQ；FAQ 只有实际给出操作步骤且没有更直接的指引时才使用。
- 普通 API 与 Coding/Token/Agent Plan 必须分别核对密钥与接入流程，不能用普通密钥教程替代专属套餐教程。共用教程只有明确覆盖该套餐时才可复用。不能读取正文时记录为未确认，不以链接存在或页面标题代替内容核验。
- `console` 指向可以登录并管理 API Key 或账户的官方控制台。
- 找不到满足语义的官方页面时省略字段，不写空字符串、`null`、搜索页或无关首页。
- 按页面实际内容判断用途，不要求独立页面或特定标题：快速开始中的密钥申请步骤可以作为 `api_key`，模型目录中的价格表可以作为 `pricing`。存在已验证的章节锚点时优先使用，方便直接定位。
- 同一个官方页面同时满足多个用途时可以重复使用 URL；展示层按用途分别展示，不按地址去重，避免隐藏 API Key 等入口。
- Provider Model 的 `doc` 继续指向精确调用型号的详情或参数证据，不受此处影响。

每个 Provider 同时直接声明 ModelLink 默认协议扩展字段：

```toml
protocol = "openai-compatible"
```

`protocol` 与 `api` 必须保持为默认接入方式，以兼容原有单协议消费者。全部经官网确认的协议和 Base URL 使用 `endpoints` 记录，且必须恰好有一个端点声明 `default = true`，其 `protocol` 和 `api` 必须与 Provider 顶层字段一致：

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

协议标识固定使用 `openai-compatible`、`anthropic-compatible` 和 `openai-responses`。不同协议即使共用同一个 Base URL，也应建立不同 endpoint；不要把完整请求路径（如 `/chat/completions`、`/messages`、`/responses`）误写成 SDK 所需的 Base URL。

普通按量 API、Coding Plan、Token Plan 等服务只要接入地址、模型名称或计费方式不同，就分别建立独立 Provider，不能合并模型清单。

## 添加 Logo

ModelLink 现有 Logo 主要来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)、许可明确的开源图标库和品牌官网。新增或更新 `labs/<lab-id>/logo.svg`、`providers/<provider-id>/logo.svg` 时，按以下顺序选择来源：

1. 优先使用 Lobe Icons 静态 SVG 包中的单色图标，并固定具体版本，不引用会随时间变化的 `latest`。
2. Lobe Icons 没有对应品牌或图标明显落后于当前品牌时，使用其他许可明确的开源 SVG，或品牌官网提供且允许用于项目展示的 SVG。
3. 没有可靠来源时，省略 `logo.svg`，页面会自动使用通用默认图标。只有品牌形态清晰且经过人工确认时，才可提交项目绘制的单色简化版，并明确注明它不是官方素材。

Logo 必须使用方形 `viewBox` 和 `currentColor`，不得包含脚本、外链、嵌入字体、Base64 图片或其他需要联网加载的资源。不要直接描摹或把来源、许可不明的 PNG 自动转换成 SVG。

Lab 使用模型研发机构的品牌，Provider 使用实际提供 API 或套餐的服务品牌。例如阿里巴巴 Lab、阿里云百炼 Provider 和 Qwen 模型系列不是同一个 Logo；同一服务商的普通 API、Coding Plan、Token Plan 可以复用同一 Logo。

每个 SVG 顶部应记录来源。例如：

```svg
<!-- source: LobeHub/lobe-icons@1.94.0; slug: example; license: MIT -->
```

```svg
<!-- source: official; url: https://example.com/logo.svg; retrieved: 2026-08-26 -->
```

```svg
<!-- source: simple-icons@16.28.0; slug: example; license: CC0-1.0 -->
```

项目绘制的简化版使用 `source: modellink-original; unofficial monochrome simplification`；通用默认图标不应复制到各 Lab 或 Provider 目录。

修改源文件后运行 `bun run build`，将 Lab Logo 生成到 `docs/logos/labs/<lab-id>.svg`、Provider Logo 生成到 `docs/logos/<provider-id>.svg`，并确认源文件与页面展示副本一致。

## 添加 provider model

如果 provider 不是模型研发方，必须引用 canonical model：

```toml
base_model = "alibaba/qwen3-32b"
endpoints = ["openai", "anthropic"]

[cost_cn]
input = 1
output = 4
```

Provider Model 的 `endpoints` 只能引用当前 Provider 已声明的 endpoint ID，并表示该模型经官网确认实际支持的协议。省略时只表示支持 Provider 的默认 endpoint，不得自动继承 Provider 的全部协议。Responses 等模型白名单协议必须逐个模型核对，不能因为 Provider 提供对应端点就批量推断全部模型支持。

只写 provider 真实不同的字段。`cost_cn`、`reasoning_options`、`interleaved`、`status`、provider request shape 和 provider-specific limit 通常属于这一层。

可以用 `base_model_omit` 删除不适用于该 provider 的继承字段：

```toml
base_model = "lab/model"
base_model_omit = ["structured_output", "limit.input"]
```

## 合并规则

- 普通对象深度合并。
- 数组和基本类型由 provider 值替换。
- 未声明字段从 canonical model 继承。
- `base_model` 引用不存在时校验失败。
- `base_model` 与 `base_model_omit` 不进入发布 JSON。

## 模型限制

`limit.context`、`limit.input` 和 `limit.output` 分别记录上下文窗口、最大输入和最大输出。模型同时支持思考和非思考模式时，按照对应 Provider 的默认模式录入：默认开启思考就采用官网公布的思考模式限制，默认关闭思考就采用非思考模式限制。字段名称保持不变，不在标题中附加模式名称。

## 推理能力与控制参数

Canonical Model 的 `reasoning = true` 只表示模型具备思考能力。具体服务商是否开放开关、推理强度或思考 Token 预算，必须在 Provider Model 的 `reasoning_options` 中按该服务商官网单独记录，不能从基础模型或其他服务商继承推断。

思考模型没有 `reasoning_options` 时，表示该服务商下模型固定思考、没有经过官网确认的用户可调参数。禁止使用 `values = ["default"]` 等占位值伪造 effort 档位。

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
- `values` 只记录会产生不同推理效果的真实档位。`medium -> high`、`xhigh -> max` 等兼容映射不进入结构化数据，由模型的官方文档链接说明。
- `values` 同时是实际请求值，必须保留服务商协议使用的原始字面量，例如官网声明 Responses 接口使用 `none` 时不能擅自改写为 `no_think`。
- `default` 记录服务商该协议的默认有效档位，并且必须包含在 `values` 中；官网没有明确默认值时省略。
- `budget_tokens` 只在官网明确开放思考预算时填写；已确认上限或下限才填写 `max`、`min`，不得用上下文窗口推算。
- `toggle` 表示允许用户启用和禁用思考。始终开启且不能关闭的模型不要填写 `toggle`。

## 数据来源

Provider 数据必须逐项取自该服务商当前官网：模型是否可用以当前模型列表为准；调用 ID、能力、默认模式和限制以对应模型详情页为准；人民币价格以对应中国地域的官方价格页为准。模型研发方官网只能补充 canonical model 信息，不能证明某个 Provider 当前提供该模型。

开发者社区文章、搜索结果摘要、API 示例、models.dev 和第三方聚合站只能用于发现线索或兼容性对比，不得直接作为模型可用性、调用参数或价格的录入依据。官网未明确公布的字段保持为空，由页面显示 `-`，不得推算或猜测。

模型收录范围以“当前正式可调用且适合 Agent”为准，不限于官网首页推荐或最新一代模型。价格页折叠为“历史模型”但仍在正式模型列表中、有当前价格且没有下线公告的模型应继续收录；只有官网明确已经停用、即将下线，或明显面向角色扮演等非 Agent 场景的小模型才排除。

## 价格

国内 Provider 模型使用 ModelLink 扩展字段 `cost_cn`，单位为人民币元/百万 Token：

```toml
[cost_cn]
input = 1
output = 2
cache_read = 0.02
```

models.dev 的美元 `cost` 仍可被 schema 读取，但 ModelLink 国内数据不要求填写。`cost_cn` 必须来自该 Provider 官方网站中对应中国地域、对应调用 ID 的人民币原价；不得使用 models.dev、第三方聚合站或汇率换算生成中国区价格。没有经过官网核验的人民币价格不要换算或猜测，页面会显示 `-`。

models.dev 只用于发现差异和验证兼容性，不能作为中国区价格的录入来源。

Coding Plan、Token Plan 等订阅服务按积分抵扣时，使用 `cost_points`，不能将积分系数写入人民币 `cost_cn`：

```toml
[cost_points]
label = "非高峰"
per_tokens = 10_000
input = 3.45
cache_read = 0.85
output = 12

[cost_points.tiers]
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

`per_tokens` 表示积分系数对应的 Token 数量；顶层是非高峰或默认扣减，`tiers` 记录高峰等例外扣减，且必须来自套餐当前官方规则。人民币订阅金额属于 Provider 套餐信息，不得换算成模型 Token 单价。

积分消耗随输入或输出 Token 数量变化时，使用 `[[cost_points.tiers]]`，边界规则与 `cost_cn.tiers` 完全一致。`cost_points` 顶层填写首个阶梯用于兼容读取，阶梯中不重复填写 `per_tokens`。

Provider 官网直接公布固定人民币月费时，可以通过 `plans_cn` 记录套餐本身；预付积分包使用
`credit_packages_cn` 记录全部官方档位。为了兼容已发布客户端，同时保留 `credits_cn`
单档摘要，并让它精确匹配其中一个积分包；通常选择最小购买档。这些信息只描述订阅和余额，
不替代模型的 `cost_cn` 或 `cost_points`。

价格只按单一输入长度阈值变化时，继续使用兼容的 `type = "context"` 阶梯。价格同时取决于输入量、输出量或每日时段时，使用 ModelLink 的条件阶梯扩展：

```toml
[cost_cn]
input = 2
output = 8

[[cost_cn.tiers]]
input = 2
output = 8

[cost_cn.tiers.when]
type = "conditional"

[cost_cn.tiers.when.input]
gte = 0
lt = 32_000

[cost_cn.tiers.when.output]
gte = 0
lt = 200
```

Token 区间支持四种明确边界：`gt` 表示大于，`gte` 表示大于等于，`lt` 表示小于，`lte` 表示小于等于。同一侧只能选择一种边界，不能同时写 `gt` 与 `gte`，也不能同时写 `lt` 与 `lte`。必须原样表达官网的包含关系，不能用 `lt = 512_001` 间接模拟 `lte = 512_000`。

纯输入量、输出量或上下文数值阶梯不要填写 `label`。页面会自动显示“阶梯 1”“阶梯 2”，并根据结构化边界在 `?` 悬浮详情中生成“输入 ≤512K”“输出 >200 Token”等条件：

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

`label` 与 `input`、`output` 同级。只有官网赋予计费条件明确且无法单纯由数值边界概括的业务名称时才使用 `label`，例如“高峰期”“低峰期”“优先服务”或“批量调用”。标签只负责概括业务模式，结构化的 Token、时间等条件仍必须完整填写，不能用标签替代真实条件。

如果官网规则有明确默认档，例如“非高峰价格为默认值，高峰时段例外”，顶层填写默认价格并设置 `label`，`tiers` 只保留高峰等例外档。如果官网是“上下文阈值 × 时段”这类完整矩阵，则保留多个 `tiers` 覆盖全部组合；此时顶层价格只是安全兜底，可以不写 `label`。

按高峰、低谷时段计费时可增加时间条件；同一价格可以包含多个时间窗口，开始时间包含、结束时间不包含，开始时间晚于结束时间表示跨越午夜。`days` 必须显式列出；结束时间允许使用 `24:00` 表示当天结束，开始时间不能使用 `24:00`：

```toml
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

`holiday = "exclude_cn_statutory"` 只能用于官网明确说明中国法定节假日按非高峰或例外处理的服务商，且必须搭配 `Asia/Shanghai`。ModelLink 不维护具体节假日日期；调用方需要注入自己的节假日 resolver。resolver 缺失时应返回价格未知，不能静默回落到顶层价格。

高峰 / 闲时价格的推荐写法是：

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

如果同一调用 ID 在普通模式和思考模式下采用不同单价，在 `thinking` 中记录思考模式的完整价格；不要把它写成独立的推理 Token 价格：

```toml
[cost_cn]
input = 2
output = 8

[cost_cn.thinking]
input = 2
output = 20
```

## 生成产物

不要手工编辑 `docs/api.json`、`docs/models.json` 或 `docs/catalog.json`。它们由 `bun run build` 生成，并由 CI 在部署前重建。
