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

## 快速开始

四种使用方式读取的是**同一份数据**：在线页面、JSON 直链与 npm 包由同一次构建产出（同一 Git commit，`manifest.json` 哈希一致）。全部数据与字段都可以在线浏览，字段含义见[数据格式说明](./DATA_FORMAT.md)。

### 1. 在线浏览

打开 [goroutined.github.io/modellink](https://goroutined.github.io/modellink/)，按模型、服务商、研发机构浏览全部收录数据，包括价格档位、能力矩阵、调用 ID 与协议端点。

### 2. Shell / curl

直接请求 JSON 直链，配合 `jq` 查询任意服务商的任意模型：

```bash
curl -s https://goroutined.github.io/modellink/catalog.json \
  | jq '.providers["deepseek"].models["deepseek-v4-pro"]'
```

四个直链地址：`https://goroutined.github.io/modellink/{api|models|catalog|schema}.json`。

### 3. npm 安装

Node / Bun 项目安装数据包（国内建议 npmmirror 源）：

```bash
npm install @modellink/data --registry=https://registry.npmmirror.com
```

```ts
import catalog from "@modellink/data/catalog.json" with { type: "json" };
const model = catalog.providers["deepseek"].models["deepseek-v4-pro"];
console.log(model.cost_cn);
```

### 4. Go

Go 项目用 [modellink-go](https://github.com/goroutined/modellink-go)（自动下载、校验、缓存，离线可用）：

```go
client, _ := modellink.New(modellink.Options{})
snapshot, _ := client.Load(context.Background())

model, _ := snapshot.ProviderModel("deepseek", "deepseek-v4-pro")
fmt.Println(model.Name, model.Limit.Context)
```

## 真实计费模型

价格字段按官方真实规则建模，不把复杂价格压成一个失真的数字：

- `cost_cn`：人民币元/百万 Token，支持缓存命中、分时段（tiers + 时区与时间窗）、输入长度阶梯、思考模式差价、按日期生效的调价；
- `cost_points`：订阅套餐的积分抵扣价，不伪装成人民币 Token 单价；
- `plans_cn`：订阅套餐档位、月费与月度额度。

同一模型在不同服务商、不同套餐下的价格可以直接对比。

## 数据覆盖

收录标准是 **Agent 运行时真正会用到的模型**：各家旗舰与主流模型、多模态与推理模型，以及 Coding / Token 订阅套餐内的可用模型。参数量小、不适合 Agent 场景的模型明确排除——ModelLink 追求对 Agent 开发者够用且可信，不是全量模型库。当前收录规模见顶部 data 徽章（随每次发布自动更新）。

- **官方直营**：智谱、DeepSeek、月之暗面、MiniMax、字节豆包、腾讯混元、阿里通义、百度千帆、华为云 MaaS、美团 LongCat、阶跃、小米 MiMo 等；
- **聚合与托管**：硅基流动、火山方舟、腾讯 TokenHub、Gitee AI、京东 JoyBuilder 等；
- **订阅套餐**：火山 Coding / Agent Plan、腾讯 Token / Coding Plan、阿里 / 百度 Token Plan、MiniMax / Xiaomi 积分包等，含套餐档位与积分抵扣规则。

## 数据质量

- **官网优先**：模型参数、调用 ID 和价格直接依据服务商当前官方文档维护，每条记录带 `doc` 链接可溯源；
- **双重核验**：自动化全量回归 + 维护者逐项独立取证，官方证据不足的字段宁可省略也不猜测；
- **发布门禁**：合并到 `main` 后自动构建候选数据包，用 `modellink-go` 模拟 Registry 下载、哈希校验、类型解码和从上一版升级，任何一步失败都不会发布到 npm。

## 工作方式

### 目录架构

数据源是仓库里的 TOML 文件，文件路径决定 ID：

- `labs/`：模型研发组织及其品牌信息；
- `models/`：canonical model——与服务商无关的基础模型事实（能力、模态、上下文限制、权重链接）；
- `providers/`：具体 API 服务——协议端点、调用 ID、在该服务商上的能力、限制与价格。

第三方托管服务通过 `base_model` 引用 canonical model 并继承模型事实，只声明真实差异；构建时展开为完整 JSON。同一服务按量 API 与订阅套餐接入地址、模型名或计费不同时，拆成独立 Provider。

### 部署与分发

```text
TOML 源数据（labs / models / providers）
        │  合并到 main 后 CI 自动构建
        ▼
生成 JSON（api / models / catalog / schema + manifest）
        │
        ├── GitHub Pages：在线浏览页面 + JSON 直链
        └── npm 发布 @modellink/data（npmmirror 自动同步）
```

发布工作流只在数据或 Schema 实际变化时发布新版本（通常自动递增 patch），页面、文档等非数据修改不会产生空版本。版本一经发布不会覆盖。

### Go 客户端与 npm 数据包

`modellink-go` 是官方 Go 客户端，数据来源与 npm 包相同：运行时通过标准 npm Registry API（默认 npmmirror）查询 `@modellink/data` 的最新版本，按 `version` 判断是否需要下载，下载后校验 Registry integrity 与 `manifest.json` 逐文件 SHA-256，通过后缓存到本地。客户端不依赖 Node.js、不执行 npm 包中的任何脚本，校验失败时继续使用上一次通过的本地副本。

### npm 包内数据

`@modellink/data` 是不含运行时代码与依赖的纯数据制品，包内文件：

| 文件 | 内容 |
| --- | --- |
| `api.json` / `models.json` / `catalog.json` | 与 GitHub Pages 直链完全相同的数据 |
| `schema.json` | 公开结构的版本化 JSON Schema |
| `manifest.json` | 版本、Schema 版本、来源 Git commit、逐文件 SHA-256 与字节数 |

生产环境建议通过 Registry 元数据比较 `version` 后再下载 tarball，并按 `manifest.json` 校验，不要把 `latest` 元数据作为唯一数据源。

## 参与贡献

欢迎提交新的模型、服务商、官方价格与数据修正。开发环境、录入规则和校验方式请参阅 [贡献指南](./CONTRIBUTING.md)。

## 许可

[MIT](./LICENSE)。数据格式设计与 [models.dev](https://models.dev) 保持兼容，兼容 schema 参考自 [models.dev](https://github.com/anomalyco/models.dev)（MIT，Copyright © 2025 models.dev）；全部数据由 ModelLink 独立维护与核验。
