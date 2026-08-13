# CET 真题词频质量报告

构建器版本：13A.2.1。本报告中的 Top 列表只用于质量审计，不代表未来学习顺序。

## 主语料字符级清洗

| 异常类型 | 清洗前 | 清洗后 |
| --- | --- | --- |
| replacementCharacterCount | 53 | 0 |
| privateUseCharacterCount | 0 | 0 |
| abnormalControlCharacterCount | 0 | 0 |

所有异常字符均仅按字符级规则删除；未尝试猜测或恢复无法识别的单词，未使用 OCR。

## CET4

| 指标 | 结果 |
| --- | --- |
| 正式 session | 10 |
| 正式 paper | 30 |
| 完整/部分卷 | 29 / 1 |
| raw token | 104914 |
| cleaned token | 88980 |
| boilerplate 删除 | 15934 |
| 去重前/后 token | 88980 / 88979 |
| 重复 section | 1 |
| CETWords 匹配率 | 88.14% |
| unmatched 比例 | 11.86% |
| 词形归并 token | 12317 |
| ambiguous forms | 33 |
| 零出现词 | 1881 (33.72%) |

### 统计桶 token（去重后、清洗后）

| section | token |
| --- | --- |
| readingTokenCount | 58277 |
| printedListeningTokenCount | 12451 |
| questionTokenCount | 16985 |
| writingPromptTokenCount | 1210 |
| otherPrintedTokenCount | 56 |

### FrequencyTier 分布

| tier | 词数 |
| --- | --- |
| A | 317 |
| B | 379 |
| C | 998 |
| D | 1675 |
| E | 1881 |
| S | 329 |

### 重点抽样词

| word | token | paper | session | paper coverage | session coverage | tier | surface forms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| paper | 23 | 10 | 8 | 33.33% | 80.00% | A | paper:16, paper's:1, papers:6 |
| issue | 31 | 16 | 9 | 53.33% | 90.00% | A | issue:12, issued:2, issues:16, issuing:1 |
| subject | 11 | 4 | 4 | 13.33% | 40.00% | C | subject:10, subjects:1 |
| address | 6 | 5 | 5 | 16.67% | 50.00% | C | address:5, addressing:1 |
| present | 31 | 15 | 9 | 50.00% | 90.00% | A | present:25, presented:4, presenting:1, presents:1 |
| matter | 24 | 15 | 10 | 50.00% | 100.00% | S | matter:17, matters:7 |
| figure | 17 | 12 | 8 | 40.00% | 80.00% | A | figure:7, figures:6, figuring:4 |
| case | 35 | 19 | 10 | 63.33% | 100.00% | S | case:19, cases:16 |
| charge | 14 | 12 | 8 | 40.00% | 80.00% | A | charge:7, charged:5, charges:2 |
| point | 30 | 16 | 9 | 53.33% | 90.00% | A | point:20, pointed:2, pointing:2, points:6 |
| term | 30 | 18 | 9 | 60.00% | 90.00% | A | term:5, terms:25 |
| article | 13 | 7 | 5 | 23.33% | 50.00% | C | article:7, articles:6 |
| book | 73 | 21 | 9 | 70.00% | 90.00% | A | book:31, booked:2, booking:11, books:29 |
| capital | 1 | 1 | 1 | 3.33% | 10.00% | D | capital:1 |
| board | 5 | 5 | 4 | 16.67% | 40.00% | C | board:4, boards:1 |

### Top unmatched tokens（前 30）

| surface | token |
| --- | --- |
| is | 1245 |
| an | 303 |
| has | 286 |
| was | 265 |
| were | 183 |
| said | 141 |
| us | 133 |
| been | 121 |
| s | 104 |
| had | 97 |
| women | 91 |
| children | 73 |
| online | 71 |
| researchers | 70 |
| don't | 70 |
| did | 66 |
| men | 61 |
| doing | 60 |
| made | 57 |
| u | 55 |
| going | 47 |
| using | 45 |
| doesn't | 44 |
| participants | 44 |
| you're | 43 |
| greater | 37 |
| longer | 36 |
| obesity | 36 |
| teens | 34 |
| lives | 33 |

## CET6

| 指标 | 结果 |
| --- | --- |
| 正式 session | 10 |
| 正式 paper | 30 |
| 完整/部分卷 | 29 / 1 |
| raw token | 119852 |
| cleaned token | 103515 |
| boilerplate 删除 | 16337 |
| 去重前/后 token | 103515 / 103515 |
| 重复 section | 0 |
| CETWords 匹配率 | 64.05% |
| unmatched 比例 | 35.95% |
| 词形归并 token | 12438 |
| ambiguous forms | 35 |
| 零出现词 | 2442 (36.66%) |

### 统计桶 token（去重后、清洗后）

| section | token |
| --- | --- |
| readingTokenCount | 71046 |
| printedListeningTokenCount | 13077 |
| questionTokenCount | 17957 |
| writingPromptTokenCount | 1388 |
| otherPrintedTokenCount | 47 |

### FrequencyTier 分布

| tier | 词数 |
| --- | --- |
| A | 326 |
| B | 413 |
| C | 1152 |
| D | 2048 |
| E | 2442 |
| S | 281 |

### 重点抽样词

| word | token | paper | session | paper coverage | session coverage | tier | surface forms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| paper | 26 | 11 | 7 | 36.67% | 70.00% | B | paper:17, paper's:1, papers:8 |
| issue | 41 | 19 | 9 | 63.33% | 90.00% | A | issue:14, issued:3, issues:24 |
| subject | 22 | 11 | 8 | 36.67% | 80.00% | A | subject:11, subjects:11 |
| address | 26 | 13 | 9 | 43.33% | 90.00% | A | address:17, addressed:6, addresses:1, addressing:2 |
| present | 33 | 18 | 9 | 60.00% | 90.00% | A | present:21, presented:10, presenting:2 |
| matter | 18 | 11 | 8 | 36.67% | 80.00% | A | matter:11, matters:7 |
| figure | 11 | 5 | 4 | 16.67% | 40.00% | C | figure:6, figures:5 |
| case | 33 | 19 | 9 | 63.33% | 90.00% | A | case:23, cases:10 |
| charge | 16 | 10 | 7 | 33.33% | 70.00% | B | charge:9, charged:1, charges:5, charging:1 |
| point | 45 | 25 | 10 | 83.33% | 100.00% | S | point:31, pointed:6, pointing:2, points:6 |
| term | not in level vocabulary | - | - | - | - | - | - |
| article | 13 | 10 | 7 | 33.33% | 70.00% | B | article:7, articles:6 |
| book | 49 | 19 | 9 | 63.33% | 90.00% | A | book:22, booking:2, books:25 |
| capital | 8 | 8 | 5 | 26.67% | 50.00% | C | capital:7, capitals:1 |
| board | 16 | 6 | 5 | 20.00% | 50.00% | C | board:9, boarding:1, boards:6 |

### Top unmatched tokens（前 30）

| surface | token |
| --- | --- |
| the | 5168 |
| to | 3586 |
| is | 1514 |
| that | 1215 |
| they | 1035 |
| are | 869 |
| their | 783 |
| with | 710 |
| we | 461 |
| an | 426 |
| you | 400 |
| this | 381 |
| was | 360 |
| has | 346 |
| will | 308 |
| than | 300 |
| when | 295 |
| them | 294 |
| who | 269 |
| your | 241 |
| there | 223 |
| which | 214 |
| some | 196 |
| been | 183 |
| us | 177 |
| time | 175 |
| work | 167 |
| so | 160 |
| world | 159 |
| those | 159 |

## 特殊处理与警告

- 2022-06 CET4/CET6 第 3 套只保留独立作文和翻译；第 2 套公共 section 仅统计一次，并为覆盖率标注到第 3 套。
- 主语料 U+FFFD、私用区字符和异常控制字符的实际计数见 `data/cet-frequency-report.json`；未凭空恢复任何单词，未使用 OCR。
- 当前无 listening transcript，不能把本结果描述成完整听力正文词频。
- 混合在中文字符中的拉丁碎片被保守丢弃并记 warning，避免把文本层识别碎片误当成单词。
- 完全相同 section 才自动去重；token 相似度不低于 0.90 的非完全重复 section 进入 JSON 的 `nearDuplicateSectionAudit`，不凭相似度自动删除真实独立题目。
- `concentratedFrequency` 标记 token 很高但仅集中在不超过两个 session 的词，供人工复核。

## 第 13B 前人工验收

请重点检查频率档分布、Top unmatched、ambiguous forms、零频比例、重点抽样词，以及 CET4/CET6 的差异。确认后再单独进入第 13B；本阶段没有接入学习顺序。
