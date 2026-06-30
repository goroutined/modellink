# 贡献指南

感谢你对 ModelLink 的关注！这份文档会帮你了解如何添加或更新数据。

## 数据模型：两层结构

ModelLink 仿照 [models.dev](https://models.dev) 把数据拆成两层，核心原因是：**同一个模型常被多家提供商转售**。

以 DeepSeek-V3 为例——它的能力（上下文长度、是否支持工具调用、推理等）是一份客观事实，不会因为谁在卖它就变了。但硅基流动、火山引擎、阿里云百炼等提供商各自有不同的定价、Base URL 和认证方式。

这两层分开存，能避免同一个模型的能力字段在多个文件里重复：

| 层级 | 目录 | 存什么 | 谁来改 |
|------|------|--------|--------|
| 模型事实 | `data/models/<id>.json` | 模型本身的能力和架构——与提供商无关 | 模型发布时创建，能力有变时更新 |
| 提供商服务 | `data/providers/<id>.json` | 定价、调用方式、合规信息——随提供商不同 | 新平台上线、定价变动时更新 |

举例：硅基流动上新了 DeepSeek-V3，贡献者要做两步——① 没有 `data/models/deepseek-v3.json`？创建一个；② 在 `data/providers/siliconflow.json` 里加一条，通过 `model_id` 指向 `deepseek-v3`，带上价格/Base URL。第二步不需要重复写能力字段。

## 准备工作

1. Fork 本仓库
2. 把你 fork 的仓库 clone 到本地
3. 在 `main` 分支上开一个新分支，用来提交你的改动

## 添加一个新模型

当市场上出现一个新模型（如 Qwen3、GLM-5 等），且目前 `data/models/` 下还没有它时，需要先建模型事实文件。

文件名：`data/models/<id>.json`，其中 `<id>` 是模型的规范英文 slug（全小写，单词间用 `-` 连接，例如 `qwen3`、`glm-5`、`deepseek-v3`）。

文件内容遵循 [model.schema.json](data/schema/model.schema.json)，以下是一个完整示例：

```json
{
  "id": "deepseek-v3",
  "name": "DeepSeek-V3",
  "family": "deepseek",
  "release_date": "2024-12-26",
  "open_weights": true,
  "tool_call": true,
  "reasoning": false,
  "structured_output": true,
  "modalities": {
    "input": ["text"],
    "output": ["text"]
  },
  "limit": {
    "context": 131072,
    "output": 8192
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 规范英文 slug，与文件名一致 |
| `name` | string | ✅ | 展示名称，例如 `"DeepSeek-V3"` |
| `family` | string | ✅ | 模型家族 slug，例如 `"deepseek"`、`"qwen"`、`"glm"` |
| `release_date` | string | 否 | 首次发布时间，格式 `YYYY-MM-DD` |
| `open_weights` | boolean | ✅ | 权重开放：`true` = 开源，`false` = 闭源 |
| `tool_call` | boolean | ✅ | 是否支持 Function Calling / 工具调用 |
| `reasoning` | boolean | ✅ | 是否为内置思考模型（如 DeepSeek-R1、QwQ，有 extended thinking 能力） |
| `structured_output` | boolean | ✅ | 是否支持结构化输出（JSON Mode） |
| `modalities` | object | ✅ | 多模态支持，包含 `input` 和 `output` 两个数组，元素为 `"text"` / `"image"` / `"video"` / `"audio"` |
| `limit` | object | ✅ | `context`（最大上下文窗口 token 数）和 `output`（最大输出 token 数） |

> 这些字段描述的是模型本身的上限。某个提供商如果只开放更低的上下文或输出长度，请用 provider 文件里的 `limit_override` 标注——不要为迁就一个提供商而改低模型的能力值。

## 添加一个新提供商（或给已有提供商加模型）

文件名：`data/providers/<id>.json`，`<id>` 是该提供商的英文 slug（如 `siliconflow`、`alibaba`、`zhipu`）。

如果该文件已存在，在 `models` 数组末尾追加一个新条目即可。

每个模型条目的字段遵循 [provider.schema.json](data/schema/provider.schema.json)，示例：

```json
{
  "model_id": "deepseek-v3",
  "model_id_on_platform": "deepseek-ai/DeepSeek-V3",
  "cost": {
    "input": 2,
    "output": 8,
    "cache_read": 1
  },
  "api": {
    "protocol": "openai",
    "base_url": "https://api.siliconflow.cn/v1",
    "auth_type": "api_key"
  },
  "streaming": true,
  "doc": "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions",
  "access": {
    "requires_mainland_phone": true,
    "requires_enterprise": false,
    "compliance_status": "已备案"
  },
  "source": "https://siliconflow.cn/pricing",
  "updated_at": "2026-06-25"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model_id` | string | ✅ | 引用 `data/models/<id>.json` 中的 `id`；模型的能力以此文件为准 |
| `model_id_on_platform` | string | ✅ | 调用该提供商 API 时使用的精确字符串，可能和 `model_id` 不同（例如 `"deepseek-ai/DeepSeek-V3"`） |
| `cost` | object | ✅ | 价格，详见下方子字段 |
| `cost.input` | number | ✅ | 输入价格（元 / 百万 token） |
| `cost.output` | number | ✅ | 输出价格（元 / 百万 token） |
| `cost.reasoning` | number | 否 | 思考 token 价格（思考模型专有，如该模型不支持思考则不填） |
| `cost.cache_read` | number | 否 | 缓存读取价格（支持 KV Cache 的平台适用） |
| `limit_override` | object | 否 | 仅在该提供商实际提供的上下文/输出上限低于模型本身能力时填写，含 `context` 和 `output` 两个整数 |
| `api` | object | ✅ | 调用信息 |
| `api.protocol` | string | ✅ | 调用协议：`"openai"`（OpenAI 兼容）或 `"anthropic"`（Anthropic 兼容） |
| `api.base_url` | string | ✅ | API 请求地址 |
| `api.auth_type` | string | ✅ | 认证方式：`"api_key"` / `"bearer_token"` / `"aksk"` |
| `streaming` | boolean | ✅ | 是否支持流式输出（SSE） |
| `doc` | string | 否 | 该模型在该平台的文档或介绍页链接 |
| `access` | object | 否 | 合规与访问信息，省略表示未知或无特殊要求 |
| `access.requires_mainland_phone` | boolean | 否 | 是否需要大陆手机号 |
| `access.requires_enterprise` | boolean | 否 | 是否需要企业资质 |
| `access.compliance_status` | string | 否 | 生成式 AI 备案情况，如 `"已备案"` / `"未备案"` / `"不适用"` |
| `source` | string | ✅ | 数据来源链接（定价页、文档等），用于核实 |
| `updated_at` | string | ✅ | 该条目最后核实/更新的日期，格式 `YYYY-MM-DD` |

### Provider 级字段

Provider 文件本身的顶层也有关键字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 提供商英文 slug，与文件名一致，例如 `"siliconflow"` |
| `name` | string | ✅ | 提供商中文名称，例如 `"硅基流动"` |
| `doc` | string | 否 | 提供商官网或文档总入口 |
| `models` | array | ✅ | 该提供商服务的模型列表，每个元素为上述的模型条目对象 |

## 更新已有数据

发现定价过时、某字段有误、或缺少新上线的模型？同样欢迎提 PR：

- **定价变动**：修改对应 provider 文件里该模型的 `cost` 和 `updated_at`
- **模型能力更新**（如上下文窗口扩展）：修改 `data/models/<id>.json`，不要动 provider 文件
- **新增合规信息**：在 provider 文件该模型条目的 `access` 字段补充

每次修改都请更新 `updated_at` 为当前日期。

## 提交 PR 前

1. 确保 JSON 格式合法，字段名、类型与本节描述一致
2. 确保每个价格和链接都附上了 `source`
3. 如果新增了一个模型但尚未被任何 provider 引用，那也是可以的——这表明模型已发布，等待提供商接入
4. 如果新增的 provider 引用了尚不存在的 `model_id`，确保同时提交对应的 model 文件

## 常见问题

**Q: 同一个模型有两个变体（如 `deepseek-v3` 和 `deepseek-r1`），应该分开建文件吗？**
A: 是的。能力不同、架构不同的就是两个模型，各自一个文件。`family` 可以相同。

**Q: 一个提供商对同一个模型有不同价格档位（如按并发数），怎么填？**
A: 填基础档位（默认价格），如果需要描述更多细节，在 PR 描述里备注，我们后续可以扩展 schema。

**Q: 字段名为什么用英文？**
A: 与 models.dev 生态对齐，也方便 Go struct tag 直接映射。中文说明请看本文档。
