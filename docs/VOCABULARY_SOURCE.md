# 词库来源与转换记录

## 来源

- 仓库：KyleBing/english-vocabulary
- 地址：https://github.com/KyleBing/english-vocabulary
- 分支：`master`
- 数据目录：`json_original/json-sentence`
- 转换日期：2026-08-11

正式词库在开发阶段从上述仓库转换，运行“拾词”时只读取本项目内的 `data/cet4.json` 与 `data/cet6.json`，不访问网络。

## 使用的具体文件

### CET4 主词表

- `CET4_1.json`：1,162 条
- `CET4_2.json`：3,739 条
- `CET4_3.json`：2,607 条
- 主词表合计：7,508 条

主词表按英文拼写忽略大小写去重后只有 4,544 个不同单词。为同时满足“单词不重复”和 5,000+ 的完整学习路径，继续使用同一仓库的真实高中先修词：

- `GaoZhong_2.json`
- `GaoZhong_3.json`

主词表优先；先修词只补充主词表中不存在的 1,035 个单词。最终 CET4 为 5,579 个不同单词。

- CET4 核心词：4,544 个（`sourceLevel: "cet4"`，`isCore: true`）
- 高中补充词：1,035 个（`sourceLevel: "high-school"`，`isCore: false`）

### CET6 主词表

- `CET6_1.json`：1,228 条
- `CET6_2.json`：2,078 条
- `CET6_3.json`：2,345 条
- 主词表合计：5,651 条

主词表按英文拼写忽略大小写去重后只有 3,991 个不同单词。CET6 学习路径因此补入同一仓库 CET4 主词表中尚未出现的 2,671 个先修词。CET6 释义与例句始终优先于 CET4 补充记录。最终 CET6 为 6,662 个不同单词。

这项补全是为了处理上游数据“标称条目数超过 5,000、严格去重后却低于 5,000”的客观矛盾。质量报告同时保留主词表原始数、主词表唯一数和补充数，不用补充数据掩盖主词表问题。

- CET6 核心词：3,991 个（`sourceLevel: "cet6"`，`isCore: true`）
- CET4 先修补充词：2,671 个（`sourceLevel: "cet4"`，`isCore: false`）

## 核心与补充分层

每条正式数据都由转换脚本根据所在的原始文件组自动生成以下字段：

```json
{
  "book": "cet6",
  "sourceLevel": "cet4",
  "isCore": false
}
```

- 来自当前词库主文件的记录：`sourceLevel` 等于当前 `book`，`isCore` 为 `true`。
- CET4 的高中补充记录：`sourceLevel` 为 `high-school`，`isCore` 为 `false`。
- CET6 的 CET4 先修记录：`sourceLevel` 为 `cet4`，`isCore` 为 `false`。
- 同一英文同时出现在主文件和补充文件时，主文件优先，所以该词仍被认定为核心词。

“拾词”默认只从核心词中生成每日新词。补充词继续保留在完整列表、搜索、收藏、错词和到期复习中；只有用户主动把词汇范围切换为“核心 + 补充词汇”后，补充词才可以作为新词进入每日任务。

## 转换与清洗

转换脚本：`scripts/build-vocabulary.py`

脚本执行以下操作：

1. 读取上述真实 JSON 数据，不生成或猜测释义、例句和音标。
2. 清理首尾空白与异常连续空格。
3. 按 `word.trim().toLowerCase()` 在每个最终词库内去重。
4. 合并并保留结构化的全部释义与全部有效例句。
5. 根据原始文件组自动生成 `book`、`sourceLevel` 和 `isCore`。
6. 从第一条释义生成不超过 56 个字符的 `meaning` / `shortMeaning`。
7. 第一条有效例句写入兼容字段 `example` / `translation`。
8. 英音写入 `phoneticUK`，美音写入 `phoneticUS`；兼容字段 `phonetic` 优先英音。
9. 验证空 ID、空单词、空释义、来源标记、重复 ID、重复英文拼写和生成后的 JSON。
10. 生成 `data/vocabulary-report.json`。

在项目目录中可使用已下载的源文件重新构建：

```text
python scripts/build-vocabulary.py --source-dir <json-sentence目录>
```

也可以让脚本只在开发阶段下载缺少的源文件：

```text
python scripts/build-vocabulary.py --download
```

## 稳定 ID

ID 由词库名和规范化后的英文拼写生成：

```text
cet4-abandon
cet6-comprehensive
```

规范化规则为：Unicode NFKC、转小写、移除英文撇号、把其他特殊分隔符转为连字符。ID 不使用数组下标，因此重新排序不会改变 ID。

当前已有学习记录仍以英文拼写作为兼容键读取，这是为了无损保留第 1–5 阶段已经保存的正确次数、错误次数、收藏、错词、熟练度和复习时间。正式词条同时带稳定 `id`，后续可以在显式迁移后改用它，不需要再次改造词库文件。

## 最终数据结构

```json
{
  "id": "cet6-comprehensive",
  "word": "comprehensive",
  "book": "cet6",
  "sourceLevel": "cet6",
  "isCore": true,
  "phonetic": "/ˌkɒmprɪˈhensɪv/",
  "phoneticUS": "/ˌkɑːmprɪˈhensɪv/",
  "phoneticUK": "/ˌkɒmprɪˈhensɪv/",
  "meaning": "adj. 全面的；综合的",
  "shortMeaning": "adj. 全面的；综合的",
  "meanings": [
    { "partOfSpeech": "adj.", "translation": "全面的；综合的" }
  ],
  "example": "The report provides a comprehensive analysis.",
  "translation": "这份报告提供了全面的分析。",
  "examples": [
    {
      "sentence": "The report provides a comprehensive analysis.",
      "translation": "这份报告提供了全面的分析。"
    }
  ]
}
```

示例只说明字段形状；正式字段值全部来自上游数据。

## 已知数据质量问题

- 上游六个 CET 主文件合计数中包含大量跨文件重复拼写：CET4 有 2,964 条重复，CET6 有 1,660 条重复。
- 最终 CET4 有 70 个词缺少音标、199 个词缺少例句、201 个词缺少例句翻译。
- 最终 CET6 有 65 个词缺少音标、209 个词缺少例句、209 个词缺少例句翻译。
- 个别原始音标使用源仓库自身的标注形式；转换只加斜杠，不校订、不猜测。
- 截至转换日，上游仓库根目录未提供明确的 `LICENSE` 文件。项目保留完整来源说明；如需公开发布或商业使用，应先向上游作者确认授权范围。

机器可读的完整统计见 `data/vocabulary-report.json`。
