import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE_KEY = "cetwords-user-data-v1";
let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

function assertUnmodified(files) {
  if (!files.length) return;
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", ...files], { cwd: ROOT, stdio: "pipe" });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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
  const window = { CETWords: {}, localStorage };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout,
  });
  [
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js",
    "js/review-recovery.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "js/confusable-words.js", "js/storage.js", "js/backup-service.js",
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return { app: window.CETWords, localStorage };
}

const vocabulary = ["cet4", "cet6"].flatMap((bookId) => JSON.parse(read(`data/${bookId}.json`)));
const formal = (spelling, book = "cet4") => vocabulary.find((word) => word.book === book && word.word === spelling);
const decade = formal("decade");
const decide = formal("decide");
const adapt = formal("adapt");
const adopt = formal("adopt");
const html = read("index.html");
const css = read("css/style.css");
const appSource = read("js/app.js");
const studySource = read("js/study.js");
const { app } = loadApp();
const { confusableWords } = app;

await test("01 decade and decide use the formal local vocabulary", () => {
  assert.ok(decade?.coreMeaning);
  assert.ok(decide?.coreMeaning);
  assert.match(decade.coreMeaning, /十年/);
  assert.match(decide.coreMeaning, /决定/);
});

await test("02 a real-confusion pair starts at one with a timestamp", () => {
  const result = confusableWords.upsertPair({}, decade.id, decide.id, {
    source: "wrong_answer_detected", initialConfusion: true, now: 1000,
  });
  assert.equal(result.pair.confusionCount, 1);
  assert.equal(result.pair.lastConfusedAt, 1000);
});

await test("03 a manual pair starts at zero and null", () => {
  const result = confusableWords.upsertPair({}, adapt.id, adopt.id, { source: "manual", now: 1000 });
  assert.equal(result.pair.confusionCount, 0);
  assert.equal(result.pair.lastConfusedAt, null);
});

await test("04 an AI-suggested pair starts at zero and null", () => {
  const result = confusableWords.upsertPair({}, adapt.id, adopt.id, { source: "ai_suggested", now: 1000 });
  assert.equal(result.pair.confusionCount, 0);
  assert.equal(result.pair.lastConfusedAt, null);
});

await test("05 recent and description creation paths do not opt into initial confusion", () => {
  const creator = appSource.slice(appSource.indexOf("function createCandidateRow"), appSource.indexOf("function createConfusablePair"));
  assert.doesNotMatch(creator, /initialConfusion/);
});

await test("06 reverse A↔B never creates a second pair", () => {
  const first = confusableWords.upsertPair({}, decade.id, decide.id, { initialConfusion: true, now: 1000 });
  const reverse = confusableWords.upsertPair(first.pairs, decide.id, decade.id, { initialConfusion: true, now: 2000 });
  assert.equal(reverse.changed, false);
  assert.equal(Object.keys(reverse.pairs).length, 1);
  assert.equal(reverse.pair.confusionCount, 1);
});

await test("07 recording a later real confusion increments only confusionCount", () => {
  const created = confusableWords.upsertPair({}, decade.id, decide.id, { initialConfusion: true, now: 1000 }).pair;
  const updated = confusableWords.recordConfusion(created, 2000);
  assert.equal(updated.confusionCount, 2);
  assert.equal(updated.wrongCount, 0);
  assert.equal(updated.practiceCount, 0);
});

await test("08 lastConfusedAt updates to the real event time", () => {
  const pair = confusableWords.upsertPair({}, decade.id, decide.id, { now: 1000 }).pair;
  assert.equal(confusableWords.recordConfusion(pair, 4321).lastConfusedAt, 4321);
});

await test("09 practice wrongCount does not change confusionCount", () => {
  const pair = confusableWords.upsertPair({}, decade.id, decide.id, { initialConfusion: true, now: 1000 }).pair;
  const practiced = confusableWords.recordPractice(pair, 1, 2000);
  assert.equal(practiced.confusionCount, 1);
  assert.equal(practiced.wrongCount, 2);
  assert.equal(practiced.practiceCount, 1);
});

await test("10 normalization and rerendering are free of counter side effects", () => {
  const raw = confusableWords.upsertPair({}, decade.id, decide.id, { initialConfusion: true, now: 1000 }).pair;
  assert.equal(confusableWords.normalizePair(raw).confusionCount, 1);
  assert.equal(confusableWords.normalizePair(raw).confusionCount, 1);
});

await test("11 the same official answer event is deduplicated in memory", () => {
  assert.match(appSource, /recordedConfusionEvents:\s*new Set\(\)/);
  assert.match(appSource, /const dedupKey = answerEventId && pairKey \? `\$\{answerEventId\}:\$\{pairKey\}` : ""/);
  assert.match(appSource, /!appState\.confusables\.recordedConfusionEvents\.has\(dedupKey\)/);
  assert.match(appSource, /recordedConfusionEvents\.add\(dedupKey\)/);
});

await test("12 the stable event id reuses session id and answer sequence", () => {
  assert.match(studySource, /question\.confusionEventId = `\$\{session\.studySessionId\}:\$\{result\.answerSequence\}`/);
});

await test("13 opening, closing and scrolling never call the confusion recorder", () => {
  const modalBlock = appSource.slice(appSource.indexOf("function showConfusableModal"), appSource.indexOf("async function requestConfusableSuggestions"));
  assert.doesNotMatch(modalBlock, /recordConfusableConfusion/);
});

await test("14 decade answered as 决定 is a high-confidence decide match", () => {
  const detected = confusableWords.detectMeaningConfusion(decade, "决定", vocabulary, {});
  assert.equal(detected.word.word, "decide");
});

await test("15 only wrong judgement enters formal confusion detection", () => {
  assert.match(studySource, /if \(judgement === "wrong"\) \{[\s\S]*?onDetectConfusion/);
});

await test("16 partial does not increment a real confusion", () => {
  assert.match(appSource, /pair\s*&& judgement === "wrong"/);
  assert.doesNotMatch(appSource, /judgement === "partial"[\s\S]{0,180}recordConfusableConfusion/);
});

await test("17 an unpaired candidate says possible confusion, never again", () => {
  assert.match(studySource, /`你可能和 \$\{candidate\.word\.word\} 混淆了`/);
});

await test("18 an existing pair uses the active repeated-confusion warning", () => {
  assert.match(studySource, /`你又把 \$\{question\.word\.word\} 和 \$\{candidate\.word\.word\} 混淆了`/);
});

await test("19 the Nth-confusion copy reads the persisted pair count", () => {
  assert.match(studySource, /`这是你第 \$\{pair\.confusionCount\} 次出现这组混淆。`/);
});

await test("20 the success card distinguishes newly added and already present", () => {
  assert.match(studySource, /"已加入我的易混词"/);
  assert.match(studySource, /"已在我的易混词中"/);
  assert.match(studySource, /confirmationState: result\.changed \? "added" : "existing"/);
});

await test("21 the confirmation card uses both formal local core meanings", () => {
  assert.match(studySource, /question\.word\.coreMeaning \|\| question\.word\.shortMeaning/);
  assert.match(studySource, /candidate\.word\?\.coreMeaning \|\| candidate\.word\?\.shortMeaning/);
});

await test("22 immediate practice reuses the existing pair and practice callback", () => {
  const method = studySource.slice(studySource.indexOf("\n    practiceDetectedConfusion() {"), studySource.indexOf("\n    viewDetectedConfusion() {"));
  assert.match(method, /candidate\.pair\?\.pairKey/);
  assert.match(method, /onStartConfusablePractice/);
  assert.match(method, /confirmationState: result\.changed \? "added" : "existing"/);
});

await test("23 view difference reuses the Phase16.4 main compare modal", () => {
  const method = studySource.slice(studySource.indexOf("\n    viewDetectedConfusion() {"), studySource.indexOf("\n    updateNextButtonLabel() {"));
  assert.match(method, /onOpenConfusable/);
  assert.equal((html.match(/id="confusable-dialog"/g) || []).length, 1);
});

await test("24 the practice result gives the required 3/3 encouragement", () => {
  assert.match(appSource, /state\.practiceCorrect === 3\s*\? "这组区分得很好。"/);
});

await test("25 the practice result gives the required 0/3 and 1/3 reminder", () => {
  assert.match(appSource, /state\.practiceCorrect <= 1\s*\? "这组仍容易混，之后遇到时系统会继续提醒。"/);
});

await test("26 one completed practice round is recorded only once", () => {
  assert.match(appSource, /practiceRecorded:\s*false/);
  assert.match(appSource, /if \(!state\.practiceRecorded\) \{[\s\S]*?recordConfusablePractice[\s\S]*?practiceRecorded = true/);
});

await test("27 real-confusion recording does not mutate SRS, Recovery or progress", () => {
  const loaded = loadApp();
  const state = loaded.app.storage.loadUserData();
  state.books.cet4.words.decade = {
    learned: true, masteryLevel: 4, nextReviewDate: "2026-08-30", manualMastered: true,
  };
  state.books.cet4.reviewRecovery.decade = { active: true, attemptCount: 2 };
  state.books.cet4.daily = {
    ...state.books.cet4.daily,
    reviewHandledCount: 40,
    reviewSegmentNextAt: 60,
    formalReviewCorrect: 9,
    groupProgress: { completed: 3 },
  };
  loaded.app.storage.saveUserData(state);
  loaded.app.storage.addConfusablePair(decade.id, decide.id, { source: "manual", now: 1000 });
  const before = plain(loaded.app.storage.loadUserData().books);
  const key = loaded.app.confusableWords.getPairKey(decade.id, decide.id);
  loaded.app.storage.recordConfusableConfusion(key, 2000);
  assert.deepEqual(plain(loaded.app.storage.loadUserData().books), before);
});

await test("28 manualMastered remains true after confusion and practice", () => {
  const loaded = loadApp();
  loaded.app.storage.updateWordProgress("cet4", "decade", { learned: true });
  loaded.app.storage.markWordManualMastered("cet4", "decade");
  const pair = loaded.app.storage.addConfusablePair(decade.id, decide.id, { source: "manual", now: 1000 }).pair;
  loaded.app.storage.recordConfusableConfusion(pair.pairKey, 2000);
  loaded.app.storage.recordConfusablePractice(pair.pairKey, 0, 3000);
  assert.equal(loaded.app.storage.getWordProgress("cet4", "decade").manualMastered, true);
});

await test("29 the list displays actual confusion, recent time and practice rounds", () => {
  assert.match(appSource, /实际混淆：\$\{pair\.confusionCount\}次/);
  assert.match(appSource, /最近混淆：\$\{pair\.lastConfusedAt/);
  assert.match(appSource, /辨析练习：\$\{pair\.practiceCount\}轮/);
});

await test("30 pairs sort by most recent real confusion first", () => {
  const recent = confusableWords.upsertPair({}, decade.id, decide.id, { now: 100 }).pair;
  const older = confusableWords.upsertPair({}, adapt.id, adopt.id, { now: 200 }).pair;
  const pairs = {
    [recent.pairKey]: confusableWords.recordConfusion(recent, 5000),
    [older.pairKey]: confusableWords.recordConfusion(older, 4000),
  };
  assert.equal(confusableWords.sortPairs(pairs)[0].pairKey, recent.pairKey);
});

await test("31 confusion count breaks ties before old Phase16.4 factors", () => {
  const first = confusableWords.upsertPair({}, decade.id, decide.id, { now: 100 }).pair;
  const second = confusableWords.upsertPair({}, adapt.id, adopt.id, { now: 200 }).pair;
  const more = { ...first, confusionCount: 3, lastConfusedAt: 5000 };
  const less = { ...second, confusionCount: 1, lastConfusedAt: 5000 };
  assert.equal(confusableWords.sortPairs({ [more.pairKey]: more, [less.pairKey]: less })[0].pairKey, more.pairKey);
});

await test("32 legacy v15 pairs default the optional fields safely", () => {
  const pairKey = confusableWords.getPairKey(decade.id, decide.id);
  const legacy = confusableWords.normalizePair({
    pairKey, wordIdA: decade.id, wordIdB: decide.id, source: "manual", createdAt: 1000,
  });
  assert.equal(legacy.confusionCount, 0);
  assert.equal(legacy.lastConfusedAt, null);
});

await test("33 Storage stays at v15", () => {
  assert.equal(loadApp().app.storage.DATA_VERSION, 15);
  assert.match(read("js/storage.js"), /const DATA_VERSION = 15/);
});

await test("34 a v15 backup saves and restores both new fields", () => {
  const source = loadApp();
  const pair = source.app.storage.addConfusablePair(decade.id, decide.id, {
    source: "wrong_answer_detected", initialConfusion: true, now: 1000,
  }).pair;
  source.app.storage.recordConfusableConfusion(pair.pairKey, 2000);
  const backup = source.app.backupService.createBackup(3000);
  assert.equal(backup.data.confusablePairs[pair.pairKey].confusionCount, 2);
  assert.equal(backup.data.confusablePairs[pair.pairKey].lastConfusedAt, 2000);
  const destination = loadApp();
  const restored = destination.app.backupService.importBackup(backup);
  assert.equal(restored.confusablePairs[pair.pairKey].confusionCount, 2);
  assert.equal(restored.confusablePairs[pair.pairKey].lastConfusedAt, 2000);
});

await test("35 the result layout keeps feedback, compact card, shared entry, details and next in order", () => {
  const card = html.slice(html.indexOf('id="question-screen"'), html.indexOf('id="result-screen"'));
  const ids = ["answer-feedback", "study-confusion-detected", "study-confusable-button", "word-details", "next-word-button"];
  for (let index = 1; index < ids.length; index += 1) {
    assert.ok(card.indexOf(`id="${ids[index - 1]}"`) < card.indexOf(`id="${ids[index]}"`), ids[index]);
  }
});

await test("36 the confirmation card exposes one primary practice and one secondary view action", () => {
  assert.match(html, /class="primary-button" id="study-confusion-practice"/);
  assert.match(html, /class="secondary-button" id="study-confusion-view"/);
  assert.equal((html.match(/id="study-confusion-practice"/g) || []).length, 1);
  assert.equal((html.match(/id="study-confusion-view"/g) || []).length, 1);
});

await test("37 mobile actions and long words cannot overflow horizontally", () => {
  assert.match(css, /\.confusion-detected__compare[\s\S]*?minmax\(0, 1fr\)/);
  assert.match(css, /\.confusion-detected__compare strong,[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /\.confusion-detected__actions > button[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.confusion-detected__actions > \.primary-button[\s\S]*?min-height:\s*48px/);
});

await test("38 long explanatory text is limited to three lines", () => {
  assert.match(css, /\.confusion-detected__note[\s\S]*?-webkit-line-clamp:\s*3/);
});

await test("39 original answers are never written to persistent confusion records", () => {
  const storageSource = read("js/storage.js");
  const recordBlock = storageSource.slice(storageSource.indexOf("function recordConfusableConfusion"), storageSource.indexOf("function recordRecentEncounteredWord"));
  assert.doesNotMatch(recordBlock, /userAnswer|rawAnswer|answerText/);
  const serialized = JSON.stringify(confusableWords.upsertPair({}, decade.id, decide.id, { initialConfusion: true }).pair);
  assert.doesNotMatch(serialized, /决定/);
});

await test("40 protected word books and frequency data are byte-identical", () => {
  assertUnmodified([
    "data/cet4.json", "data/cet6.json",
    "data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json",
    "data/cet-frequency-report.json", "data/cet-learning-priority-overrides.json",
  ]);
});

await test("41 protected smart, SRS, Recovery, workload and grouping rules are byte-identical", () => {
  assertUnmodified([
    "js/smart-learning-order.js", "js/review-scheduler.js", "js/review-recovery.js",
    "js/new-word-learning.js", "js/review-workload.js", "js/daily-group-service.js",
  ]);
});

await test("42 Worker and all AI schemas remain byte-identical", () => {
  assert.equal(sha256("worker/src/index.js"), "f68d152589c9de0b2533ab4a6f2f8351437d83976d5927dd26189dc7e13b5611");
  assert.equal(sha256("js/confusable-ai.js"), "d916e32a20c38e220ffbd6157358865c852e580a4f8ab20b9f461e5a5d773364");
});

await test("43 PWA files remain unmodified in this phase", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  const pwaFiles = tracked.split(/\r?\n/).filter((file) => /(^|\/)(service-worker|sw)\.js$|manifest\.webmanifest$/i.test(file));
  assertUnmodified(pwaFiles);
});

await test("44 the new fields survive normal local persistence", () => {
  const loaded = loadApp();
  const pair = loaded.app.storage.addConfusablePair(decade.id, decide.id, {
    source: "wrong_answer_detected", initialConfusion: true, now: 1000,
  }).pair;
  const saved = JSON.parse(loaded.localStorage.dump()[STORAGE_KEY]);
  assert.equal(saved.confusablePairs[pair.pairKey].confusionCount, 1);
  assert.equal(saved.confusablePairs[pair.pairKey].lastConfusedAt, 1000);
});

console.log(`\nPhase 16.4.2 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
