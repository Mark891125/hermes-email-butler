Hermes 本地数字化能力网关需求文档

请根据以下需求，建设一个 Hermes Agent 的本地数字化能力网关。

1. 项目定位

这是一个 TypeScript Node 工程，不是 Vite 前端项目，不是 Python 主项目，也不是 Hermes Skill 项目。

系统目标是为 Hermes Agent 和其他本地 Agent 提供稳定、可控、可测试的数字化信息收集整理能力。

整体原则：

* Hermes Agent 负责理解意图、调度任务、组织结果
* 本地 TS 系统负责核心业务处理
* CLI 提供给 Hermes 或本地管理员调用
* API 提供给其他 Agent 受限访问
* 未来可以增加 MCP adapter
* Python 只作为辅助脚本，不作为主工程

2. 技术选型

请使用：

TypeScript
Bun        - 包管理器 / script runner
CAC        - CLI
Hono       - 本地 API Server
tsx        - 运行 TS，保持 Node 兼容
zod        - 参数 / 配置 / 数据校验
dotenv     - 环境变量
pino       - 日志
drizzle    - SQLite ORM
better-sqlite3
vitest     - 测试
tsup       - 构建
execa      - 调 Python / shell

重要约束：

* Bun 只作为包管理器和脚本运行器
* 不要依赖 bun:sqlite、Bun.file 等 Bun Runtime 专属 API
* 项目应尽量保持 Node.js 兼容
* 不要引入 Vite、NestJS、Effect、复杂 monorepo

3. 推荐目录结构

hermes-data-gateway/
  package.json
  tsconfig.json
  .env.example
  README.md
  src/
    core/
      collect-mails.ts
      generate-report.ts
      list-latest-report.ts
      list-tasks.ts
    ports/
      mail-provider.ts
      notifier.ts
      storage.ts
      report-generator.ts
    infra/
      config.ts
      logger.ts
      db/
        client.ts
        schema.ts
      outlook/
      feishu/
      llm/
    adapters/
      cli/
        index.ts
        commands/
      api/
        server.ts
        routes/
      mcp/
        server.ts
        tools/
    mocks/
      mock-mail-provider.ts
      mock-notifier.ts
      mock-report-generator.ts
  tests/
    unit/
    integration/
    e2e/
  scripts/
    python/
  data/
    app.sqlite
    logs/

4. 核心架构要求

请按以下原则实现：

1. core/ 中放真正业务逻辑。
2. CLI、API、未来 MCP 都只能调用 core service。
3. 不要在 adapter 中写复杂业务流程。
4. 外部依赖必须通过 ports/ 接口抽象。
5. mock provider 是正式代码结构的一部分，不是临时脚本。
6. 第一版优先跑通 mock 流程，不急着接真实 Outlook / Feishu。
7. core service 必须使用对象入参、对象出参，方便未来包装为 MCP tools。
8. core 中不要直接依赖 process.env、console、HTTP 框架或 CLI 框架。

5. 第一版需要实现的能力

CLI

实现以下命令：

hermes-data version
hermes-data health
hermes-data mails collect --since 24h --provider mock
hermes-data reports generate --source mock
hermes-data reports latest
hermes-data tasks list

CLI 输出优先使用 JSON，方便 Hermes Agent 解析。

API

实现本地 Hono API：

GET  /health
GET  /reports/latest
GET  /mails/pending
POST /tasks/collect-mails
POST /tasks/generate-report

API 不允许暴露任意 shell 执行能力，只能暴露明确业务接口。

Core Services

至少实现：

collectMails
generateReport
listLatestReport
listTasks

Ports

至少定义：

MailProvider
Notifier
Storage
ReportGenerator

Mock

至少实现：

MockMailProvider
MockNotifier
MockReportGenerator

mock 数据要能支撑 CLI 和 API 跑通完整流程。

6. 数据库要求

使用：

SQLite + Drizzle + better-sqlite3

至少包含：

operation_records
mail_items
reports

每次 collect / generate report 都要写入 operation_records。

操作记录字段建议包括：

id
taskType
source
input
status
startedAt
endedAt
durationMs
processedCount
errorMessage

7. 日志要求

使用 Pino 输出结构化日志。

建议字段：

action
source
status
durationMs
input
error

日志输出到控制台，同时预留：

data/logs/

8. 测试要求

使用 Vitest。

第一版至少包含：

unit:
  core service + mock provider
integration:
  core service + test sqlite db
e2e:
  CLI 基础命令
  API health / latest report

9. 第一版成功标准

以下命令可以正常运行：

bun install
bun run dev -- health
bun run dev -- mails collect --since 24h --provider mock
bun run dev -- reports generate --source mock
bun run dev -- reports latest
bun run dev:api
bun run test