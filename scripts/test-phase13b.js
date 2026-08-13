const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;
const pending = [];

function test(name, callback) {
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      pending.push(result.then(() => {
        passed += 1;
        console.log(`PASS ${name}`);
      }).catch((error) => {
        failed += 1;
        console.error(`FAIL ${name}\n  ${error.stack || error.message}`);
      }));
      return;
    }
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
    clear() { values.clear(); },
    dump() { return Object.fromEntries(values); },
  };
}

function loadApp({ initialStorage = {}, includeStorage = true } = {}) {
  const localStorage = createLocalStorage(initialStorage);
  const window = { CETWords: {}, localStorage, fetch: () => Promise.reject(new Error("not mocked")) };
  const context = vm.createContext({ window, console, URL, Map, Set, Date, Math, Intl });
  const files = ["js/review-scheduler.js", "js/smart-learning-order.js", "js/review-recovery.js", "js/new-word-learning.js"];
  if (includeStorage) files.push("js/storage.js");
  files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

function loadFrequency(level) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `data/${level}-exam-frequency.json`), "utf8"));
}

const base = loadApp({ includeStorage: false }).app;
const smart = base.smartLearningOrder;
const learning = base.newWordLearning;
const scheduler = base.reviewScheduler;

const sameTierFrequency = new Map([
  ["alpha", { frequencyTier: "S", tokenCount: 1000 }],
  ["bravo", { frequencyTier: "S", tokenCount: 1 }],
  ["charlie", { frequencyTier: "S", tokenCount: 500 }],
  ["delta", { frequencyTier: "S", tokenCount: 10 }],
  ["echo", { frequencyTier: "S", tokenCount: 20 }],
]);

function smartQueue(seed, frequency = sameTierFrequency) {
  return smart.rebuildQueueState({
    candidateIds: [...sameTierFrequency.keys()],
    frequencyByWord: frequency,
    overridesByWord: new Map(),
    scopeKey: "test",
    random: smart.createSeededRandom(seed),
  }).queues.S;
}

test("same-tier shuffle is reproducible with the same seed", () => {
  assert.deepEqual(smartQueue("seed-1"), smartQueue("seed-1"));
});

test("same-tier shuffle changes with a different seed", () => {
  assert.notDeepEqual(smartQueue("seed-1"), smartQueue("seed-2"));
});

test("token count does not create a hidden within-tier rank", () => {
  const changedCounts = new Map([...sameTierFrequency].map(([word, entry], index) => [
    word,
    { ...entry, tokenCount: 999999 - index * 10000, tierScore: index },
  ]));
  assert.deepEqual(smartQueue("no-hidden-rank", sameTierFrequency), smartQueue("no-hidden-rank", changedCounts));
});

test("weighted pattern exactly reflects centralized weights", () => {
  const counts = Object.fromEntries(smart.FREQUENCY_TIERS.map((tier) => [tier, 0]));
  smart.SMART_TIER_PATTERN.forEach((tier) => { counts[tier] += 1; });
  assert.deepEqual(counts, { S: 40, A: 30, B: 15, C: 8, D: 5, E: 2 });
});

test("weighted pattern avoids long runs and mixes tiers", () => {
  let longestRun = 1;
  let run = 1;
  for (let index = 1; index < smart.SMART_TIER_PATTERN.length; index += 1) {
    run = smart.SMART_TIER_PATTERN[index] === smart.SMART_TIER_PATTERN[index - 1] ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  }
  assert.ok(longestRun <= 2);
});

test("low-frequency E tier is not starved", () => {
  const queues = Object.fromEntries(smart.FREQUENCY_TIERS.map((tier) => [tier, Array.from({ length: 100 }, (_, i) => `${tier}${i}`)]));
  const draw = smart.takeFromQueue({ scopeKey: "x", cursor: 0, queues }, 100);
  assert.equal(draw.ids.filter((word) => word.startsWith("E")).length, 2);
});

test("empty weighted slots are reallocated to non-empty tiers", () => {
  const queues = Object.fromEntries(smart.FREQUENCY_TIERS.map((tier) => [tier, tier === "D" ? ["d1", "d2"] : []]));
  assert.deepEqual(Array.from(smart.takeFromQueue({ scopeKey: "x", cursor: 0, queues }, 3).ids), ["d1", "d2"]);
});

test("all candidates eventually receive a turn", () => {
  const frequency = new Map();
  const candidates = [];
  smart.FREQUENCY_TIERS.forEach((tier) => {
    for (let index = 0; index < 7; index += 1) {
      const id = `${tier}-${index}`;
      candidates.push(id);
      frequency.set(id.toLowerCase(), { frequencyTier: tier });
    }
  });
  const state = smart.rebuildQueueState({ candidateIds: candidates, frequencyByWord: frequency, overridesByWord: new Map(), scopeKey: "all", random: smart.createSeededRandom(7) });
  const result = smart.takeFromQueue(state, 100).ids;
  assert.equal(result.length, candidates.length);
  assert.equal(new Set(result).size, candidates.length);
});

const overridePayload = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cet-learning-priority-overrides.json"), "utf8"));
const overrideMap = smart.createOverrideMap(overridePayload);
const requiredFunctionWords = "a an the of to in at on for by as and or but if be do have it he she we you they my your his her their this that these those".split(" ");

test("all required function words are explicitly audited", () => {
  assert.deepEqual(requiredFunctionWords.filter((word) => !overrideMap.has(word)), []);
});

test("all protected function words disable frequency boost", () => {
  requiredFunctionWords.forEach((word) => assert.equal(overrideMap.get(word).frequencyBoostEligible, false));
});

test("function word protection adjusts effective tier without changing raw tier", () => {
  const priority = smart.getLearningPriority("a", smart.createFrequencyMap(loadFrequency("cet4")), overrideMap);
  assert.equal(priority.rawFrequencyTier, "S");
  assert.equal(priority.effectiveLearningTier, "neutral");
  assert.match(priority.priorityAdjustmentReason, /功能词保护/);
});

test("a, the, in and be keep raw S while using neutral learning tier", () => {
  const cases = {
    cet4: ["a", "the", "in", "be"],
    // "the" has no CET6 frequency row, so there is no raw CET6 tier to preserve.
    cet6: ["a", "in", "be"],
  };
  for (const [level, words] of Object.entries(cases)) {
    const frequency = smart.createFrequencyMap(loadFrequency(level));
    for (const word of words) {
      const priority = smart.getLearningPriority(word, frequency, overrideMap);
      assert.equal(priority.rawFrequencyTier, "S");
      assert.equal(priority.effectiveLearningTier, "neutral");
      assert.equal(priority.frequencyBoostEligible, false);
    }
  }
});

test("neutral is absent from SMART_TIER_WEIGHTS and the weighted pattern", () => {
  assert.equal(Object.hasOwn(smart.SMART_TIER_WEIGHTS, "neutral"), false);
  assert.equal(smart.SMART_TIER_PATTERN.includes("neutral"), false);
});

test("neutral insertion consumes no S/A/B/C/D/E weighted slot", () => {
  const weightedQueues = Object.fromEntries(smart.FREQUENCY_TIERS.map((tier) => [
    tier,
    Array.from({ length: 60 }, (_, index) => `${tier}${index}`),
  ]));
  const baseline = smart.takeFromQueue({ scopeKey: "weighted", cursor: 0, queues: weightedQueues }, 45);
  const withNeutral = smart.takeFromQueue({
    scopeKey: "weighted",
    cursor: 0,
    weightedDrawsUntilNeutral: smart.NEUTRAL_DRAW_INTERVAL,
    queues: { ...weightedQueues, neutral: ["the", "in"] },
  }, 45);
  const weightedOnly = withNeutral.ids.filter((id) => id !== "the" && id !== "in");
  assert.deepEqual(Array.from(weightedOnly), Array.from(baseline.ids.slice(0, weightedOnly.length)));
  assert.equal(withNeutral.state.cursor, baseline.ids.length > weightedOnly.length
    ? smart.takeFromQueue({ scopeKey: "weighted", cursor: 0, queues: weightedQueues }, weightedOnly.length).state.cursor
    : baseline.state.cursor);
});

test("neutral queue is independently and fully shuffled", () => {
  const candidateIds = ["a", "the", "in", "be", "of", "to", "and", "or"];
  const frequency = new Map(candidateIds.map((word) => [word, { frequencyTier: "S" }]));
  const first = smart.rebuildQueueState({ candidateIds, frequencyByWord: frequency, overridesByWord: overrideMap, scopeKey: "neutral", random: smart.createSeededRandom("neutral-1") }).queues.neutral;
  const repeated = smart.rebuildQueueState({ candidateIds, frequencyByWord: frequency, overridesByWord: overrideMap, scopeKey: "neutral", random: smart.createSeededRandom("neutral-1") }).queues.neutral;
  const changed = smart.rebuildQueueState({ candidateIds, frequencyByWord: frequency, overridesByWord: overrideMap, scopeKey: "neutral", random: smart.createSeededRandom("neutral-2") }).queues.neutral;
  assert.deepEqual(Array.from(first), Array.from(repeated));
  assert.notDeepEqual(Array.from(first), Array.from(changed));
});

test("neutral words cannot starve and are eventually all drawn", () => {
  const queues = Object.fromEntries(smart.FREQUENCY_TIERS.map((tier) => [
    tier,
    Array.from({ length: 100 }, (_, index) => `${tier}${index}`),
  ]));
  queues.neutral = ["a", "the", "in", "be"];
  const draw = smart.takeFromQueue({ scopeKey: "neutral", cursor: 0, queues }, 1000);
  assert.deepEqual(new Set(draw.ids.filter((id) => ["a", "the", "in", "be"].includes(id))), new Set(["a", "the", "in", "be"]));
});

test("neutral persistent queue and cadence survive storage reload", () => {
  const first = loadApp();
  const frequency = new Map([
    ...Array.from({ length: 50 }, (_, index) => [`content-${index}`, { frequencyTier: smart.FREQUENCY_TIERS[index % 6] }]),
    ["a", { frequencyTier: "S" }],
    ["the", { frequencyTier: "S" }],
    ["in", { frequencyTier: "S" }],
    ["be", { frequencyTier: "S" }],
  ]);
  const ids = [...frequency.keys()];
  const options = { learningOrder: "smart", frequencyByWord: frequency, overridesByWord: overrideMap, scopeKey: "cet4:neutral", random: smart.createSeededRandom("persist-neutral") };
  const firstTwenty = first.app.storage.getOrCreateDailyNewWordIds("cet4", ids, 20, options);
  const savedState = first.app.storage.loadUserData().books.cet4.smartNewWordQueue;
  const second = loadApp({ initialStorage: first.localStorage.dump() });
  const expanded = second.app.storage.getOrCreateDailyNewWordIds("cet4", ids, 40, { ...options, random: smart.createSeededRandom("ignored-after-reload") });
  const reloadedState = second.app.storage.loadUserData().books.cet4.smartNewWordQueue;
  assert.deepEqual(Array.from(expanded.slice(0, 20)), Array.from(firstTwenty));
  assert.ok(savedState.queues.neutral.length > reloadedState.queues.neutral.length);
  assert.ok(expanded.some((id) => ["a", "the", "in", "be"].includes(id)));
});

test("random learning order does not create a special neutral queue", () => {
  const { app } = loadApp();
  const ids = ["a", "the", "in", "be", "content"];
  const frequency = new Map(ids.map((word) => [word, { frequencyTier: "S" }]));
  const result = app.storage.getOrCreateDailyNewWordIds("cet4", ids, 5, {
    learningOrder: "random",
    frequencyByWord: frequency,
    overridesByWord: overrideMap,
    scopeKey: "cet4:random",
    random: smart.createSeededRandom("random-neutral"),
  });
  const state = app.storage.loadUserData().books.cet4.smartNewWordQueue;
  assert.equal(result.length, 5);
  assert.equal(state.queues.neutral.length, 0);
});

test("raw frequency files contain no learning override fields", () => {
  for (const level of ["cet4", "cet6"]) {
    const text = fs.readFileSync(path.join(ROOT, `data/${level}-exam-frequency.json`), "utf8");
    assert.equal(text.includes("effectiveLearningTier"), false);
    assert.equal(text.includes("frequencyBoostEligible"), false);
  }
});

function blankProgress() {
  return {
    learned: false, correctCount: 0, wrongCount: 0, consecutiveCorrect: 0, masteryLevel: 0,
    reviewCount: 0, favorite: false, inWrongBook: false, lastStudyTime: null, nextReviewTime: null,
  };
}

const now = 1_800_000_000_000;
const dateKey = "2027-01-15";

test("gate 01: first choice wrong enters choice_retry", () => {
  assert.equal(learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 }).phase, learning.LEARNING_PHASES.CHOICE_RETRY);
});

test("gate 02: first choice wrong leaves gate false", () => {
  assert.equal(learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 }).choiceGatePassed, false);
});

test("gate 03: first choice wrong leaves mastery at zero", () => {
  assert.equal(learning.handleIntro(blankProgress(), false, { now }).masteryLevel, 0);
});

test("gate 04: first choice wrong enters wrong book", () => {
  assert.equal(learning.handleIntro(blankProgress(), false, { now }).inWrongBook, true);
});

test("gate 05: choice retry preserves original en-to-zh direction", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  assert.equal(learning.getPendingStudyMode(record), "en-to-zh");
});

test("gate 06: choice retry preserves original zh-to-en direction", () => {
  const record = learning.createPendingRecord({ introStudyMode: "zh-to-en", introCorrect: false, now, dateKey, sequence: 1 });
  assert.equal(learning.getPendingStudyMode(record), "zh-to-en");
});

test("gate 07: repeated choice wrong remains choice_retry", () => {
  const first = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  const second = learning.markChoiceResult(first, false, { now: now + 100_000, sequence: 6 });
  assert.equal(second.phase, learning.LEARNING_PHASES.CHOICE_RETRY);
  assert.equal(second.choiceGatePassed, false);
});

test("gate 08: repeated choice wrong uses 3-5 question and 60-90 second schedule", () => {
  const first = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  const second = learning.markChoiceResult(first, false, { now: now + 100_000, sequence: 6 });
  assert.ok(second.questionGap >= 3 && second.questionGap <= 5);
  assert.ok(second.minDelayMs >= 60_000 && second.minDelayMs <= 90_000);
});

test("gate 09: choice retry correct passes the gate", () => {
  const first = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  assert.equal(learning.markChoiceResult(first, true, { now: now + 100_000, sequence: 6 }).choiceGatePassed, true);
});

test("gate 10: choice retry correct advances to AI reinforcement", () => {
  const first = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  assert.equal(learning.markChoiceResult(first, true, { now: now + 100_000, sequence: 6 }).phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
});

test("gate 11: choice correct itself does not grant Level 1", () => {
  assert.equal(learning.handleChoiceAttempt({ ...blankProgress(), learned: true }, true, { now }).masteryLevel, 0);
});

test("gate 12: first choice correct passes gate but stays pending", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey, sequence: 1 });
  assert.equal(record.choiceGatePassed, true);
  assert.equal(record.stage, learning.LEARNING_STAGES.PENDING);
  assert.equal(record.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
});

test("gate 13: AI partial stays L0 and in AI phase", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey, sequence: 1 });
  const next = learning.markAiResult(record, "partial", { now: now + 300_000, dateKey, sequence: 8 });
  assert.equal(next.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
  assert.equal(next.stage, learning.LEARNING_STAGES.PENDING);
  assert.equal(learning.handleReinforcementPartial({ ...blankProgress(), learned: true }, { now }).masteryLevel, 0);
});

test("gate 14: AI wrong stays L0 and never returns to choice", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey, sequence: 1 });
  const next = learning.markAiResult(record, "wrong", { now: now + 300_000, dateKey, sequence: 8 });
  assert.equal(next.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
  assert.equal(next.choiceGatePassed, true);
  assert.equal(learning.handleReinforcement({ ...blankProgress(), learned: true }, false, { now }).masteryLevel, 0);
});

test("gate 15: AI correct completes and grants Level 1", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey, sequence: 1 });
  const next = learning.markAiResult(record, "correct", { now: now + 300_000, dateKey, sequence: 8 });
  const progress = learning.handleReinforcement({ ...blankProgress(), learned: true }, true, { now });
  assert.equal(next.stage, learning.LEARNING_STAGES.COMPLETED);
  assert.equal(progress.masteryLevel, 1);
  assert.ok(progress.nextReviewTime > now);
});

test("gate 16: AI result cannot bypass an unpassed choice gate", () => {
  const record = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 1 });
  assert.equal(learning.markAiResult(record, "correct", { now: now + 300_000, dateKey, sequence: 8 }).stage, learning.LEARNING_STAGES.PENDING);
});

test("gate 17: pending scheduler orders choice retry before AI reinforcement", () => {
  const choice = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 0 });
  const ai = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: true, now, dateKey, sequence: 0 });
  choice.eligibleAfterSequence = ai.eligibleAfterSequence = 0;
  choice.eligibleAfterTime = ai.eligibleAfterTime = now - 1;
  const index = learning.selectNextItemIndex({ items: [
    { wordId: "ai", learningState: ai, learningPhase: ai.phase },
    { wordId: "choice", learningState: choice, learningPhase: choice.phase },
  ], currentSequence: 10, dateKey, now, pendingCount: 2 });
  assert.equal(index, 1);
});

test("v8 migration defaults learning order to smart and assumes pending gate passed", () => {
  const old = {
    version: 8,
    currentBook: "cet6",
    preferences: { dailyNewWordGoals: { cet4: 20, cet6: 50 }, vocabularyScope: { cet4: "all", cet6: "core" }, studyMode: "zh-to-en", aiJudge: { enabled: true, proxyUrl: "https://example.com" } },
    aiStats: { requestCount: 7 },
    books: {
      cet4: { words: { legacy: { learned: true, correctCount: 3, masteryLevel: 2, nextReviewTime: now + 123456 } }, daily: { [dateKey]: { newWordIds: ["legacy"], scheduledNewWordIds: ["legacy"] } }, newWordQueue: ["queue-id"], newWordLearning: { legacy: { stage: "pending-reinforcement", introStudyMode: "zh-to-en", introducedDate: dateKey, eligibleAfterSequence: 9 } } },
      cet6: { words: {}, daily: {}, newWordQueue: [], newWordLearning: {} },
    },
  };
  const { app } = loadApp({ initialStorage: { "cetwords-user-data-v1": JSON.stringify(old) } });
  const data = app.storage.loadUserData();
  assert.equal(data.version, 11);
  assert.equal(data.preferences.learningOrder, "smart");
  assert.equal(data.books.cet4.newWordLearning.legacy.choiceGatePassed, true);
  assert.equal(data.books.cet4.newWordLearning.legacy.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
  assert.equal(data.books.cet4.words.legacy.correctCount, 3);
  assert.equal(data.books.cet4.words.legacy.masteryLevel, 2);
  assert.equal(data.books.cet4.words.legacy.nextReviewTime, now + 123456);
  assert.deepEqual(Array.from(data.books.cet4.newWordQueue), ["queue-id"]);
  assert.equal(data.currentBook, "cet6");
});

test("integrated wrong choice persists choice_retry and does not complete the new word", () => {
  const { app } = loadApp();
  const result = app.storage.updateWordProgress("cet4", "gate-word", false, {
    now,
    timestamp: now,
    studyMode: "en-to-zh",
    sessionMode: "normal",
    taskType: "new",
    learningPhase: learning.LEARNING_PHASES.INTRO,
  });
  assert.equal(result.progress.masteryLevel, 0);
  assert.equal(result.learningState.phase, learning.LEARNING_PHASES.CHOICE_RETRY);
  assert.equal(result.learningState.choiceGatePassed, false);
  assert.equal(result.daily.completedNewWords, 0);
});

test("integrated wrong-wrong-correct choice flow stays L0 until AI correct", () => {
  const { app } = loadApp();
  app.storage.updateWordProgress("cet4", "flow-word", false, { timestamp: now, studyMode: "zh-to-en", sessionMode: "normal", taskType: "new", learningPhase: learning.LEARNING_PHASES.INTRO });
  app.storage.updateWordProgress("cet4", "flow-word", false, { timestamp: now + 100_000, studyMode: "zh-to-en", sessionMode: "normal", taskType: "reinforcement", learningPhase: learning.LEARNING_PHASES.CHOICE_RETRY });
  const gatePass = app.storage.updateWordProgress("cet4", "flow-word", true, { timestamp: now + 200_000, studyMode: "zh-to-en", sessionMode: "normal", taskType: "reinforcement", learningPhase: learning.LEARNING_PHASES.CHOICE_RETRY });
  assert.equal(gatePass.progress.masteryLevel, 0);
  assert.equal(gatePass.learningState.choiceGatePassed, true);
  assert.equal(gatePass.learningState.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
  assert.equal(gatePass.daily.completedNewWords, 0);
  const complete = app.storage.updateWordProgress("cet4", "flow-word", true, { timestamp: now + 300_000, judgement: "correct", judgementSource: "local", studyMode: "ai-meaning", sessionMode: "normal", taskType: "reinforcement", learningPhase: learning.LEARNING_PHASES.AI_REINFORCEMENT });
  assert.equal(complete.progress.masteryLevel, 1);
  assert.equal(complete.daily.completedNewWords, 1);
});

test("integrated AI wrong updates wrong count and wrong book but stays in AI", () => {
  const { app } = loadApp();
  app.storage.updateWordProgress("cet4", "ai-wrong", true, { timestamp: now, studyMode: "en-to-zh", sessionMode: "normal", taskType: "new", learningPhase: learning.LEARNING_PHASES.INTRO });
  const result = app.storage.updateWordProgress("cet4", "ai-wrong", false, { timestamp: now + 300_000, judgement: "wrong", judgementSource: "deepseek", studyMode: "ai-meaning", sessionMode: "normal", taskType: "reinforcement", learningPhase: learning.LEARNING_PHASES.AI_REINFORCEMENT });
  assert.equal(result.progress.masteryLevel, 0);
  assert.equal(result.progress.wrongCount, 1);
  assert.equal(result.progress.inWrongBook, true);
  assert.equal(result.learningState.phase, learning.LEARNING_PHASES.AI_REINFORCEMENT);
});

test("choice retry phase, eligibility, attempts and direction survive reload", () => {
  const first = loadApp();
  first.app.storage.updateWordProgress("cet4", "reload-word", false, { timestamp: now, studyMode: "zh-to-en", sessionMode: "normal", taskType: "new", learningPhase: learning.LEARNING_PHASES.INTRO });
  const before = first.app.storage.getNewWordLearningState("cet4", "reload-word");
  const second = loadApp({ initialStorage: first.localStorage.dump() });
  const after = second.app.storage.getNewWordLearningState("cet4", "reload-word");
  assert.equal(after.phase, before.phase);
  assert.equal(after.eligibleAfterSequence, before.eligibleAfterSequence);
  assert.equal(after.eligibleAfterTime, before.eligibleAfterTime);
  assert.equal(after.choiceAttempts, before.choiceAttempts);
  assert.equal(learning.getPendingStudyMode(after), "zh-to-en");
});

test("recent-word protection prevents immediate choice retry when another candidate exists", () => {
  const choice = learning.createPendingRecord({ introStudyMode: "en-to-zh", introCorrect: false, now, dateKey, sequence: 0 });
  choice.eligibleAfterSequence = 0;
  choice.eligibleAfterTime = now - 1;
  const index = learning.selectNextItemIndex({
    items: [
      { wordId: "recent", learningState: choice, learningPhase: choice.phase },
      { wordId: "other", learningState: choice, learningPhase: choice.phase },
    ],
    currentSequence: 10,
    dateKey,
    now,
    pendingCount: 2,
    recentWordIds: ["recent"],
  });
  assert.equal(index, 1);
});

test("random learning order uses the same choice gate state machine", () => {
  const { app } = loadApp();
  app.storage.setLearningOrder("random");
  const result = app.storage.updateWordProgress("cet4", "random-gate", false, { timestamp: now, studyMode: "en-to-zh", sessionMode: "normal", taskType: "new", learningPhase: learning.LEARNING_PHASES.INTRO });
  assert.equal(result.learningState.phase, learning.LEARNING_PHASES.CHOICE_RETRY);
  assert.equal(result.learningState.choiceGatePassed, false);
});

test("today's smart assignment is stable across refresh and appends on goal increase", () => {
  const { app } = loadApp();
  const frequency = new Map(Array.from({ length: 80 }, (_, index) => [`w${index}`, { frequencyTier: smart.FREQUENCY_TIERS[index % 6] }]));
  const ids = [...frequency.keys()];
  const options = { learningOrder: "smart", frequencyByWord: frequency, overridesByWord: new Map(), scopeKey: "cet4:core", random: smart.createSeededRandom("daily") };
  const first = app.storage.getOrCreateDailyNewWordIds("cet4", ids, 20, options);
  const refreshed = app.storage.getOrCreateDailyNewWordIds("cet4", ids, 20, { ...options, random: smart.createSeededRandom("other") });
  const expanded = app.storage.getOrCreateDailyNewWordIds("cet4", ids, 50, options);
  assert.deepEqual(refreshed, first);
  assert.deepEqual(expanded.slice(0, 20), first);
  assert.equal(expanded.length, 50);
});

test("scope change rebuilds candidates without replacing today's assignment", () => {
  const { app } = loadApp();
  const frequency = new Map(Array.from({ length: 40 }, (_, index) => [`w${index}`, { frequencyTier: index % 2 ? "S" : "A" }]));
  const all = [...frequency.keys()];
  const first = app.storage.getOrCreateDailyNewWordIds("cet4", all, 20, { learningOrder: "smart", frequencyByWord: frequency, overridesByWord: new Map(), scopeKey: "cet4:all", random: smart.createSeededRandom(1) });
  const core = all.slice(20);
  const afterScope = app.storage.getOrCreateDailyNewWordIds("cet4", core, 30, { learningOrder: "smart", frequencyByWord: frequency, overridesByWord: new Map(), scopeKey: "cet4:core", random: smart.createSeededRandom(2) });
  assert.deepEqual(afterScope.slice(0, 20), first);
  assert.ok(afterScope.slice(20).every((id) => core.includes(id)));
});

test("localStorage persists only IDs and never copies frequency statistics", () => {
  const { app, localStorage } = loadApp();
  const frequency = new Map([["alpha", { frequencyTier: "S", tokenCount: 999, sessionCount: 10 }]]);
  app.storage.getOrCreateDailyNewWordIds("cet4", ["alpha"], 1, { learningOrder: "smart", frequencyByWord: frequency, overridesByWord: new Map(), scopeKey: "cet4:core", random: () => 0 });
  const stored = localStorage.getItem("cetwords-user-data-v1");
  assert.equal(stored.includes("tokenCount"), false);
  assert.equal(stored.includes("sessionCount"), false);
});

test("frequency resource failure produces explicit random fallback status", async () => {
  const result = await smart.loadFrequencyResources(async () => ({ ok: false, json: async () => ({}) }));
  assert.equal(result.status, "fallback-random");
  assert.equal(result.maps.cet4, null);
});

test("review priority is based only on personal weakness and respects caps", () => {
  const score = scheduler.calculateReviewPriority({ masteryLevel: 0, correctCount: 0, wrongCount: 10, nextReviewTime: now - 100 * 24 * 60 * 60 * 1000, lastWrongTime: now }, now);
  assert.equal(score.overdueScore, 50);
  assert.equal(score.masteryScore, 25);
  assert.equal(score.errorRateScore, 15);
  assert.equal(score.recentWrongScore, 10);
  assert.equal(score.total, 100);
});

test("review queue places the weaker due word first without frequency input", () => {
  const stronger = { learned: true, masteryLevel: 4, correctCount: 20, wrongCount: 1, nextReviewTime: now - 60_000, lastWrongTime: now - 20 * 24 * 60 * 60 * 1000 };
  const weaker = { learned: true, masteryLevel: 1, correctCount: 2, wrongCount: 8, nextReviewTime: now - 60_000, lastWrongTime: now - 60_000 };
  assert.equal(scheduler.getDueWords([{ wordId: "strong", progress: stronger }, { wordId: "weak", progress: weaker }], now)[0].wordId, "weak");
});

(async () => {
  await Promise.all(pending);
  console.log(`\nPhase 13B tests: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
})();
