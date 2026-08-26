# 拾词 AI 判题 Worker

这个 Worker 提供 `GET /health`、`POST /api/judge-meaning`、`POST /api/daily-review`、每日分组及易混词相关接口，模型、提示词和生成参数都固定在服务端。`POST /api/confusable-match-existing` 只接收当前词、错误释义与该词已建立的少量易混候选，用于唯一高置信语义兜底；不会接收完整词库、学习历史、frequency、SRS 或例句。

本地运行与生产部署步骤见 [AI_SETUP.md](../docs/AI_SETUP.md)。第 15 阶段为每日复盘输入增加了正式复习与 Recovery 统计字段校验，因此前端更新后需要重新执行 `pnpm deploy`。请勿提交 `.dev.vars`，也不要把 `DEEPSEEK_API_KEY` 放入 `wrangler.jsonc`、前端或学习数据备份。
