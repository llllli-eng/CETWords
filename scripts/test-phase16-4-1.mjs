import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

const html = read("index.html");
const css = read("css/style.css");
const study = read("js/study.js");
const studyCard = html.slice(html.indexOf('id="question-screen"'), html.indexOf('id="result-screen"'));

await test("01 reuses exactly one study confusable button", () => {
  assert.equal((html.match(/id="study-confusable-button"/g) || []).length, 1);
});

await test("02 result feedback precedes the confusable entry", () => {
  assert.ok(studyCard.indexOf('id="answer-feedback"') < studyCard.indexOf('id="study-confusable-button"'));
});

await test("03 confusable entry precedes the word detail card", () => {
  assert.ok(studyCard.indexOf('id="study-confusable-button"') < studyCard.indexOf('id="word-details"'));
});

await test("04 word detail card precedes the next action", () => {
  assert.ok(studyCard.indexOf('id="word-details"') < studyCard.indexOf('id="next-word-button"'));
});

await test("05 entry remains hidden before a final answer", () => {
  assert.match(studyCard, /id="study-confusable-button"[^>]*hidden/);
  assert.match(study, /const answered = question\?\.selectedIndex !== null;\s*this\.elements\.confusableButton\.hidden = !answered;/);
});

await test("06 all active-recall outcomes keep the shared render path", () => {
  assert.ok((study.match(/renderConfusableActions\(question\);/g) || []).length >= 2);
  assert.match(study, /renderSubjectiveFeedback\(question\)[\s\S]*?renderConfusableActions\(question\);/);
  assert.match(study, /applySubjectiveJudgement\(judgement,[\s\S]*?renderConfusableActions\(question\);/);
});

await test("07 entry keeps the existing shared click handler and modal", () => {
  assert.equal((html.match(/id="confusable-dialog"/g) || []).length, 1);
  assert.match(study, /this\.elements\.confusableButton\.addEventListener\("click",[\s\S]*?source: "study-result"/);
});

await test("08 no-pair state still exposes search and explicit AI tools", () => {
  for (const id of ["confusable-open-finder", "confusable-refresh-suggest", "confusable-search-input", "confusable-recent-list", "confusable-ai-find"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(read("js/app.js"), /confusablePracticeCurrent\.disabled = pairs\.length === 0/);
});

await test("09 entry fills the existing content width", () => {
  assert.match(css, /\.study-confusable-button\s*\{[\s\S]*?width:\s*100%;/);
});

await test("10 entry is at least 48px tall", () => {
  assert.match(css, /\.study-confusable-button\s*\{[\s\S]*?min-height:\s*48px;/);
});

await test("11 closing the shared modal does not navigate away from the result", () => {
  const app = read("js/app.js");
  const closeHandler = app.slice(app.indexOf("elements.confusableDialogClose.addEventListener"), app.indexOf("elements.confusableFinderClose.addEventListener"));
  const closeMain = app.slice(app.indexOf("function closeMainConfusableDialog"), app.indexOf("async function requestConfusableSuggestions"));
  assert.match(closeHandler, /closeMainConfusableDialog/);
  assert.match(closeMain, /closeConfusableModal\(elements\.confusableDialog\)/);
  assert.match(closeMain, /restoreConfusableStudyScroll\(\)/);
  assert.doesNotMatch(`${closeHandler}\n${closeMain}`, /showView|location/);
});

await test("12 protected Worker, AI client and learning rules are byte-identical", () => {
  const expected = {
    "js/confusable-ai.js": "d916e32a20c38e220ffbd6157358865c852e580a4f8ab20b9f461e5a5d773364",
    "js/review-scheduler.js": "b65b22be281665c1633c9859efb9c5c5cd7adff996d51ec60d933280c94fe4f7",
    "js/review-recovery.js": "050a8dff4e21b9be018f7631610cde9ef8c39e47fa97bd08f628f9e17c91bf05",
    "js/review-workload.js": "900cd488f7ced050da7b49e7d1433b636639039b4d41db8cc2c94d22cefc6d1a",
    "js/daily-group-service.js": "502275f89f546d34ae085f9fb769faa119903a5ff68cc10a4c5282d828d4f013",
    "worker/src/index.js": "f68d152589c9de0b2533ab4a6f2f8351437d83976d5927dd26189dc7e13b5611",
  };
  Object.entries(expected).forEach(([file, hash]) => assert.equal(sha256(file), hash, file));
});

await test("13 final active-recall results bring the shared entry fully into view", () => {
  assert.match(study, /scheduleFeedbackVisibility\(question\)[\s\S]*?getVisibility\(this\.elements\.confusableButton\)/);
  assert.match(study, /this\.elements\.confusableButton\.scrollIntoView\(\{[\s\S]*?block:\s*"nearest"/);
  assert.match(study, /activeRecallResult\.isFinalResult\(question\)/);
});

await test("14 study-result modal restores its in-memory scroll position", () => {
  const app = read("js/app.js");
  assert.match(app, /returnScrollY:\s*null/);
  assert.match(app, /options\.source === "study-result" \? window\.scrollY : null/);
  assert.match(app, /function restoreConfusableStudyScroll\(\)[\s\S]*?window\.scrollTo\(\{ top: returnScrollY, behavior: "auto" \}\)/);
  assert.doesNotMatch(read("js/storage.js"), /returnScrollY/);
});

console.log(`\nPhase 16.4.1 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
