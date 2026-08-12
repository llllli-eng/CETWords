# 拾词 AI 判题 Worker

这个 Worker 只提供 `GET /health` 与 `POST /api/judge-meaning`，模型、提示词和生成参数都固定在服务端。判题请求只包含当前单词的 `word`、`coreMeaning`、`meanings`、`meaningsByPos` 与用户答案；任一正确常见义都可判 `correct`。它不会托管前端，也不会接收整份词库或学习记录。

本地运行与生产部署步骤见 [AI_SETUP.md](../docs/AI_SETUP.md)。第 12 阶段修改了请求校验与系统提示词，前端更新后需要重新执行 `pnpm deploy`。请勿提交 `.dev.vars`，也不要把 `DEEPSEEK_API_KEY` 放入 `wrangler.jsonc`、前端或学习数据备份。
