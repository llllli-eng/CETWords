/** Phase16.6.1 · AI 词义核验与个人释义覆盖专项测试 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORAGE_KEY = "cetwords-user-data-v1";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const html = read("index.html");
const css = read("css/style.css");
const appSource = read("js/app.js");
const studySource = read("js/study.js");
const workerSource = read("worker/src/index.js");
let passed = 0;
let failed = 0;

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

function createLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values); },
  };
}

function loadApp(initial = {}, fetchImpl = async () => new Response("{}")) {
  const localStorage = createLocalStorage(initial);
  const window = {
    CETWords: {},
    localStorage,
    location: { href: "https://app.example/index.html" },
  };
  const context = vm.createContext({
    window, localStorage, console, URL, Map, Set, Date, Math, Intl,
    AbortController, setTimeout, clearTimeout, fetch: fetchImpl, Response,
    structuredClone,
  });
  [
    "js/sample-data.js", "js/review-scheduler.js", "js/review-workload.js",
    "js/smart-learning-order.js", "js/review-recovery.js", "js/new-word-learning.js",
    "js/daily-group-service.js", "js/confusable-words.js", "js/meaning-overrides.js",
    "js/storage.js", "js/backup-service.js", "js/ai-judge.js", "js/meaning-audit.js",
    "js/word-utils.js", "js/study-modes.js",
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return { app: window.CETWords, localStorage, context };
}

const vocabulary = ["cet4", "cet6"].flatMap((bookId) => JSON.parse(read(`data/${bookId}.json`)));
const formal = (spelling, book = "cet4") => vocabulary.find((word) => word.book === book && word.word === spelling);
const fast4 = formal("fast", "cet4");
const fast6 = formal("fast", "cet6");
const assume = formal("assume", "cet4");
const opposite = formal("opposite", "cet4");
const distractors = [formal("slow"), formal("quick"), formal("firm")].filter(Boolean);
const auditFixture = {
  verdict: "priority_issue",
  summary: "该义项真实存在，但不适合作为四六级首要核心义。",
  commonMeanings: [
    { pos: "adj.", meaning: "快速的；迅速的" },
    { pos: "adv.", meaning: "快速地" },
  ],
  suggestedCoreMeaning: "快速的；迅速的；快速地",
  secondaryMeanings: ["牢固的；固定的"],
  cetAdvice: "优先掌握表示速度的常见义。",
  caution: "牢固的是真实义项，但优先级较低。",
};

await test("01 fast/assume/opposite and cross-book fixtures exist", () => {
  [fast4, fast6, assume, opposite].forEach((word) => assert.ok(word));
  assert.notEqual(fast4.id, fast6.id);
});

const loaded = loadApp();
const { storage, meaningOverrides, meaningAudit, aiJudge, backupService, createStudyQuestion } = loaded.app;

await test("02 Storage remains v15 and defaults to an empty override map", () => {
  assert.equal(storage.DATA_VERSION, 15);
  assert.equal(Object.keys(storage.getPersonalMeaningOverrides()).length, 0);
});

await test("03 exact wordId separates identical spellings in CET4/CET6", () => {
  storage.savePersonalMeaningOverride(fast4.id, { coreMeaning: "四级个人义", source: "manual" }, 1000);
  assert.equal(storage.getPersonalMeaningOverride(fast4.id).coreMeaning, "四级个人义");
  assert.equal(storage.getPersonalMeaningOverride(fast6.id), null);
});

await test("04 invalid override entries are discarded safely", () => {
  const normalized = meaningOverrides.normalizeOverrideMap({ good: { coreMeaning: " 好 " }, bad: { note: "missing" } });
  assert.deepEqual(Object.keys(normalized), ["good"]);
  assert.equal(normalized.good.coreMeaning, "好");
});

await test("05 accepting an AI suggestion creates the documented override shape", () => {
  const override = meaningOverrides.buildOverrideFromAudit(auditFixture, 2000);
  const saved = storage.savePersonalMeaningOverride(fast4.id, override, 2000);
  assert.equal(saved.override.source, "ai_accepted");
  assert.equal(saved.override.aiAuditSnapshot.verdict, "priority_issue");
  assert.equal(saved.override.coreMeaning, auditFixture.suggestedCoreMeaning);
});

await test("06 manual editing creates a manual override with required coreMeaning", () => {
  const saved = storage.savePersonalMeaningOverride(assume.id, {
    coreMeaning: "假设；认为；承担",
    shortMeaning: "假设；认为",
    meanings: ["假设", "认为", "承担"],
    note: "个人记忆顺序",
    source: "manual",
  }, 3000);
  assert.equal(saved.override.source, "manual");
  assert.equal(saved.override.note, "个人记忆顺序");
});

await test("07 override survives a storage reload", () => {
  const reloaded = loadApp(loaded.localStorage.dump()).app.storage;
  assert.equal(reloaded.getPersonalMeaningOverride(assume.id).coreMeaning, "假设；认为；承担");
});

await test("08 removing an override restores base selection", () => {
  storage.removePersonalMeaningOverride(fast4.id);
  assert.equal(storage.getPersonalMeaningOverride(fast4.id), null);
  assert.equal(meaningOverrides.getDisplayCoreMeaning(fast4, null), meaningOverrides.getBaseCoreMeaning(fast4));
});

await test("09 undo can remove a newly created override", () => {
  const saved = storage.savePersonalMeaningOverride(opposite.id, { coreMeaning: "个人相反义" }, 4000);
  storage.restorePersonalMeaningOverrideSnapshot(opposite.id, saved.previous);
  assert.equal(storage.getPersonalMeaningOverride(opposite.id), null);
});

await test("10 undo can restore the previous override exactly", () => {
  storage.savePersonalMeaningOverride(opposite.id, { coreMeaning: "旧个人义", note: "旧" }, 5000);
  const changed = storage.savePersonalMeaningOverride(opposite.id, { coreMeaning: "新个人义", note: "新" }, 6000);
  storage.restorePersonalMeaningOverrideSnapshot(opposite.id, changed.previous);
  assert.equal(storage.getPersonalMeaningOverride(opposite.id).coreMeaning, "旧个人义");
  assert.equal(storage.getPersonalMeaningOverride(opposite.id).note, "旧");
});

await test("11 display view prioritizes personal meaning without mutating the dictionary object", () => {
  const before = JSON.stringify(assume);
  const view = meaningOverrides.applyPersonalOverride(assume, storage.getPersonalMeaningOverride(assume.id));
  assert.equal(view.coreMeaning, "假设；认为；承担");
  assert.equal(JSON.stringify(assume), before);
});

await test("12 judgement reference contains personal meanings plus original dictionary meanings", () => {
  const reference = meaningOverrides.buildReferenceWord(assume, storage.getPersonalMeaningOverride(assume.id));
  assert.equal(reference.meanings[0].pos, "个人");
  assert.ok(reference.meanings.some((item) => item.meaning === "假设"));
  assert.ok(reference.meanings.some((item) => item.pos !== "个人"));
});

await test("13 active recall accepts a modern meaning added by the personal override", () => {
  const reference = meaningOverrides.buildReferenceWord(assume, storage.getPersonalMeaningOverride(assume.id));
  assert.equal(aiJudge.localMeaningJudge(reference, "假设").result, "correct");
});

await test("14 original correct meanings still pass after a narrow personal override", () => {
  const narrow = meaningOverrides.buildReferenceWord(assume, { coreMeaning: "假设", meanings: ["假设"] });
  const originalCandidate = aiJudge.extractMeaningSegments(assume).find((value) => value && value !== "假设");
  assert.ok(originalCandidate);
  assert.equal(aiJudge.localMeaningJudge(narrow, originalCandidate).result, "correct");
});

await test("15 verified mastery uses the same merged reference path", () => {
  assert.match(studySource, /const referenceWord = this\.getMeaningReference\(question\.word\)[\s\S]*localMeaningJudge\(referenceWord, userAnswer\)/);
  assert.match(studySource, /onAiJudgeMeaning\(\{ word: referenceWord, userAnswer \}\)/);
});

await test("16 English-to-Chinese correct option uses personal core meaning", () => {
  const view = meaningOverrides.applyPersonalOverride(assume, storage.getPersonalMeaningOverride(assume.id));
  const question = createStudyQuestion(view, distractors, "en-to-zh", () => 0.4);
  assert.equal(question.options.find((option) => option.isCorrect).meaning, "假设；认为；承担");
});

await test("17 Chinese-to-English prompt uses personal core meaning", () => {
  const view = meaningOverrides.applyPersonalOverride(assume, storage.getPersonalMeaningOverride(assume.id));
  const question = createStudyQuestion(view, distractors, "zh-to-en", () => 0.4);
  assert.equal(question.prompt.primary, "假设；认为；承担");
});

await test("18 four-choice options remain unique", () => {
  const view = meaningOverrides.applyPersonalOverride(assume, storage.getPersonalMeaningOverride(assume.id));
  const question = createStudyQuestion(view, distractors, "en-to-zh", () => 0.4);
  assert.equal(new Set(question.options.map((item) => item.text)).size, question.options.length);
});

await test("19 formal review and Recovery result surfaces share personalized renderWordDetails", () => {
  assert.match(studySource, /renderWordDetails\(question\)[\s\S]*getLearningWordView\(question\.word\)/);
  assert.match(studySource, /renderAiFeedbackDetails\(question[\s\S]*getLearningWordView\(question\.word\)/);
});

await test("20 word detail exposes personal/base labels and restoration", () => {
  for (const id of ["word-detail-personal-badge", "word-detail-personal-current", "word-detail-personal-base", "word-detail-meaning-restore"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(appSource, /meaningOverrides\.getBaseCoreMeaning\(word\)/);
});

await test("21 restoration requires a second confirmation", () => {
  assert.match(html, /id="meaning-override-confirm"/);
  assert.match(appSource, /openMeaningConfirm\("restore"\)/);
  assert.match(appSource, /removePersonalMeaningOverride\(wordId\)/);
});

await test("22 save and restore both offer an eight-second undo", () => {
  assert.match(appSource, /actionLabel: "撤销",[\s\S]*duration: 8000/);
  assert.match(appSource, /restorePersonalMeaningOverrideSnapshot/);
});

await test("23 confusable vocabulary uses the personal-first merged reference", () => {
  assert.match(appSource, /function getConfusableVocabulary\(\)[\s\S]*buildReferenceWord/);
  const reference = meaningOverrides.buildReferenceWord(assume, storage.getPersonalMeaningOverride(assume.id));
  assert.equal(reference.coreMeaning, "假设；认为；承担");
});

await test("24 Phase16.5.1 threshold remains exactly 8", () => {
  assert.equal(loaded.app.confusableWords.NEW_CANDIDATE_SCORE_THRESHOLD, 8);
});

await test("25 editing a meaning does not create a pair or change confusionCount", () => {
  storage.addConfusablePair(assume.id, opposite.id, { initialConfusion: true, now: 7000 });
  const before = storage.getConfusablePairs();
  storage.savePersonalMeaningOverride(assume.id, { coreMeaning: "假设；认为" }, 8000);
  assert.deepEqual(storage.getConfusablePairs(), before);
});

await test("26 normal module load performs zero AI requests", () => {
  let calls = 0;
  loadApp({}, async () => { calls += 1; return new Response("{}"); });
  assert.equal(calls, 0);
});

await test("27 audit payload contains only the minimum documented fields", () => {
  const payload = meaningAudit.buildAuditPayload(fast4, null);
  assert.deepEqual(Object.keys(payload), ["word", "book", "sourceLevel", "coreMeaning", "shortMeaning", "meanings", "meaningsByPos"]);
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ["srs", "frequency", "confusablepairs", "history", "example", "writing", "pdf"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

await test("28 one explicit audit click produces exactly one dedicated request", async () => {
  let calls = 0;
  let url = "";
  await meaningAudit.audit({
    word: fast4,
    proxyUrl: "https://worker.example",
    token: "token",
    fetchImpl: async (requestedUrl) => {
      calls += 1;
      url = String(requestedUrl);
      return new Response(JSON.stringify(auditFixture), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(calls, 1);
  assert.match(url, /\/api\/meaning-audit$/);
});

await test("29 all five verdict values normalize successfully", () => {
  for (const verdict of ["correct", "incomplete", "priority_issue", "misleading", "wrong"]) {
    assert.equal(meaningAudit.normalizeAuditResult({ ...auditFixture, verdict }).verdict, verdict);
  }
});

await test("30 malformed audit output fails safely", () => {
  assert.throws(() => meaningAudit.normalizeAuditResult({ verdict: "invented" }), /格式异常/);
});

await test("31 oversized client fields are bounded", () => {
  const result = meaningAudit.normalizeAuditResult({ ...auditFixture, suggestedCoreMeaning: "x".repeat(5000) });
  assert.equal(result.suggestedCoreMeaning.length, 300);
});

await test("32 each explicit follow-up sends one chat request", async () => {
  let calls = 0;
  const response = await meaningAudit.chat({
    word: fast4,
    audit: auditFixture,
    history: [],
    question: "为什么牢固的优先级较低？",
    proxyUrl: "https://worker.example",
    token: "token",
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(String(url), /\/api\/meaning-audit-chat$/);
      return new Response(JSON.stringify({ answer: "这是现代真实义项，但在四六级语境中远低于速度义。" }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.match(response.answer, /真实义项/);
});

await test("33 follow-up history is capped at four rounds (eight messages)", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `m${index}` }));
  assert.equal(meaningAudit.normalizeHistory(history).length, 8);
  assert.equal(meaningAudit.normalizeHistory(history)[0].content, "m4");
});

const worker = await import(`${pathToFileURL(path.join(ROOT, "worker/src/index.js")).href}?phase1661=${Date.now()}`);
const validAuditPayload = meaningAudit.buildAuditPayload(fast4, null);

await test("34 Worker accepts the bounded meaning-audit request", () => {
  assert.equal(worker.validateMeaningAuditPayload(validAuditPayload).error, undefined);
});

await test("35 Worker rejects unknown audit fields", () => {
  assert.match(worker.validateMeaningAuditPayload({ ...validAuditPayload, srs: {} }).error, /不允许/);
});

await test("36 Worker validates optional personal override independently", () => {
  const payload = meaningAudit.buildAuditPayload(assume, storage.getPersonalMeaningOverride(assume.id));
  const value = worker.validateMeaningAuditPayload(payload).value;
  assert.equal(value.personalOverride.coreMeaning, storage.getPersonalMeaningOverride(assume.id).coreMeaning);
});

await test("37 Worker rejects more than eight chat-history messages", () => {
  const payload = meaningAudit.buildChatPayload({
    word: fast4,
    audit: auditFixture,
    history: [],
    question: "问题",
  });
  payload.history = Array.from({ length: 9 }, () => ({ role: "user", content: "x" }));
  assert.match(worker.validateMeaningAuditChatPayload(payload).error, /history/);
});

await test("38 Worker normalizes every verdict with the structured schema", () => {
  for (const verdict of ["correct", "incomplete", "priority_issue", "misleading", "wrong"]) {
    const result = worker.normalizeMeaningAuditModelResult(JSON.stringify({ ...auditFixture, verdict }));
    assert.equal(result.verdict, verdict);
  }
});

await test("39 Worker rejects an oversized model field rather than trusting it", () => {
  assert.equal(worker.normalizeMeaningAuditModelResult(JSON.stringify({ ...auditFixture, summary: "x".repeat(501) })), null);
});

await test("40 Worker prompt distinguishes real meanings from CET priority", () => {
  const body = worker.buildMeaningAuditDeepSeekBody(validAuditPayload);
  const prompt = body.messages.map((item) => item.content).join("\n");
  assert.match(prompt, /真实存在/);
  assert.match(prompt, /核心义/);
  assert.match(prompt, /古旧义|方言义|专业义/);
});

function deepSeekResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const env = {
  ALLOWED_ORIGINS: "https://app.example",
  APP_PROXY_TOKEN: "token",
  DEEPSEEK_API_KEY: "secret",
};

await test("41 /api/meaning-audit returns the dedicated structured response", async () => {
  let calls = 0;
  const request = new Request("https://worker.example/api/meaning-audit", {
    method: "POST",
    headers: { Origin: "https://app.example", "Content-Type": "application/json", "X-App-Token": "token" },
    body: JSON.stringify(validAuditPayload),
  });
  const response = await worker.handleRequest(request, env, async () => { calls += 1; return deepSeekResponse(auditFixture); });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(data.verdict, "priority_issue");
  assert.equal(data.usage.promptTokens, 10);
});

await test("42 /api/meaning-audit-chat sends only a current-word bounded conversation", async () => {
  const payload = meaningAudit.buildChatPayload({ word: fast4, audit: auditFixture, history: [], question: "为什么？" });
  const request = new Request("https://worker.example/api/meaning-audit-chat", {
    method: "POST",
    headers: { Origin: "https://app.example", "Content-Type": "application/json", "X-App-Token": "token" },
    body: JSON.stringify(payload),
  });
  const response = await worker.handleRequest(request, env, async (_url, options) => {
    const upstream = JSON.parse(options.body);
    assert.equal(upstream.messages.at(-1).content, "为什么？");
    return deepSeekResponse({ answer: "因为速度义在四六级中更常见。" });
  });
  assert.equal((await response.json()).answer, "因为速度义在四六级中更常见。");
});

await test("43 original judge schema remains correct|partial|wrong", () => {
  assert.match(workerSource, /VALID_RESULTS = new Set\(\["correct", "partial", "wrong"\]\)/);
  assert.equal(aiJudge.normalizeJudgement({ result: "correct", confidence: 1 }).result, "correct");
});

await test("44 current-session result cache prevents rerender/reopen requests", () => {
  assert.match(appSource, /if \(session\.audit && !force\)[\s\S]*return;/);
  assert.match(appSource, /if \(!session\.audit && !session\.error\) requestMeaningAudit\(\)/);
});

await test("45 only explicit re-audit uses force=true", () => {
  assert.match(appSource, /meaningAuditRetry\.addEventListener\("click", \(\) => requestMeaningAudit\(\{ force: true \}\)\)/);
});

await test("46 AI failure leaves overrides untouched and exposes a retry message", async () => {
  const before = storage.getPersonalMeaningOverrides();
  await assert.rejects(() => meaningAudit.audit({
    word: fast4,
    proxyUrl: "https://worker.example",
    token: "token",
    fetchImpl: async () => { throw new Error("offline"); },
  }));
  assert.deepEqual(storage.getPersonalMeaningOverrides(), before);
  assert.match(appSource, /AI 核验暂时失败，请稍后重试/);
});

await test("47 AI text is rendered through textContent/createElement, never raw HTML", () => {
  const auditSection = appSource.slice(appSource.indexOf("const MEANING_AUDIT_LABELS"), appSource.indexOf("function renderStatistics"));
  assert.doesNotMatch(auditSection, /innerHTML/);
  assert.match(auditSection, /textContent/);
});

await test("48 backup export includes personalMeaningOverrides", () => {
  const backup = backupService.createBackup(9000);
  assert.equal(backup.data.personalMeaningOverrides[assume.id].coreMeaning, storage.getPersonalMeaningOverride(assume.id).coreMeaning);
});

await test("49 importing a new backup restores overrides", () => {
  const backup = backupService.createBackup(10000);
  storage.removePersonalMeaningOverride(assume.id);
  backupService.importBackup(backup);
  assert.ok(storage.getPersonalMeaningOverride(assume.id));
});

await test("50 an old backup without the field imports as an empty map", () => {
  const old = storage.loadUserData();
  delete old.personalMeaningOverrides;
  old.version = 14;
  backupService.importBackup(old);
  assert.equal(Object.keys(storage.getPersonalMeaningOverrides()).length, 0);
});

await test("51 backup never contains proxy token or Worker/API secrets", () => {
  storage.setAiProxyToken("never-export-this-token");
  const serialized = JSON.stringify(backupService.createBackup(11000));
  assert.doesNotMatch(serialized, /never-export-this-token|APP_PROXY_TOKEN|DEEPSEEK_API_KEY|Worker secret/i);
});

await test("52 editing meaning changes no learning/SRS/Recovery/daily/frequency fields", () => {
  const isolated = loadApp();
  const before = isolated.app.storage.loadUserData();
  isolated.app.storage.savePersonalMeaningOverride(assume.id, { coreMeaning: "个人释义" }, 12000);
  const after = isolated.app.storage.loadUserData();
  delete before.personalMeaningOverrides;
  delete after.personalMeaningOverrides;
  assert.deepEqual(after, before);
});

await test("53 audit entry is after result feedback and before word details", () => {
  const feedback = html.indexOf('id="answer-feedback"');
  const audit = html.indexOf('id="study-meaning-tools"');
  const details = html.indexOf('id="word-details"');
  assert.ok(feedback < audit && audit < details);
});

await test("54 audit controls are hidden in HTML before answer reveal", () => {
  assert.match(html, /id="study-meaning-tools"[^>]*hidden/);
  assert.match(studySource, /meaningTools\.hidden = true/);
  assert.match(studySource, /selectedIndex !== null/);
});

await test("55 desktop/mobile CSS provides 48px controls and bounded wrapping dialogs", () => {
  assert.match(css, /study-meaning-tools > div > button[\s\S]*min-height:\s*48px/);
  assert.match(css, /meaning-audit-dialog[\s\S]*max-height:\s*calc\(100dvh - 32px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*meaning-audit-actions[\s\S]*grid-template-columns:\s*1fr/);
});

await test("56 scripts load personal-meaning helpers before storage/app", () => {
  assert.ok(html.indexOf("js/meaning-overrides.js") < html.indexOf("js/storage.js"));
  assert.ok(html.indexOf("js/meaning-audit.js") < html.indexOf("js/app.js"));
});

await test("57 protected dictionary/frequency/writing/scheduler files equal HEAD byte-for-byte", () => {
  const protectedFiles = [
    "data/cet4.json", "data/cet6.json", "data/core-meaning-overrides.json",
    "data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json", "data/cet-frequency-report.json",
    "data/cet6-writing-topics.json", "data/cet6-writing-materials.json",
    "js/review-scheduler.js", "js/review-recovery.js", "js/review-workload.js",
    "js/confusable-words.js", "js/writing.js", "js/writing-data.js",
  ];
  for (const file of protectedFiles) {
    const current = execFileSync("git", ["hash-object", file], { cwd: ROOT, encoding: "utf8" }).trim();
    const base = execFileSync("git", ["rev-parse", `HEAD:${file}`], { cwd: ROOT, encoding: "utf8" }).trim();
    assert.equal(current, base, file);
  }
});

await test("58 Worker endpoints remain isolated from /api/judge-meaning", () => {
  assert.match(workerSource, /\/api\/meaning-audit/);
  assert.match(workerSource, /buildMeaningAuditDeepSeekBody/);
  assert.doesNotMatch(workerSource.match(/const SYSTEM_PROMPT = `[\s\S]*?`;/)?.[0] || "", /meaning-audit|核验词义/);
});

console.log(`\nPhase16.6.1: ${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
