import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE_KEY = "cetwords-user-data-v1";
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

function loadApp(initialStorage = {}, fetchImpl = () => Promise.reject(new Error("not mocked"))) {
  const localStorage = createLocalStorage(initialStorage);
  const window = { CETWords: {}, localStorage, fetch: fetchImpl };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
  });
  [
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js",
    "js/review-recovery.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "js/confusable-words.js", "js/storage.js", "js/backup-service.js",
  ].forEach((file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file }));
  return { app: window.CETWords, localStorage, context };
}

function loadConfusableAi(fetchImpl) {
  const loaded = loadApp({}, fetchImpl);
  loaded.app.storage.setAiJudgeSettings({ enabled: true, proxyUrl: "https://worker.example" });
  loaded.app.storage.setAiProxyToken("token");
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/confusable-ai.js"), "utf8"), loaded.context, { filename: "js/confusable-ai.js" });
  return loaded;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

const books = ["cet4", "cet6"].flatMap((bookId) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/${bookId}.json`), "utf8")));
const byId = new Map(books.map((word) => [word.id, word]));
const formal = (spelling, book = "cet4") => books.find((word) => word.book === book && word.word === spelling);
const { app, localStorage } = loadApp();
const { confusableWords, storage } = app;
const adapt = formal("adapt");
const adopt = formal("adopt");
const affect = formal("affect");
const effect = formal("effect");
let practiceStateBefore;

await test("01 pair A↔B is created with stable wordIds", () => {
  const result = storage.addConfusablePair(adapt.id, adopt.id, { types: ["spelling"], source: "manual", now: 100 });
  assert.equal(result.changed, true);
  assert.equal(result.pair.wordIdA, adapt.id);
  assert.equal(result.pair.wordIdB, adopt.id);
});

await test("02 reverse B↔A does not duplicate", () => {
  const result = storage.addConfusablePair(adopt.id, adapt.id, { types: ["meaning"] });
  assert.equal(result.changed, false);
  assert.equal(Object.keys(storage.getConfusablePairs()).length, 1);
});

await test("03 a word cannot pair with itself", () => {
  const result = storage.addConfusablePair(adapt.id, adapt.id);
  assert.equal(result.changed, false);
  assert.match(result.error, /自己/);
});

await test("04 pair is visible from both sides", () => {
  assert.equal(storage.getConfusablePairsForWord(adapt.id).length, 1);
  assert.equal(storage.getConfusablePairsForWord(adopt.id).length, 1);
});

await test("05 deleting a pair removes it from both sides", () => {
  storage.removeConfusablePair(adopt.id, adapt.id);
  assert.equal(storage.getConfusablePairsForWord(adapt.id).length, 0);
  assert.equal(storage.getConfusablePairsForWord(adopt.id).length, 0);
});

await test("06 a pair stores at most two valid type labels", () => {
  const result = confusableWords.upsertPair({}, adapt.id, adopt.id, { types: ["spelling", "meaning", "usage", "bad"] });
  assert.deepEqual(Array.from(result.pair.types), ["spelling", "meaning"]);
});

await test("07 pair deletion does not change Level nextReviewDate or Recovery", () => {
  const state = storage.loadUserData();
  state.books.cet4.words.adapt = { learned: true, masteryLevel: 4, nextReviewDate: "2026-08-29" };
  state.books.cet4.reviewRecovery.adapt = { active: true, attemptCount: 2 };
  storage.saveUserData(state);
  const before = storage.loadUserData().books.cet4;
  storage.addConfusablePair(adapt.id, adopt.id);
  storage.removeConfusablePair(adapt.id, adopt.id);
  const after = storage.loadUserData().books.cet4;
  assert.equal(after.words.adapt.masteryLevel, before.words.adapt.masteryLevel);
  assert.equal(after.words.adapt.nextReviewDate, before.words.adapt.nextReviewDate);
  assert.deepEqual(JSON.parse(JSON.stringify(after.reviewRecovery.adapt)), JSON.parse(JSON.stringify(before.reviewRecovery.adapt)));
});

await test("08 manualMastered words can retain a pair", () => {
  storage.updateWordProgress("cet4", "adapt", { learned: true });
  storage.markWordManualMastered("cet4", "adapt");
  storage.addConfusablePair(adapt.id, adopt.id);
  assert.equal(storage.getConfusablePairsForWord(adapt.id).length, 1);
});

await test("09 exact English search ranks exact first", () => {
  assert.equal(confusableWords.searchWords(books, "adopt")[0].word.word, "adopt");
});

await test("10 prefix English search works", () => {
  const result = confusableWords.searchWords(books, "ad", { anchorWord: "adapt", excludeWord: "adapt" });
  assert.ok(result.some((item) => item.word.word === "adopt"));
});

await test("11 substring English search works", () => {
  const result = confusableWords.searchWords(books, "conom", { limit: 12 });
  assert.ok(result.some((item) => item.word.word === "economic"));
});

await test("12 Damerau-Levenshtein finds adpat as adapt", () => {
  assert.equal(confusableWords.searchWords(books, "adpat")[0].word.word, "adapt");
});

await test("13 Chinese coreMeaning search finds adopt for 采用", () => {
  assert.equal(confusableWords.searchWords(books, "采用")[0].word.word, "adopt");
});

await test("14 detailed meanings are searchable", () => {
  const sample = { id: "cet4-x", word: "xword", book: "cet4", coreMeaning: "甲", meanings: [{ meaning: "详细乙" }] };
  assert.equal(confusableWords.searchWords([sample], "详细乙")[0].word.word, "xword");
});

await test("15 meaningsByPos are searchable", () => {
  const sample = { id: "cet4-y", word: "yword", book: "cet4", coreMeaning: "甲", meaningsByPos: { "v.": ["分组丙"] } };
  assert.equal(confusableWords.searchWords([sample], "分组丙")[0].word.word, "yword");
});

await test("16 current word and same spelling in the other book are excluded", () => {
  const result = confusableWords.searchWords(books, "adapt", { excludeWordId: adapt.id, excludeWord: adapt.word });
  assert.equal(result.some((item) => item.word.word === "adapt"), false);
});

await test("17 candidates are de-duplicated by spelling across CET4/CET6", () => {
  const result = confusableWords.searchWords(books, "adopt", { limit: 12 });
  assert.equal(result.filter((item) => item.word.word === "adopt").length, 1);
});

await test("18 candidates respect the 8–12 hard limit", () => {
  assert.equal(confusableWords.searchWords(books, "a", { limit: 10 }).length, 10);
  assert.ok(confusableWords.searchWords(books, "a", { limit: 99 }).length <= 12);
});

await test("19 empty and unmatched searches return an empty array", () => {
  assert.equal(confusableWords.searchWords(books, "").length, 0);
  assert.equal(confusableWords.searchWords(books, "zzzznotawordzzzz").length, 0);
});

await test("20 recent encounters record a new-word wordId", () => {
  storage.recordRecentEncounteredWord(adapt.id, 1000);
  assert.equal(storage.getRecentEncounteredWords()[0].wordId, adapt.id);
});

await test("21 formal review encounters use the same wordId-only recorder", () => {
  storage.recordRecentEncounteredWord(adopt.id, 2000);
  assert.equal(storage.getRecentEncounteredWords()[0].wordId, adopt.id);
});

await test("22 Recovery encounters use the same wordId-only recorder", () => {
  storage.recordRecentEncounteredWord(affect.id, 3000);
  assert.equal(storage.getRecentEncounteredWords()[0].wordId, affect.id);
});

await test("23 recent encounters de-duplicate and refresh time", () => {
  storage.recordRecentEncounteredWord(adapt.id, 4000);
  const recent = storage.getRecentEncounteredWords();
  assert.equal(recent.filter((entry) => entry.wordId === adapt.id).length, 1);
  assert.equal(recent[0].encounteredAt, 4000);
});

await test("24 recent encounters are capped at 30", () => {
  for (let index = 0; index < 40; index += 1) storage.recordRecentEncounteredWord(`cet4-recent-${index}`, 5000 + index);
  assert.equal(storage.getRecentEncounteredWords().length, 30);
});

await test("25 recent records never contain a raw answer", () => {
  const serialized = JSON.stringify(storage.getRecentEncounteredWords());
  assert.doesNotMatch(serialized, /userAnswer|rawAnswer|适应答案/);
});

await test("26 loading the AI client performs zero requests", () => {
  let requests = 0;
  loadConfusableAi(async () => { requests += 1; return new Response("{}"); });
  assert.equal(requests, 0);
});

await test("27 explicit suggest click path performs one request", async () => {
  let requests = 0;
  const loaded = loadConfusableAi(async () => {
    requests += 1;
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  await loaded.app.confusableAi.suggest(adapt);
  assert.equal(requests, 1);
});

await test("28 AI candidates require exact formal-vocabulary validation", () => {
  const valid = confusableWords.validateAiSuggestions([{ word: "adopt", types: ["spelling"] }], books, adapt, {});
  assert.equal(valid[0].word.id, adopt.id);
});

await test("29 out-of-vocabulary AI candidates are dropped", () => {
  assert.equal(confusableWords.validateAiSuggestions([{ word: "inventedxyz", types: ["spelling"] }], books, adapt, {}).length, 0);
});

await test("30 AI current-word suggestions are dropped", () => {
  assert.equal(confusableWords.validateAiSuggestions([{ word: "adapt", types: ["spelling"] }], books, adapt, {}).length, 0);
});

await test("31 AI candidates already paired are dropped", () => {
  const pairs = confusableWords.upsertPair({}, adapt.id, adopt.id).pairs;
  assert.equal(confusableWords.validateAiSuggestions([{ word: "adopt", types: ["spelling"] }], books, adapt, pairs).length, 0);
});

await test("32 duplicate AI candidates collapse to one", () => {
  const items = [{ word: "adopt" }, { word: "ADOPT" }];
  assert.equal(confusableWords.validateAiSuggestions(items, books, adapt, {}).length, 1);
});

await test("33 suggest validation caps output at four", () => {
  const items = ["adopt", "affect", "effect", "access", "assess"].map((word) => ({ word }));
  assert.equal(confusableWords.validateAiSuggestions(items, books, adapt, {}, { limit: 4 }).length, 4);
});

await test("34 find validation caps output at five", () => {
  const items = ["adopt", "affect", "effect", "access", "assess", "economic"].map((word) => ({ word }));
  assert.equal(confusableWords.validateAiSuggestions(items, books, adapt, {}, { limit: 5 }).length, 5);
});

await test("35 suggestion cache stores items and generatedAt", () => {
  const cache = storage.saveConfusableSuggestionCache(adapt.id, [{ wordId: adopt.id, types: ["spelling"] }], 9000);
  assert.equal(cache.generatedAt, 9000);
  assert.equal(storage.getConfusableSuggestionCache(adapt.id).items[0].wordId, adopt.id);
});

await test("36 repeated open can use cache without an AI call", () => {
  const cached = storage.getConfusableSuggestionCache(adapt.id);
  assert.equal(cached.items.length, 1);
  assert.equal(cached.generatedAt, 9000);
});

await test("37 find description is not persisted", () => {
  const secretDescription = "意思是采用，好像a开头，和adapt长得很像";
  const loaded = loadConfusableAi(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
  assert.equal(loaded.app.confusableAi.buildFindPayload(adapt, secretDescription).description, secretDescription);
  assert.doesNotMatch(JSON.stringify(loaded.localStorage.dump()), new RegExp(secretDescription));
});

await test("38 AI failure leaves local fuzzy search working", async () => {
  const loaded = loadConfusableAi(async () => { throw new Error("offline"); });
  await assert.rejects(() => loaded.app.confusableAi.suggest(adapt));
  assert.equal(loaded.app.confusableWords.searchWords(books, "adpat")[0].word.word, "adapt");
});

await test("39 adopt → 适应 conservatively detects adapt", () => {
  assert.equal(confusableWords.detectMeaningConfusion(adopt, "适应", books).word.word, "adapt");
});

await test("40 ambiguous meaning candidates produce no guess", () => {
  const current = { id: "x-current", word: "coast", coreMeaning: "海岸" };
  const candidates = [
    { id: "x-boast", word: "boast", coreMeaning: "测试义" },
    { id: "x-roast", word: "roast", coreMeaning: "测试义" },
  ];
  assert.equal(confusableWords.detectMeaningConfusion(current, "测试义", [current, ...candidates]), null);
});

await test("41 wrong-meaning detection does not create a pair", () => {
  const before = Object.keys(storage.getConfusablePairs()).length;
  confusableWords.detectMeaningConfusion(adopt, "适应", books);
  assert.equal(Object.keys(storage.getConfusablePairs()).length, before);
});

await test("42 AI judge correct|partial|wrong schema remains unchanged", () => {
  const source = fs.readFileSync(path.join(ROOT, "worker/src/index.js"), "utf8");
  assert.match(source, /VALID_RESULTS = new Set\(\["correct", "partial", "wrong"\]\)/);
});

await test("43 micro practice always builds exactly three questions", () => {
  const pair = confusableWords.upsertPair({}, adapt.id, adopt.id).pair;
  assert.equal(confusableWords.buildPracticeQuestions(pair, adapt, adopt).length, 3);
});

await test("44 micro practice includes English→Chinese", () => {
  const pair = confusableWords.upsertPair({}, adapt.id, adopt.id).pair;
  assert.ok(confusableWords.buildPracticeQuestions(pair, adapt, adopt).some((question) => question.type === "en-to-zh"));
});

await test("45 micro practice includes Chinese→English", () => {
  const pair = confusableWords.upsertPair({}, adapt.id, adopt.id).pair;
  assert.ok(confusableWords.buildPracticeQuestions(pair, adapt, adopt).some((question) => question.type === "zh-to-en"));
});

await test("46 each micro question has exactly one correct option", () => {
  const pair = confusableWords.upsertPair({}, adapt.id, adopt.id).pair;
  for (const question of confusableWords.buildPracticeQuestions(pair, adapt, adopt)) {
    assert.equal(question.options.filter((option) => option.isCorrect).length, 1);
  }
});

await test("47 micro practice records one independent round and 2/3", () => {
  storage.removeConfusablePair(adapt.id, adopt.id);
  const pair = storage.addConfusablePair(adapt.id, adopt.id).pair;
  practiceStateBefore = JSON.parse(JSON.stringify(storage.loadUserData().books.cet4));
  const updated = storage.recordConfusablePractice(pair.pairKey, 2, 10000);
  assert.equal(updated.practiceCount, 1);
  assert.equal(updated.correctCount, 2);
  assert.equal(updated.wrongCount, 1);
  assert.equal(updated.lastPracticedAt, 10000);
});

await test("48 practice does not modify Level", () => {
  assert.equal(storage.getWordProgress("cet4", "adapt").masteryLevel, practiceStateBefore.words.adapt.masteryLevel);
});

await test("49 practice does not modify nextReviewDate", () => {
  assert.equal(storage.getWordProgress("cet4", "adapt").nextReviewDate, practiceStateBefore.words.adapt.nextReviewDate);
});

await test("50 practice does not create or change Recovery", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(storage.loadUserData().books.cet4.reviewRecovery)),
    practiceStateBefore.reviewRecovery,
  );
});

await test("51 practice does not increment formal review accuracy", () => {
  const metrics = storage.getDailyStats("cet4").learningMetrics.formalReview;
  assert.equal(metrics.correct + metrics.partial + metrics.wrong, 0);
});

await test("52 practice does not increment dailyReview handledCount", () => {
  assert.equal(Object.keys(storage.loadUserData().books.cet4.dailyReviewTasks).length, 0);
});

await test("53 practice does not increment review segment", () => {
  assert.equal(storage.getDailyStats("cet4").reviewWords, 0);
});

await test("54 practice does not modify Phase16 group progress", () => {
  assert.equal(Object.keys(storage.loadUserData().books.cet4.dailyGroupPlans).length, 0);
});

await test("55 v14→v15 preserves old learning state and initializes new fields", () => {
  const old = storage.loadUserData();
  old.version = 14;
  old.books.cet4.words.keep = { learned: true, masteryLevel: 3, manualMastered: true, nextReviewDate: "2026-09-01" };
  old.confusablePairs = { shouldDropOnV14: {} };
  const migrated = loadApp({ [STORAGE_KEY]: JSON.stringify(old) }).app.storage.loadUserData();
  assert.equal(migrated.version, 15);
  assert.equal(migrated.books.cet4.words.keep.manualMastered, true);
  assert.equal(migrated.books.cet4.words.keep.nextReviewDate, "2026-09-01");
  assert.deepEqual(Object.keys(migrated.confusablePairs), []);
  assert.deepEqual(Array.from(migrated.recentEncounteredWordIds), []);
});

await test("56 v15 backup contains personal pairs and pair stats", () => {
  const backup = app.backupService.createBackup(11000);
  const pair = Object.values(backup.data.confusablePairs)[0];
  assert.equal(pair.practiceCount, 1);
  assert.equal(pair.correctCount, 2);
  assert.equal(pair.wrongCount, 1);
});

await test("57 backup validation accepts every version v1–v15", () => {
  const seed = storage.loadUserData();
  for (let version = 1; version <= 15; version += 1) {
    assert.equal(app.backupService.validateBackup({ ...seed, version }).valid, true, `v${version}`);
  }
});

const worker = await import(`${pathToFileURL(path.join(ROOT, "worker/src/index.js")).href}?phase164=${Date.now()}`);
const workerEnv = { ALLOWED_ORIGINS: "http://localhost:8000", APP_PROXY_TOKEN: "token", DEEPSEEK_API_KEY: "secret" };

await test("58 Worker suggest input validates the minimal schema", () => {
  assert.equal(worker.validateConfusableSuggestPayload({ word: "adapt", coreMeaning: "改编；使适应", meanings: [] }).error, undefined);
  assert.ok(worker.validateConfusableSuggestPayload({ word: "adapt", coreMeaning: "适应", meanings: [], history: [] }).error);
});

await test("59 Worker find input validates description without history", () => {
  assert.equal(worker.validateConfusableFindPayload({ currentWord: "adapt", description: "意思是采用" }).error, undefined);
  assert.ok(worker.validateConfusableFindPayload({ currentWord: "adapt", description: "" }).error);
});

await test("60 Worker suggest normalizer enforces max4 types and lengths", () => {
  const valid = worker.normalizeConfusableSuggestModelResult(JSON.stringify({ items: [{ word: "adopt", types: ["spelling"], reason: "近似", difference: "区别" }] }));
  assert.equal(valid.items[0].word, "adopt");
  assert.equal(worker.normalizeConfusableSuggestModelResult(JSON.stringify({ items: Array(5).fill({ word: "x", types: ["spelling"], reason: "r", difference: "d" }) })), null);
});

await test("61 Worker find normalizer enforces max5", () => {
  assert.equal(worker.normalizeConfusableFindModelResult(JSON.stringify({ items: [{ word: "adopt", reason: "匹配" }] })).items.length, 1);
  assert.equal(worker.normalizeConfusableFindModelResult(JSON.stringify({ items: Array(6).fill({ word: "x", reason: "r" }) })), null);
});

await test("62 Worker suggest endpoint preserves Origin token and JSON controls", async () => {
  let upstreamBody;
  const response = await worker.handleRequest(new Request("http://worker/api/confusable-suggest", {
    method: "POST",
    headers: { Origin: "http://localhost:8000", "X-App-Token": "token", "Content-Type": "application/json" },
    body: JSON.stringify({ word: "adapt", coreMeaning: "改编；使适应", meanings: [] }),
  }), workerEnv, async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ word: "adopt", types: ["spelling"], reason: "近似", difference: "区别" }] }) } }], usage: {} }), { status: 200 });
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamBody.thinking.type, "disabled");
  assert.equal(upstreamBody.response_format.type, "json_object");
  assert.equal(upstreamBody.stream, false);
});

await test("63 Worker find endpoint returns at most normalized candidates", async () => {
  const response = await worker.handleRequest(new Request("http://worker/api/confusable-find", {
    method: "POST",
    headers: { Origin: "http://localhost:8000", "X-App-Token": "token", "Content-Type": "application/json" },
    body: JSON.stringify({ currentWord: "adapt", description: "意思是采用" }),
  }), workerEnv, async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ word: "adopt", reason: "匹配" }] }) } }], usage: {} }), { status: 200 }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].word, "adopt");
});

await test("64 existing AI judge system prompt is independent from both new prompts", () => {
  const source = fs.readFileSync(path.join(ROOT, "worker/src/index.js"), "utf8");
  assert.match(source, /const SYSTEM_PROMPT =/);
  assert.match(source, /const CONFUSABLE_SUGGEST_SYSTEM_PROMPT =/);
  assert.match(source, /const CONFUSABLE_FIND_SYSTEM_PROMPT =/);
});

await test("65 UI exposes one reusable main dialog and no pre-answer content", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.equal((html.match(/id="confusable-dialog"/g) || []).length, 1);
  assert.match(html, /id="study-confusable-button"[^>]*hidden/);
  assert.match(html, /id="study-confusion-detected"[^>]*hidden/);
});

await test("66 UI includes result detail finder list and three-question entry points", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ["study-confusable-button", "word-detail-add-confusable", "confusable-search-input", "confusable-list-view", "confusable-practice-dialog"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

await test("67 mobile CSS enforces fluid dialog touch targets and overflow", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
  assert.match(css, /\.confusable-dialog\s*\{[\s\S]*max-height:\s*calc\(100dvh - 32px\)[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.confusable-candidate-row[\s\S]*min-height:\s*48px/);
  assert.match(css, /\.confusable-field input,[\s\S]*min-height:\s*48px/);
  assert.match(css, /body\.has-modal-open[\s\S]*overflow:\s*hidden/);
});

await test("68 protected formal vocabulary frequency and learning algorithms are byte-identical", () => {
  const expected = {
    "data/cet4.json": "0de69a56aff805e2707b2fd334c0f9e4863b8783c95fe79b50088634fd4a3be2",
    "data/cet6.json": "43252c0b18ca6b5ea8e6c7305b02f8c046ae927e2feddc573ee7b224f5e4ef00",
    "data/cet4-exam-frequency.json": "9c7b94b424818ccc2352f42329f09f0bf3245462d863d48c6cc43e158357a4a3",
    "data/cet6-exam-frequency.json": "f71b8e21a6a9d709ad5a38caa56a5838eabd9e845790dd28c251a15623a20765",
    "js/smart-learning-order.js": "1001693298a1bbda0af5efc6793017bdfeb41dc8e2b9aeb610657c9571313a30",
    "js/review-scheduler.js": "b65b22be281665c1633c9859efb9c5c5cd7adff996d51ec60d933280c94fe4f7",
    "js/review-recovery.js": "050a8dff4e21b9be018f7631610cde9ef8c39e47fa97bd08f628f9e17c91bf05",
    "js/review-workload.js": "900cd488f7ced050da7b49e7d1433b636639039b4d41db8cc2c94d22cefc6d1a",
    "js/new-word-learning.js": "5dd8cbdd1ceddfeb438fd6a496c0f1dcf408a0b74d4a398bf19c255563733cf4",
    "js/daily-group-service.js": "502275f89f546d34ae085f9fb769faa119903a5ff68cc10a4c5282d828d4f013",
  };
  Object.entries(expected).forEach(([file, hash]) => assert.equal(sha256(file), hash, file));
});

await test("69 required real pairs exist except absent adept, which exact validation rejects", () => {
  for (const [left, right] of [["adapt", "adopt"], ["affect", "effect"], ["access", "assess"], ["economic", "economical"], ["principal", "principle"]]) {
    assert.ok(formal(left), left);
    assert.ok(formal(right), right);
  }
  assert.equal(formal("adept"), undefined);
  assert.equal(confusableWords.validateAiSuggestions([{ word: "adept" }], books, adapt, {}).length, 0);
});

await test("70 source code keeps micro practice isolated from formal answer handlers", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const practice = source.slice(source.indexOf("function startConfusablePractice"), source.indexOf("function pairMatchesQuery"));
  assert.doesNotMatch(practice, /handleAnswer|recordAnswer|beginReviewRecovery|dailyReviewTask|groupProgress/);
});

console.log(`\nPhase 16.4 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
