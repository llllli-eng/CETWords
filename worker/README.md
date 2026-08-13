# 拾词 AI 判题 Worker

这个 Worker 提供 `GET /health`、`POST /api/judge-meaning` 与 `POST /api/daily-review`，模型、提示词和生成参数都固定在服务端。判题请求只包含当前词及本次答案；每日复盘请求只包含今日聚合统计、最多 10 个薄弱词与 5 个纠正词，不接收完整词库、答题原文或全部学习历史。

本地运行与生产部署步骤见 [AI_SETUP.md](../docs/AI_SETUP.md)。第 15 阶段为每日复盘输入增加了正式复习与 Recovery 统计字段校验，因此前端更新后需要重新执行 `pnpm deploy`。请勿提交 `.dev.vars`，也不要把 `DEEPSEEK_API_KEY` 放入 `wrangler.jsonc`、前端或学习数据备份。
