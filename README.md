# ModelLink

中国 AI 模型与推理服务商的开源目录，并保持与 [models.dev](https://models.dev) 的数据格式兼容。

[在线浏览](https://goroutined.github.io/modellink/) · [数据格式与迁移](./DATA_FORMAT.md) · [兼容输出](#兼容输出) · [参与贡献](./CONTRIBUTING.md)

ModelLink 不只是 models.dev 的中国镜像。它保留 models.dev 核心结构，让现有工具可以低成本迁移，同时围绕中国开发者和 Agent 应用补充更实用的数据：

- **中国区官方数据**：收录国内主流模型、API 服务与订阅套餐，价格以中国区官网人民币原价为准，不做美元换算。
- **面向 Agent 开发**：重点整理上下文、最大输入输出、推理模式、工具调用、结构化输出和多模态能力。
- **多协议与多入口**：统一记录 OpenAI Chat、Anthropic Messages、OpenAI Responses 及各自 Base URL。
- **真实计费模型**：支持缓存、阶梯、分时、思考模式、积分和 Token Plan，不把复杂价格压成一个失真的数字。
- **兼容且可扩展**：提供 models.dev 兼容输出，也提供包含中国区特色字段的完整目录和中文可视化页面。
- **官网优先、持续核验**：模型参数、调用 ID 和价格直接依据服务商当前官方文档维护，社区可以共同补充与纠错。

## 获取数据

在线页面同时提供最新 JSON：

```text
https://goroutined.github.io/modellink/api.json
https://goroutined.github.io/modellink/models.json
https://goroutined.github.io/modellink/catalog.json
https://goroutined.github.io/modellink/schema.json
```

`@modellink/data` 将同一份结果发布为不含运行时代码和依赖的版本化数据制品。国内客户端可以通过 npmmirror 的标准 npm Registry API 查询最新版本：

```text
https://registry.npmmirror.com/@modellink%2Fdata/latest
```

返回的 JSON 包含 `version`、`dist.tarball` 和 `dist.integrity`。这套接口与编程语言无关，客户端建议按以下流程更新本地数据：

1. 定期请求元数据，只比较 `version`，未变化时无需下载完整数据包。
2. 版本变化后下载 `dist.tarball` 指向的标准 `.tgz`，并用 `dist.integrity` 校验包完整性。
3. 解包后读取 `manifest.json`，再用其中的 SHA-256 分别校验 `api.json`、`models.json`、`catalog.json` 和 `schema.json`。
4. 网络、解包或任一校验失败时继续使用上一次校验通过的本地副本。

也可以通过包管理器安装固定版本：

```bash
npm install @modellink/data --registry=https://registry.npmmirror.com
```

合并到 `main` 后，发布工作流会将本次生成的四个公开 JSON 与 npm 最新版本中的哈希比较。只有实际数据或 Schema 发生变化时才发布；通常自动递增 patch 版本，破坏性数据迁移可通过 `packages/data/release.json` 提升最低发布版本。页面、文档等非数据修改不会产生空版本。版本一经发布不会覆盖，生产环境应保存已校验的本地副本，不要把 `latest` 元数据作为唯一数据源。

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
- `schema.json`：公开 JSON 的版本化 JSON Schema，同时通过 GitHub Pages 和 npm 数据包分发。
- `logos/<provider>.svg` 和 `logos/labs/<lab>.svg`。

源码中的 `base_model` 和 `base_model_omit` 只参与构建，不会出现在输出 JSON 中。

全部公开字段、缺失值语义、人民币与积分计费、协议选择方式，以及从 models.dev 迁移的注意事项，请参阅 [数据格式与迁移指南](./DATA_FORMAT.md)。

## 参与贡献

欢迎提交新的模型、服务商、官方价格与数据修正。开发环境、录入规则和校验方式请参阅 [贡献指南](./CONTRIBUTING.md)。

## 当前范围

现阶段的验收目标是保持 models.dev 核心字段兼容，并以字段超集提供中国区信息。`protocol` 不依赖 `npm` 判断；`cost_cn` 单位固定为人民币元/百万 Token，并可通过 `cost_cn.thinking` 表达思考模式采用的不同输入、输出单价。按订阅积分抵扣的服务使用 `cost_points`，不得伪装成人民币 Token 单价。国内数据可以没有美元 `cost`。模型同时支持思考和非思考模式时，限制字段按照对应 Provider 的默认模式录入。

同一服务支持多种协议时，`protocol` 与 `api` 继续表示默认接入方式以兼容既有消费者，全部协议和 Base URL 通过 Provider 的 `endpoints` 记录；具体模型支持的端点通过 Provider Model 的 `endpoints` 记录。订阅计划与普通按量 API 使用不同地址、模型名称或计费方式时，必须拆成独立 Provider。

## 许可

[MIT](./LICENSE)。兼容 schema 和部分样例数据基于 [models.dev](https://github.com/anomalyco/models.dev)（MIT，Copyright © 2025 models.dev）。
