import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

process.env.TZ = "Asia/Shanghai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function dueProgress(index = 0) {
  const level = (index % 4) + 1;
  return {
    learned: true,
    correctCount: 8 + (index % 4),
    partialCount: index % 2,
    wrongCount: index % 3,
    consecutiveCorrect: 1,
    masteryLevel: level,
    reviewCount: 2,
    favorite: index % 11 === 0,
    inWrongBook: index % 13 === 0,
    lastStudyTime: NOW - 20 * DAY,
    lastWrongTime: null,
    lastReviewTime: NOW - 20 * DAY,
    nextReviewTime: null,
    nextReviewDate: localDateKey(NOW - (index % 8) * DAY),
    lastLongTermAnchorAt: NOW - 30 * DAY,
    earliestReviewAt: level === 1 ? NOW - DAY : null,
    firstLearnDate: "2026-07-01",
    manualMastered: false,
    manualMasteredAt: null,
  };
}

function createSegmentFixture({ count = 180, target = 150, handled = 40, acknowledged = 1 } = {}) {
  const loaded = loadApp();
  const data = loaded.app.storage.loadUserData();
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const id = `word-${String(index).padStart(3, "0")}`;
    ids.push(id);
    data.books.cet4.words[id] = dueProgress(index);
  }
  loaded.app.storage.saveUserData(data);
  loaded.app.storage.setDailyReviewLimit("cet4", target);
  const initial = loaded.app.storage.getDailyReviewSummary("cet4", ids, NOW);
  const stored = loaded.app.storage.loadUserData();
  const task = stored.books.cet4.dailyReviewTasks[localDateKey()];
  task.completedWordIds = initial.taskWordIds.slice(0, handled);
  task.startedWordIds = [...task.completedWordIds];
  task.manualMasteredWordIds = [];
  task.deferredTodayWordIds = [];
  task.acknowledgedSegmentCount = acknowledged;
  task.breakStartedAt = null;
  loaded.app.storage.saveUserData(stored);
  return { ...loaded, storage: loaded.app.storage, ids };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

await test("01 segment page exposes the requested four actions in order", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const ids = [
    "review-segment-start-break",
    "review-segment-continue",
    "review-segment-quick-cleanup",
    "review-segment-stop",
  ];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /id="review-segment-quick-cleanup"[^>]*>⚡ 快速清理简单词<\/button>/);
});

await test("02 cleanup is secondary and reuses the only existing dialog", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /class="secondary-button review-segment-cleanup" id="review-segment-quick-cleanup"/);
  assert.equal((html.match(/id="quick-cleanup-dialog"/g) || []).length, 1);
});

await test("03 segment page has live handled-category, remaining and backlog fields", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ["answered", "manual-mastered", "deferred", "remaining", "backlog"]) {
    assert.match(html, new RegExp(`id="review-segment-${id}"`));
  }
});

await test("04 candidates prioritize the unhandled current task and exclude handled words", () => {
  const { storage, ids } = createSegmentFixture();
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  const candidates = storage.getQuickCleanupCandidates("cet4", ids, NOW).map((entry) => entry.wordId);
  assert.deepEqual(candidates, summary.pendingTaskWordIds.slice(0, 20));
  assert.equal(candidates.some((id) => summary.handledWordIds.includes(id)), false);
});

await test("05 a short task remainder is filled from backlog, never already-handled task words", () => {
  const { storage, ids } = createSegmentFixture({ handled: 140, acknowledged: 6 });
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  const candidates = storage.getQuickCleanupCandidates("cet4", ids, NOW).map((entry) => entry.wordId);
  assert.deepEqual(candidates.slice(0, 10), summary.pendingTaskWordIds);
  assert.deepEqual(candidates.slice(10), summary.outsideBacklogWords.slice(0, 10).map((entry) => entry.wordId));
  assert.equal(candidates.some((id) => summary.handledWordIds.includes(id)), false);
});

await test("06 every cleanup list remains capped at 20 candidates", () => {
  const { storage, ids } = createSegmentFixture({ count: 300 });
  assert.equal(storage.getQuickCleanupCandidates("cet4", ids, NOW).length, 20);
});

await test("07 40/150 plus eight manual masteries becomes 48/150 immediately", () => {
  const { storage, ids } = createSegmentFixture();
  const selected = storage.getQuickCleanupCandidates("cet4", ids, NOW).slice(0, 8).map((entry) => entry.wordId);
  storage.markWordsManualMastered("cet4", selected, { now: NOW });
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.handledCount, 48);
  assert.equal(summary.target, 150);
  assert.equal(summary.answeredCount, 40);
  assert.equal(summary.manualMasteredCount, 8);
  assert.equal(summary.remainingCount, 102);
  assert.equal(summary.backlogCount, 30);
});

await test("08 manual cleanup changes neither answer statistics nor correctness", () => {
  const { storage, ids } = createSegmentFixture();
  const selected = storage.getQuickCleanupCandidates("cet4", ids, NOW).slice(0, 8).map((entry) => entry.wordId);
  const beforeStats = storage.getDailyStats("cet4", localDateKey());
  const beforeCorrect = selected.map((id) => storage.getWordProgress("cet4", id).correctCount);
  storage.markWordsManualMastered("cet4", selected, { now: NOW });
  const afterStats = storage.getDailyStats("cet4", localDateKey());
  assert.equal(afterStats.answerCount, beforeStats.answerCount);
  assert.deepEqual(selected.map((id) => storage.getWordProgress("cet4", id).correctCount), beforeCorrect);
  assert.equal(afterStats.manualMasteredWordIds.length, 8);
});

await test("09 opening or applying cleanup does not start the three-minute break", () => {
  const { storage, ids } = createSegmentFixture();
  const selected = storage.getQuickCleanupCandidates("cet4", ids, NOW).slice(0, 8).map((entry) => entry.wordId);
  storage.markWordsManualMastered("cet4", selected, { now: NOW });
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.breakStartedAt, null);
  assert.equal(summary.pendingBreak, true);
});

await test("10 crossing 60 while cleaning stays on the current opportunity and advances the future node to 80", () => {
  const { storage, ids } = createSegmentFixture();
  const first20 = storage.getQuickCleanupCandidates("cet4", ids, NOW).map((entry) => entry.wordId);
  storage.markWordsManualMastered("cet4", first20, { now: NOW });
  const next2 = storage.getQuickCleanupCandidates("cet4", ids, NOW).slice(0, 2).map((entry) => entry.wordId);
  storage.markWordsManualMastered("cet4", next2, { now: NOW });
  let summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.handledCount, 62);
  assert.equal(summary.pendingBreak, true);
  assert.equal(summary.completedSegmentCount, 3);
  storage.continueDailyReviewTask("cet4", NOW);
  summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.pendingBreak, false);
  assert.equal(summary.segmentHandledCount, 2);
  const data = storage.loadUserData();
  const task = data.books.cet4.dailyReviewTasks[localDateKey()];
  const next18 = summary.pendingTaskWordIds.slice(0, 18);
  task.completedWordIds.push(...next18);
  task.startedWordIds.push(...next18);
  storage.saveUserData(data);
  summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.handledCount, 80);
  assert.equal(summary.pendingBreak, true);
});

await test("11 145/150 plus five masteries completes formal review and unlocks intro", () => {
  const { app, storage, ids } = createSegmentFixture({ handled: 145, acknowledged: 6 });
  const summaryBefore = storage.getDailyReviewSummary("cet4", ids, NOW);
  storage.markWordsManualMastered("cet4", summaryBefore.pendingTaskWordIds, { now: NOW });
  const summary = storage.getDailyReviewSummary("cet4", ids, NOW);
  assert.equal(summary.handledCount, 150);
  assert.equal(summary.remainingCount, 0);
  assert.equal(summary.pendingBreak, false);
  const queue = app.newWordLearning.buildNormalQueue({
    dueItems: summary.dueWords,
    recoveryItems: [],
    pendingItems: [],
    introItems: [{ wordId: "new-word", taskType: "new" }],
    currentSequence: 0,
    dateKey: localDateKey(),
    now: NOW,
  });
  assert.equal(queue[0].taskType, "new");
});

await test("12 batch undo restores task, SRS, Recovery and daily statistics exactly", () => {
  const { app, storage, ids } = createSegmentFixture();
  const selected = storage.getQuickCleanupCandidates("cet4", ids, NOW).slice(0, 2).map((entry) => entry.wordId);
  const data = storage.loadUserData();
  data.books.cet4.reviewRecovery[selected[0]] = app.reviewRecovery.createRecovery({
    sourceReviewResult: "wrong", currentLevel: 2, sessionId: "phase16-3-1", now: NOW,
  });
  storage.saveUserData(data);
  const beforeBook = storage.loadUserData().books.cet4;
  const beforeProgress = selected.map((id) => beforeBook.words[id]);
  const beforeRecovery = beforeBook.reviewRecovery[selected[0]];
  const beforeTask = beforeBook.dailyReviewTasks[localDateKey()];
  const beforeStats = storage.getDailyStats("cet4", localDateKey());
  const result = storage.markWordsManualMastered("cet4", selected, { now: NOW });
  assert.equal(storage.undoManualMasteryBatch(result.undoEntries), 2);
  const afterBook = storage.loadUserData().books.cet4;
  assert.deepEqual(selected.map((id) => afterBook.words[id]), beforeProgress);
  assert.deepEqual(afterBook.reviewRecovery[selected[0]], beforeRecovery);
  assert.deepEqual(afterBook.dailyReviewTasks[localDateKey()], beforeTask);
  assert.deepEqual(storage.getDailyStats("cet4", localDateKey()), beforeStats);
});

await test("13 segment controller refreshes the same page unless remaining reaches zero", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /applyReviewSegmentQuickCleanup[\s\S]*remainingCount === 0[\s\S]*showReviewSegmentComplete\(session\.book\)/);
  assert.match(source, /applyReviewSegmentQuickCleanup[\s\S]*renderQuestion\(\)/);
  assert.match(source, /session\.questions\.filter\(\(question\) => !selected\.has\(question\.word\.word\)\)/);
  assert.doesNotMatch(source, /index <= session\.currentIndex \|\| !selected\.has/);
  assert.doesNotMatch(source, /openReviewSegmentQuickCleanup\(\)[\s\S]{0,350}startReviewBreak/);
});

await test("14 app routes segment entry, confirmation and undo through Phase16.3 implementations", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.match(source, /handleOpenReviewSegmentQuickCleanup[\s\S]*openQuickCleanupDialog/);
  assert.match(source, /confirmQuickCleanup\(\)[\s\S]*storage\.markWordsManualMastered/);
  assert.match(source, /onAction:[\s\S]*storage\.undoManualMasteryBatch/);
  assert.match(source, /closeQuickCleanupDialog[\s\S]*applyReviewSegmentQuickCleanup/);
});

await test("15 mobile layout keeps actions touch-sized and fluid at 375px", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*review-segment-card \.group-complete-actions button[\s\S]*min-height:\s*52px/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*review-segment-stats[\s\S]*width:\s*100%/);
  assert.match(css, /\.quick-cleanup-dialog\s*\{[\s\S]*width:\s*min\(calc\(100% - 28px\), 560px\)/);
  assert.doesNotMatch(css, /review-segment-cleanup[^\{]*\{[^}]*min-width:\s*[4-9]\d\dpx/);
});

await test("16 protected learning, SRS, Worker and vocabulary files remain unchanged", () => {
  const expected = {
    "worker/src/index.js": "6fa1dacf44c84ce74c0206db73bdad4667a6cac1b3e9a4bd6df014fd07c40f5d",
    "js/review-scheduler.js": "b65b22be281665c1633c9859efb9c5c5cd7adff996d51ec60d933280c94fe4f7",
    "js/review-recovery.js": "050a8dff4e21b9be018f7631610cde9ef8c39e47fa97bd08f628f9e17c91bf05",
    "js/daily-group-service.js": "502275f89f546d34ae085f9fb769faa119903a5ff68cc10a4c5282d828d4f013",
    "js/smart-learning-order.js": "1001693298a1bbda0af5efc6793017bdfeb41dc8e2b9aeb610657c9571313a30",
    "js/new-word-learning.js": "5dd8cbdd1ceddfeb438fd6a496c0f1dcf408a0b74d4a398bf19c255563733cf4",
    "data/cet4.json": "0de69a56aff805e2707b2fd334c0f9e4863b8783c95fe79b50088634fd4a3be2",
    "data/cet6.json": "43252c0b18ca6b5ea8e6c7305b02f8c046ae927e2feddc573ee7b224f5e4ef00",
    "data/cet4-exam-frequency.json": "9c7b94b424818ccc2352f42329f09f0bf3245462d863d48c6cc43e158357a4a3",
    "data/cet6-exam-frequency.json": "f71b8e21a6a9d709ad5a38caa56a5838eabd9e845790dd28c251a15623a20765",
  };
  Object.entries(expected).forEach(([file, hash]) => assert.equal(sha256(file), hash, file));
  assert.match(fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8"), /const DATA_VERSION = 14;/);
});

console.log(`\nPhase 16.3.1 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
