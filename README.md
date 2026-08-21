# ModelLink

中国 AI 模型与推理服务商的开源目录，并保持与 [models.dev](https://models.dev) 的数据格式兼容。

ModelLink 保留 models.dev 核心字段，并增加适合中国开发者的扩展字段。仓库当前仅保留已核验数据和少量结构样例，完整中国区数据将分批录入。

## 数据结构

ModelLink 沿用 models.dev 的三层目录：

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
- `providers/`：具体 API 服务及其模型、价格、限制和调用方式。
- `protocol`、`endpoints`、`cost_cn`、`cost_points`、`plans_cn` 和 `series`：ModelLink 扩展字段，分别表示默认调用协议、多协议接入端点、人民币官方价格、订阅套餐积分消耗、人民币套餐信息和 canonical model 的版本系列。
- 第三方 provider 使用 `base_model = "<lab>/<model>"` 继承模型事实，只声明真实差异。

文件路径决定 ID，TOML 中不写 `id`。

## 兼容输出

构建后在 `docs/` 生成：

- `api.json`：完整展开的 provider map，是 models.dev `/api.json` 的兼容字段超集。
- `models.json`：canonical model map，与 models.dev `/models.json` 同形。
- `catalog.json`：`{ models, providers }`，Provider 数据包含 ModelLink 中国区扩展字段。
- `logos/<provider>.svg` 和 `logos/labs/<lab>.svg`。

源码中的 `base_model` 和 `base_model_omit` 只参与构建，不会出现在输出 JSON 中。

## 本地开发

需要 [Bun](https://bun.sh/)：

```bash
bun install
bun run check
```

常用命令：

```bash
bun run validate  # 校验 TOML、引用和最终模型约束
bun test          # 运行继承与输出测试
bun run build     # 生成三个兼容 JSON 和 logo
```

## 当前范围

现阶段的验收目标是保持 models.dev 核心字段兼容，并以字段超集提供中国区信息。`protocol` 不依赖 `npm` 判断；`cost_cn` 单位固定为人民币元/百万 Token，并可通过 `cost_cn.thinking` 表达思考模式采用的不同输入、输出单价。按订阅积分抵扣的服务使用 `cost_points`，不得伪装成人民币 Token 单价。国内数据可以没有美元 `cost`。模型同时支持思考和非思考模式时，限制字段按照对应 Provider 的默认模式录入。

同一服务支持多种协议时，`protocol` 与 `api` 继续表示默认接入方式以兼容既有消费者，全部协议和 Base URL 通过 Provider 的 `endpoints` 记录；具体模型支持的端点通过 Provider Model 的 `endpoints` 记录。订阅计划与普通按量 API 使用不同地址、模型名称或计费方式时，必须拆成独立 Provider。

## 许可

[MIT](./LICENSE)。兼容 schema 和部分样例数据基于 [models.dev](https://github.com/anomalyco/models.dev)（MIT，Copyright © 2025 models.dev）。
