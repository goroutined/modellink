# @modellink/data

ModelLink 的版本化 JSON 数据制品，包含中国 AI 模型、推理服务商、人民币价格、调用限制和 Agent 能力数据。

包内提供以下文件：

- `api.json`：models.dev `/api.json` 兼容字段超集。
- `models.json`：canonical model map。
- `catalog.json`：包含 models 与 providers 的完整目录。
- `schema.json`：上述公开 JSON 与 Manifest 的 JSON Schema。
- `manifest.json`：版本、生成时间以及各 JSON 文件的 SHA-256 和大小。

这个包没有运行时代码、依赖或安装脚本。它既可以通过 npm 安装，也可以作为与编程语言无关的静态数据制品使用。

Provider 的 `links` 字段按用途提供模型列表、价格与套餐、API Key 说明和管理控制台入口；没有准确官方入口的用途会直接省略。

项目主页与完整使用说明请参阅 [ModelLink](https://github.com/goroutined/modellink)。
