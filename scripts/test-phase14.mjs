import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_ONLY = process.argv.includes("--worker-only");
let passed = 0;
let failed = 0;
let representativePayloadTokens = 0;

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
    "js/review-scheduler.js",
    "js/smart-learning-order.js",
    "js/review-recovery.js",
    "js/new-word-learning.js",
    "js/storage.js",
    "js/daily-review-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

function sampleWord(word, meaning = `释义 ${word}`) {
  return {
    word,
    coreMeaning: meaning,
    meaning: meaning,
    meanings: [{ meaning }, { meaning: `${meaning}；常见义` }],
  };
}

function makeDaily(overrides = {}) {
  return {
    dateKey: "2026-08-13",
    completedNewWords: 30,
    answerCount: 52,
    learningMetrics: {
      firstChoice: { correct: 21, wrong: 9 },
      choiceRetryCount: 7,
      reinforcement: { correct: 22, partial: 3, wrong: 4 },
      choiceModes: {
        "en-to-zh": { answerCount: 20, correctCount: 16, wrongCount: 4 },
        "zh-to-en": { answerCount: 17, correctCount: 10, wrongCount: 7 },
      },
      words: {},
    },
    ...overrides,
  };
}

function makeWordMetric(index) {
  return {
    choiceWrongCount: index % 3,
    choiceRetryCount: index % 4,
    reinforcementWrongCount: index % 2,
    reinforcementPartialCount: index % 5 === 0 ? 1 : 0,
    eventuallyPassed: index % 2 === 0,
  };
}

function buildReviewFixture(service, count = 14) {
  const words = Array.from({ length: count }, (_, index) => sampleWord(`word-${index}`, `核心义 ${index}`));
  const wordMetrics = Object.fromEntries(words.map((word, index) => [word.word, makeWordMetric(index + 1)]));
  return service.buildLocalReview({
    bookId: "cet4",
    dailyTarget: 30,
    daily: makeDaily({ learningMetrics: { ...makeDaily().learningMetrics, words: wordMetrics } }),
    words,
    getProgress: (wordId) => ({ correctCount: wordId.length % 4, wrongCount: wordId.length % 3 }),
  });
}

const workerModule = await import(`${pathToFileURL(path.join(ROOT, "worker/src/index.js")).href}?phase14=${Date.now()}`);
const env = {
  ALLOWED_ORIGINS: "http://localhost:8000,https://example.pages.dev",
  APP_PROXY_TOKEN: "test-token",
  DEEPSEEK_API_KEY: "deepseek-secret",
};
const origin = "http://localhost:8000";

function validDailyPayload() {
  const { app } = loadApp();
  return app.dailyReviewService.buildRequestPayload(buildReviewFixture(app.dailyReviewService));
}

function workerRequest(pathname, payload, options = {}) {
  return new Request(`https://worker.example${pathname}`, {
    method: options.method || "POST",
    headers: {
      Origin: options.origin || origin,
      "Content-Type": "application/json",
      "X-App-Token": options.token ?? "test-token",
    },
    body: options.method === "GET" || options.method === "OPTIONS" ? undefined : JSON.stringify(payload),
  });
}

function deepSeekResponse(content, usage = { prompt_tokens: 980, completion_tokens: 420 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

await test("Worker CORS preflight accepts an allowlisted origin", async () => {
  const request = workerRequest("/api/daily-review", null, { method: "OPTIONS", token: "" });
  const response = await workerModule.handleRequest(request, env, () => { throw new Error("unexpected"); });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});

await test("Worker rejects a non-allowlisted origin", async () => {
  const response = await workerModule.handleRequest(
    workerRequest("/api/daily-review", validDailyPayload(), { origin: "https://evil.example" }),
    env,
  );
  assert.equal(response.status, 403);
});

await test("Worker rejects an invalid app token", async () => {
  const response = await workerModule.handleRequest(
    workerRequest("/api/daily-review", validDailyPayload(), { token: "wrong" }),
    env,
  );
  assert.equal(response.status, 401);
});

await test("daily-review validation rejects raw user answers", async () => {
  const payload = { ...validDailyPayload(), userAnswer: "我猜是……" };
  const validation = workerModule.validateDailyReviewPayload(payload);
  assert.match(validation.error, /不允许的字段/);
});

await test("daily-review uses V4 Flash, disabled thinking, JSON output and 800 max tokens", async () => {
  const body = workerModule.buildDailyReviewDeepSeekBody(validDailyPayload());
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_tokens, 800);
});

await test("daily-review returns normalized JSON and filters invented focus words", async () => {
  const payload = validDailyPayload();
  const allowedWord = payload.weakWords[0].word;
  const response = await workerModule.handleRequest(workerRequest("/api/daily-review", payload), env, async () => deepSeekResponse({
    summary: "今天完成任务，主动提取仍需加强。",
    strengths: ["完成了今日新词"],
    weaknesses: ["部分词重复出错"],
    focusWords: [
      { word: allowedWord, reason: "重复错误", suggestion: "先主动回忆核心义" },
      { word: "invented", reason: "编造", suggestion: "不应出现" },
    ],
    tomorrowAdvice: ["完成系统安排的到期复习"],
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.focusWords.length, 1);
  assert.equal(body.focusWords[0].word, allowedWord);
  assert.deepEqual(body.usage, { promptTokens: 980, completionTokens: 420 });
});

await test("invalid AI JSON retries then returns a safe error", async () => {
  let attempts = 0;
  const response = await workerModule.handleRequest(workerRequest("/api/daily-review", validDailyPayload()), env, async () => {
    attempts += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 });
  });
  assert.equal(attempts, 2);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "AI_INVALID_RESPONSE");
});

await test("the original judge-meaning endpoint remains compatible", async () => {
  let upstreamBody;
  const response = await workerModule.handleRequest(workerRequest("/api/judge-meaning", {
    word: "paper",
    coreMeaning: "纸；论文；试卷",
    meanings: [{ pos: "n.", meaning: "纸" }],
    meaningsByPos: { "n.": ["纸"] },
    userAnswer: "纸",
  }), env, async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return deepSeekResponse({ result: "correct", confidence: 0.98, matchedMeaning: "纸", feedback: "正确" });
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result, "correct");
  assert.equal(upstreamBody.max_tokens, 160);
});

if (!WORKER_ONLY) {
  const { app } = loadApp();
  const { storage, dailyReviewService: service, newWordLearning } = app;

  await test("unfinished daily target cannot generate a formal review", () => {
    const local = service.buildLocalReview({ bookId: "cet4", dailyTarget: 30, daily: makeDaily({ completedNewWords: 29 }) });
    assert.equal(local.canGenerate, false);
  });

  await test("completed daily target enables the review entry", () => {
    const local = service.buildLocalReview({ bookId: "cet4", dailyTarget: 30, daily: makeDaily() });
    assert.equal(local.canGenerate, true);
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /id="daily-review-panel"[^>]*hidden/);
    assert.match(fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8"), /this\.onComplete\?\.\(session\)/);
  });

  await test("local accuracy and mode statistics are calculated exactly", () => {
    const local = service.buildLocalReview({ bookId: "cet4", dailyTarget: 30, daily: makeDaily() });
    assert.equal(local.statistics.firstChoiceAccuracy, 70);
    assert.equal(local.statistics.reinforcementPassRate, 76);
    assert.equal(local.statistics.choiceRetryCount, 7);
    assert.equal(local.statistics.enToZh.accuracy, 80);
    assert.equal(local.statistics.zhToEn.accuracy, 59);
  });

  await test("storage records first choice, retries, reinforcement and correction", () => {
    const timestamp = Date.now();
    storage.updateWordProgress("cet4", "metric-word", false, { timestamp, studyMode: "zh-to-en", sessionMode: "normal", taskType: "new", learningPhase: newWordLearning.LEARNING_PHASES.INTRO });
    storage.updateWordProgress("cet4", "metric-word", true, { timestamp: timestamp + 1, studyMode: "zh-to-en", sessionMode: "normal", taskType: "reinforcement", learningPhase: newWordLearning.LEARNING_PHASES.CHOICE_RETRY });
    storage.updateWordProgress("cet4", "metric-word", "partial", { timestamp: timestamp + 2, judgement: "partial", studyMode: "ai-meaning", sessionMode: "normal", taskType: "reinforcement", learningPhase: newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT });
    storage.updateWordProgress("cet4", "metric-word", true, { timestamp: timestamp + 3, judgement: "correct", studyMode: "ai-meaning", sessionMode: "normal", taskType: "reinforcement", learningPhase: newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT });
    const metrics = storage.getDailyStats("cet4").learningMetrics;
    assert.deepEqual(JSON.parse(JSON.stringify(metrics.firstChoice)), { correct: 0, wrong: 1 });
    assert.equal(metrics.choiceRetryCount, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(metrics.reinforcement)), { correct: 1, partial: 1, wrong: 0 });
    assert.equal(metrics.choiceModes["zh-to-en"].answerCount, 2);
    assert.equal(metrics.words["metric-word"].eventuallyPassed, true);
  });

  await test("weak words are sorted by local risk score", () => {
    const local = buildReviewFixture(service);
    const scores = local.weakWords.map((entry) => entry.dailyRiskScore);
    assert.deepEqual(Array.from(scores), Array.from(scores).sort((left, right) => right - left));
  });

  await test("weak words are capped at ten", () => {
    assert.equal(buildReviewFixture(service, 30).weakWords.length, 10);
  });

  await test("successfully corrected words are capped at five", () => {
    assert.equal(buildReviewFixture(service, 30).correctedWords.length, 5);
  });

  await test("daily risk score is review-only and bounded to 0-100", () => {
    assert.equal(service.calculateDailyRiskScore({ choiceWrongCount: 99, choiceRetryCount: 99, reinforcementWrongCount: 99 }, { wrongCount: 99 }), 100);
    assert.equal(service.calculateDailyRiskScore({ eventuallyPassed: true }, {}), 0);
  });

  await test("request payload is whitelisted and never includes the full vocabulary", () => {
    const payload = service.buildRequestPayload(buildReviewFixture(service, 30));
    assert.deepEqual(Object.keys(payload), ["date", "level", "statistics", "weakWords", "correctedWords"]);
    assert.equal(payload.weakWords.length, 10);
    assert.equal(JSON.stringify(payload).includes("examples"), false);
  });

  await test("request payload never includes raw Chinese answers or history", () => {
    const text = JSON.stringify(service.buildRequestPayload(buildReviewFixture(service, 30)));
    for (const forbidden of ["userAnswer", "rawAnswer", "answerHistory", "allWords", "examText", "nextReviewTime"]) {
      assert.equal(text.includes(forbidden), false);
    }
  });

  await test("frontend parses review JSON and separates token usage", async () => {
    const result = await service.requestDailyReview({
      payload: service.buildRequestPayload(buildReviewFixture(service)),
      proxyUrl: "https://worker.example",
      token: "token",
      fetchImpl: async () => new Response(JSON.stringify({
        summary: "总结",
        strengths: ["优点"], weaknesses: ["不足"], focusWords: [], tomorrowAdvice: ["建议"],
        usage: { promptTokens: 1000, completionTokens: 360 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    });
    assert.equal(result.review.summary, "总结");
    assert.deepEqual(JSON.parse(JSON.stringify(result.usage)), { promptTokens: 1000, completionTokens: 360 });
  });

  await test("frontend rejects malformed review JSON safely", async () => {
    await assert.rejects(() => service.requestDailyReview({
      payload: {}, proxyUrl: "https://worker.example", token: "token",
      fetchImpl: async () => new Response(JSON.stringify({ summary: "缺字段" }), { status: 200 }),
    }), /AI_INVALID_RESPONSE/);
  });

  await test("review result persists and survives a storage reload", () => {
    const dateKey = storage.getLocalDateKey();
    storage.saveDailyReviewRecord("cet4", dateKey, {
      dailyTarget: 30, completedNewWords: 30,
      review: { summary: "缓存复盘", strengths: [], weaknesses: [], focusWords: [], tomorrowAdvice: [] },
      usage: { promptTokens: 900, completionTokens: 300 },
    }, Date.now());
    const rawStorage = storage.loadUserData();
    const reloaded = loadApp({ "cetwords-user-data-v1": JSON.stringify(rawStorage) }).app.storage;
    assert.equal(reloaded.getDailyReviewRecord("cet4", dateKey).review.summary, "缓存复盘");
  });

  await test("changing the daily target from 30 to 50 marks cached review stale", () => {
    const dateKey = storage.getLocalDateKey();
    storage.setDailyNewWordGoal("cet6", 30);
    storage.saveDailyReviewRecord("cet6", dateKey, {
      dailyTarget: 30, completedNewWords: 30,
      review: { summary: "旧复盘", strengths: [], weaknesses: [], focusWords: [], tomorrowAdvice: [] },
    });
    storage.setDailyNewWordGoal("cet6", 50);
    assert.equal(storage.getDailyReviewRecord("cet6", dateKey).stale, true);
  });

  await test("saving a review does not modify mastery, next review or wrong-book state", () => {
    const timestamp = Date.now();
    storage.updateWordProgress("cet4", "invariant-word", false, { timestamp, sessionMode: "wrong", taskType: "practice" });
    const before = storage.getWordProgress("cet4", "invariant-word");
    storage.saveDailyReviewRecord("cet4", storage.getLocalDateKey(), {
      dailyTarget: 30, completedNewWords: 30,
      review: { summary: "只读复盘", strengths: [], weaknesses: [], focusWords: [], tomorrowAdvice: [] },
    });
    const after = storage.getWordProgress("cet4", "invariant-word");
    assert.equal(after.masteryLevel, before.masteryLevel);
    assert.equal(after.nextReviewTime, before.nextReviewTime);
    assert.equal(after.inWrongBook, before.inWrongBook);
  });

  await test("v9 remains lossless through v11 with empty dailyReviews and recovery maps", () => {
    const today = "2026-08-13";
    const v9 = {
      version: 9, currentBook: "cet6",
      preferences: { dailyNewWordGoals: { cet4: 30, cet6: 50 }, vocabularyScope: { cet4: "core", cet6: "all" }, studyMode: "zh-to-en", learningOrder: "random" },
      books: {
        cet4: { words: { keep: { learned: true, masteryLevel: 4, correctCount: 8, wrongCount: 2, nextReviewTime: 1893456000000, inWrongBook: true } }, daily: { [today]: { answerCount: 10, correctCount: 8, wrongCount: 2 } }, newWordQueue: ["keep"], newWordLearning: {} },
        cet6: { words: {}, daily: {}, newWordQueue: [], newWordLearning: {} },
      },
    };
    const migrated = loadApp({ "cetwords-user-data-v1": JSON.stringify(v9) }).app.storage.loadUserData();
    assert.equal(migrated.version, 11);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.books.cet4.dailyReviews)), {});
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.books.cet4.reviewRecovery)), {});
    assert.equal(migrated.books.cet4.words.keep.masteryLevel, 4);
    assert.equal(migrated.books.cet4.words.keep.nextReviewTime, 1893456000000);
    assert.equal(migrated.books.cet4.daily[today].answerCount, 10);
    assert.equal(migrated.preferences.learningOrder, "random");
  });

  await test("v1-v11 remain accepted backup versions", () => {
    const source = fs.readFileSync(path.join(ROOT, "js/backup-service.js"), "utf8");
    assert.match(source, /\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11\]/);
  });

  await test("a representative maximum payload stays within the 800-2500 token target", () => {
    const vocabulary = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cet4.json"), "utf8")).slice(0, 15);
    const words = vocabulary.map((word) => word.word);
    const metrics = Object.fromEntries(words.map((word, index) => [word, {
      choiceWrongCount: 2 + (index % 2), choiceRetryCount: 2, reinforcementWrongCount: index % 2,
      reinforcementPartialCount: 1, eventuallyPassed: index < 5,
    }]));
    const local = service.buildLocalReview({
      bookId: "cet4", dailyTarget: 30,
      daily: makeDaily({ learningMetrics: { ...makeDaily().learningMetrics, words: metrics } }),
      words: vocabulary, getProgress: () => ({ correctCount: 4, wrongCount: 2 }),
    });
    representativePayloadTokens = Math.ceil(JSON.stringify(service.buildRequestPayload(local)).length / 3);
    assert.ok(representativePayloadTokens >= 800 && representativePayloadTokens <= 2500, `estimated ${representativePayloadTokens} tokens`);
  });
}

console.log(`\nPhase 14 tests: ${passed} passed, ${failed} failed`);
if (representativePayloadTokens) console.log(`Representative daily-review input: ~${representativePayloadTokens} tokens`);
if (failed) process.exitCode = 1;
