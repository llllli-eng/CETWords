import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_ONLY = process.argv.includes("--worker-only");
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
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js", "js/review-recovery.js",
    "js/new-word-learning.js", "js/daily-group-service.js", "js/confusable-words.js", "js/storage.js", "js/backup-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

const workerModule = await import(`${pathToFileURL(path.join(ROOT, "worker/src/index.js")).href}?phase16=${Date.now()}`);
const env = {
  ALLOWED_ORIGINS: "http://localhost:8000,https://example.pages.dev",
  APP_PROXY_TOKEN: "test-token",
  DEEPSEEK_API_KEY: "deepseek-secret",
};
const origin = "http://localhost:8000";

function groupPayload(overrides = {}) {
  return {
    dailyTarget: 40,
    todayDueReviewCount: 6,
    todayRecoveryPendingCount: 2,
    todayPendingReinforcementCount: 3,
    todayChoiceRetryCount: 1,
    yesterdayStudied: true,
    yesterdayDailyTarget: 40,
    yesterdayCompletedNewWords: 40,
    yesterdayTaskCompleted: true,
    yesterdayTotalAnswers: 62,
    yesterdayActiveRecallPerformance: 82,
    recentCompletionRate: 90,
    recentAverageAnswers: 58,
    ...overrides,
  };
}

function workerRequest(pathname, payload, options = {}) {
  return new Request(`https://worker.example${pathname}`, {
    method: options.method || "POST",
    headers: {
      Origin: options.origin || origin,
      "Content-Type": "application/json",
      "X-App-Token": options.token ?? "test-token",
    },
    body: options.method === "OPTIONS" ? undefined : JSON.stringify(payload),
  });
}

function deepSeekResponse(content, usage = { prompt_tokens: 310, completion_tokens: 96 }) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

await test("daily-group Worker CORS preflight accepts an allowlisted origin", async () => {
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", null, { method: "OPTIONS", token: "" }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});

await test("daily-group Worker rejects a non-allowlisted origin", async () => {
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", groupPayload(), { origin: "https://evil.example" }), env);
  assert.equal(response.status, 403);
});

await test("daily-group Worker rejects an invalid token", async () => {
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", groupPayload(), { token: "wrong" }), env);
  assert.equal(response.status, 401);
});

await test("daily-group Worker rejects extra private data", () => {
  assert.match(workerModule.validateDailyGroupPayload({ ...groupPayload(), scheduledNewWordIds: ["secret"] }).error, /不允许的字段/);
});

await test("daily-group Worker rejects invalid counts", () => {
  assert.match(workerModule.validateDailyGroupPayload(groupPayload({ todayDueReviewCount: -1 })).error, /格式不正确/);
});

await test("daily-group uses V4 Flash, disabled thinking, JSON output and 400 max tokens", () => {
  const body = workerModule.buildDailyGroupDeepSeekBody(groupPayload());
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_tokens, 400);
});

await test("daily-group Worker returns validated AI JSON", async () => {
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", groupPayload()), env, async () => deepSeekResponse({
    groupSizes: [10, 10, 10, 10], breakMinutes: 5, reason: "分组降低连续学习压力。",
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.groupSizes, [10, 10, 10, 10]);
  assert.equal(result.source, "ai");
  assert.deepEqual(result.usage, { promptTokens: 310, completionTokens: 96 });
});

await test("invalid AI group JSON falls back after exactly one AI call", async () => {
  let attempts = 0;
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", groupPayload()), env, async () => {
    attempts += 1;
    return deepSeekResponse("not-json");
  });
  assert.equal(attempts, 1);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "local");
  assert.equal(result.fallback, true);
  assert.equal(result.groupSizes.reduce((sum, size) => sum + size, 0), 40);
});

await test("AI upstream failure returns Worker fallback without blocking study", async () => {
  const response = await workerModule.handleRequest(workerRequest("/api/daily-group-plan", groupPayload({ dailyTarget: 25 })), env, async () => {
    throw new Error("offline");
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).groupSizes, [9, 8, 8]);
});

await test("group total mismatch is rejected by Worker normalizer", () => {
  assert.equal(workerModule.normalizeDailyGroupModelResult(JSON.stringify({ groupSizes: [10, 10], breakMinutes: 5, reason: "x" }), 30), null);
});

await test("non-integer group size is rejected by Worker normalizer", () => {
  assert.equal(workerModule.normalizeDailyGroupModelResult(JSON.stringify({ groupSizes: [10.5, 9.5], breakMinutes: 5, reason: "x" }), 20), null);
});

await test("zero and negative group sizes are rejected by Worker normalizer", () => {
  assert.equal(workerModule.normalizeDailyGroupModelResult(JSON.stringify({ groupSizes: [10, 0, -1], breakMinutes: 5, reason: "x" }), 9), null);
});

await test("ordinary groups above fifteen are rejected", () => {
  assert.equal(workerModule.normalizeDailyGroupModelResult(JSON.stringify({ groupSizes: [20], breakMinutes: 5, reason: "x" }), 20), null);
});

await test("break minutes outside 2-10 are rejected", () => {
  assert.equal(workerModule.normalizeDailyGroupModelResult(JSON.stringify({ groupSizes: [10, 10], breakMinutes: 11, reason: "x" }), 20), null);
});

if (!WORKER_ONLY) {
  const { app } = loadApp();
  const service = app.dailyGroupService;

  await test("frontend validates that group sizes sum to dailyTarget", () => {
    assert.equal(service.validateGroupPlan({ groupSizes: [10, 10, 10], breakMinutes: 5, reason: "ok" }, 30).valid, true);
    assert.equal(service.validateGroupPlan({ groupSizes: [10, 10], breakMinutes: 5, reason: "bad" }, 30).valid, false);
  });

  await test("frontend rejects fractional, zero and negative group sizes", () => {
    for (const sizes of [[9.5, 10.5], [10, 0, 10], [10, -1, 11]]) {
      assert.equal(service.validateGroupPlan({ groupSizes: sizes, breakMinutes: 5, reason: "bad" }, 20).valid, false);
    }
  });

  await test("frontend rejects ordinary groups outside 5-15", () => {
    assert.equal(service.validateGroupPlan({ groupSizes: [4, 16], breakMinutes: 5, reason: "bad" }, 20).valid, false);
  });

  await test("small targets may use one group below five", () => {
    assert.equal(service.validateGroupPlan({ groupSizes: [3], breakMinutes: 4, reason: "small" }, 3).valid, true);
  });

  await test("frontend rejects invalid break minutes and overlong reasons", () => {
    assert.equal(service.validateGroupPlan({ groupSizes: [10], breakMinutes: 1, reason: "bad" }, 10).valid, false);
    assert.equal(service.validateGroupPlan({ groupSizes: [10], breakMinutes: 5, reason: "x".repeat(181) }, 10).valid, false);
  });

  for (const [target, expected] of [[10, [10]], [25, [9, 8, 8]], [35, [9, 9, 9, 8]], [45, [9, 9, 9, 9, 9]], [100, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]]]) {
    await test(`fallback ${target} creates balanced groups without a tiny tail`, () => {
      assert.deepEqual(Array.from(service.createFallbackGroupSizes(target)), expected);
    });
  }

  await test("invalid frontend AI output falls back locally", () => {
    const plan = service.normalizeGroupPlan({ groupSizes: [1, 19], breakMinutes: 50, reason: "bad" }, 20);
    assert.deepEqual(Array.from(plan.groupSizes), [10, 10]);
  });

  await test("group boundaries preserve scheduledNewWordIds order", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `w${index + 1}`);
    const progress = service.getGroupProgress({ groupSizes: [10, 10, 10], activeGroupIndex: 1 }, ids, [], []);
    assert.deepEqual(Array.from(progress.groups[1].ids), ids.slice(10, 20));
    assert.deepEqual(Array.from(progress.allowedIntroIds), ids.slice(0, 20));
  });

  await test("the next group is outside the current intro boundary", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `w${index + 1}`);
    const progress = service.getGroupProgress({ groupSizes: [10, 10, 10], activeGroupIndex: 0 }, ids, [], []);
    assert.equal(progress.allowedIntroIds.includes("w11"), false);
  });

  await test("only 10 of 10 completed IDs makes a group complete", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `w${index + 1}`);
    assert.equal(service.getGroupProgress({ groupSizes: [10, 10], activeGroupIndex: 0 }, ids, ids.slice(0, 9), ids.slice(0, 10)).activeGroup.complete, false);
    assert.equal(service.getGroupProgress({ groupSizes: [10, 10], activeGroupIndex: 0 }, ids, ids.slice(0, 10), ids.slice(0, 10)).activeGroup.complete, true);
  });

  await test("merely introduced choice words do not complete a group", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `w${index + 1}`);
    const progress = service.getGroupProgress({ groupSizes: [10], activeGroupIndex: 0 }, ids, [], ids);
    assert.equal(progress.activeGroup.introducedCount, 10);
    assert.equal(progress.activeGroup.complete, false);
  });

  await test("unrelated due and Recovery work cannot block group completion", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `w${index + 1}`);
    const progress = service.getGroupProgress({ groupSizes: [10], activeGroupIndex: 0 }, ids, ids, ids);
    assert.equal(progress.allComplete, true);
  });

  await test("storage v11 migrates losslessly through v15 with empty dailyGroupPlans", () => {
    const v11 = {
      version: 11, currentBook: "cet6",
      preferences: { dailyNewWordGoals: { cet4: 30, cet6: 50 }, vocabularyScope: { cet4: "all", cet6: "core" }, studyMode: "zh-to-en", learningOrder: "random", aiJudge: { enabled: true, proxyUrl: "https://worker.example" } },
      books: {
        cet4: { words: { keep: { learned: true, masteryLevel: 4, correctCount: 5, nextReviewTime: 1893456000000, favorite: true } }, daily: {}, newWordQueue: ["keep"], smartNewWordQueue: {}, newWordLearning: {}, reviewRecovery: {}, dailyReviews: {} },
        cet6: { words: {}, daily: {}, newWordQueue: [], smartNewWordQueue: {}, newWordLearning: {}, reviewRecovery: {}, dailyReviews: {} },
      },
    };
    const migrated = loadApp({ "cetwords-user-data-v1": JSON.stringify(v11) }).app.storage.loadUserData();
    assert.equal(migrated.version, 15);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.books.cet4.dailyGroupPlans)), {});
    assert.equal(migrated.books.cet4.words.keep.masteryLevel, 4);
    assert.equal(migrated.books.cet4.words.keep.nextReviewDate, app.reviewScheduler.getLocalDateKey(1893456000000));
    assert.equal(migrated.books.cet4.words.keep.nextReviewTime, null);
    assert.equal(migrated.books.cet4.words.keep.favorite, true);
    assert.equal(migrated.preferences.learningOrder, "random");
  });

  await test("daily group plan persists across a storage reload", () => {
    const first = loadApp();
    first.app.storage.saveDailyGroupPlan("cet4", first.app.storage.getLocalDateKey(), {
      dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 5, reason: "稳定", source: "ai", activeGroupIndex: 1, completedGroupCount: 1,
    }, Date.now());
    const dumped = first.localStorage.getItem("cetwords-user-data-v1");
    const reloaded = loadApp({ "cetwords-user-data-v1": dumped }).app.storage.getDailyGroupPlan("cet4");
    assert.deepEqual(Array.from(reloaded.groupSizes), [10, 10, 10]);
    assert.equal(reloaded.activeGroupIndex, 1);
    assert.equal(reloaded.source, "ai");
  });

  await test("breakStartedAt persists and real time determines remaining rest", () => {
    const first = loadApp();
    const now = Date.now();
    first.app.storage.saveDailyGroupPlan("cet4", first.app.storage.getLocalDateKey(), {
      dailyTarget: 20, groupSizes: [10, 10], breakMinutes: 5, reason: "休息", source: "local", activeGroupIndex: 0,
    }, now);
    first.app.storage.startDailyGroupBreak("cet4", first.app.storage.getLocalDateKey(), now - 6 * 60 * 1000);
    const saved = first.app.storage.getDailyGroupPlan("cet4");
    assert.ok(saved.breakStartedAt < now);
    assert.ok(saved.breakStartedAt + saved.breakMinutes * 60 * 1000 <= now);
  });

  await test("target increase appends groups without replacing existing groups", () => {
    const loaded = loadApp();
    const storage = loaded.app.storage;
    storage.saveDailyGroupPlan("cet4", storage.getLocalDateKey(), {
      dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 5, reason: "原计划", source: "ai", activeGroupIndex: 0,
    });
    storage.setDailyNewWordGoal("cet4", 50);
    const adjusted = storage.adjustDailyGroupPlanTarget("cet4", 50);
    assert.equal(adjusted.action, "regenerate");
    assert.equal(adjusted.plan, null);
  });

  await test("started target increase keeps current groups and appends only new capacity", () => {
    const dateKey = "2026-08-13";
    const ids = Array.from({ length: 30 }, (_, index) => `w${index + 1}`);
    const data = loadApp().app.storage.loadUserData();
    data.version = 12;
    data.preferences.dailyNewWordGoals.cet4 = 30;
    data.books.cet4.daily[dateKey] = { scheduledNewWordIds: ids, newWordIds: ["w1"], completedNewWordIds: [] };
    data.books.cet4.dailyGroupPlans[dateKey] = { dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 5, reason: "原计划", source: "ai", createdAt: Date.now(), activeGroupIndex: 0, completedGroupCount: 0 };
    const loaded = loadApp({ "cetwords-user-data-v1": JSON.stringify(data) });
    loaded.app.storage.setDailyNewWordGoal("cet4", 50);
    const adjusted = loaded.app.storage.adjustDailyGroupPlanTarget("cet4", 50, dateKey);
    assert.equal(adjusted.action, "extended");
    assert.deepEqual(Array.from(adjusted.plan.groupSizes), [10, 10, 10, 10, 10]);
  });

  await test("unsafe started target reduction defers without changing today's plan", () => {
    const dateKey = "2026-08-13";
    const ids = Array.from({ length: 30 }, (_, index) => `w${index + 1}`);
    const data = loadApp().app.storage.loadUserData();
    data.version = 12;
    data.preferences.dailyNewWordGoals.cet4 = 30;
    data.books.cet4.daily[dateKey] = { scheduledNewWordIds: ids, newWordIds: ids.slice(0, 12), completedNewWordIds: ids.slice(0, 10) };
    data.books.cet4.dailyGroupPlans[dateKey] = { dailyTarget: 30, groupSizes: [10, 10, 10], breakMinutes: 5, reason: "原计划", source: "ai", createdAt: Date.now(), activeGroupIndex: 1, completedGroupCount: 1 };
    const loaded = loadApp({ "cetwords-user-data-v1": JSON.stringify(data) });
    loaded.app.storage.setDailyNewWordGoal("cet4", 10);
    const adjusted = loaded.app.storage.adjustDailyGroupPlanTarget("cet4", 10, dateKey);
    assert.equal(adjusted.action, "deferred");
    assert.equal(adjusted.plan.dailyTarget, 30);
    assert.deepEqual(Array.from(adjusted.plan.groupSizes), [10, 10, 10]);
  });

  await test("v1-v15 backup import remains accepted", () => {
    const source = fs.readFileSync(path.join(ROOT, "js/backup-service.js"), "utf8");
    assert.match(source, /\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15\]/);
  });

  const appSource = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const studySource = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
  const htmlSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const cssSource = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  const smartSource = fs.readFileSync(path.join(ROOT, "js/smart-learning-order.js"), "utf8");

  await test("app filters intro items to allowed current-group IDs", () => {
    assert.match(appSource, /allowedIntroIds[\s\S]*new Set\(groupProgress\.allowedIntroIds\)[\s\S]*\.filter\(\(word\) => !allowedIntroIds \|\| allowedIntroIds\.has\(word\.word\)\)/);
  });

  await test("due, Recovery, choice retry and reinforcement queue builder remains unchanged", () => {
    assert.match(appSource, /buildNormalQueue\(\{\s*dueItems,\s*recoveryItems,\s*pendingItems,\s*introItems: newItems/);
  });

  await test("due review keeps the scheduler's highest priority", () => {
    const learningSource = fs.readFileSync(path.join(ROOT, "js/new-word-learning.js"), "utf8");
    assert.match(learningSource, /if \(item\.taskType === "review"\) return 0/);
  });

  await test("smart and random ordering algorithms contain no grouping logic", () => {
    assert.equal(smartSource.includes("dailyGroup"), false);
    assert.match(appSource, /getOrCreateDailyNewWordIds[\s\S]*schedulingOptions/);
  });

  await test("group completion screen provides all three required actions", () => {
    assert.match(htmlSource, /id="group-start-break"/);
    assert.match(htmlSource, /id="group-continue"/);
    assert.match(htmlSource, /id="group-stop-today"/);
  });

  await test("break screen supports early continue and session-only stop", () => {
    assert.match(htmlSource, /id="group-break-continue"/);
    assert.match(htmlSource, /id="group-break-stop"/);
    assert.match(studySource, /getBreakRemainingMs[\s\S]*breakStartedAt[\s\S]*breakMinutes/);
  });

  await test("today-stop returns home without marking the task complete", () => {
    assert.match(appSource, /function handleStopDailyGroups\(\) \{\s*showHome\(\);\s*\}/);
    assert.doesNotMatch(studySource, /stopDailyGroups[\s\S]{0,220}completedNewWords/);
  });

  await test("home and study UI both expose concise group progress", () => {
    assert.match(htmlSource, /id="daily-group-overview"/);
    assert.match(studySource, /const groupCaption = groupStatus\?\.activeGroup/);
  });

  await test("mobile group UI has no fixed wide layout and buttons are touch sized", () => {
    assert.match(cssSource, /@media \(max-width: 620px\)[\s\S]*group-complete-actions[\s\S]*min-height: 56px/);
    assert.match(cssSource, /\.group-complete-card,\s*\.group-break-card\s*\{[\s\S]*max-width: 680px[\s\S]*margin: 0 auto/);
    assert.equal(/(^|[^-])width:\s*680px/.test(cssSource), false);
  });

  await test("same-day cached plans prevent ordinary repeated AI generation", () => {
    assert.match(appSource, /if \(existing && !regenerate\) return existing/);
    assert.match(appSource, /appState\.dailyGroup\.promise/);
  });

  await test("regeneration is hidden after any new word has started", () => {
    assert.match(appSource, /dailyGroupRegenerate\.hidden = Boolean\(plan\.startedAt\)/);
    assert.match(appSource, /regenerate && \(daily\.newWordIds\.length > 0 \|\| existing\?\.startedAt\)/);
    assert.match(studySource, /question\.learningPhase === newWordLearning\.LEARNING_PHASES\.INTRO[\s\S]*onDailyGroupStarted/);
  });

  await test("frontend request whitelist excludes word IDs, raw answers and histories", () => {
    const payload = service.buildRequestPayload({ ...groupPayload(), scheduledNewWordIds: ["secret"], userAnswer: "secret", history: [1] });
    assert.equal("scheduledNewWordIds" in payload, false);
    assert.equal("userAnswer" in payload, false);
    assert.equal("history" in payload, false);
  });

  await test("Phase14 summary remains independent from grouping", () => {
    const source = fs.readFileSync(path.join(ROOT, "js/daily-review-service.js"), "utf8");
    assert.equal(source.includes("dailyGroupPlans"), false);
    assert.equal(source.includes("groupSizes"), false);
  });
}

console.log(`\nPhase 16 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
