import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studySource = fs.readFileSync(path.join(ROOT, "js/study.js"), "utf8");
const resultSource = fs.readFileSync(path.join(ROOT, "js/active-recall-result.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
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

function loadResultService({ reducedMotion = false } = {}) {
  const window = {
    CETWords: {},
    innerHeight: 720,
    matchMedia: () => ({ matches: reducedMotion }),
  };
  vm.runInContext(resultSource, vm.createContext({ window, Set }), { filename: "js/active-recall-result.js" });
  return window.CETWords.activeRecallResult;
}

function fakeElement(rect) {
  const calls = [];
  return {
    calls,
    getBoundingClientRect: () => ({ ...rect }),
    scrollIntoView: (options) => calls.push(options),
  };
}

const resultService = loadResultService();

await test("pre-submit active recall keeps the textarea form visible", () => {
  assert.match(studySource, /meaningForm\.hidden = !isSubjective \|\| isFinalSubjectiveResult/);
  assert.match(studySource, /if \(question\.selectedIndex === null && !question\.aiPending\)/);
});

for (const judgement of ["correct", "partial", "wrong"]) {
  await test(`${judgement} is recognized as a final result mode`, () => {
    assert.equal(resultService.isFinalResult({ judgement }), true);
  });
}

await test("a deferred judgement is not treated as final result mode", () => {
  assert.equal(resultService.isFinalResult({ judgement: "deferred" }), false);
});

await test("final result mode hides the large textarea and submit form", () => {
  assert.match(studySource, /isFinalSubjectiveResult[\s\S]*meaningForm\.hidden/);
  assert.match(cssSource, /\.study-card\.is-active-recall-result \.answer-area\s*\{\s*display: none/);
});

await test("the compact card keeps the submitted answer", () => {
  assert.match(htmlSource, /你的回答[\s\S]*ai-feedback-user-answer/);
  assert.match(studySource, /aiFeedbackUserAnswer\.textContent = question\.userAnswer/);
});

await test("the compact card places the standard meaning before the explanation", () => {
  const standardIndex = htmlSource.indexOf("ai-feedback-standard-meaning");
  const judgementIndex = htmlSource.indexOf("ai-feedback-judgement");
  assert.ok(standardIndex > 0 && standardIndex < judgementIndex);
});

await test("the compact card uses the core meaning as the immediate standard answer", () => {
  assert.match(studySource, /aiFeedbackStandardMeaning\.textContent = question\.word\.coreMeaning/);
});

await test("the judgement explanation remains in the common result card", () => {
  assert.match(studySource, /aiFeedbackJudgement\.textContent = judgementText/);
});

await test("a mostly visible result does not scroll", () => {
  const element = fakeElement({ top: 240, bottom: 500, height: 260 });
  const question = { judgement: "correct", resultScrollHandled: false };
  assert.equal(resultService.scrollFeedbackIntoViewIfNeeded(element, question, { viewportHeight: 720 }), false);
  assert.equal(element.calls.length, 0);
  assert.equal(question.resultScrollHandled, true);
});

await test("a result below the viewport scrolls smoothly to center", () => {
  const element = fakeElement({ top: 760, bottom: 1040, height: 280 });
  const question = { judgement: "wrong", resultScrollHandled: false };
  assert.equal(resultService.scrollFeedbackIntoViewIfNeeded(element, question, { viewportHeight: 720 }), true);
  assert.equal(JSON.stringify(element.calls), JSON.stringify([{ behavior: "smooth", block: "center" }]));
});

await test("the same result never auto-scrolls twice", () => {
  const element = fakeElement({ top: 760, bottom: 1040, height: 280 });
  const question = { judgement: "partial", resultScrollHandled: false };
  resultService.scrollFeedbackIntoViewIfNeeded(element, question, { viewportHeight: 720 });
  resultService.scrollFeedbackIntoViewIfNeeded(element, question, { viewportHeight: 720 });
  assert.equal(element.calls.length, 1);
});

await test("visibility uses geometry and a mostly-visible ratio", () => {
  assert.equal(resultService.isElementMostlyVisible(fakeElement({ top: 100, bottom: 295, height: 300 }), 720), true);
  assert.equal(resultService.isElementMostlyVisible(fakeElement({ top: 600, bottom: 900, height: 300 }), 720), false);
});

await test("result scrolling waits for requestAnimationFrame", () => {
  assert.match(studySource, /window\.requestAnimationFrame\(\(\) =>/);
  assert.doesNotMatch(studySource, /setTimeout\([^)]*scrollFeedbackIntoViewIfNeeded/);
});

await test("AI loading keeps the form and never schedules result scrolling", () => {
  assert.match(studySource, /question\.aiPending = true;\s*this\.renderAnswerArea\(question\)/);
  assert.match(studySource, /activeRecallResult\.isFinalResult\(question\)/);
  assert.equal(resultService.isFinalResult({ judgement: null, aiPending: true }), false);
});

await test("AI failure keeps the existing manual fallback controls", () => {
  assert.match(studySource, /showAiUnavailable[\s\S]*manualActions\.hidden = false/);
  assert.match(studySource, /applyManualJudgement\(judgement\)/);
  assert.match(studySource, /deferAiQuestion\(\)/);
});

for (const [label, phase] of [
  ["new reinforcement", "AI_REINFORCEMENT"],
  ["formal review", "FORMAL_REVIEW_PHASE"],
  ["Recovery", "RECOVERY_PHASE"],
]) {
  await test(`${label} reuses the shared subjective result renderer`, () => {
    assert.match(studySource, new RegExp(phase));
    assert.match(studySource, /renderSubjectiveFeedback\(question\)/);
    assert.equal((studySource.match(/scheduleFeedbackVisibility\(question\);/g) || []).length, 1);
  });
}

await test("correct partial and wrong use clear shared result labels", () => {
  assert.match(studySource, /回答正确/);
  assert.match(studySource, /部分正确/);
  assert.match(studySource, /未通过/);
});

await test("Ctrl+Enter and IME guards remain intact", () => {
  assert.match(studySource, /event\.key === "Enter"[\s\S]*event\.ctrlKey/);
  assert.match(studySource, /event\.isComposing/);
  assert.match(studySource, /compositionstart/);
  assert.match(studySource, /compositionend/);
  assert.match(studySource, /event\.repeat/);
});

await test("next-word behavior and button remain unchanged", () => {
  assert.match(studySource, /nextQuestion\(\)[\s\S]*session\.currentIndex \+= 1/);
  assert.match(htmlSource, /id="next-word-button"/);
});

await test("mobile result mode remains compact and shortcut-free", () => {
  assert.match(cssSource, /@media \(max-width: 620px\)[\s\S]*\.study-card\.is-active-recall-result/);
  assert.match(cssSource, /@media \(max-width: 620px\)[\s\S]*\.meaning-submit-shortcut[\s\S]*display: none/);
  assert.doesNotMatch(cssSource, /\.study-card\.is-active-recall-result[^}]*width:\s*\d{4}px/);
});

await test("Phase 15.1 result behavior remains intact after the v12 grouping upgrade", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8"), /const DATA_VERSION = 12/);
  const changedWorker = fs.readFileSync(path.join(ROOT, "worker/src/index.js"), "utf8");
  assert.equal(changedWorker.includes("activeRecallResult"), false);
});

console.log(`\nPhase 15.1 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
