import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertUnmodified(files) {
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", ...files], { cwd: ROOT, stdio: "pipe" });
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
  };
}

function loadApp() {
  const window = { CETWords: {}, localStorage: createLocalStorage() };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController, setTimeout, clearTimeout,
  });
  [
    "js/review-scheduler.js", "js/review-workload.js", "js/smart-learning-order.js",
    "js/review-recovery.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "js/confusable-words.js", "js/storage.js",
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return window.CETWords;
}

const app = loadApp();
const { confusableWords, storage } = app;
const vocabulary = ["cet4", "cet6"].flatMap((bookId) => JSON.parse(read(`data/${bookId}.json`)));
const formal = (spelling, book = "cet4") => vocabulary.find((word) => word.book === book && word.word === spelling);
const attach4 = formal("attach", "cet4");
const good4 = formal("good", "cet4");
const attach6 = formal("attach", "cet6");
const adapt = formal("adapt", "cet4");
const adopt = formal("adopt", "cet4");
const transition = formal("transition", "cet6");
const transfer = formal("transfer", "cet6");
const appSource = read("js/app.js");
const studySource = read("js/study.js");
const html = read("index.html");

function makePair(left, right, options = {}) {
  return confusableWords.upsertPair({}, left.id, right.id, { source: "manual", now: 1000, ...options });
}

function detect(current, answer, words, pairs) {
  return confusableWords.detectMeaningConfusion(current, answer, words, { personalPairs: pairs });
}

await test("01 formal attach and good fixtures have the reported meanings", () => {
  assert.equal(attach4.coreMeaning, "缚,系,贴；附加");
  assert.equal(good4.coreMeaning, "好的；好处");
});

await test("02 the original generic threshold reproduces the attach → 好的 miss", () => {
  assert.equal(confusableWords.detectMeaningConfusion(attach4, "好的", vocabulary), null);
});

await test("03 an existing attach ↔ good pair prioritizes and detects good", () => {
  const saved = makePair(attach4, good4);
  assert.equal(detect(attach4, "好的", vocabulary, saved.pairs)?.word?.word, "good");
});

await test("04 the detection returns the persisted pair and pairKey", () => {
  const saved = makePair(attach4, good4);
  const result = detect(attach4, "好的", vocabulary, saved.pairs);
  assert.equal(result.pairKey, saved.pair.pairKey);
  assert.equal(result.pair.pairKey, saved.pair.pairKey);
  assert.equal(result.detectionSource, "personal_pair");
});

await test("05 semicolon meaning segments match independently", () => {
  const left = { id: "x-attach", word: "attach", coreMeaning: "附加" };
  const right = { id: "x-good", word: "good", coreMeaning: "好的；好处" };
  assert.equal(detect(left, "好的", [left, right], makePair(left, right).pairs)?.word.word, "good");
});

await test("06 ASCII comma meaning segments match independently", () => {
  const left = { id: "x-attach", word: "attach", coreMeaning: "附加" };
  const right = { id: "x-good", word: "good", coreMeaning: "好的, 好处" };
  assert.equal(detect(left, "好的", [left, right], makePair(left, right).pairs)?.word.word, "good");
});

await test("07 Chinese comma, enumeration comma and slash are separators", () => {
  for (const coreMeaning of ["好的，好处", "好的、好处", "好的/好处"]) {
    assert.deepEqual(plain(confusableWords.splitMeaningSegments(coreMeaning)), ["好的", "好处"]);
  }
});

await test("08 surrounding and repeated whitespace do not affect matching", () => {
  const left = { id: "x-attach", word: "attach", coreMeaning: "附加" };
  const right = { id: "x-good", word: "good", coreMeaning: "  好 的 ； 好处 " };
  assert.equal(detect(left, "  好 的  ", [left, right], makePair(left, right).pairs)?.word.word, "good");
});

await test("09 common part-of-speech prefixes do not affect matching", () => {
  for (const coreMeaning of ["adj. 好的；n. 好处", "adj 好的；n 好处", "v & n. 好的；好处"]) {
    assert.deepEqual(plain(confusableWords.splitMeaningSegments(coreMeaning)), ["好的", "好处"]);
  }
});

await test("10 coreMeaning and shortMeaning have the highest match priority", () => {
  const word = { coreMeaning: "好的；好处", shortMeaning: "优良的", meanings: [{ meaning: "善良" }] };
  assert.equal(confusableWords.findIndependentMeaningMatch(word, "好的").source, "coreMeaning");
  assert.equal(confusableWords.findIndependentMeaningMatch(word, "优良的").source, "shortMeaning");
});

await test("11 meanings are checked even when a word has multiple senses", () => {
  const left = { id: "x-left", word: "left", coreMeaning: "左边" };
  const right = { id: "x-right", word: "right", coreMeaning: "正确", meanings: [{ meaning: "好的" }, { meaning: "权利" }] };
  assert.equal(detect(left, "好的", [left, right], makePair(left, right).pairs)?.word.word, "right");
});

await test("12 meaningsByPos is checked as the fourth specified source", () => {
  const left = { id: "x-left", word: "left", coreMeaning: "左边" };
  const right = { id: "x-right", word: "right", coreMeaning: "正确", meaningsByPos: { "adj.": ["好的"] } };
  const result = detect(left, "好的", [left, right], makePair(left, right).pairs);
  assert.equal(result?.word.word, "right");
  assert.equal(result?.meaningSource, "meaningsByPos");
});

await test("13 adapt ↔ adopt detects adapt answered as 采用 through the existing safe alias", () => {
  const saved = makePair(adapt, adopt);
  const result = detect(adapt, "采用", vocabulary, saved.pairs);
  assert.equal(result?.word.word, "adopt");
  assert.equal(result?.pairKey, saved.pair.pairKey);
});

await test("14 adapt → 采用 may be a new candidate without lowering the global threshold", () => {
  const result = confusableWords.detectMeaningConfusion(adapt, "采用", vocabulary);
  assert.equal(result?.word.word, "adopt");
  assert.equal(result?.detectionSource, "local_new_candidate");
  assert.equal(confusableWords.NEW_CANDIDATE_SCORE_THRESHOLD, 8);
});

await test("15 multiple pairs select the only high-confidence meaning hit", () => {
  const kind = { id: "x-kind", word: "kind", coreMeaning: "善良的" };
  const first = makePair(attach4, good4);
  const second = confusableWords.upsertPair(first.pairs, attach4.id, kind.id);
  assert.equal(detect(attach4, "好的", [...vocabulary, kind], second.pairs)?.word.word, "good");
});

await test("16 multiple equally high-confidence pair hits do not guess", () => {
  const nice = { id: "x-nice", word: "nice", coreMeaning: "好的；美好的" };
  const first = makePair(attach4, good4);
  const second = confusableWords.upsertPair(first.pairs, attach4.id, nice.id);
  assert.equal(detect(attach4, "好的", [...vocabulary, nice], second.pairs), null);
});

await test("17 unrelated 香蕉 does not match good", () => {
  assert.equal(detect(attach4, "香蕉", vocabulary, makePair(attach4, good4).pairs), null);
});

await test("18 partial-character 好像 does not match good", () => {
  assert.equal(detect(attach4, "好像", vocabulary, makePair(attach4, good4).pairs), null);
});

await test("19 weak related wording does not trigger a repeated confusion", () => {
  assert.equal(detect(attach4, "挺好", vocabulary, makePair(attach4, good4).pairs), null);
});

await test("20 an answer matching the current word is never diverted to a pair", () => {
  assert.equal(detect(attach4, "附加", vocabulary, makePair(attach4, good4).pairs), null);
});

await test("21 canonical lookup finds a CET4 pair from a CET6 same-spelling question", () => {
  const saved = makePair(attach4, good4);
  const result = detect(attach6, "好的", vocabulary, saved.pairs);
  assert.equal(result?.word.word, "good");
  assert.equal(result?.pairKey, saved.pair.pairKey);
});

await test("22 repeated detection is side-effect free", () => {
  const saved = makePair(attach4, good4);
  detect(attach4, "好的", vocabulary, saved.pairs);
  detect(attach4, "好的", vocabulary, saved.pairs);
  assert.equal(saved.pair.confusionCount, 0);
  assert.equal(saved.pair.lastConfusedAt, null);
});

await test("23 the first persisted repeated confusion increments once and updates time", () => {
  const created = storage.addConfusablePair(attach4.id, good4.id, { source: "manual", now: 1000 }).pair;
  const updated = storage.recordConfusableConfusion(created.pairKey, 2000);
  assert.equal(updated.confusionCount, 1);
  assert.equal(updated.lastConfusedAt, 2000);
});

await test("24 app detection passes personal pairs and reuses the detected persisted key", () => {
  const block = appSource.slice(appSource.indexOf("function detectStudyConfusion"), appSource.indexOf("async function initializeWordBooks"));
  assert.match(block, /const personalPairs = storage\.getConfusablePairs\(\)/);
  assert.match(block, /personalPairs,/);
  assert.match(block, /const pairKey = candidate\.pairKey/);
  assert.match(block, /personalPairs\[pairKey\] \|\| candidate\.pair/);
});

await test("25 wrong is the only judgement that records a repeated confusion", () => {
  const block = appSource.slice(appSource.indexOf("function detectStudyConfusion"), appSource.indexOf("async function initializeWordBooks"));
  assert.match(block, /pair\s*&& judgement === "wrong"/);
  assert.doesNotMatch(block, /judgement === "partial"/);
});

await test("26 eventId plus pairKey deduplicates rerender, modal and scroll paths", () => {
  const block = appSource.slice(appSource.indexOf("function detectStudyConfusion"), appSource.indexOf("async function initializeWordBooks"));
  assert.match(block, /const dedupKey = answerEventId && pairKey \? `\$\{answerEventId\}:\$\{pairKey\}`/);
  assert.match(block, /!appState\.confusables\.recordedConfusionEvents\.has\(dedupKey\)/);
  assert.equal((appSource.match(/recordConfusableConfusion\(/g) || []).length, 1);
});

await test("27 micro-practice wrongCount remains independent from confusionCount", () => {
  const pair = makePair(attach4, good4, { initialConfusion: true }).pair;
  const practiced = confusableWords.recordPractice(pair, 1, 3000);
  assert.equal(practiced.confusionCount, 1);
  assert.equal(practiced.wrongCount, 2);
});

await test("28 the result immediately renders warning, meanings and both actions", () => {
  assert.match(studySource, /`你又把 \$\{question\.word\.word\} 和 \$\{candidate\.word\.word\} 混淆了`/);
  assert.match(studySource, /learningWord\.coreMeaning \|\| learningWord\.shortMeaning/);
  assert.match(studySource, /candidate\.word\?\.coreMeaning \|\| candidate\.word\?\.shortMeaning/);
  assert.match(studySource, /this\.elements\.confusionPractice\.textContent = "立即做3题辨析"/);
  assert.match(html, /id="study-confusion-practice"/);
  assert.match(html, /id="study-confusion-view"[^>]*>查看区别</);
});

await test("29 cross-book View Difference opens the persisted pair anchor", () => {
  assert.match(studySource, /pairKey: question\.confusionCandidate\.pair\.pairKey/);
  const block = appSource.slice(appSource.indexOf("function openConfusableDialog"), appSource.indexOf("function closeMainConfusableDialog"));
  assert.match(block, /const canonicalPairWordId = requestedPair/);
  assert.match(block, /canonicalPairWordId \|\| requestedWordId/);
});

await test("30 transition ↔ transfer partial remains outside the changed wrong path", () => {
  const saved = makePair(transition, transfer);
  assert.equal(detect(transition, "转移", vocabulary, saved.pairs)?.word.word, "transfer");
  assert.match(studySource, /if \(judgement === "wrong"\) \{[\s\S]*?onDetectConfusion/);
});

await test("31 Storage stays at v15 and preserves confusable persistence", () => {
  assert.equal(storage.DATA_VERSION, 15);
  const storageSource = read("js/storage.js");
  assert.match(storageSource, /const DATA_VERSION = 15/);
  assert.match(storageSource, /confusablePairs: \{\}/);
  assert.match(storageSource, /addConfusablePair/);
  assert.match(storageSource, /recordConfusableConfusion/);
});

await test("32 protected data, learning logic and PWA stay untouched", () => {
  assertUnmodified([
    "data/cet4.json", "data/cet6.json", "data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json",
    "data/cet-frequency-report.json", "data/cet-learning-priority-overrides.json",
    "js/smart-learning-order.js", "js/review-scheduler.js", "js/review-recovery.js",
    "js/review-workload.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "service-worker.js", "manifest.webmanifest",
  ]);
});

await test("33 implementation does not hard-code either acceptance case", () => {
  const core = read("js/confusable-words.js");
  assert.doesNotMatch(core, /attach|good|adapt|adopt|好的；好处/);
});

await test("34 the original global spelling and semantic confidence threshold is unchanged", () => {
  const core = read("js/confusable-words.js");
  const globalFallback = core.slice(
    core.indexOf("function detectNewConfusableCandidate"),
    core.indexOf("function validateExistingPairAiMatch"),
  );
  assert.match(globalFallback, /distance <= 1 \? 5 : distance === 2 \? 3 : 0/);
  assert.match(core, /const NEW_CANDIDATE_SCORE_THRESHOLD = 8/);
  assert.match(globalFallback, /score >= NEW_CANDIDATE_SCORE_THRESHOLD/);
  assert.match(core, /const NEW_CANDIDATE_UNIQUENESS_GAP = 2/);
});

console.log(`\nPhase 16.4.4 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
