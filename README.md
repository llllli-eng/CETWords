# 拾词 · 四六级背单词

当前本地数据版本：`8`。第 12 阶段修复了词库构建时“第一条同词记录胜出”的问题：现在会跨高中、CET4、CET6 来源合并多词性与常见义，同时保持全部单词 ID、核心/补充归属和既有学习进度不变。

## 第 12 阶段结果

- CET4：5,579 词；核心 4,544；补充 1,035；多义词 4,501；平均 2.103 个主要义项。
- CET6：6,662 词；核心 3,991；补充 2,671；多义词 4,826；平均 1.976 个主要义项。
- CET4 有 4,690 个词、CET6 有 5,022 个词合并了两个以上源文件。
- 所有正式词条包含 `coreMeaning`、`meaning`、`meanings`、`meaningsByPos` 和多条例句。
- 英选中与中选英统一使用 `coreMeaning`，并排除与正确核心义重叠的干扰项。
- 详情页先显示核心义，再按词性展示常见义和核心优先例句。
- AI 判题发送核心义和全部常见义；回答任一正确常见义均可判 `correct`，非核心义只给学习建议，不扣熟练度。
- `paper` 现在以“纸；论文；试卷”为核心义，并保留名词/动词结构与核心名词例句。

完整来源、合并规则与授权边界见 [词库来源文档](docs/VOCABULARY_SOURCE.md)，汇总和高风险词检查见 [词库质量报告](docs/VOCABULARY_QUALITY_REPORT.md)。机器可读报告位于 `data/vocabulary-report.json` 与 `data/vocabulary-quality-report.json`。

## 数据结构

```json
{
  "id": "cet6-paper",
  "word": "paper",
  "book": "cet6",
  "sourceLevel": "cet6",
  "isCore": true,
  "coreMeaning": "纸；论文；试卷",
  "shortMeaning": "纸；论文；试卷",
  "meaning": "n. 纸；纸张；论文；文章；试卷 v. 给……贴壁纸",
  "meanings": [
    { "pos": "n.", "meaning": "纸；纸张" },
    { "pos": "n.", "meaning": "论文；文章" },
    { "pos": "n.", "meaning": "试卷" },
    { "pos": "v.", "meaning": "给……贴壁纸" }
  ],
  "meaningsByPos": {
    "n.": ["纸；纸张", "论文；文章", "试卷"],
    "v.": ["给……贴壁纸"]
  },
  "examples": []
}
```

旧字段仍兼容：`shortMeaning` 等于核心义，`example` / `translation` 指向第一条核心优先例句，每个结构化义项同时保留旧的 `partOfSpeech` / `translation` 别名。

## 现有学习功能

- CET4/CET6 核心词与补充词分层，默认每日任务仅使用核心词。
- 英文选中文、中文选英文两种四选一模式。
- 新词“初学 + 当日巩固”、智能调度、到期复习、五级熟练度与间隔重复。
- 本地学习记录、错词本、收藏、统计、完整词库浏览、搜索筛选、备份恢复。
- 可选 DeepSeek V4 Flash 中文释义巩固；前端不保存 DeepSeek API Key。

本阶段没有改变熟练度算法、当日巩固间隔、队列优先级、部署架构或存储键。

## 本地运行

在项目根目录启动静态服务：

```text
python -m http.server 8000
```

打开 `http://localhost:8000`。网页除可选 AI 判题外可完全离线使用。直接双击 `index.html` 时，部分浏览器会禁止读取本地 JSON，因此建议使用静态服务。

重新构建词库：

```text
python scripts/build-vocabulary.py --download
```

已有源数据时：

```text
python scripts/build-vocabulary.py --source-dir <json-sentence目录>
```

## 本地数据与备份

- 存储键保持 `cetwords-user-data-v1`。
- 数据版本为 `version: 8`，支持导入并迁移 `version: 1` 至 `version: 8`。
- 迁移保留正确/错误/partial 次数、熟练度、首次学习日期、下次复习时间、收藏、错词、每日统计、新词队列、当日巩固状态、AI 设置、`vocabularyScope` 和 `studyMode`。
- 完整词库正文不会写入 `localStorage` 或学习备份。
- 个人代理 Token 使用独立本地键保存，不进入学习备份；DeepSeek API Key 只存在 Cloudflare Worker Secret 中。

## 主要文件

```text
data/cet4.json                         CET4 正式词库
data/cet6.json                         CET6 正式词库
data/vocabulary-report.json            构建统计
data/vocabulary-quality-report.json    逐词质量警告
docs/VOCABULARY_SOURCE.md              来源、合并规则与授权边界
docs/VOCABULARY_QUALITY_REPORT.md      人类可读质量报告
scripts/build-vocabulary.py            可重复构建和验证脚本
js/word-utils.js                       词库规范化与四选一干扰项
js/study-modes.js                      双学习模式题目生成
js/ai-judge.js                         本地判定与 Worker 请求
js/storage.js                          本地数据 v8 迁移与持久化
worker/src/index.js                    DeepSeek 多义词判题代理
```

AI Worker 的本地与正式配置见 [AI 配置文档](docs/AI_SETUP.md)。因为本阶段修改了 Worker 请求结构和系统提示词，更新正式站点时必须重新执行 `pnpm deploy`；不要提交 `.dev.vars` 或任何 API Key。
