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

function loadCore() {
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const window = { CETWords: {}, localStorage };
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

const appSource = read("js/app.js");
const studySource = read("js/study.js");
const css = read("css/style.css");
const candidateBlock = appSource.slice(
  appSource.indexOf("function createCandidateRow"),
  appSource.indexOf("function refreshConfusableSurfaces"),
);
const refreshBlock = appSource.slice(
  appSource.indexOf("function refreshConfusableSurfaces"),
  appSource.indexOf("function createConfusablePair"),
);
const createBlock = appSource.slice(
  appSource.indexOf("function createConfusablePair"),
  appSource.indexOf("function removeConfusablePair"),
);
const removeBlock = appSource.slice(
  appSource.indexOf("function removeConfusablePair"),
  appSource.indexOf("function renderConfusableDialog"),
);

await test("01 candidate UI state is in-memory only", () => {
  assert.match(appSource, /candidatePairStates:\s*new Map\(\)/);
  assert.doesNotMatch(read("js/storage.js"), /candidatePairStates/);
});

await test("02 an unpaired candidate starts with 添加", () => {
  assert.match(candidateBlock, /createElement\("button", "text-button", "添加"\)/);
});

await test("03 a newly added candidate immediately says ✓ 已添加", () => {
  assert.match(candidateBlock, /candidateState === "added"[\s\S]*?add\.textContent = "✓ 已添加"/);
});

await test("04 a pre-existing pair immediately says ✓ 已在易混词中", () => {
  assert.match(candidateBlock, /else if \(existingAtRender\)[\s\S]*?add\.textContent = "✓ 已在易混词中"/);
});

await test("05 both confirmed button states are disabled", () => {
  assert.equal((candidateBlock.match(/add\.disabled = true/g) || []).length >= 3, true);
});

await test("06 candidate add reuses createConfusablePair", () => {
  assert.match(candidateBlock, /const result = createConfusablePair\(current, word/);
  assert.doesNotMatch(candidateBlock, /storage\.addConfusablePair/);
});

await test("07 createConfusablePair still reuses storage.addConfusablePair", () => {
  assert.match(createBlock, /storage\.addConfusablePair/);
});

await test("08 rapid clicks are blocked before persistence", () => {
  assert.match(candidateBlock, /if \(!current \|\| add\.disabled\) return;\s*add\.disabled = true;\s*add\.textContent = "添加中…"/);
});

await test("09 a failed result restores the button", () => {
  assert.match(candidateBlock, /if \(!result\.pair\) \{\s*add\.disabled = false;\s*add\.textContent = "添加"/);
});

await test("10 a thrown failure also restores the button", () => {
  assert.match(candidateBlock, /catch \(error\) \{\s*add\.disabled = false;\s*add\.textContent = "添加"/);
});

await test("11 failures show an explicit non-blocking toast", () => {
  assert.match(candidateBlock, /showToast\(result\.error \|\| "添加失败，请稍后重试"\)/);
  assert.doesNotMatch(candidateBlock, /alert\(/);
});

await test("12 success uses the requested lightweight toast", () => {
  assert.match(createBlock, /showToast\(`✓ \$\{otherWord\.word\} 已加入我的易混词`, \{ duration: 1800 \}\)/);
});

await test("13 success refreshes modal, finder, personal list and dashboard", () => {
  for (const call of ["updateDashboard", "renderConfusableDialog", "renderConfusableFinder", "renderConfusableList"]) {
    assert.match(refreshBlock, new RegExp(`${call}\\(\\)`));
  }
});

await test("14 success refreshes an open word-detail surface", () => {
  assert.match(refreshBlock, /if \(getDetailWord\(\)\) renderWordDetail\(\)/);
});

await test("15 the outer study result is synchronized without reload", () => {
  assert.match(refreshBlock, /studyController\.syncConfusablePairState/);
  assert.doesNotMatch(`${candidateBlock}\n${refreshBlock}\n${createBlock}`, /location\.reload|window\.location|\.reload\(/);
});

await test("16 the modal is not closed after adding", () => {
  assert.doesNotMatch(candidateBlock, /closeConfusableModal|\.close\(/);
});

await test("17 paired candidates remain renderable for immediate feedback", () => {
  const dialogBlock = appSource.slice(appSource.indexOf("function renderConfusableDialog"), appSource.indexOf("function openConfusableDialog"));
  assert.doesNotMatch(dialogBlock, /!allPairs\[/);
});

await test("18 candidate feedback distinguishes new from racing existing pairs", () => {
  assert.match(createBlock, /result\.changed \? "added" : "existing"/);
});

await test("19 deleting clears transient feedback and refreshes surfaces", () => {
  assert.match(removeBlock, /candidatePairStates\.delete\(pair\.pairKey\)/);
  assert.match(removeBlock, /refreshConfusableSurfaces\(pair, \{ removed: true \}\)/);
});

await test("20 deleting restores the outer result candidate state", () => {
  const syncBlock = studySource.slice(
    studySource.indexOf("\n    syncConfusablePairState(pair"),
    studySource.indexOf("\n    updateNextButtonLabel()"),
  );
  assert.match(syncBlock, /pair: options\.removed \? null : pair/);
  assert.match(syncBlock, /confirmationState: options\.removed \? "" : options\.confirmationState/);
  assert.match(syncBlock, /this\.renderConfusableActions\(question\)/);
});

await test("21 unrelated outer result candidates are not changed", () => {
  assert.match(studySource, /if \(candidatePairKey !== pair\.pairKey\) return false/);
});

await test("22 reopening a modal derives existing status from persisted pairs", () => {
  assert.match(appSource, /candidatePairStates\.clear\(\)/);
  assert.match(candidateBlock, /storage\.getConfusablePairs\(\)\[pairKeyAtRender\]/);
});

await test("23 duplicate A↔B remains blocked by the original core service", () => {
  const { confusableWords } = loadCore();
  const first = confusableWords.upsertPair({}, "cet4-adapt", "cet4-adopt", { source: "manual" });
  const second = confusableWords.upsertPair(first.pairs, "cet4-adopt", "cet4-adapt", { source: "manual" });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(Object.keys(second.pairs).length, 1);
});

await test("24 candidate UI never changes confusion statistics", () => {
  assert.doesNotMatch(candidateBlock, /confusionCount|recordConfusableConfusion|wrongCount/);
});

await test("25 confirmed labels stay on one line without horizontal overflow", () => {
  assert.match(css, /\.confusable-candidate-row button[\s\S]*?white-space:\s*nowrap/);
});

await test("26 Storage stays at v15 and keeps the existing pair API", () => {
  assert.equal(loadCore().storage.DATA_VERSION, 15);
  const storageSource = read("js/storage.js");
  assert.match(storageSource, /const DATA_VERSION = 15/);
  assert.match(storageSource, /function addConfusablePair/);
  assert.match(storageSource, /function removeConfusablePair/);
});

await test("27 SRS, Recovery, grouping and frequency stay untouched", () => {
  assertUnmodified([
    "js/review-scheduler.js", "js/review-recovery.js", "js/review-workload.js",
    "js/new-word-learning.js", "js/daily-group-service.js",
    "js/smart-learning-order.js", "data/cet4.json", "data/cet6.json",
    "data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json",
  ]);
});

console.log(`\nPhase 16.4.3 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
