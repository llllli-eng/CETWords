import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let passed = 0;
let failed = 0;
const STORAGE_KEY = "cetwords-user-data-v1";
const NOW = new Date(2026, 7, 25, 12).getTime();

async function test(name, callback) {
  try {
    await callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values); },
  };
}

function loadApp(initialStorage = {}) {
  const localStorage = createLocalStorage(initialStorage);
  const window = { CETWords: {}, localStorage, fetch: () => Promise.reject(new Error("not mocked")) };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout,
  });
  [
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js",
    "js/exam-value.js", "js/review-recovery.js", "js/new-word-learning.js",
    "js/daily-group-service.js", "js/confusable-words.js", "js/storage.js", "js/ai-judge.js",
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

function getVocabularyWord(spelling, book = "cet4") {
  return JSON.parse(read(`data/${book}.json`)).find((word) => word.word === spelling);
}

function loadPriorityFixture(spelling = "hunt", book = "cet4") {
  const loaded = loadApp();
  const smart = loaded.app.smartLearningOrder;
  const frequency = JSON.parse(read(`data/${book}-exam-frequency.json`));
  const overrides = JSON.parse(read("data/cet-learning-priority-overrides.json"));
  const priority = smart.getLearningPriority(
    spelling,
    smart.createFrequencyMap(frequency),
    smart.createOverrideMap(overrides),
  );
  return {
    ...loaded,
    priority,
    model: loaded.app.examValue.buildExamValue(getVocabularyWord(spelling, book), priority),
  };
}

function createVerifiedFixture() {
  const loaded = loadApp();
  const { storage } = loaded.app;
  storage.toggleFavorite("cet4", "hunt");
  const scheduled = storage.getOrCreateDailyNewWordIds("cet4", ["hunt", "apple"], 2, {
    now: NOW,
    learningOrder: "random",
    random: () => 0.4,
  });
  storage.saveDailyGroupPlan("cet4", storage.getLocalDateKey(NOW), {
    dailyTarget: 2,
    groupSizes: [2],
    breakMinutes: 5,
    reason: "专项测试",
    source: "local",
  }, NOW);
  storage.markDailyGroupStarted("cet4", storage.getLocalDateKey(NOW), NOW);
  const before = storage.getDailyStats("cet4", storage.getLocalDateKey(NOW));
  const result = storage.markNewWordVerifiedMastered("cet4", "hunt", { now: NOW });
  return { ...loaded, storage, scheduled, before, result };
}

await test("01 new-word page has a real exam-value region", () => {
  assert.match(read("index.html"), /id="study-exam-value"/);
});

await test("02 new-word page has the verified-mastery entry", () => {
  assert.match(read("index.html"), /id="new-word-mastered-button"/);
});

await test("03 verified mastery uses a blank active-meaning dialog", () => {
  const html = read("index.html");
  assert.match(html, /id="new-word-mastery-dialog"/);
  assert.match(html, /id="new-word-mastery-input"/);
});

await test("04 exam-value formatter is isolated from scheduling", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "js/exam-value.js")), true);
});

await test("05 hunt uses its persisted raw C frequency tier", () => {
  assert.equal(loadPriorityFixture().priority.rawFrequencyTier, "C");
});

await test("06 hunt displays the effective C tier", () => {
  assert.equal(loadPriorityFixture().model.tierLabel, "真题 C 档");
});

await test("07 hunt displays 5/10 session coverage", () => {
  assert.equal(loadPriorityFixture().model.coverageLabel, "覆盖 5/10 场");
});

await test("08 hunt displays its real occurrence count", () => {
  assert.equal(loadPriorityFixture().model.occurrenceLabel, "出现 8 次");
});

await test("09 hunt exposes real paper coverage in the display model", () => {
  const model = loadPriorityFixture().model;
  assert.deepEqual([model.paperCount, model.paperTotal], [5, 30]);
});

await test("10 a keeps raw S but displays as a true-exam function word", () => {
  const fixture = loadPriorityFixture("a");
  assert.equal(fixture.priority.rawFrequencyTier, "S");
  assert.equal(fixture.model.tierLabel, "真题功能词");
});

await test("11 neutral is derived from effectiveLearningTier", () => {
  assert.equal(loadPriorityFixture("the").model.effectiveTier, "neutral");
});

await test("12 neutral never masquerades as a low tier", () => {
  assert.doesNotMatch(loadPriorityFixture("in").model.tierLabel, /[CDE]档/);
});

await test("13 frequencyBoostEligible remains false for protected words", () => {
  assert.equal(loadPriorityFixture("be").priority.frequencyBoostEligible, false);
});

await test("14 a missing frequency record does not fabricate zero coverage", () => {
  const loaded = loadApp();
  const model = loaded.app.examValue.buildExamValue(
    { word: "invented", book: "cet4", isCore: false },
    { frequency: null, rawFrequencyTier: "E", effectiveLearningTier: "E" },
  );
  assert.equal(model.coverageLabel, "");
  assert.equal(model.occurrenceLabel, "");
});

await test("15 incomplete frequency is explicitly labelled", () => {
  const loaded = loadApp();
  const model = loaded.app.examValue.buildExamValue({ book: "cet4" }, {});
  assert.equal(model.incompleteLabel, "暂无完整真题统计");
});

await test("16 CET4 core source is distinguished", () => {
  assert.equal(loadPriorityFixture("hunt").model.sourceLabel, "CET4 核心词");
});

await test("17 CET6 core source is distinguished", () => {
  assert.equal(loadPriorityFixture("transition", "cet6").model.sourceLabel, "CET6 核心词");
});

await test("18 supplemental source is distinguished", () => {
  const loaded = loadApp();
  assert.equal(loaded.app.examValue.getSourceLabel({ book: "cet4", isCore: false }), "CET4 补充词");
});

await test("19 display formatting does not mutate priority input", () => {
  const fixture = loadPriorityFixture();
  const before = JSON.stringify(fixture.priority);
  fixture.app.examValue.buildExamValue(getVocabularyWord("hunt"), fixture.priority);
  assert.equal(JSON.stringify(fixture.priority), before);
});

await test("20 SMART_TIER_WEIGHTS remains unchanged", () => {
  assert.deepEqual(plain(loadApp().app.smartLearningOrder.SMART_TIER_WEIGHTS), {
    S: 40, A: 30, B: 15, C: 8, D: 5, E: 2,
  });
});

await test("21 verified mastery marks an unlearned intro word", () => {
  assert.equal(createVerifiedFixture().result.changed, true);
});

await test("22 verified mastery creates completion type without L1", () => {
  const { result } = createVerifiedFixture();
  assert.equal(result.completionType, "verified-manual-mastered");
  assert.equal(result.progress.masteryLevel, 0);
});

await test("23 verified mastery sets manualMastered", () => {
  assert.equal(createVerifiedFixture().result.progress.manualMastered, true);
});

await test("24 verified mastery creates no nextReviewDate", () => {
  assert.equal(createVerifiedFixture().result.progress.nextReviewDate, null);
});

await test("25 verified mastery creates no nextReviewTime", () => {
  assert.equal(createVerifiedFixture().result.progress.nextReviewTime, null);
});

await test("26 verified mastery preserves favorite", () => {
  assert.equal(createVerifiedFixture().result.progress.favorite, true);
});

await test("27 verified mastery does not count as a normal completed reinforcement", () => {
  assert.deepEqual(plain(createVerifiedFixture().result.daily.completedNewWordIds), []);
});

await test("28 verified mastery has its own daily ID collection", () => {
  assert.deepEqual(plain(createVerifiedFixture().result.daily.verifiedManualMasteredNewWordIds), ["hunt"]);
});

await test("29 daily handled new words includes verified mastery", () => {
  assert.equal(createVerifiedFixture().result.daily.completedNewWords, 1);
});

await test("30 verified mastery does not increment answerCount", () => {
  assert.equal(createVerifiedFixture().result.daily.answerCount, 0);
});

await test("31 verified mastery does not increment correctCount", () => {
  assert.equal(createVerifiedFixture().result.daily.correctCount, 0);
});

await test("32 verified mastery does not increment partial or wrong", () => {
  const daily = createVerifiedFixture().result.daily;
  assert.deepEqual([daily.partialCount, daily.wrongCount], [0, 0]);
});

await test("33 verified mastery does not touch choice accuracy metrics", () => {
  const metrics = createVerifiedFixture().result.daily.learningMetrics;
  assert.deepEqual(plain(metrics.firstChoice), { correct: 0, wrong: 0 });
});

await test("34 verified mastery leaves reinforcement metrics empty", () => {
  const metrics = createVerifiedFixture().result.daily.learningMetrics;
  assert.deepEqual(plain(metrics.reinforcement), { correct: 0, partial: 0, wrong: 0 });
});

await test("35 verified mastery immediately leaves scheduledNewWordIds", () => {
  assert.equal(createVerifiedFixture().result.daily.scheduledNewWordIds.includes("hunt"), false);
});

await test("36 a refresh does not refill the verified slot", () => {
  const fixture = createVerifiedFixture();
  const refreshed = fixture.storage.getOrCreateDailyNewWordIds("cet4", ["hunt", "apple", "pear"], 2, {
    now: NOW, learningOrder: "random", random: () => 0.2,
  });
  assert.deepEqual(plain(refreshed), ["apple"]);
});

await test("37 future new-word candidates exclude verified mastery", () => {
  const fixture = createVerifiedFixture();
  const tomorrow = NOW + 24 * 60 * 60 * 1000;
  const scheduled = fixture.storage.getOrCreateDailyNewWordIds("cet4", ["hunt", "pear"], 1, {
    now: tomorrow, learningOrder: "random", random: () => 0,
  });
  assert.deepEqual(plain(scheduled), ["pear"]);
});

await test("38 verified mastery has no reinforcement record", () => {
  assert.equal(createVerifiedFixture().storage.getNewWordLearningState("cet4", "hunt"), null);
});

await test("39 verified mastery has no Recovery record", () => {
  assert.equal(createVerifiedFixture().storage.getReviewRecoveryState("cet4", "hunt"), null);
});

await test("40 verified mastery is absent from due SRS", () => {
  const fixture = createVerifiedFixture();
  assert.deepEqual(plain(fixture.storage.getDueWords("cet4", ["hunt"], NOW)), []);
});

await test("41 group progress counts verified mastery as handled", () => {
  const fixture = createVerifiedFixture();
  const progress = fixture.storage.updateDailyGroupProgress("cet4", fixture.storage.getLocalDateKey(NOW)).progress;
  assert.equal(progress.activeGroup.completedCount, 1);
});

await test("42 group progress exposes verified completion separately", () => {
  const fixture = createVerifiedFixture();
  const progress = fixture.storage.getDailyGroupProgress("cet4", fixture.storage.getLocalDateKey(NOW));
  assert.deepEqual(
    [progress.activeGroup.normalCompletedCount, progress.activeGroup.verifiedManualMasteredCount],
    [0, 1],
  );
});

await test("43 assigned group IDs remain stable after live schedule removal", () => {
  const fixture = createVerifiedFixture();
  const plan = fixture.storage.getDailyGroupPlan("cet4", fixture.storage.getLocalDateKey(NOW));
  assert.equal(plan.assignedNewWordIds.includes("hunt"), true);
});

await test("44 duplicate verified mastery cannot double count", () => {
  const fixture = createVerifiedFixture();
  const second = fixture.storage.markNewWordVerifiedMastered("cet4", "hunt", { now: NOW });
  assert.equal(second.changed, false);
  assert.equal(fixture.storage.getDailyStats("cet4", fixture.storage.getLocalDateKey(NOW)).completedNewWords, 1);
});

await test("45 an already learned word cannot use the new-word verifier", () => {
  const loaded = loadApp();
  loaded.app.storage.updateWordProgress("cet4", "learned", true, { timestamp: NOW, taskType: "new" });
  assert.equal(loaded.app.storage.markNewWordVerifiedMastered("cet4", "learned", { now: NOW }).changed, false);
});

await test("46 undo restores the exact unlearned progress", () => {
  const fixture = createVerifiedFixture();
  assert.equal(fixture.storage.undoManualMastery(fixture.result.undo), true);
  const restored = fixture.storage.getWordProgress("cet4", "hunt");
  assert.equal(restored.learned, false);
  assert.equal(restored.manualMastered, false);
  assert.equal(restored.favorite, true);
});

await test("47 undo restores today's scheduled assignment", () => {
  const fixture = createVerifiedFixture();
  fixture.storage.undoManualMastery(fixture.result.undo);
  assert.equal(
    fixture.storage.getDailyStats("cet4", fixture.storage.getLocalDateKey(NOW)).scheduledNewWordIds.includes("hunt"),
    true,
  );
});

await test("48 verified state survives a full storage reload", () => {
  const fixture = createVerifiedFixture();
  const reloaded = loadApp(fixture.localStorage.dump());
  assert.equal(reloaded.app.storage.getWordProgress("cet4", "hunt").manualMastered, true);
  assert.deepEqual(
    plain(reloaded.app.storage.getDailyStats("cet4", reloaded.app.storage.getLocalDateKey(NOW)).verifiedManualMasteredNewWordIds),
    ["hunt"],
  );
});

await test("49 Storage version remains v15", () => {
  const fixture = createVerifiedFixture();
  assert.equal(JSON.parse(fixture.localStorage.dump()[STORAGE_KEY]).version, 15);
});

await test("50 existing restore action can re-enter review", () => {
  const fixture = createVerifiedFixture();
  const restored = fixture.storage.restoreWordReview("cet4", "hunt", NOW);
  assert.equal(restored.manualMastered, false);
  assert.equal(restored.learned, true);
});

await test("51 four-choice answering still uses updateWordProgress only", () => {
  const source = read("js/study.js");
  const answerMethod = source.slice(source.indexOf("    answer(selectedIndex)"), source.indexOf("    submitMeaningAnswer"));
  assert.match(answerMethod, /this\.onAnswer\(/);
  assert.doesNotMatch(answerMethod, /onVerifiedNewWordMastery/);
});

await test("52 verifier reuses localMeaningJudge before AI", () => {
  const source = read("js/study.js");
  const method = source.slice(source.indexOf("async submitNewWordMasteryMeaning"), source.indexOf("applyVerifiedMasteryResultToBook"));
  assert.ok(method.indexOf("aiJudge.localMeaningJudge") < method.indexOf("this.onAiJudgeMeaning"));
});

await test("53 only a correct judgement calls verified mastery persistence", () => {
  const source = read("js/study.js");
  assert.match(source, /if \(judgementResult\.result === "correct"\)[\s\S]*onVerifiedNewWordMastery/);
});

await test("54 AI failure is fail-closed with the specified feedback", () => {
  assert.match(read("js/study.js"), /AI 暂时无法判断，本次不会标记为已掌握/);
});

await test("55 the verifier exists only for unanswered intro questions", () => {
  const source = read("js/study.js");
  assert.match(source, /learningPhase === newWordLearning\.LEARNING_PHASES\.INTRO[\s\S]*selectedIndex === null/);
});

await test("56 the dialog result is hidden before submission", () => {
  assert.match(read("index.html"), /id="new-word-mastery-result"[^>]*hidden/);
});

await test("57 the active answer input starts blank and never embeds the core answer", () => {
  const html = read("index.html");
  const input = html.match(/<textarea[^>]*id="new-word-mastery-input"[^>]*>[\s\S]*?<\/textarea>/)?.[0] || "";
  assert.doesNotMatch(input, /value=|打猎|狩猎|搜寻/);
});

await test("58 the undo window is eight seconds", () => {
  assert.match(read("js/study.js"), /actionLabel: "撤销",\s*duration: 8000/);
});

await test("59 desktop and mobile controls remain touch-sized and fluid", () => {
  const css = read("css/style.css");
  assert.match(css, /\.new-word-mastered-button[\s\S]*min-height: 48px/);
  assert.match(css, /\.study-exam-value[\s\S]*max-width: 100%/);
});

await test("60 protected vocabulary, frequency and grouping algorithm files are unchanged", () => {
  execFileSync("git", [
    "diff", "--exit-code", "HEAD", "--",
    "data/cet4.json", "data/cet6.json", "data/cet4-exam-frequency.json",
    "data/cet6-exam-frequency.json", "js/smart-learning-order.js",
    "js/daily-group-service.js", "js/review-scheduler.js", "js/review-recovery.js",
  ], { cwd: ROOT, stdio: "pipe" });
});

console.log(`\nPhase16.5 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
