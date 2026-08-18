# 贡献指南

ModelLink 当前的数据格式与 models.dev catalog 保持一致。提交数据前请先运行：

```bash
bun install
bun run check
```

## 添加 canonical model

在模型研发组织下创建：

```text
models/<lab-id>/<model-id>.toml
```

文件路径会生成 canonical ID `<lab-id>/<model-id>`，不要在 TOML 中写 `id`。

完整模型至少应包含名称、描述、发布日期、更新时间、能力布尔值、模态和上下文限制。示例见 `models/alibaba/qwen3-32b.toml`。

## 添加 provider

```text
providers/<provider-id>/
  provider.toml
  logo.svg
  models/.../*.toml
```

兼容层的 `provider.toml` 包含名称、认证环境变量、AI SDK 包、文档地址，以及 OpenAI-compatible provider 的 API 地址。`npm` 仅用于保持 models.dev 兼容，不作为 ModelLink 的协议判断依据。

每个 Provider 同时直接声明 ModelLink 协议扩展字段：

```toml
protocol = "openai-compatible"
```

如果服务商同时支持 OpenAI 与 Anthropic 协议，默认录入 OpenAI-compatible 地址。普通按量 API、Coding Plan、Token Plan 等服务只要接入地址、模型名称或计费方式不同，就分别建立独立 Provider，不能合并模型清单。

## 添加 provider model

如果 provider 不是模型研发方，必须引用 canonical model：

```toml
base_model = "alibaba/qwen3-32b"

[cost_cn]
input = 1
output = 4
```

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

## 数据来源

Provider 数据必须逐项取自该服务商当前官网：模型是否可用以当前模型列表为准；调用 ID、能力、默认模式和限制以对应模型详情页为准；人民币价格以对应中国地域的官方价格页为准。模型研发方官网只能补充 canonical model 信息，不能证明某个 Provider 当前提供该模型。

开发者社区文章、搜索结果摘要、API 示例、models.dev 和第三方聚合站只能用于发现线索或兼容性对比，不得直接作为模型可用性、调用参数或价格的录入依据。官网未明确公布的字段保持为空，由页面显示 `-`，不得推算或猜测。

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

价格只按单一输入长度阈值变化时，继续使用兼容的 `type = "context"` 阶梯。价格同时取决于输入量、输出量或每日时段时，使用 ModelLink 的条件阶梯扩展：

```toml
[cost_cn]
input = 2
output = 8

[[cost_cn.tiers]]
input = 2
output = 8

[cost_cn.tiers.tier]
type = "conditional"

[cost_cn.tiers.tier.input]
gte = 0
lt = 32_000

[cost_cn.tiers.tier.output]
gte = 0
lt = 200
```

`gte` 表示包含下界，`lt` 表示不包含上界。条件阶梯应覆盖官网公布的全部计价情况，`cost_cn` 顶层价格作为默认值和兼容回退。按每日高峰、低谷时段计费时可增加以下条件；同一价格可以包含多个时间窗口，开始时间包含、结束时间不包含，开始时间晚于结束时间表示跨越午夜：

```toml
[cost_cn.tiers.tier.time]
timezone = "Asia/Shanghai"

[[cost_cn.tiers.tier.time.windows]]
start = "09:00"
end = "12:00"

[[cost_cn.tiers.tier.time.windows]]
start = "14:00"
end = "18:00"
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
