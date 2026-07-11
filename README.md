# Hermes Data Gateway

Hermes Data Gateway 是一个本地 TypeScript Node 工程，为 Hermes Agent 和其他本地 Agent 提供可控、可测试的信息收集与整理能力。

邮件同步使用 Microsoft Entra ID delegated OAuth 和 Microsoft Graph delta query 读取登录用户 Inbox。CLI 和 API 都通过 core service 调用业务能力，adapter 不承载业务流程。

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

项目使用 mise 固定本地工具版本：

```bash
mise trust
mise install
eval "$(mise activate zsh)"
node -p process.version
```

期望 Node.js 为 `24.x`。

如果没有在 shell profile 中启用 mise，可以在每次调用前使用 `mise exec -- hd login` 或 `mise exec -- hd sync`。否则全局 `hd` 可能落到系统 Node 版本，导致原生 SQLite 依赖 ABI 不匹配。

```bash
bun install
```

可选配置见 `.env.example`。

## 部署给 Agent

在实际运行 Agent 的同一台主机、同一用户下部署。`hd` 的 OAuth token 和 SQLite 数据库均是本地状态；不要将它们复制到其他主机或用户。

1. 准备 Node 24 与 Bun，并在项目目录安装依赖和构建：

   ```bash
   mise trust
   mise install
   eval "$(mise activate zsh)"
   bun install
   bun run build
   bun link
   ```

2. 依据 `.env.example` 创建 `.env`，填入 Microsoft Entra 应用配置；运行 `hd login` 完成一次交互式 Microsoft 授权。随后执行一次 `hd sync`，确认 Inbox 邮件已写入本地数据库。

3. 验收 CLI 与 Node ABI：

   ```bash
   hd health
   hd tasks list
   ```

   两个命令应返回 JSON。若系统 Agent 未加载交互式 shell 配置，请让它的启动环境使用 Node 24，或以 `mise exec -- hd …` 调用，避免 `better-sqlite3` 的 ABI 不匹配。

4. 将随仓库提供的 Agent skill 安装到目标 Agent 的 skills 根目录。Codex 默认位置如下；其他 Agent 请复制到其约定的 skills 目录：

   ```bash
   mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
   cp -R skills/hd-mail-report "${CODEX_HOME:-$HOME/.codex}/skills/"
   ```

5. 重启或重新加载 Agent skills。Agent 以 `$hd-mail-report` 被调用时，会遵循领取邮件、外部 IM 发送、标准输入回报的流程。可使用定时器或 Agent 调度器定期执行 `hd sync`；汇总时由 Agent 调用 `hd reports claim` 与 `hd reports submit`。

## CLI

这个项目最终提供的 CLI 命令是：

```bash
hd
```

`cac` 只是 CLI 框架，用来解析 `hd health`、`hd reports claim` 这类命令。它不需要单独 build；真正需要 build 的是本项目的 TypeScript CLI 入口。

### Development Mode

开发态不需要先 build，使用 `tsx` 直接运行 TypeScript：

```bash
bun run dev -- health
bun run dev -- version
bun run dev -- login
bun run dev -- sync
bun run dev -- reports claim --limit 50
printf '# Daily summary\n' | bun run dev -- reports submit <task-id>
bun run dev -- tasks list
```

CLI 默认输出 JSON，便于 Hermes Agent 解析。

### Built Local Mode

构建后可以通过本地 script 调用打包产物：

```bash
bun run build

bun run cli -- health
bun run cli -- login
bun run cli -- sync
bun run cli -- reports claim --limit 50
printf '# Daily summary\n' | bun run cli -- reports submit <task-id>
bun run cli -- tasks list
```

这里的 `bun run cli -- ...` 等价于：

```bash
node dist/cli/index.js health
```

### Command Mode

安装或 link 之后，才会得到真正的命令形式：

```bash
hd health
hd login
hd sync
hd reports claim --limit 50
printf '# Daily summary\n' | hd reports submit <task-id>
hd tasks list
```

## Build And Package

CLI 使用 `cac` 实现，最终通过 `package.json` 的 `bin` 字段包装成可执行命令：

```json
{
  "bin": {
    "hd": "./dist/cli/index.js"
  }
}
```

构建：

```bash
bun run build
```

构建后主要产物：

```text
dist/cli/index.js
dist/api/server.js
```

本地也可以直接执行构建后的 CLI：

```bash
node dist/cli/index.js health
node dist/cli/index.js login
node dist/cli/index.js sync
node dist/cli/index.js reports claim --limit 50
printf '# Daily summary\n' | node dist/cli/index.js reports submit <task-id>
```

如需在本机以 `hd` 命令调用，可以在项目目录执行：

```bash
bun run build
bun link
```

然后使用：

```bash
hd health
hd login
hd sync
hd reports claim --limit 50
printf '# Daily summary\n' | hd reports submit <task-id>
hd tasks list
```

如果发布为 npm 包，安装方会通过 `bin` 自动获得 `hd` 命令。当前项目 `private: true`，默认不发布；需要发布时再改为非 private，并补充发布流程。

如果出现 `zsh: command not found: hd`，通常是还没有执行 link，或 Bun 的全局 bin 目录不在 PATH 中：

```bash
bun run build
bun link
which hd
hd health
```

`which hd` 正常时通常会指向：

```text
~/.bun/bin/hd
```

## API

开发态：

```bash
bun run dev:api
```

构建后：

```bash
bun run build
bun run start:api
```

默认监听 `127.0.0.1:8787`。

可用路由：

- `GET /health`
- `POST /tasks/collect-mails`

示例：

```bash
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/tasks/collect-mails
```

邮件汇总的领取与回报只通过 CLI 提供，不提供 HTTP 路由。

## Microsoft Graph Mail Sync

Microsoft provider 使用 Microsoft Entra ID delegated OAuth 读取登录用户 `/me` 的 Inbox。

先在 `.env` 配置：

```bash
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/callback
MICROSOFT_GRAPH_SCOPES=offline_access User.Read Mail.Read
```

首次授权：

```bash
bun run dev -- login
```

已有可用 token 时，命令会直接返回 Microsoft 用户 ID 和收件邮箱地址。首次授权或 token 失效时，命令会立即打印可点击的 Microsoft 登录链接，并强制显示账户选择；随后在 `MICROSOFT_REDIRECT_URI` 对应的本地端口等待回调。回调接收、token 交换和登录成功都会显示在同一个 shell 中。登录只验证 OAuth 身份，不读取或同步邮件；邮件读取仅由 `sync` 命令执行。

同步 Inbox：

```bash
bun run dev -- sync
```

首轮同步只读取最近 7 天的 Inbox delta，并按 Graph `@odata.nextLink` 拉到本轮完成后保存 `@odata.deltaLink`。后续同步从已保存的 `deltaLink` 开始，只处理新增、更新和删除变化。默认 Graph page size 为 3。系统保存纯文本邮件正文，以及附件的名称、MIME 类型和大小；不下载附件内容。

## Agent 汇总回报

Agent 通过 `hd reports claim --limit N` 原子领取最新的待处理邮件。领取结果包含任务 ID、30 分钟过期时间、邮件正文与附件元数据；没有待处理邮件时会返回空任务。

Agent 在外部完成摘要和 IM 发送后，从标准输入提交摘要：

```bash
printf '# 邮件摘要\n\n已发送到 IM。\n' | hd reports submit <task-id>
```

提交成功后，系统存档摘要、领取时的邮件身份快照和系统接收回报的时间，并将对应邮件标记为已汇总。重复提交同一已完成任务会返回原始归档结果；过期任务不能提交，邮件会在下一次领取时重新进入待处理队列。

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
- `mail_attachments`
- `mail_sync_states`
- `oauth_tokens`
- `report_tasks`
- `report_task_mail_items`

每次 collect / claim report / submit report 成功或失败都会记录到 `operation_records`。

## Future TODO

- TODO: `src/adapters/mcp/` 将 core service 包装为 MCP tools。
