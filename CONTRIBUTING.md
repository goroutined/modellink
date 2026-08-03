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

`provider.toml` 包含名称、认证环境变量、AI SDK 包、文档地址，以及 OpenAI-compatible provider 的 API 地址。

## 添加 provider model

如果 provider 不是模型研发方，必须引用 canonical model：

```toml
base_model = "alibaba/qwen3-32b"

[cost]
input = 0.14
output = 0.57
```

只写 provider 真实不同的字段。`cost`、`reasoning_options`、`interleaved`、`status`、provider request shape 和 provider-specific limit 通常属于这一层。

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

## 价格

兼容基线中的 `cost` 与 models.dev 一致，单位为美元/百万 token。人民币价格等中国扩展字段尚未开放，请不要提前加入。

## 生成产物

不要手工编辑 `docs/api.json`、`docs/models.json` 或 `docs/catalog.json`。它们由 `bun run build` 生成，并由 CI 在部署前重建。
