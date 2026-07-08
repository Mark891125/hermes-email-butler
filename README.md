# Hermes Data Gateway

Hermes Data Gateway 是一个本地 TypeScript Node 工程，为 Hermes Agent 和其他本地 Agent 提供可控、可测试的信息收集与整理能力。

第一版只跑通 mock 主流程，不接真实 Outlook / Feishu。CLI 和 API 都通过 core service 调用业务能力，adapter 不承载业务流程。

## Tech Stack

- Bun: package manager / script runner
- TypeScript + ESM
- CAC CLI
- Hono API
- Drizzle ORM + better-sqlite3
- zod
- pino
- Vitest
- tsx / tsup

## Setup

```bash
bun install
```

可选配置见 `.env.example`。

## CLI

```bash
bun run dev -- health
bun run dev -- version
bun run dev -- mails collect --since 24h --provider mock
bun run dev -- reports generate --source mock
bun run dev -- reports latest
bun run dev -- tasks list
```

CLI 默认输出 JSON，便于 Hermes Agent 解析。

## API

```bash
bun run dev:api
```

默认监听 `127.0.0.1:8787`。

可用路由：

- `GET /health`
- `GET /reports/latest`
- `GET /mails/pending`
- `POST /tasks/collect-mails`
- `POST /tasks/generate-report`

示例：

```bash
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/tasks/collect-mails -H 'content-type: application/json' -d '{"since":"24h","provider":"mock"}'
curl -s -X POST http://127.0.0.1:8787/tasks/generate-report -H 'content-type: application/json' -d '{"source":"mock"}'
```

## Test

```bash
bun run test
```

## Data

本地 SQLite 默认写入：

```text
data/app.sqlite
```

包含：

- `operation_records`
- `mail_items`
- `reports`

每次 collect / generate report 成功或失败都会记录到 `operation_records`。

## Future TODO

- TODO: `src/infra/outlook/` 实现真实 Outlook provider。
- TODO: `src/infra/feishu/` 实现真实 Feishu notifier。
- TODO: `src/infra/llm/` 实现真实 LLM report generator。
- TODO: `src/adapters/mcp/` 将 core service 包装为 MCP tools。
