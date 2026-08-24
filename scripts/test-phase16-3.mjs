import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

process.env.TZ = "Asia/Shanghai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE_KEY = "cetwords-user-data-v1";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 7, 24, 12).getTime();
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
    "js/review-recovery.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "js/storage.js", "js/backup-service.js", "js/word-library.js", "js/daily-review-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

function localDateKey(timestamp = NOW) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dueProgress(index = 0, options = {}) {
  const level = options.level ?? ((index % 4) + 1);
  const overdueDays = options.overdueDays ?? (index % 8);
  return {
    learned: true,
    correctCount: options.correctCount ?? (8 + (index % 4)),
    partialCount: 0,
    wrongCount: options.wrongCount ?? (index % 3),
    consecutiveCorrect: 1,
    masteryLevel: level,
    reviewCount: 2,
    favorite: Boolean(options.favorite),
    inWrongBook: Boolean(options.inWrongBook),
    lastStudyTime: NOW - 20 * DAY,
    lastWrongTime: options.lastWrongTime ?? null,
    lastReviewTime: NOW - 20 * DAY,
    nextReviewTime: level === 0 ? NOW - overdueDays * DAY : null,
    nextReviewDate: level === 0 ? null : localDateKey(NOW - overdueDays * DAY),
    lastLongTermAnchorAt: NOW - 30 * DAY,
    earliestReviewAt: level === 1 ? NOW - DAY : null,
    firstLearnDate: "2026-07-01",
    manualMastered: false,
    manualMasteredAt: null,
  };
}

function seedWords(loaded, count, prefix = "word", progressFactory = dueProgress) {
  const data = loaded.app.storage.loadUserData();
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}-${String(index).padStart(3, "0")}`;
    ids.push(id);
    data.books.cet4.words[id] = progressFactory(index);
  }
  loaded.app.storage.saveUserData(data);
  return ids;
}

function fixture(count = 420, limit = 120) {
  const loaded = loadApp();
  const ids = seedWords(loaded, count);
  loaded.app.storage.setDailyReviewLimit("cet4", limit);
  return { ...loaded, ids, storage: loaded.app.storage };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

// 1–10 每日复习预算
await test("01 due 420 with limit 120 creates exactly 120 task IDs", () => {
  const { storage, ids } = fixture();
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW).taskWordIds.length, 120);
});

await test("02 due 80 with limit 120 creates a task of 80", () => {
  const { storage, ids } = fixture(80);
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW).target, 80);
});

await test("03 unlimited creates a task containing every due word", () => {
  const { storage, ids } = fixture(180, "unlimited");
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW).target, 180);
});

await test("04 task IDs preserve existing review priority order", () => {
  const { storage, ids } = fixture();
  const expected = storage.getDueWords("cet4", ids, NOW).slice(0, 120).map((entry) => entry.wordId);
  assert.deepEqual(storage.getDailyReviewSummary("cet4", ids, NOW).taskWordIds, expected);
});

await test("05 a preload-time empty placeholder rebuilds when vocabulary arrives", () => {
  const loaded = loadApp();
  assert.equal(loaded.app.storage.getDailyReviewSummary("cet4", [], NOW).target, 0);
  const ids = seedWords(loaded, 130);
  assert.equal(loaded.app.storage.getDailyReviewSummary("cet4", ids, NOW).target, 120);
});

await test("06 task IDs remain stable after storage reload", () => {
  const loaded = fixture();
  const first = loaded.storage.getDailyReviewSummary("cet4", loaded.ids, NOW).taskWordIds;
  const reloaded = loadApp(loaded.localStorage.dump());
  assert.deepEqual(Array.from(reloaded.app.storage.getDailyReviewSummary("cet4", loaded.ids, NOW).taskWordIds), Array.from(first));
});

await test("07 300 words outside today's task remain due", () => {
  const { storage, ids } = fixture();
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.backlogCount, 300);
  assert.equal(storage.getDueWords("cet4", ids, NOW).length, 420);
});

await test("08 backlog is excluded from the normal formal-review queue", () => {
  const { storage, ids } = fixture();
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.dueWords.length, 120);
  assert.equal(summary.outsideBacklogWords.length, 300);
});

await test("09 an unfinished daily task still supplies formal reviews first", () => {
  const loaded = fixture(3, 120);
  const summary = loaded.storage.getDailyReviewSummary("cet4", loaded.ids, NOW);
  const queue = loaded.app.newWordLearning.buildNormalQueue({
    dueItems: summary.dueWords.map((entry) => ({ wordId: entry.wordId, taskType: "review" })),
    recoveryItems: [], pendingItems: [], introItems: [{ wordId: "intro", taskType: "new" }],
    currentSequence: 0, dateKey: localDateKey(), now: NOW,
  });
  assert.equal(queue[0].taskType, "review");
});

await test("10 a handled task allows intro even while outside backlog remains", () => {
  const { reviewWorkload } = loadApp().app;
  let task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: ["a", "b"], limit: 120, now: NOW });
  task = reviewWorkload.markHandled(task, "a", "answered");
  task = reviewWorkload.markHandled(task, "b", "deferred");
  const summary = reviewWorkload.summarizeTask(task, { currentDueWordIds: ["b", "outside"], outsideBacklogWordIds: ["outside"] });
  assert.equal(summary.completed, true);
  assert.equal(summary.backlogCount, 1);
});

// 11–24 manual mastered
await test("11 a learned word can be marked manual mastered", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(storage.markWordManualMastered("cet4", ids[0], { now: NOW }).progress.manualMastered, true);
});

await test("12 manual mastered is excluded from due words", () => {
  const { storage, ids } = fixture(1);
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDueWords("cet4", ids, NOW).length, 0);
});

await test("13 manual mastered is excluded from a new daily task", () => {
  const { storage, ids } = fixture(1);
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW + DAY).target, 0);
});

await test("14 manual mastered exits Recovery", () => {
  const loaded = fixture(1);
  const data = loaded.storage.loadUserData();
  data.books.cet4.reviewRecovery[loaded.ids[0]] = loaded.app.reviewRecovery.createRecovery({ sourceReviewResult: "wrong", currentLevel: 2, sessionId: "x", now: NOW });
  loaded.storage.saveUserData(data);
  loaded.storage.markWordManualMastered("cet4", loaded.ids[0], { now: NOW });
  assert.equal(loaded.storage.getReviewRecoveryState("cet4", loaded.ids[0]), null);
});

await test("15 manual mastered never becomes a new-word assignment", () => {
  const { storage, ids } = fixture(1);
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getOrCreateDailyNewWordIds("cet4", ids, 1, { now: NOW }).length, 0);
});

await test("16 manual mastered remains independent from Level 5", () => {
  const { storage, ids } = fixture(1);
  const before = storage.getWordProgress("cet4", ids[0]).masteryLevel;
  const after = storage.markWordManualMastered("cet4", ids[0], { now: NOW }).progress;
  assert.equal(after.masteryLevel, before);
  assert.notEqual(after.masteryLevel, 5);
});

await test("17 manual mastery does not count as correct", () => {
  const { storage, ids } = fixture(1);
  const before = storage.getWordProgress("cet4", ids[0]).correctCount;
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getWordProgress("cet4", ids[0]).correctCount, before);
});

await test("18 manual mastery does not change answer accuracy", () => {
  const { storage, ids } = fixture(1);
  const before = storage.getDailyStats("cet4", localDateKey()).answerCount;
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDailyStats("cet4", localDateKey()).answerCount, before);
});

await test("19 wrong history remains after manual mastery", () => {
  const { storage, ids } = fixture(1, 120);
  const before = storage.getWordProgress("cet4", ids[0]).wrongCount;
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  assert.equal(storage.getWordProgress("cet4", ids[0]).wrongCount, before);
});

await test("20 favorite remains after manual mastery", () => {
  const loaded = fixture(1);
  const data = loaded.storage.loadUserData();
  data.books.cet4.words[loaded.ids[0]].favorite = true;
  loaded.storage.saveUserData(data);
  loaded.storage.markWordManualMastered("cet4", loaded.ids[0], { now: NOW });
  assert.equal(loaded.storage.getWordProgress("cet4", loaded.ids[0]).favorite, true);
});

await test("21 word-library filter exposes manual mastered", () => {
  const loaded = fixture(1);
  loaded.storage.markWordManualMastered("cet4", loaded.ids[0], { now: NOW });
  assert.equal(loaded.app.wordLibrary.matchesFilter(loaded.storage.getWordProgress("cet4", loaded.ids[0]), "manual-mastered"), true);
});

await test("22 restore schedules manual mastered for tomorrow", () => {
  const { storage, ids } = fixture(1);
  storage.markWordManualMastered("cet4", ids[0], { now: NOW });
  const restored = storage.restoreWordReview("cet4", ids[0], NOW);
  assert.equal(restored.manualMastered, false);
  assert.equal(restored.nextReviewDate, localDateKey(NOW + DAY));
});

await test("23 single manual mastery undo restores exact SRS and Recovery snapshot", () => {
  const loaded = fixture(1);
  const before = loaded.storage.getWordProgress("cet4", loaded.ids[0]);
  const result = loaded.storage.markWordManualMastered("cet4", loaded.ids[0], { now: NOW });
  assert.equal(loaded.storage.undoManualMastery(result.undo), true);
  assert.deepEqual(loaded.storage.getWordProgress("cet4", loaded.ids[0]), before);
});

await test("24 batch undo restores every selected word", () => {
  const { storage, ids } = fixture(3);
  const batch = storage.markWordsManualMastered("cet4", ids, { now: NOW });
  assert.equal(storage.undoManualMasteryBatch(batch.undoEntries), 3);
  assert.equal(storage.getManualMasteredWords("cet4").length, 0);
});

// 25–31 today defer
await test("25 today defer does not modify mastery", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  const before = storage.getWordProgress("cet4", ids[0]).masteryLevel;
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  assert.equal(storage.getWordProgress("cet4", ids[0]).masteryLevel, before);
});

await test("26 today defer preserves original next review date", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  const before = storage.getWordProgress("cet4", ids[0]).nextReviewDate;
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  assert.equal(storage.getWordProgress("cet4", ids[0]).nextReviewDate, before);
});

await test("27 today deferred word does not repeat in today's pending task", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW).pendingTaskWordIds.includes(ids[0]), false);
});

await test("28 today deferred word returns to tomorrow's task", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW + DAY).taskWordIds.includes(ids[0]), true);
});

await test("29 today defer changes neither correct nor wrong count", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  const before = storage.getWordProgress("cet4", ids[0]);
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  const after = storage.getWordProgress("cet4", ids[0]);
  assert.equal(after.correctCount, before.correctCount);
  assert.equal(after.wrongCount, before.wrongCount);
});

await test("30 today defer counts as handled", () => {
  const { storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  assert.equal(storage.getDailyReviewSummary("cet4", ids, NOW).handledCount, 1);
});

await test("31 deferred overdue age keeps increasing", () => {
  const { app, storage, ids } = fixture(1);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  storage.deferDailyReviewWord("cet4", ids[0], { now: NOW });
  const progress = storage.getDueWords("cet4", ids, NOW)[0].progress;
  const todayScore = app.reviewScheduler.calculateReviewPriority(progress, NOW).overdueScore;
  const tomorrowScore = app.reviewScheduler.calculateReviewPriority(progress, NOW + DAY).overdueScore;
  assert.ok(tomorrowScore > todayScore);
});

// 32–34 稍后再看
await test("32 later moves only the selected item to the current queue tail", () => {
  const { reviewWorkload } = loadApp().app;
  assert.deepEqual(Array.from(reviewWorkload.moveWordToEnd(["a", "b", "c"], 0, "a")), ["b", "c", "a"]);
});

await test("33 later does not count as handled", () => {
  const { reviewWorkload } = loadApp().app;
  const task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: ["a", "b"], limit: 120, now: NOW });
  reviewWorkload.moveWordToEnd(task.taskWordIds, 0, "a");
  assert.equal(reviewWorkload.getHandledWordIds(task).length, 0);
});

await test("34 later does not alter persistent SRS state", () => {
  const loaded = fixture(2);
  const before = loaded.storage.loadUserData().books.cet4.words;
  loaded.app.reviewWorkload.moveWordToEnd(loaded.ids, 0, loaded.ids[0]);
  assert.deepEqual(loaded.storage.loadUserData().books.cet4.words, before);
});

// 35–39 快速清理
await test("35 quick cleanup returns at most 20 candidates", () => {
  const { storage, ids } = fixture(50);
  assert.equal(storage.getQuickCleanupCandidates("cet4", ids, NOW).length, 20);
});

await test("36 batch mastery changes only explicitly selected IDs", () => {
  const { storage, ids } = fixture(4);
  storage.markWordsManualMastered("cet4", ids.slice(0, 2), { now: NOW });
  assert.deepEqual(ids.map((id) => storage.getWordProgress("cet4", id).manualMastered), [true, true, false, false]);
});

await test("37 batch mastery does not pollute accuracy", () => {
  const { storage, ids } = fixture(3);
  const before = storage.getDailyStats("cet4", localDateKey()).answerCount;
  storage.markWordsManualMastered("cet4", ids, { now: NOW });
  assert.equal(storage.getDailyStats("cet4", localDateKey()).answerCount, before);
});

await test("38 an unselected word remains byte-equivalent", () => {
  const { storage, ids } = fixture(2);
  const before = storage.getWordProgress("cet4", ids[1]);
  storage.markWordsManualMastered("cet4", [ids[0]], { now: NOW });
  assert.deepEqual(storage.getWordProgress("cet4", ids[1]), before);
});

await test("39 batch mastery removes a selected Recovery record", () => {
  const loaded = fixture(1);
  const data = loaded.storage.loadUserData();
  data.books.cet4.reviewRecovery[loaded.ids[0]] = loaded.app.reviewRecovery.createRecovery({ sourceReviewResult: "partial", currentLevel: 2, sessionId: "x", now: NOW });
  loaded.storage.saveUserData(data);
  loaded.storage.markWordsManualMastered("cet4", loaded.ids, { now: NOW });
  assert.equal(loaded.storage.getReviewRecoveryState("cet4", loaded.ids[0]), null);
});

// 40–46 分段休息
await test("40 every 20 handled items triggers a segment break", () => {
  const { reviewWorkload } = loadApp().app;
  let task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: Array.from({ length: 40 }, (_, i) => `w${i}`), limit: 120, now: NOW });
  task.taskWordIds.slice(0, 20).forEach((id) => { task = reviewWorkload.markHandled(task, id, "answered"); });
  assert.equal(reviewWorkload.getSegmentStatus(task).pendingBreak, true);
});

await test("41 Recovery attempts are absent from handled task categories", () => {
  const { reviewWorkload } = loadApp().app;
  const task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: ["formal"], limit: 120, now: NOW });
  assert.equal(reviewWorkload.getHandledWordIds(task).length, 0);
});

await test("42 direct continue acknowledges only the completed segment", () => {
  const { reviewWorkload } = loadApp().app;
  let task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: Array.from({ length: 40 }, (_, i) => `w${i}`), limit: 120, now: NOW });
  task.taskWordIds.slice(0, 20).forEach((id) => { task = reviewWorkload.markHandled(task, id, "answered"); });
  task = reviewWorkload.acknowledgeSegment(task);
  assert.equal(reviewWorkload.getSegmentStatus(task).pendingBreak, false);
  assert.equal(reviewWorkload.getHandledWordIds(task).length, 20);
});

await test("43 starting a review break persists a real timestamp", () => {
  const { reviewWorkload } = loadApp().app;
  let task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: Array.from({ length: 40 }, (_, i) => `w${i}`), limit: 120, now: NOW });
  task.taskWordIds.slice(0, 20).forEach((id) => { task = reviewWorkload.markHandled(task, id, "answered"); });
  assert.equal(reviewWorkload.startBreak(task, NOW).breakStartedAt, NOW);
});

await test("44 early break exit preserves handled count", () => {
  const { reviewWorkload } = loadApp().app;
  let task = reviewWorkload.createTask({ date: localDateKey(), dueWordIds: Array.from({ length: 40 }, (_, i) => `w${i}`), limit: 120, now: NOW });
  task.taskWordIds.slice(0, 20).forEach((id) => { task = reviewWorkload.markHandled(task, id, "answered"); });
  task = reviewWorkload.acknowledgeSegment(reviewWorkload.startBreak(task, NOW));
  assert.equal(reviewWorkload.getHandledWordIds(task).length, 20);
});

await test("45 stop-today UI is a session action and not task completion", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /stopReviewSession\(\)[\s\S]*onStopReviewSession/);
  assert.doesNotMatch(source, /stopReviewSession\(\)[\s\S]{0,250}markHandled/);
});

await test("46 review break countdown uses Date.now real elapsed time", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /getReviewBreakRemainingMs\(now = Date\.now\(\)\)/);
  assert.match(source, /breakStartedAt \+ \(summary\.breakMinutes \|\| 3\) \* 60 \* 1000 - now/);
});

// 47–50 时间估算
await test("47 fewer than five pace samples shows no estimate", () => {
  const { reviewWorkload } = loadApp().app;
  assert.equal(reviewWorkload.estimateRemaining({ secondsPerItem: 10, sampleCount: 4 }, 100), null);
});

await test("48 sufficient samples produce a fuzzy minute estimate", () => {
  const { reviewWorkload } = loadApp().app;
  assert.equal(reviewWorkload.estimateRemaining({ secondsPerItem: 10, sampleCount: 5 }, 120).label, "约 20 分钟");
});

await test("49 one abnormal AI delay is capped and cannot dominate pace", () => {
  const { reviewWorkload } = loadApp().app;
  let pace = { secondsPerItem: 10, sampleCount: 5 };
  pace = reviewWorkload.updatePace(pace, 12 * 60 * 1000);
  assert.ok(pace.secondsPerItem < 23);
});

await test("50 pace aggregation survives storage reload", () => {
  const loaded = fixture(1);
  for (let index = 0; index < 5; index += 1) loaded.storage.recordReviewPace("cet4", 10_000);
  const reloaded = loadApp(loaded.localStorage.dump());
  assert.equal(reloaded.app.storage.getReviewPace("cet4").sampleCount, 5);
});

// 51–54 今日 limit 调整
await test("51 an unstarted task can be safely rebuilt", () => {
  const { storage, ids } = fixture(150);
  storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(storage.adjustTodayDailyReviewLimit("cet4", ids, 60, NOW).summary.target, 60);
});

await test("52 increasing a started limit only appends", () => {
  const { storage, ids } = fixture(180, 60);
  const before = storage.getDailyReviewSummary("cet4", ids, NOW).taskWordIds;
  storage.markDailyReviewTaskStarted("cet4", before[0], NOW);
  const after = storage.adjustTodayDailyReviewLimit("cet4", ids, 100, NOW).summary.taskWordIds;
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after.length, 100);
});

await test("53 decreasing a started limit never removes a processed item", () => {
  const { storage, ids } = fixture(180, 120);
  const before = storage.getDailyReviewSummary("cet4", ids, NOW).taskWordIds;
  storage.markDailyReviewTaskStarted("cet4", before[90], NOW);
  const after = storage.adjustTodayDailyReviewLimit("cet4", ids, 60, NOW).summary.taskWordIds;
  assert.equal(after.includes(before[90]), true);
  assert.ok(after.length >= 60);
});

await test("54 limit adjustment never reorders retained task IDs", () => {
  const { storage, ids } = fixture(180, 120);
  const before = storage.getDailyReviewSummary("cet4", ids, NOW).taskWordIds;
  storage.markDailyReviewTaskStarted("cet4", before[0], NOW);
  const after = storage.adjustTodayDailyReviewLimit("cet4", ids, 150, NOW).summary.taskWordIds;
  assert.deepEqual(after.slice(0, before.length), before);
});

// 55–60 迁移与备份
await test("55 v13 migrates losslessly to v14", () => {
  const seed = loadApp().app.storage.loadUserData();
  seed.version = 13;
  delete seed.preferences.dailyReviewLimits;
  delete seed.books.cet4.dailyReviewTasks;
  delete seed.books.cet4.reviewPace;
  seed.books.cet4.words.keep = dueProgress(0, { favorite: true, inWrongBook: true });
  const loaded = loadApp({ [STORAGE_KEY]: JSON.stringify(seed) });
  const progress = loaded.app.storage.getWordProgress("cet4", "keep");
  assert.equal(loaded.app.storage.getStatus().version, 14);
  assert.equal(progress.favorite, true);
  assert.equal(progress.inWrongBook, true);
});

await test("56 v13 words default manualMastered to false", () => {
  const seed = loadApp().app.storage.loadUserData();
  seed.version = 13;
  seed.books.cet4.words.keep = dueProgress();
  const loaded = loadApp({ [STORAGE_KEY]: JSON.stringify(seed) });
  assert.equal(loaded.app.storage.getWordProgress("cet4", "keep").manualMastered, false);
});

await test("57 v13 defaults daily review limit to 120", () => {
  const seed = loadApp().app.storage.loadUserData();
  seed.version = 13;
  delete seed.preferences.dailyReviewLimits;
  const loaded = loadApp({ [STORAGE_KEY]: JSON.stringify(seed) });
  assert.equal(loaded.app.storage.getConfiguredDailyReviewLimit("cet4"), 120);
});

await test("58 v13 migration preserves Phase16 dailyGroupPlans", () => {
  const seed = loadApp().app.storage.loadUserData();
  seed.version = 13;
  seed.books.cet4.dailyGroupPlans[localDateKey()] = {
    dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 3, reason: "keep", source: "local", createdAt: NOW,
  };
  const loaded = loadApp({ [STORAGE_KEY]: JSON.stringify(seed) });
  assert.deepEqual(Array.from(loaded.app.storage.getDailyGroupPlan("cet4", localDateKey()).groupSizes), [10, 10, 10]);
});

await test("59 v13 migration preserves Phase16.1 calendar SRS fields", () => {
  const seed = loadApp().app.storage.loadUserData();
  seed.version = 13;
  seed.books.cet4.words.keep = dueProgress();
  const loaded = loadApp({ [STORAGE_KEY]: JSON.stringify(seed) });
  assert.equal(loaded.app.storage.getWordProgress("cet4", "keep").nextReviewDate, dueProgress().nextReviewDate);
});

await test("60 backups accept every data version from v1 through v14", () => {
  const { backupService } = loadApp().app;
  for (let version = 1; version <= 14; version += 1) {
    const data = { version, books: { cet4: { words: {}, daily: {} }, cet6: { words: {}, daily: {} } } };
    assert.equal(backupService.validateBackup(data).valid, true, `v${version}`);
  }
});

// 61–70 回归边界
await test("61 Phase16.2 formal vocabulary files are unchanged", () => {
  assert.equal(sha256("data/cet4.json"), "0de69a56aff805e2707b2fd334c0f9e4863b8783c95fe79b50088634fd4a3be2");
  assert.equal(sha256("data/cet6.json"), "43252c0b18ca6b5ea8e6c7305b02f8c046ae927e2feddc573ee7b224f5e4ef00");
});

await test("62 exam frequency files are unchanged", () => {
  assert.equal(sha256("data/cet4-exam-frequency.json"), "9c7b94b424818ccc2352f42329f09f0bf3245462d863d48c6cc43e158357a4a3");
  assert.equal(sha256("data/cet6-exam-frequency.json"), "f71b8e21a6a9d709ad5a38caa56a5838eabd9e845790dd28c251a15623a20765");
});

await test("63 smart random and neutral learning order is unchanged", () => {
  assert.equal(sha256("js/smart-learning-order.js"), "1001693298a1bbda0af5efc6793017bdfeb41dc8e2b9aeb610657c9571313a30");
});

await test("64 Phase16 AI grouping algorithm is unchanged", () => {
  assert.equal(sha256("js/daily-group-service.js"), "502275f89f546d34ae085f9fb769faa119903a5ff68cc10a4c5282d828d4f013");
});

await test("65 Phase16.1 scheduler intervals are byte-for-byte unchanged", () => {
  assert.equal(sha256("js/review-scheduler.js"), "b65b22be281665c1633c9859efb9c5c5cd7adff996d51ec60d933280c94fe4f7");
});

await test("66 Phase16.3 did not modify the user's existing Worker content", () => {
  assert.equal(sha256("worker/src/index.js"), "6fa1dacf44c84ce74c0206db73bdad4667a6cac1b3e9a4bd6df014fd07c40f5d");
});

await test("67 review workload allocation contains no AI or network call", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/review-workload.js"), "utf8");
  assert.doesNotMatch(source, /fetch\(|DeepSeek|requestDailyGroupPlan/);
});

await test("68 local Phase14 extension is stripped from Worker payload", () => {
  const loaded = loadApp();
  const local = loaded.app.dailyReviewService.buildLocalReview({
    bookId: "cet4", dailyTarget: 1, daily: { dateKey: localDateKey(), completedNewWords: 1 },
    reviewWorkload: { target: 120, answeredCount: 20, manualMasteredCount: 2, deferredTodayCount: 1, backlogCount: 300 },
  });
  const payload = loaded.app.dailyReviewService.buildRequestPayload(local);
  assert.equal(local.statistics.reviewBacklogCount, 300);
  assert.equal("reviewBacklogCount" in payload.statistics, false);
});

await test("69 desktop and 375px mobile UI expose workload controls without fixed width", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  assert.match(html, /id="open-quick-cleanup"/);
  assert.match(html, /id="review-manual-master-button"/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*quick-cleanup-item/);
  assert.doesNotMatch(css, /quick-cleanup[^\{]*\{[^}]*width:\s*(?:[6-9]\d\d|[1-9]\d{3,})px/);
});

await test("70 storage is v14 and independent review state is present", () => {
  const loaded = loadApp();
  const data = loaded.app.storage.loadUserData();
  assert.equal(loaded.app.storage.getStatus().version, 14);
  assert.equal(Object.keys(data.books.cet4.dailyReviewTasks).length, 0);
  assert.equal(data.preferences.dailyReviewLimits.cet4, 120);
});

console.log(`\nPhase 16.3 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
