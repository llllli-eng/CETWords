/** Phase16.6 · CET6 本地真题作文专项测试 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const topicsData = JSON.parse(read("data/cet6-writing-topics.json"));
const materialsData = JSON.parse(read("data/cet6-writing-materials.json"));
const html = read("index.html");
const css = read("css/style.css");
const writingSource = read("js/writing.js");
const writingDataSource = read("js/writing-data.js");
const extractionSource = read("scripts/extract-cet6-writing.py");
const corpusDir = join(root, "local-corpus", "cet6");
const pdfFiles = readdirSync(corpusDir).filter((file) => file.toLowerCase().endsWith(".pdf")).sort();

const context = { window: { CETWords: {} }, console };
vm.runInNewContext(writingDataSource, context, { filename: "writing-data.js" });
const writingData = context.window.CETWords.writingData;

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
  }
}

const normalize = (value) => String(value).trim().toLowerCase().replace(/\s+/g, " ");
const independentCount = (topics) => {
  const groups = new Map();
  topics.forEach((topic) => groups.set(normalize(topic.directions), (groups.get(normalize(topic.directions)) || 0) + 1));
  return topics.length - [...groups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
};

await test("能扫描 local-corpus/cet6", () => assert.equal(existsSync(corpusDir), true));
await test("实际 PDF 总数为 48", () => assert.equal(pdfFiles.length, 48));
await test("所有本地真题文件均为 PDF", () => assert.equal(pdfFiles.every((file) => file.endsWith(".pdf")), true));
await test("所有 PDF 都不是空文件", () => assert.equal(pdfFiles.every((file) => statSync(join(corpusDir, file)).size > 1000), true));

const auditRun = spawnSync(process.execPath, [join(root, "scripts", "extract-cet6-writing.mjs"), "--json"], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
});
await test("文本层审计脚本运行成功", () => assert.equal(auditRun.status, 0, auditRun.stderr));
const audit = auditRun.status === 0 ? JSON.parse(auditRun.stdout) : {};
await test("成功找到 Writing 的 PDF 数为 47", () => assert.equal(audit.successfulPdfCount, 47));
await test("失败或需复核 PDF 数为 1", () => assert.equal(audit.needsReviewPdfCount, 1));
await test("唯一 needsReview 文件为 2019-12 第2套", () => assert.deepEqual(audit.needsReview, ["2019年12月英语六级真题(第2套).pdf"]));
await test("审计未使用 OCR", () => assert.equal(audit.ocrPages, 0));
await test("审计没有缺失 sourceFile", () => assert.deepEqual(audit.missingSources, []));
await test("审计没有无效 sourcePage", () => assert.deepEqual(audit.invalidSourcePages, []));

await test("真题 JSON schemaVersion 为 1", () => assert.equal(topicsData.schemaVersion, 1));
await test("真题 JSON 有 48 条来源记录", () => assert.equal(topicsData.topics.length, 48));
await test("独立作文题数量为 47", () => assert.equal(independentCount(topicsData.topics), 47));
await test("JSON 审计数字与实际扫描一致", () => assert.equal(topicsData.audit.pdfCount, audit.pdfCount));
await test("JSON 成功提取数与实际扫描一致", () => assert.equal(topicsData.audit.successfulPdfCount, audit.successfulPdfCount));
await test("JSON needsReview 数与实际扫描一致", () => assert.equal(topicsData.audit.needsReviewPdfCount, audit.needsReviewPdfCount));
await test("JSON 记录 OCR 页数为 0", () => assert.equal(topicsData.audit.ocrPages, 0));
await test("每条真题 id 唯一", () => assert.equal(new Set(topicsData.topics.map((topic) => topic.id)).size, topicsData.topics.length));
await test("每条 sourceFile 实际存在", () => topicsData.topics.forEach((topic) => assert.equal(existsSync(join(corpusDir, topic.sourceFile)), true, topic.id)));
await test("每条 sourceFile 仅为文件名", () => topicsData.topics.forEach((topic) => assert.equal(basename(topic.sourceFile), topic.sourceFile, topic.id)));
await test("每条数据均为 sourceVerified", () => topicsData.topics.forEach((topic) => assert.equal(topic.sourceVerified, true, topic.id)));
await test("可用列表中不存在 needsReview", () => topicsData.topics.forEach((topic) => assert.equal(topic.needsReview, false, topic.id)));
await test("每条 Directions 均包含 write an essay", () => topicsData.topics.forEach((topic) => assert.match(topic.directions, /write an essay/i, topic.id)));
await test("Directions 没有复制整套 PDF", () => topicsData.topics.forEach((topic) => assert.ok(topic.directions.length < 1000, topic.id)));
await test("Directions 不包含 Part II", () => topicsData.topics.forEach((topic) => assert.doesNotMatch(topic.directions, /Part\s*II/i, topic.id)));
await test("JSON 不包含 Windows 绝对路径", () => assert.doesNotMatch(JSON.stringify(topicsData), /[A-Za-z]:\\/));
await test("每条年份与文件名一致", () => topicsData.topics.forEach((topic) => assert.ok(topic.sourceFile.startsWith(String(topic.year)), topic.id)));
await test("每条月份与文件名一致", () => topicsData.topics.forEach((topic) => assert.ok(topic.sourceFile.includes(`${topic.month}月`), topic.id)));
await test("常规套卷的 set 与文件名一致", () => topicsData.topics.filter((topic) => topic.set != null && !topic.sourceNote).forEach((topic) => assert.ok(topic.sourceFile.includes(`第${topic.set}套`), topic.id)));
await test("组合卷不硬填 set", () => assert.equal(topicsData.topics.find((topic) => topic.id === "2020-07-combined").set, null));
await test("2020-09 第3套有明确来源说明", () => assert.match(topicsData.topics.find((topic) => topic.id === "2020-09-set3").sourceNote, /第3套/));
await test("重复组数量为 1", () => assert.equal(audit.duplicateGroupCount, 1));
await test("重复组是 2018-12 第1与第3套", () => assert.deepEqual(audit.duplicateGroups[0], ["2018-12-set1", "2018-12-set3"]));
await test("两条重复记录有相同 duplicateGroupId", () => {
  const group = topicsData.topics.filter((topic) => topic.duplicateGroupId);
  assert.equal(group.length, 2);
  assert.equal(group[0].duplicateGroupId, group[1].duplicateGroupId);
});
await test("题型只有三类", () => assert.deepEqual([...new Set(topicsData.topics.map((topic) => topic.typeKey))].sort(), ["chart", "opinion", "problem-solution"]));
await test("观点/重要性来源记录为 42", () => assert.equal(topicsData.topics.filter((topic) => topic.typeKey === "opinion").length, 42));
await test("问题/对策来源记录为 3", () => assert.equal(topicsData.topics.filter((topic) => topic.typeKey === "problem-solution").length, 3));
await test("图表/成就来源记录为 3", () => assert.equal(topicsData.topics.filter((topic) => topic.typeKey === "chart").length, 3));
await test("核心模板数量为 3", () => assert.equal(new Set(topicsData.topics.map((topic) => topic.templateId)).size, 3));
await test("模板覆盖全部可用真题", () => topicsData.topics.forEach((topic) => assert.ok(topic.templateId, topic.id)));

await test("素材库明确不是 AI 生成", () => assert.equal(materialsData.aiGenerated, false));
await test("每条真题都有对应主题素材 profile", () => topicsData.topics.forEach((topic) => assert.ok(materialsData.profiles[topic.materialProfile], topic.id)));
await test("职业题首选素材贴合职业准备", () => {
  const topic = topicsData.topics.find((item) => item.id === "2025-06-set2");
  const suggestions = writingData.getSuggestions(topic, "reason1", materialsData);
  assert.match(suggestions[0].en, /professional knowledge/i);
  assert.doesNotMatch(suggestions.slice(0, 2).map((item) => item.en).join(" "), /pollution|air quality/i);
});
await test("网络信息题首选素材贴合信息核验", () => {
  const topic = topicsData.topics.find((item) => item.id === "2021-12-set1");
  assert.match(writingData.getSuggestions(topic, "measure1", materialsData)[0].en, /source checking|verification|evidence/i);
});
await test("AI 创造力题首选素材不跨主题", () => {
  const topic = topicsData.topics.find((item) => item.id === "2025-06-set3");
  assert.match(writingData.getSuggestions(topic, "reason1", materialsData)[0].en, /automatic answers|independent exploration/i);
});
await test("空字段会由本地素材安全补齐", () => {
  const topic = topicsData.topics.find((item) => item.id === "2025-06-set2");
  const inputs = writingData.buildInputs(topic, {}, materialsData);
  writingData.getFieldDefinitions(topic.typeKey).forEach(({ key }) => assert.ok(inputs[key].en, key));
});

const generatedSamples = [
  ["2025-06-set2", "opinion"],
  ["2021-12-set1", "problem-solution"],
  ["2021-06-set2", "chart"],
].map(([id, type]) => {
  const topic = topicsData.topics.find((item) => item.id === id);
  return { id, type, topic, result: writingData.generateEssay(topic, {}, materialsData) };
});

for (const sample of generatedSamples) {
  await test(`${sample.type} 模板生成三段作文`, () => assert.equal(sample.result.paragraphs.length, 3));
  await test(`${sample.type} 模板没有 undefined`, () => assert.doesNotMatch(sample.result.english, /undefined|null/i));
  await test(`${sample.type} 模板没有未替换占位符`, () => assert.doesNotMatch(sample.result.english, /【|】|\{\{|\}\}/));
  await test(`${sample.type} 模板字数统计准确`, () => assert.equal(sample.result.wordCount, writingData.countWords(sample.result.english)));
  await test(`${sample.type} 模板默认篇幅为 150–200 words`, () => assert.ok(sample.result.wordCount >= 150 && sample.result.wordCount <= 200, `${sample.result.wordCount}`));
  await test(`${sample.type} 模板生成三段中文提示`, () => assert.equal(sample.result.zhParagraphs.length, 3));
}

await test("给定开头句会原样出现在作文开头", () => {
  const sample = generatedSamples.find((item) => item.id === "2025-06-set2");
  assert.ok(sample.result.english.startsWith("As requirements for job applications are getting increasingly higher"));
});
await test("职业题生成结果包含实践经验", () => assert.match(generatedSamples[0].result.english, /practical experience/i));
await test("问题题生成结果包含来源核验", () => assert.match(generatedSamples[1].result.english, /source checking|verify|verification/i));
await test("图表题生成结果包含 chart", () => assert.match(generatedSamples[2].result.english, /chart/i));
await test("篇幅提示短/适中/长正确", () => {
  assert.equal(writingData.getLengthLabel(149), "篇幅偏短");
  assert.equal(writingData.getLengthLabel(150), "篇幅适中");
  assert.equal(writingData.getLengthLabel(201), "篇幅偏长");
});

await test("首页包含六级作文入口", () => assert.match(html, /data-page="writing"[\s\S]*六级作文/));
await test("页面包含独立 writing view", () => assert.match(html, /id="writing-view"/));
await test("加载 writing-data 与 writing 脚本", () => {
  assert.match(html, /js\/writing-data\.js/);
  assert.match(html, /js\/writing\.js/);
});
await test("真题列表支持年/月/题型/搜索", () => {
  assert.match(writingSource, /data-writing-filter=\\?"year/);
  assert.match(writingSource, /data-writing-filter=\\?"month/);
  assert.match(writingSource, /data-writing-filter=\\?"type/);
  assert.match(writingSource, /data-writing-search/);
});
await test("详情页区分真题原文与主题概括", () => {
  assert.match(writingSource, /真题原文/);
  assert.match(writingSource, /主题概括/);
});
await test("表单提供不知道写什么入口", () => assert.match(writingSource, /不知道写什么？/));
await test("结果页提供字数统计、中英切换、复制与重练", () => {
  assert.match(writingSource, /words ·/);
  assert.match(writingSource, /显示中文提示/);
  assert.match(writingSource, /复制英文作文/);
  assert.match(writingSource, /重新填写/);
});
await test("作文记录使用独立 localStorage key", () => assert.match(writingSource, /cet6WritingPracticeV1/));
await test("作文模块不调用背词 storage 服务", () => assert.doesNotMatch(writingSource, /storage\.(?:get|set|record)/));
await test("网站运行时不加载 PDF", () => {
  assert.doesNotMatch(writingSource, /\.pdf/);
  assert.doesNotMatch(writingDataSource, /local-corpus|\.pdf/);
});
await test("网站只加载两个整理后的 JSON", () => {
  assert.match(writingDataSource, /cet6-writing-topics\.json/);
  assert.match(writingDataSource, /cet6-writing-materials\.json/);
});
await test("作文模块没有 AI 或 Worker 请求", () => {
  assert.doesNotMatch(writingSource, /confusableAi|aiJudge|\/api\//);
  assert.doesNotMatch(writingDataSource, /confusableAi|aiJudge|\/api\//);
});
await test("所有关键作文按钮高度至少 48px", () => assert.match(css, /writing-topic-card__actions button,[\s\S]*min-height:\s*48px/));
await test("375px 使用单列卡片与单列筛选器", () => {
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*writing-toolbar[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /writing-topic-grid[\s\S]*grid-template-columns:\s*1fr/);
});
await test("移动端 Directions 可断行", () => assert.match(css, /writing-directions,[\s\S]*overflow-wrap:\s*anywhere/));
await test("生成作文允许长词断行", () => assert.match(css, /writing-essay p[\s\S]*overflow-wrap:\s*anywhere/));
await test("提取脚本明确不使用 OCR", () => {
  assert.doesNotMatch(extractionSource, /pytesseract|easyocr|ocrmypdf/i);
  assert.match(extractionSource, /never uses OCR/i);
});

const ignored = spawnSync("git", ["check-ignore", "local-corpus/cet6/2018年6月英语六级真题(第1套).pdf"], { cwd: root, encoding: "utf8" });
await test("local-corpus PDF 被 gitignore 排除", () => assert.equal(ignored.status, 0, ignored.stderr));
await test("后续 Worker 词义核验扩展未读取作文或本地 PDF", () => {
  const workerSource = read("worker/src/index.js");
  assert.doesNotMatch(workerSource, /cet6-writing|writing-topics|local-corpus|\.pdf/i);
});
for (const path of ["js/review-scheduler.js", "js/review-recovery.js", "js/review-workload.js", "js/confusable-words.js", "data/cet4.json", "data/cet6.json"]) {
  const diff = spawnSync("git", ["diff", "--quiet", "--", path], { cwd: root });
  await test(`${path} 未修改`, () => assert.equal(diff.status, 0));
}

console.log(`\nPhase16.6: ${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
