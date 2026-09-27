# ModelLink

[![npm](https://img.shields.io/npm/v/@modellink/data)](https://www.npmjs.com/package/@modellink/data)
[![publish](https://img.shields.io/github/actions/workflow/status/goroutined/modellink/publish-data.yml?label=publish)](https://github.com/goroutined/modellink/actions/workflows/publish-data.yml)
[![data](https://img.shields.io/endpoint?url=https%3A%2F%2Fgoroutined.github.io%2Fmodellink%2Fbadge.json)](https://goroutined.github.io/modellink/)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

中国 AI 模型与推理服务商的开源目录：谁家有什么模型、什么能力、怎么调用、多少钱——一份数据源，持续核验。

[在线浏览](https://goroutined.github.io/modellink/) · [数据格式](./DATA_FORMAT.md) · [Go SDK](https://github.com/goroutined/modellink-go) · [参与贡献](./CONTRIBUTING.md)

## 为什么需要 ModelLink

使用国内大模型 API 的开发者面对的现实：

- 同一个模型在官方 API、聚合平台、订阅套餐里的价格不同，还有分时段、阶梯、缓存命中、思考模式差价；
- Token / Coding / Agent 套餐按积分抵扣，各家一张表一个规则；
- 上下文长度、思考开关、工具调用、多模态能力散落在各家文档里，格式五花八门。

ModelLink 把这些整理成一份[版本化数据制品](https://www.npmjs.com/package/@modellink/data)：每条记录都能溯源到服务商官方文档，发布前用 Go 客户端模拟完整的下载与升级流程，数据错误不出门。

## 30 秒上手

一行命令查看任意服务商的任意模型（这里是 DeepSeek 官方 API 的 V4 Pro）：

```bash
curl -s https://goroutined.github.io/modellink/catalog.json \
  | jq '.providers["deepseek"].models["deepseek-v4-pro"]'
```

Go 项目用 [modellink-go](https://github.com/goroutined/modellink-go)（自动下载、校验、缓存，离线可用）：

```go
client, _ := modellink.New(modellink.Options{})
snapshot, _ := client.Load(context.Background())

model, _ := snapshot.ProviderModel("deepseek", "deepseek-v4-pro")
fmt.Println(model.Name, model.Limit.Context)
```

Node / Bun 项目安装数据包：

```bash
npm install @modellink/data --registry=https://registry.npmmirror.com
```

```ts
import catalog from "@modellink/data/catalog.json" with { type: "json" };
const model = catalog.providers["deepseek"].models["deepseek-v4-pro"];
console.log(model.cost_cn);
```

## 数据覆盖

收录标准是 **Agent 运行时真正会用到的模型**：各家旗舰与主流模型、多模态与推理模型，以及 Coding / Token 订阅套餐内的可用模型；参数量小、不适合 Agent 场景的模型明确排除。ModelLink 追求对 Agent 开发者够用且可信，不是全量模型库。当前收录规模见顶部 data 徽章（随每次发布自动更新）。

覆盖的服务包括：

- **官方直营**：智谱、DeepSeek、月之暗面、MiniMax、字节豆包、腾讯混元、阿里通义、百度千帆、华为云 MaaS、美团 LongCat、阶跃、小米 MiMo 等；
- **聚合与托管**：硅基流动、火山方舟、腾讯 TokenHub、Gitee AI、京东 JoyBuilder 等；
- **订阅套餐**：火山 Coding / Agent Plan、腾讯 Token / Coding Plan、阿里 / 百度 Token Plan、MiniMax / Xiaomi 积分包等，含套餐档位与积分抵扣规则。

在线页面可以按模型、服务商、研发机构浏览全部数据。

## 数据质量

- **官网优先**：模型参数、调用 ID 和价格直接依据服务商当前官方文档维护，每条记录带 `doc` 链接可溯源；
- **双重核验**：自动化全量回归 + 维护者逐项独立取证，官方证据不足的字段宁可省略也不猜测；
- **发布门禁**：合并到 `main` 后自动构建候选数据包，用 `modellink-go` 模拟 Registry 下载、哈希校验、类型解码和从上一版升级，任何一步失败都不会发布到 npm。

## 真实计费模型

价格字段按官方真实规则建模，不把复杂价格压成一个失真的数字：

- `cost_cn`：人民币元/百万 Token，支持缓存命中、分时段（tiers + 时区与时间窗）、输入长度阶梯、思考模式差价；
- `cost_points`：订阅套餐的积分抵扣价，不伪装成人民币 Token 单价；
- `plans_cn`：订阅套餐档位、月费与月度额度。

同一模型在不同服务商、不同套餐下的价格可以直接对比。

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

合并到 `main` 后，发布工作流会将本次生成的四个公开 JSON 与 npm 最新版本中的哈希比较。只有实际数据或 Schema 发生变化时才发布；通常自动递增 patch 版本，破坏性数据迁移可通过 `packages/data/release.json` 提升最低发布版本。发布前还会用 `modellink-go` 的候选包验证命令模拟 Registry 下载、哈希校验、类型解码、缓存和从上一版升级。页面、文档等非数据修改不会产生空版本。版本一经发布不会覆盖，生产环境应保存已校验的本地副本，不要把 `latest` 元数据作为唯一数据源。

## 数据结构

ModelLink 沿用 [models.dev](https://models.dev) 的三层目录并保持其数据格式兼容：

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
- `protocol`、`endpoints`、`links`、`cost_cn`、`cost_points`、`plans_cn` 和 `series`：ModelLink 扩展字段，分别表示默认调用协议、多协议接入端点、按用途区分的官方入口、人民币官方价格、订阅套餐积分消耗、人民币套餐信息和 canonical model 的版本系列。
- 第三方 provider 使用 `base_model = "<lab>/<model>"` 继承模型事实，只声明真实差异。

文件路径决定 ID，TOML 中不写 `id`。完整字段说明见 [DATA_FORMAT.md](./DATA_FORMAT.md)。

## 兼容输出

构建后在 `docs/` 生成：

- `api.json`：完整展开的 provider map，是 models.dev `/api.json` 的兼容字段超集。
- `models.json`：canonical model map，与 models.dev `/models.json` 同形。
- `catalog.json`：`{ models, providers }`，Provider 数据包含 ModelLink 中国区扩展字段。
- `schema.json`：公开 JSON 的版本化 JSON Schema，同时通过 GitHub Pages 和 npm 数据包分发。

## 当前范围

现阶段的验收目标是保持 models.dev 核心字段兼容，并以字段超集提供中国区信息。`protocol` 不依赖 `npm` 判断；`cost_cn` 单位固定为人民币元/百万 Token，并可通过 `cost_cn.thinking` 表达思考模式采用的不同输入、输出单价。按订阅积分抵扣的服务使用 `cost_points`，不得伪装成人民币 Token 单价。国内数据可以没有美元 `cost`。模型同时支持思考和非思考模式时，限制字段按照对应 Provider 的默认模式录入。

同一服务支持多种协议时，`protocol` 与 `api` 继续表示默认接入方式以兼容既有消费者，全部协议和 Base URL 通过 Provider 的 `endpoints` 记录；具体模型支持的端点通过 Provider Model 的 `endpoints` 记录。订阅计划与普通按量 API 使用不同地址、模型名称或计费方式时，必须拆成独立 Provider。

## 参与贡献

欢迎提交新的模型、服务商、官方价格与数据修正。开发环境、录入规则和校验方式请参阅 [贡献指南](./CONTRIBUTING.md)。

## 许可

[MIT](./LICENSE)。数据格式设计与 [models.dev](https://models.dev) 保持兼容，兼容 schema 参考自 [models.dev](https://github.com/anomalyco/models.dev)（MIT，Copyright © 2025 models.dev）；全部数据由 ModelLink 独立维护与核验。
