# 拾词 · 四六级背单词

当前本地数据版本：`14`。第 16.3 阶段把“全部到期积压”和“今日正式复习任务”分开管理，并加入手动掌握、今日暂缓与复习分段休息。

## 第 16.3 阶段结果

- 每本词书可设置每日正式复习上限（60/100/120/150/200/不限，默认 120）；今日任务按原复习优先级生成并持久化，刷新或重开后顺序稳定，任务外积压仍保持到期状态。
- 完成今日正式复习任务后，即使仍有积压也不会阻塞新词；Recovery 保持独立优先级且不占每日上限。极老的逾期词只获得防饿死加成，不改变 SRS 间隔。
- “已掌握”独立于 L5：清除该词的 SRS 与 Recovery，但保留等级、收藏、错词和历史数据，也不记作答对；支持单词、详情页和最多 20 词快速清理，并提供撤销。
- “今天不复习”只计入今日已处理，不修改熟练度、SRS 或答题统计，次日重新进入候选；“稍后再学”只把当前词移至今日任务末尾。
- 每处理 20 个今日任务项显示一次分段页；可独立休息 3 分钟、直接继续或结束本次学习。休息使用真实时间并可在刷新后恢复。
- 至少 5 个本地有效耗时样本后显示模糊剩余时间；AI 等待时间不计入学习速度。
- v13 → v14 无损迁移，备份导入支持 v1～v14；本阶段未修改 Worker、正式词库、频率层级、学习顺序或复习间隔。

## 第 16.1 阶段结果

- L1～L5 分别按本地日期安排到下一个、第 3、第 7、第 15、第 30 个自然日；L5 正确后仍为 L5，并重新安排 30 天。
- L1 同时要求跨入目标自然日且距 `lastLongTermAnchorAt` 至少 6 小时；L2～L5 从目标日 00:00 起即可到期，不再等待原学习时刻。
- L0 仍使用精确的 10 分钟 `nextReviewTime`。new-word reinforcement、choice retry 与 Recovery 的题数/时间随机窗口和 Level 状态机均未改动。
- 长期状态使用 `nextReviewDate`、`lastLongTermAnchorAt`、`earliestReviewAt`；日期通过本地年月日与 `Date#setDate` 日历加法生成，不使用 UTC 日期切片或固定毫秒日数。
- v12 → v13 保留旧 `nextReviewTime` 的本地目标日期；旧 L1 优先采用最近的真实学习/复习时间，缺失时才用旧目标时间减 24 小时推断锚点。
- v12 → v13 的迁移规则继续保留；当前备份导入支持 v1～v14，`dailyGroupPlans`、Recovery、每日复盘、smart/random/neutral、收藏和错词状态继续保留。

## 第 16 阶段结果

- 每天首次进入今日学习时，AI 只接收当日目标、复习/Recovery/待巩固数量及昨日少量聚合统计，返回 `groupSizes`、`breakMinutes` 和简短原因；失败时立即使用约 10 词一组的均匀本地方案。
- 分组只切分已经持久化的 `scheduledNewWordIds`，不重排 smart/random/neutral 队列；当前组未全部进入 L1 前，下一组新词不会被引入，旧词到期复习、Recovery、choice retry 和释义巩固继续按原优先级穿插。
- 一组只有全部新词完成“四选一门槛 → 随机窗口 → 主动释义 correct → L1”才完成。组完成后可休息、直接继续或仅结束本次 session；倒计时不冻结任何复习时间。
- 目标增加时保留原组并只追加新增容量；已经开始后不安全的目标减少从明天生效。计划、当前组和 `breakStartedAt` 刷新或重开后保持。
- v11 → v12 无损迁移只新增 `dailyGroupPlans`；备份导入支持 v1～v12。Worker 新增 `POST /api/daily-group-plan`，继续复用现有鉴权、CORS 和 Secrets。

## 第 15.1 阶段结果

- 新词释义巩固、正式复习和 Recovery 共用一套提交后结果模式：隐藏大输入框和提交按钮，优先显示判定、用户回答、标准核心义与判断说明。
- 结果渲染完成后通过元素位置和可见比例判断是否需要平滑定位；已经大部分可见时不滚动，同一题的同一次结果最多自动定位一次。
- AI 判断中继续保留原输入内容和禁用后的答题表单，不提前进入结果模式；AI 失败后的人工兜底流程保持不变。
- 当时数据仍为 v11；第 16 阶段按需求升级到 v12，Phase15.1 结果展示逻辑本身未改变。

## 第 15 阶段结果

- L1～L5 到期正式复习不再生成四选一：`correct` 升一级（最高 L5），`partial` 保持等级，`wrong` 只降两级一次（最低 L0）；后两者进入独立 Recovery。
- Recovery 不重复改变 Level；每词每会话最多尝试 3 次，仍未通过则持久化为跨会话待纠错。正确后按当前 Level 的原间隔安排下一次正式复习。
- Recovery 第 1/2/3 次分别随机等待 3～6/5～9/7～12 个有效题和 45～90/60～120/90～180 秒；随机值生成一次后保存，不依赖长计时器。
- 新词首次四选一直接通过后，主动释义随机等待 10～18 题和 2～4 分钟；经重试通过后随机等待 6～12 题和 90～180 秒。候选不足时分别保留 5 题或 90 秒、3 题或 60 秒的兜底间隔。
- 统一候选优先级为：到期正式复习、跨会话 Recovery、eligible Recovery、四选一重试、eligible 新词释义巩固、新词初学、fallback pending；`recentWordIds` 继续避免同词连续出现。
- 所有主动释义复用本地保守判断与现有 DeepSeek 边界，并支持防重复、输入法组合态保护的 Ctrl + Enter；桌面端守护式自动聚焦，手机端隐藏快捷键提示。
- 每日复盘新增 `formalReviewStats`、`recoveryStats` 和对应薄弱词结构字段，不保存用户原始中文答案。风险分继续只服务复盘展示，不参与 SRS。
- v10 → v11 无损迁移，只新增 `reviewRecovery`；备份导入支持 v1～v11。

## 第 14 阶段结果

- 今日新词达到目标后，结果页显示本地完成数、总答题数、首次四选一正确率、四选一重试数、释义巩固通过率、重复错误词和 Top 薄弱词。
- AI 复盘不会自动请求；同一天成功后读取 `dailyReviews[date]` 缓存。调整今日目标会把旧复盘标为过期，完成新增任务后可重新生成。
- 请求只发送今日聚合统计、最多 10 个薄弱词、最多 5 个成功纠正词及必要释义，不发送完整词库、答题原文、例句库、真题正文或完整历史。
- Worker 新增 `POST /api/daily-review`，保留 `POST /api/judge-meaning`；两者共用来源白名单、`X-App-Token` 和现有 Secrets。
- AI 不可用时仍显示全部本地统计和薄弱词，不影响学习、熟练度、SRS、真题频率或学习顺序。
- v9 → v10 无损迁移，只新增空的 `dailyReviews`；备份导入支持 v1～v10。

## 第 13B 阶段结果

- 设置新增“智能顺序 / 完全随机”，默认智能顺序，且与英选中/中选英学习模式相互独立。
- 智能顺序只使用 `S/A/B/C/D/E` 层级跨档混抽；同一层级独立随机，不使用 `tokenCount`、`tierScore` 或层内排名。
- 各档按 `40/30/15/8/5/2` 权重平滑混排；空档自动让位，D/E 档不会永久饥饿。
- 高频功能词通过独立的 `data/cet-learning-priority-overrides.json` 进入持久化 `neutral` 随机队列；它不占 S–E 权重槽位，但会定期插入且最终全部学到。原始频率 JSON 完全不改写。
- Level 0 新词首次四选一答错后进入 `choice_retry`，保持原题目方向；至少一次四选一正确后才进入 `ai_reinforcement`。
- 四选一正确只通过识别门槛，熟练度仍为 Level 0；释义巩固判定正确后才进入 Level 1 并计为今日完成新词。
- AI `partial` / `wrong` 继续释义巩固，不退回四选一；远程 AI 不可用时可使用本地判定或人工兜底。
- 到期复习仅按个人薄弱度排序：逾期、低熟练度、错误率、近期答错；真题频率不改变熟练度或复习时间。
- v8 → v9 的四选一门槛迁移规则继续保留。

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

第 15 阶段没有修改正式词库正文、Level 0～5 基础时间间隔、真题频率、智能/neutral 新词队列或存储键。

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
- 数据版本为 `version: 14`，支持导入并迁移 `version: 1` 至 `version: 14`。
- 迁移保留正确/错误/partial 次数、熟练度、首次学习日期、长期自然日复习字段、L0 精确复习时间、收藏、错词、每日统计、新词队列、当日巩固状态、AI 设置、`vocabularyScope` 和 `studyMode`。
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
js/review-recovery.js                 正式复习 Recovery 随机窗口与会话状态机
js/review-workload.js                 每日复习上限、任务分段与本地速度估算
js/daily-review-service.js             本地复盘统计、薄弱词筛选与请求白名单
js/daily-group-service.js              每日分组校验、fallback、边界与 Worker 请求
js/storage.js                          本地数据 v14 迁移与持久化
worker/src/index.js                    DeepSeek 多义词判题与每日复盘代理
```

AI Worker 的本地与正式配置见 [AI 配置文档](docs/AI_SETUP.md)。第 15 阶段扩展了每日复盘输入校验，推送静态站点后还需在 `worker` 目录执行 `pnpm deploy`；不要提交 `.dev.vars` 或任何 API Key。
