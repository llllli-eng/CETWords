# CET 真题词频语料说明

## 统计口径

本项目的第一版正式考试词频仅使用 2021-06 至 2025-12 的 CET4/CET6 真题 PDF。它准确表示为：**基于 2021-2025 CET4/CET6 真题 PDF 中可直接提取的英文卷面与阅读语料所生成的考试词频统计**。

- CET4：10 个考试场次，30 份文件。
- CET6：10 个考试场次，30 份文件。
- 2018-2020 文件为 `auxiliaryOnly`，不参与正式统计或频率档。
- 未使用 OCR；所有主语料均通过 PDF 文本层提取。
- 当前文件不含完整听力原文，因此 `printedListeningTokenCount` 只表示卷面真实印出的听力说明、题干或选项，不能当作听力对话/讲座正文。
- Translation 只统计原卷真实出现的英文 token，绝不把中文翻译后再统计。

## Section 拆分

每份完整试卷拆分为 `writing_prompt`、`listening_printed`、`reading_cloze`、`reading_matching`、`reading_careful`、`translation_prompt`；阅读和听力中的印刷题目再分类为 `question_stems` 与 `options`。无法可靠划分的文件会被排除并报告，不会整卷混合统计。

## 清洗与去重

固定考试说明使用 `scripts/cet-boilerplate-patterns.json` 中保守、可审计的规则删除。每个 section 经 Unicode NFKC、空白规范化、boilerplate 清理和仅用于 hash 的小写化后计算 SHA-256。同一 `level + session` 的相同 section 只累计一次 token，但保留全部 `appearedInPapers`，用于 paper 覆盖率。

2022-06 CET4/CET6 第 3 套均只有独立作文与翻译。构建器不会复制第 2 套公共正文，只把第 2 套公共 section 的 paper 覆盖传播到第 3 套；所以 token 只统计一次，而 `paperCount` 仍反映公共内容覆盖两套试卷。

## 词形归并

先做 exact headword 匹配，再使用可审计的 `-s/-es/-ies/-ves/-ed/-ied/-ing` 规则生成现有 CETWords 候选。唯一候选才归并；多个候选进入 ambiguous report，无法确定时保持 unmatched。没有使用 Porter Stem。正式词频只包含 `data/cet4.json` 或 `data/cet6.json` 中已有 headword，零出现词仍保留。

## 频率档

频率档为 S/A/B/C/D/E，不是严格排名。非零词先按 0.05 的 `tierBoundaryTolerance` 量化综合覆盖分数，再对真实分布做一维 k-means：`sessionCoverageRate` 权重 0.80，`paperCoverageRate` 权重 0.18，`logTokenCount` 权重 0.02。零出现词固定为 E。同档内部没有顺序意义，JSON 按 word 字母序稳定输出。

## 版权与可复现性

`local-corpus/` 必须被 Git 忽略。可提交输出只保存 paperId、section hash、token 数和聚合统计，不保存完整真题、passage、听力文本、题目长段、答案解析、上下文摘录或来源句子。
