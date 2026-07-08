Hermes 本地数字化能力网关开发规划

请根据需求文档，按以下阶段完成项目初版建设。

阶段一：项目骨架搭建

目标：完成 TypeScript Node 工程基础结构。

任务：

1. 初始化 package.json
2. 配置 TypeScript
3. 配置 Bun scripts
4. 接入 CAC
5. 接入 Hono
6. 接入 tsx
7. 接入 zod / dotenv
8. 接入 pino
9. 建立目录结构
10. 实现 health / version 命令

要求：

* 使用 ESM
* 不使用 Vite
* 不使用 NestJS
* 不使用 Effect
* Bun 只作为包管理器和 script runner
* 代码保持 Node.js 兼容

建议 scripts：

{
  "scripts": {
    "dev": "tsx src/adapters/cli/index.ts",
    "dev:api": "tsx src/adapters/api/server.ts",
    "test": "vitest",
    "test:run": "vitest run",
    "build": "tsup"
  }
}

阶段产出：

可运行 CLI
可启动 API Server
统一配置加载
统一日志输出
基础项目结构

阶段二：Core Service 与 Mock Provider

目标：先跑通 mock 主流程。

任务：

1. 定义 MailProvider
2. 定义 Notifier
3. 定义 Storage
4. 定义 ReportGenerator
5. 实现 MockMailProvider
6. 实现 MockNotifier
7. 实现 MockReportGenerator
8. 实现 collectMails
9. 实现 generateReport
10. CLI 调用 core service
11. API 调用 core service

示例命令：

bun run dev -- mails collect --since 24h --provider mock
bun run dev -- reports generate --source mock

要求：

* mock 不是临时脚本
* mock provider 和真实 provider 未来可以替换
* core service 不直接依赖 CLI / API 框架
* core service 不直接 console.log

阶段产出：

不依赖真实邮箱即可跑通主流程
CLI 与业务逻辑解耦
API 与业务逻辑解耦
mock 数据可用于开发和测试

阶段三：SQLite 与任务记录

目标：让系统具备状态管理和可追踪能力。

任务：

1. 接入 Drizzle
2. 接入 better-sqlite3
3. 设计 operation_records 表
4. 设计 mail_items 表
5. 设计 reports 表
6. 每次任务执行写入 operation_records
7. 支持查询最近任务
8. 支持查询最近报告

要求：

* 暂不使用 bun:sqlite
* 优先保持 Node.js 兼容
* 任务失败也要记录 operation_records
* 错误信息不要静默吞掉

阶段产出：

任务可追踪
报告可回看
具备基础幂等能力
具备 debug 依据

阶段四：本地 API Server

目标：为其他 Agent 提供受限 HTTP 访问能力。

任务：

1. 实现 Hono server
2. 实现 GET /health
3. 实现 GET /reports/latest
4. 实现 GET /mails/pending
5. 实现 POST /tasks/collect-mails
6. 实现 POST /tasks/generate-report
7. API 复用 core service
8. 增加 API 调用日志

要求：

* API 不提供任意 shell 执行
* API 不拥有比 CLI 更大的权限
* API 入参使用 zod 校验
* API 返回结构化 JSON

阶段产出：

本地 API 可启动
其他 Agent 可读取部分数据
CLI 与 API 共享同一套 core 能力

阶段五：测试体系

目标：用自动化测试保证主链路健壮。

任务：

1. 接入 Vitest
2. 写 core service unit test
3. 写 mock provider unit test
4. 写 SQLite integration test
5. 写 CLI e2e test
6. 写 API e2e test

第一版测试重点：

collectMails 可用
generateReport 可用
operation_records 正确写入
CLI health 可用
API health 可用
latest report 可查询

阶段产出：

核心流程有测试覆盖
修改代码后可自动验证
降低后续扩展风险

阶段六：真实外部系统接入

目标：后续替换 mock，实现真实数据流。

预留但第一版不强求实现：

1. OutlookMailProvider
2. FeishuNotifier
3. LLMReportGenerator
4. 配置真实 token / secret
5. 失败重试
6. 错误记录

要求：

* 真实 provider 通过 ports 接入
* 不影响 mock provider
* 不破坏已有测试

阶段七：未来 MCP Adapter

目标：低成本把已有能力包装成 MCP tools。

预留结构：

src/adapters/mcp/
  server.ts
  tools/

未来可包装：

collectMails
generateReport
listLatestReport
listTasks

要求：

* MCP adapter 只调用 core service
* 不复制业务逻辑
* 复用 zod schema
* core service 入参 / 出参保持对象化

推荐第一轮交付范围

第一轮只完成：

1. Bun + TypeScript Node 工程
2. CAC CLI
3. Hono API
4. Core Service
5. Mock Provider
6. SQLite + Drizzle + better-sqlite3
7. Pino 日志
8. Vitest 基础测试
9. README
10. .env.example

不要在第一轮实现复杂真实外部接入。