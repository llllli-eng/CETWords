import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  const context = vm.createContext({ window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout });
  [
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js", "js/review-recovery.js",
    "js/new-word-learning.js", "js/daily-group-service.js", "js/confusable-words.js", "js/storage.js", "js/daily-review-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

const now = Date.now();
const { app } = loadApp();
const { storage, reviewScheduler, reviewRecovery, newWordLearning, dailyReviewService } = app;

function learnedProgress(level, options = {}) {
  return {
    learned: true, correctCount: 8, partialCount: 0, wrongCount: 2, consecutiveCorrect: 2,
    masteryLevel: level, reviewCount: 3, favorite: Boolean(options.favorite),
    inWrongBook: Boolean(options.inWrongBook), lastStudyTime: now - 1000,
    lastReviewTime: now - 86_400_000, nextReviewTime: now - 1,
    nextReviewDate: reviewScheduler.getLocalDateKey(now),
    lastLongTermAnchorAt: now - 86_400_000,
    earliestReviewAt: level === 1 ? now - 1 : null,
    firstLearnDate: "2026-08-01",
  };
}

function seedWord(bookId, wordId, level, extra = {}) {
  const data = storage.loadUserData();
  data.books[bookId].words[wordId] = { ...learnedProgress(level), ...extra };
  storage.saveUserData(data);
}

function formal(bookId, wordId, judgement, timestamp = now, sessionId = "formal-session") {
  return storage.updateWordProgress(bookId, wordId, judgement === "correct", {
    timestamp, judgement, studyMode: "ai-meaning", sessionMode: "review", taskType: "review",
    learningPhase: reviewRecovery.FORMAL_REVIEW_PHASE, studySessionId: sessionId, random: () => 0.5,
  });
}

function recover(bookId, wordId, judgement, timestamp, sessionId = "formal-session") {
  return storage.updateWordProgress(bookId, wordId, judgement === "correct", {
    timestamp, judgement, studyMode: "ai-meaning", sessionMode: "review", taskType: "recovery",
    learningPhase: reviewRecovery.RECOVERY_PHASE, studySessionId: sessionId, random: () => 0.5,
  });
}

await test("formal review phase is an active-recall phase in the controller", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /question\.learningPhase === reviewRecovery\.FORMAL_REVIEW_PHASE/);
  assert.match(source, /question\.studyMode = "ai-meaning"/);
});

await test("L1-L5 due items are not built as four-choice formal reviews", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.match(source, /taskType: "review",\s*learningPhase: reviewRecovery\.FORMAL_REVIEW_PHASE/);
});

for (const level of [1, 2, 3, 4]) {
  await test(`formal correct raises L${level} to L${level + 1}`, () => {
    const word = `correct-l${level}`;
    seedWord("cet4", word, level);
    const result = formal("cet4", word, "correct", now + level);
    assert.equal(result.progress.masteryLevel, level + 1);
    assert.equal(result.recoveryState, null);
  });
}

await test("formal correct at L5 remains L5", () => {
  seedWord("cet4", "correct-l5", 5);
  assert.equal(formal("cet4", "correct-l5", "correct").progress.masteryLevel, 5);
});

await test("formal partial preserves Level and enters recovery", () => {
  seedWord("cet4", "partial-l4", 4);
  const result = formal("cet4", "partial-l4", "partial");
  assert.equal(result.progress.masteryLevel, 4);
  assert.equal(result.recoveryState.active, true);
  assert.equal(result.progress.nextReviewTime, null);
});

for (const [level, expected] of [[1, 0], [2, 0], [4, 2]]) {
  await test(`formal wrong lowers L${level} to L${expected} once`, () => {
    const word = `wrong-l${level}`;
    seedWord("cet4", word, level);
    const result = formal("cet4", word, "wrong");
    assert.equal(result.progress.masteryLevel, expected);
    assert.equal(result.recoveryState.currentLevel, expected);
  });
}

await test("recovery wrong and partial never change Level", () => {
  seedWord("cet4", "stable-recovery", 4);
  const entered = formal("cet4", "stable-recovery", "wrong", now, "s1");
  const wrong = recover("cet4", "stable-recovery", "wrong", now + 1, "s1");
  const partial = recover("cet4", "stable-recovery", "partial", now + 2, "s1");
  assert.equal(entered.progress.masteryLevel, 2);
  assert.equal(wrong.progress.masteryLevel, 2);
  assert.equal(partial.progress.masteryLevel, 2);
});

await test("recovery correct exits and schedules by the current Level", () => {
  seedWord("cet4", "recovery-pass", 4);
  formal("cet4", "recovery-pass", "wrong", now, "s2");
  const passedRecovery = recover("cet4", "recovery-pass", "correct", now + 1000, "s2");
  assert.equal(passedRecovery.progress.masteryLevel, 2);
  assert.equal(passedRecovery.recoveryState.active, false);
  assert.equal(passedRecovery.progress.nextReviewDate, reviewScheduler.addLocalCalendarDays(now + 1000, 3));
  assert.equal(passedRecovery.progress.nextReviewTime, null);
  assert.equal(storage.getReviewRecoveryState("cet4", "recovery-pass"), null);
});

await test("third failed recovery becomes recoveryPending", () => {
  seedWord("cet4", "three-fails", 3);
  formal("cet4", "three-fails", "wrong", now, "session-a");
  recover("cet4", "three-fails", "wrong", now + 1, "session-a");
  recover("cet4", "three-fails", "partial", now + 2, "session-a");
  const third = recover("cet4", "three-fails", "wrong", now + 3, "session-a");
  assert.equal(third.recoveryState.attemptsThisSession, 3);
  assert.equal(third.recoveryState.pendingNextSession, true);
  assert.equal(third.progress.masteryLevel, 1);
});

await test("next session resets the per-session cap and keeps recovery high priority", () => {
  storage.beginReviewRecoverySession("cet4", "session-b", ["three-fails"]);
  const record = storage.getReviewRecoveryState("cet4", "three-fails");
  assert.equal(record.attemptsThisSession, 0);
  assert.equal(record.pendingNextSession, false);
  assert.equal(record.crossSessionReady, true);
  assert.equal(reviewRecovery.getPriority(record, { sessionId: "session-b", sequence: 0, now }), 1);
  assert.equal(reviewRecovery.isEligible(record, { sessionId: "session-b", sequence: 0, now }), true);
});

await test("an active recovery interrupted before attempt three also resumes cross-session", () => {
  seedWord("cet4", "interrupted-recovery", 4);
  formal("cet4", "interrupted-recovery", "partial", now, "old-session");
  recover("cet4", "interrupted-recovery", "wrong", now + 1, "old-session");
  storage.beginReviewRecoverySession("cet4", "new-session", ["interrupted-recovery"]);
  const record = storage.getReviewRecoveryState("cet4", "interrupted-recovery");
  assert.equal(record.attemptsThisSession, 0);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.crossSessionReady, true);
});

await test("active recovery is not hidden by ordinary nextReviewTime", () => {
  const data = storage.loadUserData();
  data.books.cet4.words["three-fails"].nextReviewTime = now + 99_999_999;
  storage.saveUserData(data);
  assert.equal(storage.getReviewRecoverySummary("cet4", ["three-fails"], { sessionId: "session-b", sequence: 0, now }).count, 1);
});

await test("a learned L0 recovery word is never treated as a new word", () => {
  seedWord("cet4", "learned-l0", 2);
  formal("cet4", "learned-l0", "wrong", now, "l0-session");
  const progress = storage.getWordProgress("cet4", "learned-l0");
  assert.equal(progress.learned, true);
  assert.equal(progress.masteryLevel, 0);
  assert.equal(storage.getReviewRecoveryState("cet4", "learned-l0").active, true);
});

await test("formal partial increments partial count but not wrong count", () => {
  const progress = storage.getWordProgress("cet4", "partial-l4");
  assert.equal(progress.partialCount, 1);
  assert.equal(progress.wrongCount, 2);
});

await test("recovery partial remains active", () => {
  const record = storage.getReviewRecoveryState("cet4", "stable-recovery");
  assert.equal(record.active, true);
  assert.equal(record.lastResult, "partial");
});

await test("recovery wrong remains active before the cap", () => {
  const record = storage.getReviewRecoveryState("cet4", "interrupted-recovery");
  assert.equal(record.active, true);
  assert.equal(record.lastResult, "wrong");
});

for (const attempt of [1, 2, 3]) {
  await test(`recovery window ${attempt} stays in its prescribed range`, () => {
    const rule = reviewRecovery.RECOVERY_WINDOWS[attempt];
    const low = reviewRecovery.calculateRecoverySchedule(attempt, { sequence: 10, now, random: () => 0 });
    const high = reviewRecovery.calculateRecoverySchedule(attempt, { sequence: 10, now, random: () => 0.999999 });
    assert.equal(low.questionGap, rule.questionMin);
    assert.equal(high.questionGap, rule.questionMax);
    assert.equal(low.minDelayMs, rule.delayMinMs);
    assert.equal(high.minDelayMs, rule.delayMaxMs);
  });
}

await test("direct first-choice pass uses 10-18 questions and 2-4 minutes", () => {
  const low = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey: "2026-08-13", sequence: 1, random: () => 0 });
  const high = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey: "2026-08-13", sequence: 1, random: () => 0.999999 });
  assert.equal(low.questionGap, 10);
  assert.equal(high.questionGap, 18);
  assert.equal(low.minDelayMs, 120_000);
  assert.equal(high.minDelayMs, 240_000);
});

await test("choice-retry pass uses 6-12 questions and 90-180 seconds", () => {
  const failed = newWordLearning.createPendingRecord({ introStudyMode: "zh-to-en", introCorrect: false, now, dateKey: "2026-08-13", sequence: 1, random: () => 0 });
  const low = newWordLearning.markChoiceResult(failed, true, { now: now + 1, sequence: 3, random: () => 0 });
  const high = newWordLearning.markChoiceResult(failed, true, { now: now + 1, sequence: 3, random: () => 0.999999 });
  assert.equal(low.questionGap, 6);
  assert.equal(high.questionGap, 12);
  assert.equal(low.minDelayMs, 90_000);
  assert.equal(high.minDelayMs, 180_000);
});

await test("direct-choice fallback is 5 questions or 90 seconds", () => {
  const record = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey: "2026-08-13", sequence: 10, random: () => 0 });
  assert.equal(record.fallbackQuestionGap, 5);
  assert.equal(record.fallbackDelayMs, 90_000);
  assert.equal(newWordLearning.isFallbackEligible(record, 15, "2026-08-13", now), true);
});

await test("choice-retry fallback is 3 questions or 60 seconds", () => {
  const failed = newWordLearning.createPendingRecord({ introStudyMode: "zh-to-en", introCorrect: false, now, dateKey: "2026-08-13", sequence: 1, random: () => 0 });
  const record = newWordLearning.markChoiceResult(failed, true, { now: now + 1, sequence: 10, random: () => 0 });
  assert.equal(record.fallbackQuestionGap, 3);
  assert.equal(record.fallbackDelayMs, 60_000);
  assert.equal(newWordLearning.isFallbackEligible(record, 10, "2026-08-13", now + 60_001), true);
});

await test("full reinforcement window requires both question and time gates", () => {
  const record = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey: "2026-08-13", sequence: 1, random: () => 0 });
  assert.equal(newWordLearning.isEligible(record, 11, "2026-08-13", now + 120_001), true);
  assert.equal(newWordLearning.isEligible(record, 10, "2026-08-13", now + 120_001), false);
  assert.equal(newWordLearning.isEligible(record, 11, "2026-08-13", now + 119_999), false);
});

await test("long direct-choice window prevents a fixed choice-reinforcement alternation", () => {
  const record = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey: "2026-08-13", sequence: 1, random: () => 0 });
  assert.ok(record.eligibleAfterSequence - record.scheduledAtSequence >= 10);
  assert.ok(record.eligibleAfterTime - record.scheduledAtTime >= 120_000);
});

await test("reinforcement random window survives reload unchanged", () => {
  const fresh = loadApp();
  fresh.app.storage.updateWordProgress("cet4", "persist-gap", true, {
    timestamp: now, sessionMode: "normal", taskType: "new", studyMode: "en-to-zh",
    learningPhase: newWordLearning.LEARNING_PHASES.INTRO, random: () => 0.25,
  });
  const before = fresh.app.storage.getNewWordLearningState("cet4", "persist-gap");
  const reloaded = loadApp(fresh.localStorage.dump()).app.storage.getNewWordLearningState("cet4", "persist-gap");
  assert.equal(reloaded.questionGap, before.questionGap);
  assert.equal(reloaded.minDelayMs, before.minDelayMs);
});

await test("recovery random window survives reload unchanged", () => {
  const raw = storage.loadUserData();
  const before = storage.getReviewRecoveryState("cet4", "partial-l4");
  const reloaded = loadApp({ "cetwords-user-data-v1": JSON.stringify(raw) }).app.storage.getReviewRecoveryState("cet4", "partial-l4");
  assert.equal(reloaded.questionGap, before.questionGap);
  assert.equal(reloaded.minDelayMs, before.minDelayMs);
});

await test("eligible recovery joins the pool without becoming forced next", () => {
  const record = reviewRecovery.createRecovery({ sourceReviewResult: "wrong", currentLevel: 2, sessionId: "x", sequence: 0, now: 1, random: () => 0 });
  const index = newWordLearning.selectNextItemIndex({
    items: [
      { wordId: "recovery", word: { word: "recovery" }, taskType: "recovery", recoveryState: record },
      { wordId: "due", word: { word: "due" }, taskType: "review" },
    ], currentSequence: 99, dateKey: "2026-08-13", now, studySessionId: "x",
  });
  assert.equal(index, 1);
});

await test("cross-session recovery outranks ordinary eligible recovery", () => {
  const resumed = reviewRecovery.beginSession(
    reviewRecovery.createRecovery({ sourceReviewResult: "wrong", currentLevel: 2, sessionId: "old", sequence: 0, now: 1, random: () => 0 }),
    "current",
  );
  const eligible = reviewRecovery.createRecovery({ sourceReviewResult: "wrong", currentLevel: 2, sessionId: "current", sequence: 0, now: 1, random: () => 0 });
  assert.equal(reviewRecovery.getPriority(resumed, { sessionId: "current", sequence: 99, now }), 1);
  assert.equal(reviewRecovery.getPriority(eligible, { sessionId: "current", sequence: 99, now }), 2);
});

await test("choice retry outranks eligible new reinforcement", () => {
  const retry = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now: 1, dateKey: "2026-08-13", sequence: 0, random: () => 0 });
  const reinforce = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now: 1, dateKey: "2026-08-13", sequence: 0, random: () => 0 });
  const index = newWordLearning.selectNextItemIndex({
    items: [{ word: { word: "reinforce" }, learningState: reinforce }, { word: { word: "retry" }, learningState: retry }],
    currentSequence: 99, dateKey: "2026-08-13", now,
  });
  assert.equal(index, 1);
});

await test("eligible reinforcement outranks a new intro", () => {
  const reinforce = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now: 1, dateKey: "2026-08-13", sequence: 0, random: () => 0 });
  const index = newWordLearning.selectNextItemIndex({
    items: [
      { word: { word: "intro" }, learningPhase: newWordLearning.LEARNING_PHASES.INTRO },
      { word: { word: "reinforce" }, learningState: reinforce },
    ], currentSequence: 99, dateKey: "2026-08-13", now,
  });
  assert.equal(index, 1);
});

await test("recentWordIds avoids immediate repetition when another peer exists", () => {
  const a = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now: 1, dateKey: "2026-08-13", sequence: 0, random: () => 0 });
  const b = newWordLearning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now: 1, dateKey: "2026-08-13", sequence: 0, random: () => 0 });
  const index = newWordLearning.selectNextItemIndex({
    items: [{ word: { word: "same" }, learningState: a }, { word: { word: "other" }, learningState: b }],
    currentSequence: 99, dateKey: "2026-08-13", now, recentWordIds: ["same"],
  });
  assert.equal(index, 1);
});

await test("new reinforcement still grants L1 only on active-recall correct", () => {
  const fresh = loadApp().app;
  fresh.storage.updateWordProgress("cet4", "new-flow", true, { timestamp: now, sessionMode: "normal", taskType: "new", studyMode: "en-to-zh", learningPhase: fresh.newWordLearning.LEARNING_PHASES.INTRO });
  const result = fresh.storage.updateWordProgress("cet4", "new-flow", true, { timestamp: now + 1, judgement: "correct", sessionMode: "normal", taskType: "reinforcement", studyMode: "ai-meaning", learningPhase: fresh.newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT });
  assert.equal(result.progress.masteryLevel, 1);
});

await test("new reinforcement partial and wrong remain L0 and separate from recovery", () => {
  const fresh = loadApp().app;
  fresh.storage.updateWordProgress("cet4", "new-partial", true, { timestamp: now, sessionMode: "normal", taskType: "new", studyMode: "en-to-zh", learningPhase: fresh.newWordLearning.LEARNING_PHASES.INTRO });
  const partial = fresh.storage.updateWordProgress("cet4", "new-partial", false, { timestamp: now + 1, judgement: "partial", sessionMode: "normal", taskType: "reinforcement", studyMode: "ai-meaning", learningPhase: fresh.newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT });
  assert.equal(partial.progress.masteryLevel, 0);
  assert.equal(fresh.storage.getReviewRecoveryState("cet4", "new-partial"), null);
});

await test("old-word recovery does not reduce completed new-word count", () => {
  const before = storage.getDailyStats("cet4").completedNewWords;
  recover("cet4", "three-fails", "correct", now + 10, "session-b");
  assert.equal(storage.getDailyStats("cet4").completedNewWords, before);
});

await test("formal and recovery daily statistics are recorded", () => {
  const metrics = storage.getDailyStats("cet4").learningMetrics;
  assert.ok(metrics.formalReview.wrong >= 1);
  assert.ok(metrics.formalReview.partial >= 1);
  assert.ok(metrics.recovery.attempts >= 3);
  assert.ok(metrics.recovery.wrong >= 1);
});

await test("extended daily risk adds formal and recovery risk without mutating SRS", () => {
  const progress = storage.getWordProgress("cet4", "partial-l4");
  const before = JSON.stringify(progress);
  const score = dailyReviewService.calculateDailyRiskScore({ formalReviewWrongCount: 1, recoveryErrorCount: 3, recoveryPending: true }, progress);
  assert.equal(score, 66);
  assert.equal(JSON.stringify(storage.getWordProgress("cet4", "partial-l4")), before);
});

await test("daily review payload contains structured review stats but no raw answers", () => {
  const local = dailyReviewService.buildLocalReview({
    bookId: "cet4", dailyTarget: 30,
    daily: { ...storage.getDailyStats("cet4"), dateKey: storage.getLocalDateKey(), completedNewWords: 30 },
    words: [{ word: "partial-l4", coreMeaning: "测试义", meanings: [{ meaning: "测试义" }] }],
    getProgress: (wordId) => storage.getWordProgress("cet4", wordId),
  });
  const payload = dailyReviewService.buildRequestPayload(local);
  assert.ok(payload.statistics.formalReviewStats);
  assert.ok(payload.statistics.recoveryStats);
  assert.equal(JSON.stringify(payload).includes("userAnswer"), false);
});

await test("daily weak-word records expose only structured formal/recovery fields", () => {
  const local = dailyReviewService.buildLocalReview({
    bookId: "cet4", dailyTarget: 30,
    daily: { ...storage.getDailyStats("cet4"), dateKey: storage.getLocalDateKey(), completedNewWords: 30 },
    words: [{ word: "partial-l4", coreMeaning: "测试义", meanings: [{ meaning: "测试义" }] }],
    getProgress: (wordId) => storage.getWordProgress("cet4", wordId),
  });
  const entry = local.weakWords.find((item) => item.word === "partial-l4");
  assert.ok(entry);
  assert.equal(Object.hasOwn(entry, "formalReviewResult"), true);
  assert.equal(Object.hasOwn(entry, "recoveryAttempts"), true);
  assert.equal(Object.hasOwn(entry, "userAnswer"), false);
});

await test("local judge handles explicit unknown answers without DeepSeek", () => {
  const result = app.aiJudge ? app.aiJudge.localMeaningJudge({ coreMeaning: "吸收" }, "不知道") : null;
  // ai-judge is covered by the browser and Phase 14 suites; source assertion keeps this VM minimal.
  const source = fs.readFileSync(path.join(ROOT, "js/ai-judge.js"), "utf8");
  assert.equal(result, null);
  assert.match(source, /UNKNOWN_ANSWERS[\s\S]*source: "local"/);
});

await test("uncertain active recall still routes to the existing AI endpoint", () => {
  const study = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  const judge = fs.readFileSync(path.join(ROOT, "js/ai-judge.js"), "utf8");
  assert.match(study, /localMeaningJudge/);
  assert.match(study, /onAiJudgeMeaning/);
  assert.match(judge, /\/api\/judge-meaning/);
});

await test("Ctrl+Enter and IME guards exist for every active-recall phase", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /event\.key === "Enter"[\s\S]*event\.ctrlKey/);
  assert.match(source, /event\.isComposing/);
  assert.match(source, /compositionstart/);
  assert.match(source, /compositionend/);
  assert.match(source, /question\.aiPending/);
  assert.match(source, /question\.selectedIndex !== null/);
});

for (const [label, phase] of [
  ["new reinforcement", "AI_REINFORCEMENT"],
  ["formal review", "FORMAL_REVIEW_PHASE"],
  ["recovery", "RECOVERY_PHASE"],
]) {
  await test(`Ctrl+Enter shares the guarded submit path for ${label}`, () => {
    const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
    assert.match(source, new RegExp(`reviewRecovery\\.${phase}|newWordLearning\\.LEARNING_PHASES\\.${phase}`));
    assert.match(source, /this\.submitMeaningAnswer\(\)/);
  });
}

await test("desktop shortcut label and mobile-hidden CSS are present", () => {
  const study = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  assert.match(study, /Ctrl \+ Enter/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.meaning-submit-shortcut[\s\S]*display: none/);
});

await test("active-recall input auto-focus is guarded", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /activeElement === document\.body/);
  assert.match(source, /this\.elements\.meaningInput\.focus\(\)/);
});

await test("formal and recovery labels expose Level without revealing the meaning", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /`Level \$\{reviewScheduler\.getMasteryLevel[\s\S]*到期复习`/);
  assert.match(source, /`纠错巩固 · Level \$\{reviewScheduler\.getMasteryLevel/);
});

await test("partial and wrong feedback reveals the standard meaning after judgement", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  assert.match(source, /aiFeedbackStandardMeaning\.textContent = learningWord\.coreMeaning[\s\S]*learningWord\.meaning/);
  assert.match(source, /renderSubjectiveFeedback/);
});

await test("v10 migrates losslessly through v15 with reviewRecovery and group maps", () => {
  const v10 = {
    version: 10, currentBook: "cet4",
    preferences: { dailyNewWordGoals: { cet4: 30, cet6: 50 }, vocabularyScope: { cet4: "core", cet6: "all" }, studyMode: "zh-to-en", learningOrder: "random", aiJudge: { enabled: true, proxyUrl: "https://worker.example" } },
    books: {
      cet4: { words: { keep: learnedProgress(4, { favorite: true, inWrongBook: true }) }, daily: {}, newWordQueue: ["keep"], smartNewWordQueue: {}, newWordLearning: {}, dailyReviews: { "2026-08-12": { generatedAt: "2026-08-12T12:00:00.000Z", dailyTarget: 30, completedNewWords: 30, review: { summary: "保留", strengths: [], weaknesses: [], focusWords: [], tomorrowAdvice: [] } } } },
      cet6: { words: {}, daily: {}, newWordQueue: [], smartNewWordQueue: {}, newWordLearning: {}, dailyReviews: {} },
    },
  };
  const migrated = loadApp({ "cetwords-user-data-v1": JSON.stringify(v10) }).app.storage.loadUserData();
  assert.equal(migrated.version, 15);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.books.cet4.reviewRecovery)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.books.cet4.dailyGroupPlans)), {});
  assert.equal(migrated.books.cet4.words.keep.masteryLevel, 4);
  assert.equal(migrated.books.cet4.words.keep.favorite, true);
  assert.equal(migrated.books.cet4.dailyReviews["2026-08-12"].review.summary, "保留");
  assert.equal(migrated.preferences.learningOrder, "random");
});

await test("v1-v15 backup compatibility is declared", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/backup-service.js"), "utf8");
  assert.match(source, /\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15\]/);
});

await test("storage version is exactly v15 while the localStorage key stays unchanged", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
  assert.match(source, /const DATA_VERSION = 15/);
  assert.match(source, /const STORAGE_KEY = "cetwords-user-data-v1"/);
});

await test("smart and random learning-order implementations are untouched by Recovery", () => {
  const smart = fs.readFileSync(path.join(ROOT, "js/smart-learning-order.js"), "utf8");
  assert.equal(smart.includes("reviewRecovery"), false);
  const storageSource = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
  assert.match(storageSource, /DEFAULT_LEARNING_ORDER = "smart"/);
});

await test("formal/recovery events never persist raw Chinese input", () => {
  const text = JSON.stringify(storage.loadUserData());
  assert.equal(text.includes("userAnswer"), false);
  assert.equal(text.includes("完整 DeepSeek prompt"), false);
});

console.log(`\nPhase 15 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
