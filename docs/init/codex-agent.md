请严格根据我提供的《需求文档》和《开发规划》完成项目初版建设，不要重新设计架构。

执行重点

1. 项目 root 是 TypeScript Node 工程。
2. 使用 Bun 作为包管理器和 script runner。
3. 代码保持 Node.js 兼容。
4. 不使用 Vite / NestJS / Effect / 复杂 monorepo。
5. 不使用 bun:sqlite、Bun.file 等 Bun Runtime 专属 API。
6. SQLite 使用 Drizzle + better-sqlite3。
7. CLI / API / 未来 MCP 都只能调用 core service，不要在 adapter 中写业务逻辑。
8. 第一版优先跑通 mock 流程，不接真实 Outlook / Feishu。

第一版必须交付

请完成：

1. 项目目录结构
2. package.json / tsconfig.json
3. CAC CLI
4. Hono API
5. core services
6. ports interfaces
7. mock providers
8. SQLite schema 和本地存储
9. Pino 日志
10. Vitest 基础测试
11. README.md
12. .env.example

第一版必须可运行的命令

bun install
bun run dev -- health
bun run dev -- mails collect --since 24h --provider mock
bun run dev -- reports generate --source mock
bun run dev -- reports latest
bun run dev:api
bun run test

代码要求

* 使用 ESM。
* 使用 async/await。
* CLI 输出优先为 JSON。
* API 返回结构化 JSON。
* 使用 zod 校验输入。
* core/ 不直接读取 process.env。
* core/ 不直接 console.log。
* 任务成功或失败都要写入 operation_records。
* mock provider 是正式代码结构，不是临时脚本。
* 不要过度封装，不要生成大量无意义模板代码。

交付方式

请先完成一个能跑通主链路的初版。
如果某些真实外部系统暂未实现，请用 TODO 标注，不要阻塞 mock 主流程。