import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

process.env.TZ = "Asia/Shanghai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE_KEY = "cetwords-user-data-v1";
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
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
  };
}

function loadApp(initialStorage = {}) {
  const localStorage = createLocalStorage(initialStorage);
  const window = { CETWords: {}, localStorage, fetch: () => Promise.reject(new Error("not mocked")) };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout,
  });
  [
    "js/review-scheduler.js", "js/smart-learning-order.js", "js/review-recovery.js",
    "js/new-word-learning.js", "js/daily-group-service.js", "js/storage.js", "js/backup-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

function localTime(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function legacyData(version = 12) {
  const emptyBook = () => ({
    words: {}, daily: {}, newWordQueue: [], smartNewWordQueue: {}, newWordLearning: {},
    reviewRecovery: {}, dailyReviews: {}, dailyGroupPlans: {},
  });
  return {
    version,
    currentBook: "cet4",
    preferences: {
      dailyNewWordGoals: { cet4: 30, cet6: 40 },
      vocabularyScope: { cet4: "core", cet6: "all" },
      studyMode: "en-to-zh",
      learningOrder: "smart",
      aiJudge: { enabled: false, proxyUrl: "" },
    },
    books: { cet4: emptyBook(), cet6: emptyBook() },
  };
}

function learnedProgress(level, schedule, anchor) {
  return {
    learned: true,
    correctCount: 8,
    partialCount: 0,
    wrongCount: 2,
    consecutiveCorrect: 2,
    masteryLevel: level,
    reviewCount: 3,
    favorite: false,
    inWrongBook: false,
    lastStudyTime: anchor,
    lastWrongTime: null,
    lastReviewTime: anchor,
    firstLearnDate: "2026-08-01",
    ...schedule,
  };
}

function seedWord(loaded, wordId, progress) {
  const data = loaded.app.storage.loadUserData();
  data.books.cet4.words[wordId] = progress;
  loaded.app.storage.saveUserData(data);
}

const loaded = loadApp();
const { reviewScheduler, reviewRecovery, newWordLearning } = loaded.app;
const anchor = localTime(2026, 8, 14, 21, 30);

for (const [level, expectedDate] of [
  [1, "2026-08-15"],
  [2, "2026-08-17"],
  [3, "2026-08-21"],
  [4, "2026-08-29"],
  [5, "2026-09-13"],
]) {
  await test(`L${level} schedules the required local calendar date`, () => {
    const schedule = reviewScheduler.getNextReviewSchedule(level, anchor);
    assert.equal(schedule.nextReviewDate, expectedDate);
    assert.equal(schedule.nextReviewTime, null);
    assert.match(schedule.nextReviewDate, /^\d{4}-\d{2}-\d{2}$/);
  });
}

await test("L5 formal correct remains L5 and creates a fresh +30-day date", () => {
  const before = learnedProgress(5, reviewScheduler.getNextReviewSchedule(5, localTime(2026, 7, 15)), localTime(2026, 7, 15));
  const result = reviewScheduler.handleCorrect(before, true, { now: anchor, isNew: false });
  assert.equal(result.masteryLevel, 5);
  assert.equal(result.nextReviewDate, "2026-09-13");
  assert.equal(result.lastLongTermAnchorAt, anchor);
});

await test("L2-L5 are due from midnight on their target calendar date", () => {
  for (const level of [2, 3, 4, 5]) {
    const schedule = reviewScheduler.getNextReviewSchedule(level, anchor);
    const dueAtMidnight = localTime(
      Number(schedule.nextReviewDate.slice(0, 4)),
      Number(schedule.nextReviewDate.slice(5, 7)),
      Number(schedule.nextReviewDate.slice(8, 10)),
    );
    assert.equal(reviewScheduler.isDueForReview({ learned: true, masteryLevel: level, ...schedule }, dueAtMidnight), true);
  }
});

await test("L2-L5 do not retain or depend on the original learning time", () => {
  const late = localTime(2026, 8, 14, 23, 55);
  const schedule = reviewScheduler.getNextReviewSchedule(2, late);
  assert.equal(schedule.earliestReviewAt, null);
  assert.equal(reviewScheduler.isDueForReview({ learned: true, masteryLevel: 2, ...schedule }, localTime(2026, 8, 17, 0, 0)), true);
});

await test("L1 crossing midnight without six hours is not due", () => {
  const start = localTime(2026, 8, 14, 23, 55);
  const progress = { learned: true, masteryLevel: 1, ...reviewScheduler.getNextReviewSchedule(1, start) };
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 15, 0, 10)), false);
});

await test("L1 is due after both the date boundary and six-hour protection", () => {
  const start = localTime(2026, 8, 14, 23, 55);
  const progress = { learned: true, masteryLevel: 1, ...reviewScheduler.getNextReviewSchedule(1, start) };
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 15, 5, 55)), true);
});

await test("L1 remains unavailable on the same date even after six hours", () => {
  const start = localTime(2026, 8, 14, 8, 0);
  const progress = { learned: true, masteryLevel: 1, ...reviewScheduler.getNextReviewSchedule(1, start) };
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 14, 20, 0)), false);
});

await test("23:55 to next-day 05:54/05:55 observes the exact L1 boundary", () => {
  const start = localTime(2026, 8, 14, 23, 55);
  const progress = { learned: true, masteryLevel: 1, ...reviewScheduler.getNextReviewSchedule(1, start) };
  assert.equal(progress.earliestReviewAt, localTime(2026, 8, 15, 5, 55));
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 15, 5, 54)), false);
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 15, 5, 55)), true);
});

await test("yesterday 20:00 L1 is due today at 08:00", () => {
  const start = localTime(2026, 8, 13, 20, 0);
  const progress = { learned: true, masteryLevel: 1, ...reviewScheduler.getNextReviewSchedule(1, start) };
  assert.equal(reviewScheduler.isDueForReview(progress, localTime(2026, 8, 14, 8, 0)), true);
});

await test("all 80 words learned yesterday at 20:00 enter today's due candidates", () => {
  const start = localTime(2026, 8, 13, 20, 0);
  const schedule = reviewScheduler.getNextReviewSchedule(1, start);
  const records = Array.from({ length: 80 }, (_, index) => ({
    wordId: `word-${index}`,
    progress: { learned: true, masteryLevel: 1, ...schedule },
  }));
  assert.equal(reviewScheduler.getDueWords(records, localTime(2026, 8, 14, 8, 0)).length, 80);
});

await test("L0 keeps its exact ten-minute timestamp", () => {
  const schedule = reviewScheduler.getNextReviewSchedule(0, anchor);
  assert.equal(schedule.nextReviewTime, anchor + 10 * MINUTE);
  assert.equal(schedule.nextReviewDate, null);
  const progress = { learned: true, masteryLevel: 0, ...schedule };
  assert.equal(reviewScheduler.isDueForReview(progress, anchor + 10 * MINUTE - 1), false);
  assert.equal(reviewScheduler.isDueForReview(progress, anchor + 10 * MINUTE), true);
});

await test("new-word reinforcement random windows remain unchanged", () => {
  const low = newWordLearning.calculateReinforcementSchedule({
    phase: newWordLearning.LEARNING_PHASES.INTRO, correct: true, currentSequence: 3, now: anchor, random: () => 0,
  });
  const high = newWordLearning.calculateReinforcementSchedule({
    phase: newWordLearning.LEARNING_PHASES.INTRO, correct: true, currentSequence: 3, now: anchor, random: () => 0.999999,
  });
  assert.deepEqual([low.questionGap, low.minDelayMs], [10, 2 * MINUTE]);
  assert.deepEqual([high.questionGap, high.minDelayMs], [18, 4 * MINUTE]);
});

await test("choice_retry phase and its precise window remain unchanged", () => {
  const record = newWordLearning.createPendingRecord({
    introStudyMode: "en-to-zh", introCorrect: false, now: anchor, dateKey: "2026-08-14", sequence: 7, random: () => 0,
  });
  assert.equal(record.phase, newWordLearning.LEARNING_PHASES.CHOICE_RETRY);
  assert.equal(record.questionGap, 5);
  assert.equal(record.minDelayMs, 90 * 1000);
});

await test("Recovery random windows remain exact-time and unchanged", () => {
  const first = reviewRecovery.calculateRecoverySchedule(1, { sequence: 2, now: anchor, random: () => 0 });
  const third = reviewRecovery.calculateRecoverySchedule(3, { sequence: 2, now: anchor, random: () => 0.999999 });
  assert.deepEqual([first.questionGap, first.minDelayMs], [3, 45 * 1000]);
  assert.deepEqual([third.questionGap, third.minDelayMs], [12, 180 * 1000]);
});

await test("formal partial enters Recovery with every future schedule field cleared", () => {
  const appLoad = loadApp();
  const original = learnedProgress(4, reviewScheduler.getNextReviewSchedule(4, localTime(2026, 7, 30)), localTime(2026, 7, 30));
  seedWord(appLoad, "partial", original);
  const result = appLoad.app.storage.updateWordProgress("cet4", "partial", false, {
    timestamp: anchor, judgement: "partial", taskType: "review", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.FORMAL_REVIEW_PHASE, studySessionId: "partial-session", random: () => 0,
  });
  assert.equal(result.recoveryState.active, true);
  assert.deepEqual(
    [result.progress.nextReviewTime, result.progress.nextReviewDate, result.progress.lastLongTermAnchorAt, result.progress.earliestReviewAt],
    [null, null, null, null],
  );
});

await test("formal wrong changes Level once but does not pre-schedule behind Recovery", () => {
  const appLoad = loadApp();
  seedWord(appLoad, "wrong", learnedProgress(4, reviewScheduler.getNextReviewSchedule(4, localTime(2026, 7, 30)), localTime(2026, 7, 30)));
  const result = appLoad.app.storage.updateWordProgress("cet4", "wrong", false, {
    timestamp: anchor, judgement: "wrong", taskType: "review", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.FORMAL_REVIEW_PHASE, studySessionId: "wrong-session", random: () => 0,
  });
  assert.equal(result.progress.masteryLevel, 2);
  assert.equal(result.progress.nextReviewDate, null);
  assert.equal(result.recoveryState.currentLevel, 2);
});

await test("Recovery correct creates a new date from the current Level and current time", () => {
  const appLoad = loadApp();
  seedWord(appLoad, "recover-l2", learnedProgress(4, reviewScheduler.getNextReviewSchedule(4, localTime(2026, 7, 30)), localTime(2026, 7, 30)));
  appLoad.app.storage.updateWordProgress("cet4", "recover-l2", false, {
    timestamp: anchor, judgement: "wrong", taskType: "review", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.FORMAL_REVIEW_PHASE, studySessionId: "recover-session", random: () => 0,
  });
  const recoveryTime = localTime(2026, 8, 15, 9, 0);
  const result = appLoad.app.storage.updateWordProgress("cet4", "recover-l2", true, {
    timestamp: recoveryTime, judgement: "correct", taskType: "recovery", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.RECOVERY_PHASE, studySessionId: "recover-session", random: () => 0,
  });
  assert.equal(result.progress.masteryLevel, 2);
  assert.equal(result.progress.nextReviewDate, "2026-08-18");
  assert.equal(result.progress.lastLongTermAnchorAt, recoveryTime);
  assert.equal(result.progress.earliestReviewAt, null);
});

await test("Recovery ending at L1 creates next-day date plus six-hour protection", () => {
  const appLoad = loadApp();
  seedWord(appLoad, "recover-l1", learnedProgress(3, reviewScheduler.getNextReviewSchedule(3, localTime(2026, 8, 7)), localTime(2026, 8, 7)));
  appLoad.app.storage.updateWordProgress("cet4", "recover-l1", false, {
    timestamp: anchor, judgement: "wrong", taskType: "review", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.FORMAL_REVIEW_PHASE, studySessionId: "l1-session", random: () => 0,
  });
  const recoveryTime = localTime(2026, 8, 14, 23, 55);
  const result = appLoad.app.storage.updateWordProgress("cet4", "recover-l1", true, {
    timestamp: recoveryTime, judgement: "correct", taskType: "recovery", sessionMode: "review",
    learningPhase: appLoad.app.reviewRecovery.RECOVERY_PHASE, studySessionId: "l1-session", random: () => 0,
  });
  assert.equal(result.progress.masteryLevel, 1);
  assert.equal(result.progress.nextReviewDate, "2026-08-15");
  assert.equal(result.progress.earliestReviewAt, localTime(2026, 8, 15, 5, 55));
});

await test("month-end calendar addition is correct", () => {
  assert.equal(reviewScheduler.addLocalCalendarDays(localTime(2026, 1, 31, 22), 3), "2026-02-03");
});

await test("leap-year calendar addition is correct", () => {
  assert.equal(reviewScheduler.addLocalCalendarDays(localTime(2028, 2, 28, 22), 1), "2028-02-29");
  assert.equal(reviewScheduler.addLocalCalendarDays(localTime(2028, 2, 29, 22), 1), "2028-03-01");
});

await test("year-end calendar addition is correct", () => {
  assert.equal(reviewScheduler.addLocalCalendarDays(localTime(2026, 12, 31, 23, 55), 1), "2027-01-01");
});

await test("local date keys do not use the UTC cutover date", () => {
  const afterLocalMidnight = Date.parse("2026-08-14T16:30:00.000Z");
  assert.equal(new Date(afterLocalMidnight).toISOString().slice(0, 10), "2026-08-14");
  assert.equal(reviewScheduler.getLocalDateKey(afterLocalMidnight), "2026-08-15");
  assert.equal(reviewScheduler.getNextReviewSchedule(1, afterLocalMidnight).nextReviewDate, "2026-08-16");
});

await test("v12 to v13 preserves the old target's local date", () => {
  const data = legacyData(12);
  const oldTarget = localTime(2026, 8, 15, 21, 30);
  data.books.cet4.words.keep = { learned: true, masteryLevel: 3, nextReviewTime: oldTarget, lastReviewTime: anchor };
  const migrated = loadApp({ [STORAGE_KEY]: JSON.stringify(data) }).app.storage.loadUserData();
  assert.equal(migrated.version, 13);
  assert.equal(migrated.books.cet4.words.keep.nextReviewDate, "2026-08-15");
  assert.equal(migrated.books.cet4.words.keep.nextReviewTime, null);
});

await test("old L1 migration uses the most recent real study anchor", () => {
  const data = legacyData(12);
  const recentStudy = localTime(2026, 8, 14, 23, 55);
  data.books.cet4.words.keep = {
    learned: true, masteryLevel: 1, nextReviewTime: localTime(2026, 8, 15, 23, 55),
    lastReviewTime: localTime(2026, 8, 14, 20), lastStudyTime: recentStudy,
  };
  const progress = loadApp({ [STORAGE_KEY]: JSON.stringify(data) }).app.storage.loadUserData().books.cet4.words.keep;
  assert.equal(progress.lastLongTermAnchorAt, recentStudy);
  assert.equal(progress.earliestReviewAt, localTime(2026, 8, 15, 5, 55));
});

await test("old L1 without an anchor infers it from old target minus 24 hours", () => {
  const data = legacyData(12);
  const oldTarget = localTime(2026, 8, 15, 23, 55);
  data.books.cet4.words.keep = { learned: true, masteryLevel: 1, nextReviewTime: oldTarget };
  const progress = loadApp({ [STORAGE_KEY]: JSON.stringify(data) }).app.storage.loadUserData().books.cet4.words.keep;
  assert.equal(progress.lastLongTermAnchorAt, localTime(2026, 8, 14, 23, 55));
  assert.equal(progress.earliestReviewAt, localTime(2026, 8, 15, 5, 55));
});

await test("migrated L2-L5 are immediately due on the target date before the old clock time", () => {
  const data = legacyData(12);
  data.books.cet4.words.keep = { learned: true, masteryLevel: 2, nextReviewTime: localTime(2026, 8, 15, 21, 30), lastReviewTime: anchor };
  const appLoad = loadApp({ [STORAGE_KEY]: JSON.stringify(data) });
  assert.equal(appLoad.app.storage.getDueWords("cet4", ["keep"], localTime(2026, 8, 15, 8, 0)).length, 1);
});

await test("v12 migration preserves mastery, Recovery, daily reviews and Phase16 groups", () => {
  const data = legacyData(12);
  data.books.cet4.words.keep = { learned: true, masteryLevel: 4, nextReviewTime: localTime(2026, 8, 29, 20), favorite: true, inWrongBook: true };
  data.books.cet4.reviewRecovery.keep = reviewRecovery.createRecovery({ sourceReviewResult: "wrong", currentLevel: 4, sessionId: "old", now: anchor, random: () => 0 });
  data.books.cet4.dailyReviews["2026-08-13"] = {
    generatedAt: "2026-08-13T12:00:00.000Z", dailyTarget: 30, completedNewWords: 30,
    review: { summary: "保留", strengths: [], weaknesses: [], focusWords: [], tomorrowAdvice: [] },
  };
  data.books.cet4.dailyGroupPlans["2026-08-14"] = {
    dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 5, reason: "保留分组", source: "local", createdAt: anchor,
  };
  const migrated = loadApp({ [STORAGE_KEY]: JSON.stringify(data) }).app.storage.loadUserData();
  assert.equal(migrated.books.cet4.words.keep.masteryLevel, 4);
  assert.equal(migrated.books.cet4.words.keep.favorite, true);
  assert.equal(migrated.books.cet4.words.keep.inWrongBook, true);
  assert.equal(migrated.books.cet4.reviewRecovery.keep.active, true);
  assert.equal(migrated.books.cet4.dailyReviews["2026-08-13"].review.summary, "保留");
  assert.deepEqual(Array.from(migrated.books.cet4.dailyGroupPlans["2026-08-14"].groupSizes), [10, 10, 10]);
});

await test("v13 schedules stay identical across save and reload", () => {
  const first = loadApp();
  const schedule = reviewScheduler.getNextReviewSchedule(1, localTime(2026, 8, 14, 23, 55));
  seedWord(first, "stable", learnedProgress(1, schedule, schedule.lastLongTermAnchorAt));
  const before = first.app.storage.getWordProgress("cet4", "stable");
  const second = loadApp({ [STORAGE_KEY]: first.localStorage.getItem(STORAGE_KEY) });
  const after = second.app.storage.getWordProgress("cet4", "stable");
  assert.equal(after.nextReviewDate, before.nextReviewDate);
  assert.equal(after.lastLongTermAnchorAt, before.lastLongTermAnchorAt);
  assert.equal(after.earliestReviewAt, before.earliestReviewAt);
});

await test("ordinary practice cannot move an existing v13 long-term anchor", () => {
  const first = loadApp();
  const originalAnchor = localTime(2026, 8, 14, 8, 0);
  const schedule = reviewScheduler.getNextReviewSchedule(1, originalAnchor);
  seedWord(first, "practice-stable", learnedProgress(1, schedule, originalAnchor));
  first.app.storage.updateWordProgress("cet4", "practice-stable", true, {
    timestamp: localTime(2026, 8, 14, 20, 0), taskType: "practice", sessionMode: "wrong",
  });
  const progress = first.app.storage.getWordProgress("cet4", "practice-stable");
  assert.equal(progress.lastLongTermAnchorAt, originalAnchor);
  assert.equal(progress.earliestReviewAt, schedule.earliestReviewAt);
  assert.equal(progress.nextReviewDate, schedule.nextReviewDate);
});

await test("backup validation accepts every version from v1 through v13", () => {
  for (let version = 1; version <= 13; version += 1) {
    assert.equal(loaded.app.backupService.validateBackup(legacyData(version)).valid, true, `v${version}`);
  }
});

await test("natural-day overdue score increases by complete local dates", () => {
  const progress = { learned: true, masteryLevel: 3, nextReviewDate: "2026-08-11", earliestReviewAt: null };
  assert.equal(reviewScheduler.calculateReviewPriority(progress, localTime(2026, 8, 14, 0, 1)).overdueScore, 15);
});

await test("the due-review queue still has the highest normal-session priority", () => {
  const index = newWordLearning.selectNextItemIndex({
    items: [
      { wordId: "intro", learningPhase: newWordLearning.LEARNING_PHASES.INTRO },
      { wordId: "due", taskType: "review" },
    ],
    currentSequence: 0, dateKey: "2026-08-14", now: anchor,
  });
  assert.equal(index, 1);
});

await test("the scheduler uses calendar Date addition rather than UTC slicing or millisecond-day addition", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/review-scheduler.js"), "utf8");
  assert.match(source, /date\.setDate\(date\.getDate\(\) \+/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0, 10\)/);
});

console.log(`\nPhase 16.1 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
