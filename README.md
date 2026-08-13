# 拾词 · 四六级背单词

当前本地数据版本：`9`。第 13B 阶段已接入 2021—2025 CET 真题频率层级，用于新词学习顺序，并为 Level 0 新词增加“四选一至少答对一次”的识别门槛。

## 第 13B 阶段结果

- 设置新增“智能顺序 / 完全随机”，默认智能顺序，且与英选中/中选英学习模式相互独立。
- 智能顺序只使用 `S/A/B/C/D/E` 层级跨档混抽；同一层级独立随机，不使用 `tokenCount`、`tierScore` 或层内排名。
- 各档按 `40/30/15/8/5/2` 权重平滑混排；空档自动让位，D/E 档不会永久饥饿。
- 高频功能词通过独立的 `data/cet-learning-priority-overrides.json` 进入持久化 `neutral` 随机队列；它不占 S–E 权重槽位，但会定期插入且最终全部学到。原始频率 JSON 完全不改写。
- Level 0 新词首次四选一答错后进入 `choice_retry`，保持原题目方向；至少一次四选一正确后才进入 `ai_reinforcement`。
- 四选一正确只通过识别门槛，熟练度仍为 Level 0；释义巩固判定正确后才进入 Level 1 并计为今日完成新词。
- AI `partial` / `wrong` 继续释义巩固，不退回四选一；远程 AI 不可用时可使用本地判定或人工兜底。
- 到期复习仅按个人薄弱度排序：逾期、低熟练度、错误率、近期答错；真题频率不改变熟练度或复习时间。
- v8 → v9 无损迁移；旧待巩固记录视为已通过四选一门槛，保留进度、复习时间、每日记录和既有随机队列。

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

本阶段没有修改正式词库正文、Level 0～5 算法、长期复习间隔、Worker、部署架构或存储键。

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
- 数据版本为 `version: 9`，支持导入并迁移 `version: 1` 至 `version: 9`。
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
js/smart-learning-order.js            真题分层混抽、同档随机与只读词频加载
js/new-word-learning.js               四选一门槛与当日释义巩固状态机
js/storage.js                          本地数据 v9 迁移与持久化
worker/src/index.js                    DeepSeek 多义词判题代理
```

AI Worker 的本地与正式配置见 [AI 配置文档](docs/AI_SETUP.md)。第 13B 阶段没有修改 Worker，更新正式站点只需提交并推送静态站点文件；不要提交 `.dev.vars` 或任何 API Key。
