import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = {
  cet4: {
    total: 5579,
    core: 4544,
    supplemental: 1035,
    idHash: "5fa756edc6d50aef3894dd4ad11fa918f2e9c6814731584a1bb37070b7cd8434",
  },
  cet6: {
    total: 6662,
    core: 3991,
    supplemental: 2671,
    idHash: "eff947fdf91668fedacb5ea6f661861435e460783cbb79f307fb9e94b3594898",
  },
};
const PROTECTED_HASHES = {
  "data/cet4-exam-frequency.json": "9c7b94b424818ccc2352f42329f09f0bf3245462d863d48c6cc43e158357a4a3",
  "data/cet6-exam-frequency.json": "f71b8e21a6a9d709ad5a38caa56a5838eabd9e845790dd28c251a15623a20765",
  "data/cet-learning-priority-overrides.json": "c9573fa281f3f63aef0537f5672774b7b10d3ae14963c5fa717dec2b72c79947",
  "js/smart-learning-order.js": "1001693298a1bbda0af5efc6793017bdfeb41dc8e2b9aeb610657c9571313a30",
  "js/review-scheduler.js": "b65b22be281665c1633c9859efb9c5c5cd7adff996d51ec60d933280c94fe4f7",
  "js/review-recovery.js": "050a8dff4e21b9be018f7631610cde9ef8c39e47fa97bd08f628f9e17c91bf05",
  "js/daily-group-service.js": "502275f89f546d34ae085f9fb769faa119903a5ff68cc10a4c5282d828d4f013",
  "worker/src/index.js": "cb47296dcf93d6d5cf80b0beaa22282bce5850d526ed59a6b34f85675c438eaf",
};

const books = Object.fromEntries(
  Object.keys(EXPECTED).map((bookId) => [
    bookId,
    JSON.parse(fs.readFileSync(path.join(ROOT, `data/${bookId}.json`), "utf8")),
  ]),
);
const lookup = Object.fromEntries(
  Object.entries(books).map(([bookId, words]) => [bookId, new Map(words.map((word) => [word.word.toLowerCase(), word]))]),
);
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "data/core-meaning-audit-report.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "data/core-meaning-overrides.json"), "utf8"));
let passed = 0;
let failed = 0;

async function test(name, callback) {
  try {
    await callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${error.stack || error.message}`);
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizedSense(value) {
  return String(value || "")
    .replace(/<[^>]+>|\[[^\]]+\]/g, "")
    .replace(/[\s,，。；;:：、（）()\[\]…·]+/g, "")
    .toLowerCase();
}

function getWord(word) {
  return lookup.cet4.get(word) || lookup.cet6.get(word);
}

function loadServices() {
  const window = {
    CETWords: { FALLBACK_WORDS: {} },
    location: { href: "http://127.0.0.1:4173/index.html" },
  };
  const context = vm.createContext({ window, URL, Map, Set, Math, AbortController, setTimeout, clearTimeout });
  for (const file of ["js/word-utils.js", "js/ai-judge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  }
  return window.CETWords;
}

const services = loadServices();

await test("down direction senses are the CET4 and CET6 core meaning", () => {
  for (const bookId of ["cet4", "cet6"]) {
    assert.equal(lookup[bookId].get("down").coreMeaning, "向下；往下；在下面；下降");
  }
});

await test("down rare noun senses are absent from core but retained in detail", () => {
  for (const bookId of ["cet4", "cet6"]) {
    const word = lookup[bookId].get("down");
    assert.doesNotMatch(word.coreMeaning, /软毛|绒毛|高地/);
    assert.match(word.meaning, /软毛/);
    assert.match(word.meaning, /绒毛/);
    assert.match(word.meaning, /高地/);
  }
});

await test("ensure is exactly 确保；保证 and no longer includes 保护", () => {
  for (const bookId of ["cet4", "cet6"]) {
    const word = lookup[bookId].get("ensure");
    assert.equal(word.coreMeaning, "确保；保证");
    assert.doesNotMatch(word.coreMeaning, /保护/);
    assert.doesNotMatch(word.meaning, /保护/);
  }
});

await test("paper remains 纸；论文；试卷", () => {
  for (const bookId of ["cet4", "cet6"]) assert.equal(lookup[bookId].get("paper").coreMeaning, "纸；论文；试卷");
});

await test("shortMeaning equals coreMeaning for every formal word", () => {
  for (const words of Object.values(books)) {
    for (const word of words) assert.equal(word.shortMeaning, word.coreMeaning, word.id);
  }
});

await test("every core meaning is represented in detailed meanings", () => {
  for (const words of Object.values(books)) {
    for (const word of words) {
      const detail = normalizedSense(word.meaning);
      const pieces = word.coreMeaning.split(/[；;]+/).map(normalizedSense).filter(Boolean);
      for (const piece of pieces) assert.ok(detail.includes(piece), `${word.id}: ${piece}`);
    }
  }
});

await test("all word IDs and their order remain unchanged", () => {
  for (const [bookId, words] of Object.entries(books)) {
    assert.equal(sha256(words.map((word) => word.id).join("\n")), EXPECTED[bookId].idHash);
    assert.equal(new Set(words.map((word) => word.id)).size, words.length);
  }
});

await test("CET4 and CET6 total counts remain unchanged", () => {
  for (const [bookId, words] of Object.entries(books)) assert.equal(words.length, EXPECTED[bookId].total);
});

await test("core and supplemental counts remain unchanged", () => {
  for (const [bookId, words] of Object.entries(books)) {
    assert.equal(words.filter((word) => word.isCore).length, EXPECTED[bookId].core);
    assert.equal(words.filter((word) => !word.isCore).length, EXPECTED[bookId].supplemental);
  }
});

await test("frequency files are byte-for-byte unchanged", () => {
  for (const relative of ["data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json"]) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, relative))), PROTECTED_HASHES[relative]);
  }
});

await test("smart random and neutral configuration is unchanged", () => {
  for (const relative of ["data/cet-learning-priority-overrides.json", "js/smart-learning-order.js"]) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, relative))), PROTECTED_HASHES[relative]);
  }
});

await test("SRS Recovery Phase16 grouping and Worker are unchanged", () => {
  for (const relative of ["js/review-scheduler.js", "js/review-recovery.js", "js/daily-group-service.js", "worker/src/index.js"]) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, relative))), PROTECTED_HASHES[relative]);
  }
});

await test("storage schema remains v13", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8"), /const DATA_VERSION = 13/);
});

await test("neutral words keep raw frequency tiers but receive audited meanings", () => {
  const priority = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cet-learning-priority-overrides.json"), "utf8"));
  const neutralWords = priority.overrides.filter((item) => item.effectiveLearningTier === "neutral").map((item) => item.word);
  const cet4Frequency = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/cet4-exam-frequency.json"), "utf8")).words.map((item) => [item.word, item]));
  for (const word of ["a", "the", "in", "be"]) {
    assert.equal(cet4Frequency.get(word).frequencyTier, "S");
    assert.ok(neutralWords.includes(word));
    assert.ok(lookup.cet4.get(word).coreMeaning.length > 0);
  }
  assert.ok(audit.repairSummary.neutralEntries > 0);
});

await test("S A and B priority tiers are represented in confirmed repairs", () => {
  for (const tier of ["S", "A", "B"]) assert.ok(audit.repairSummary.byRawFrequencyTier[tier] > 0, tier);
});

await test("targeted override layer is versioned and every declaration is applied", () => {
  const build = JSON.parse(fs.readFileSync(path.join(ROOT, "data/vocabulary-report.json"), "utf8"));
  assert.equal(overrides.schemaVersion, 1);
  assert.equal(build.coreMeaningOverrides.declarations, overrides.overrides.length);
  assert.equal(build.coreMeaningOverrides.unusedDeclarations.length, 0);
});

await test("audit report contains all required summaries and no unresolved structural signal", () => {
  assert.equal(audit.audited.entries, EXPECTED.cet4.total + EXPECTED.cet6.total);
  assert.equal(audit.flagged.candidateEntriesBeforeRepair, audit.repairSummary.applications);
  assert.equal(audit.flagged.remainingManualReviewEntries, 0);
  assert.equal(audit.manualChecklist.length, 27);
});

await test("core displays contain no promoted proper name, source tag, or garbled markup", () => {
  for (const words of Object.values(books)) {
    for (const word of words) assert.doesNotMatch(word.coreMeaning, /人名|地名|姓氏|专名|�|<[^>]+>|\[[^\]]+\]/, word.id);
  }
});

await test("down four-choice answer is correct and distractors do not overlap", () => {
  const word = lookup.cet4.get("down");
  const options = services.generateOptions(word, books.cet4, () => 0.37);
  assert.equal(options.length, 4);
  assert.equal(options.filter((item) => item.isCorrect).length, 1);
  const correct = options.find((item) => item.isCorrect);
  assert.equal(correct.meaning, "向下；往下；在下面；下降");
  for (const option of options.filter((item) => !item.isCorrect)) {
    assert.equal(services.meaningsOverlap(correct.meaning, option.meaning), false);
  }
});

await test("ensure four-choice answer is correct and unique", () => {
  const word = lookup.cet4.get("ensure");
  const options = services.generateOptions(word, books.cet4, () => 0.61);
  assert.equal(options.length, 4);
  const correct = options.filter((item) => item.isCorrect);
  assert.equal(correct.length, 1);
  assert.equal(correct[0].meaning, "确保；保证");
  assert.equal(new Set(options.map((item) => item.meaning)).size, 4);
});

await test("local active-meaning judge accepts 确保 for ensure", () => {
  const judgement = services.aiJudge.localMeaningJudge(lookup.cet4.get("ensure"), "确保");
  assert.equal(judgement.decision, "judged");
  assert.equal(judgement.result, "correct");
  assert.equal(judgement.source, "local");
});

await test("AI judge payload retains polysemous structure", () => {
  const payload = services.aiJudge.buildJudgePayload(getWord("paper"), "论文");
  assert.equal(payload.coreMeaning, "纸；论文；试卷");
  assert.ok(payload.meanings.length >= 3);
  assert.ok(Object.keys(payload.meaningsByPos).length >= 1);
});

console.log(`\nPhase 16.2 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
