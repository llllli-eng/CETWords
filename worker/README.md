# 拾词 AI 判题 Worker

这个 Worker 只提供 `GET /health` 与 `POST /api/judge-meaning`，模型、提示词和生成参数都固定在服务端。它不会托管前端，也不会接收整份词库或学习记录。

本地运行与生产部署步骤见 [AI_SETUP.md](../docs/AI_SETUP.md)。请勿提交 `.dev.vars`，也不要把 `DEEPSEEK_API_KEY` 放入 `wrangler.jsonc`、前端或学习数据备份。
