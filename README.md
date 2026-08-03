# ModelLink

中国 AI 模型与推理服务商的开源目录，并保持与 [models.dev](https://models.dev) 的数据格式兼容。

当前阶段只定义基础数据结构和兼容输出，暂不加入 ModelLink 专属字段。仓库仅保留少量样例数据；完整中国区数据将在结构稳定后分批同步。

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
- 第三方 provider 使用 `base_model = "<lab>/<model>"` 继承模型事实，只声明真实差异。

文件路径决定 ID，TOML 中不写 `id`。

## 兼容输出

构建后在 `docs/` 生成：

- `api.json`：完整展开的 provider map，与 models.dev `/api.json` 同形。
- `models.json`：canonical model map，与 models.dev `/models.json` 同形。
- `catalog.json`：`{ models, providers }`，与 models.dev `/catalog.json` 同形。
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

现阶段的验收目标是：使用 models.dev HTTP API 或官方 SDK 的项目，仅替换 `baseUrl` 即可读取 ModelLink。中国特有字段、人民币价格和额外数据将在兼容基线稳定后设计。

## 许可

[MIT](./LICENSE)。兼容 schema 和部分样例数据基于 [models.dev](https://github.com/anomalyco/models.dev)（MIT，Copyright © 2025 models.dev）。
