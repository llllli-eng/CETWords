import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerOnly = process.argv.includes("--worker-only");
let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

async function test(name, callback, options = {}) {
  if (workerOnly && !options.worker) return;
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

function loadBrowserModules(fetchImpl = async () => new Response("{}")) {
  const settings = { proxyUrl: "https://worker.example", token: "token" };
  const window = {
    CETWords: {
      storage: {
        getAiJudgeSettings: () => settings,
        getAiProxyToken: () => settings.token,
      },
    },
  };
  const context = vm.createContext({
    window, console, URL, Map, Set, Date, Math, Intl, AbortController,
    setTimeout, clearTimeout, fetch: fetchImpl, Response,
  });
  ["js/confusable-words.js", "js/confusable-ai.js", "js/confusable-detection.js"]
    .forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return window.CETWords;
}

const app = loadBrowserModules();
const { confusableWords, confusableAi, confusableDetection } = app;
const vocabulary = ["cet4", "cet6"].flatMap((bookId) => JSON.parse(read(`data/${bookId}.json`)));
const formal = (spelling, book = "cet4") => vocabulary.find((word) => word.book === book && word.word === spelling);
const attach = formal("attach");
const good = formal("good");
const adapt = formal("adapt");
const adopt = formal("adopt");
const belief = formal("belief");
const beef = formal("beef");
const economic = formal("economic");
const banana = formal("banana");
const affect = formal("affect");
const principal = formal("principal");
const principle = formal("principle");
const makePair = (left, right, pairs = {}) => confusableWords.upsertPair(pairs, left.id, right.id, { source: "manual", now: 1000 });

const worker = await import(`${pathToFileURL(path.join(ROOT, "worker/src/index.js")).href}?phase1651=${Date.now()}`);

await test("01 formal acceptance fixtures exist", () => {
  [attach, good, adapt, adopt, belief, beef, economic, banana, affect, principal, principle]
    .forEach((word) => assert.ok(word));
});

await test("02 attach ↔ good remains a local exact personal-pair hit", () => {
  const saved = makePair(attach, good);
  assert.equal(confusableWords.detectPersonalPairMeaningConfusion(attach, "好的", vocabulary, saved.pairs)?.word.word, "good");
});

await test("03 adapt ↔ adopt remains a local safe-alias hit", () => {
  const saved = makePair(adapt, adopt);
  assert.equal(confusableWords.detectPersonalPairMeaningConfusion(adapt, "采用", vocabulary, saved.pairs)?.word.word, "adopt");
});

await test("04 an answer belonging to the current word is not diverted", () => {
  const saved = makePair(adapt, adopt);
  assert.equal(confusableWords.detectPersonalPairMeaningConfusion(adapt, "适应", vocabulary, saved.pairs), null);
});

await test("05 only pairs connected to the current word become AI candidates", () => {
  const first = makePair(adapt, adopt);
  const second = makePair(belief, beef, first.pairs);
  const candidates = confusableWords.getPersonalPairCandidates(adapt, vocabulary, second.pairs);
  assert.equal(JSON.stringify(candidates.map((item) => item.word.word)), JSON.stringify(["adopt"]));
});

await test("06 canonical same-spelling questions resolve persisted pair candidates", () => {
  const adapt6 = formal("adapt", "cet6");
  const saved = makePair(adapt, adopt);
  assert.equal(confusableWords.getPersonalPairCandidates(adapt6, vocabulary, saved.pairs)[0]?.word.word, "adopt");
});

await test("07 multiple existing pairs are returned as one candidate collection", () => {
  const adept = { id: "fixture-adept", word: "adept", coreMeaning: "熟练的", shortMeaning: "熟练的", book: "cet4" };
  const first = makePair(adapt, adopt);
  const second = makePair(adapt, adept, first.pairs);
  assert.equal(confusableWords.getPersonalPairCandidates(adapt, [...vocabulary, adept], second.pairs).length, 2);
});

await test("08 two equally exact personal-pair meaning hits remain ambiguous", () => {
  const nice = { id: "fixture-nice", word: "nice", coreMeaning: "好的", book: "cet4" };
  const first = makePair(attach, good);
  const second = makePair(attach, nice, first.pairs);
  assert.equal(confusableWords.detectPersonalPairMeaningConfusion(attach, "好的", [...vocabulary, nice], second.pairs), null);
});

await test("09 exact core meaning receives semanticScore 4", () => {
  assert.equal(confusableWords.scoreModernCommonMeaning(beef, "牛肉")?.semanticScore, 4);
});

await test("10 safe alias receives semanticScore 4", () => {
  assert.equal(confusableWords.scoreModernCommonMeaning(adopt, "采用")?.semanticScore, 4);
});

await test("11 exact meanings entry receives semanticScore at least 3", () => {
  const word = { coreMeaning: "甲", meanings: [{ meaning: "选择并使用" }] };
  assert.ok(confusableWords.scoreModernCommonMeaning(word, "选择并使用").semanticScore >= 3);
});

await test("12 exact meaningsByPos entry receives semanticScore at least 3", () => {
  const word = { coreMeaning: "甲", meaningsByPos: { v: ["选择并使用"] } };
  assert.ok(confusableWords.scoreModernCommonMeaning(word, "选择并使用").semanticScore >= 3);
});

await test("13 a broad related concept does not pass the semantic gate", () => {
  assert.equal(confusableWords.scoreModernCommonMeaning(beef, "食物"), null);
});

await test("14 the legacy catch-all meaning field is not treated as modern-common evidence", () => {
  assert.equal(confusableWords.scoreModernCommonMeaning({ meaning: "罕见义" }, "罕见义"), null);
});

await test("15 belief → 牛肉 discovers beef through all three gates", () => {
  assert.equal(confusableWords.detectNewConfusableCandidate(belief, "牛肉", vocabulary)?.word.word, "beef");
});

await test("16 new candidates expose semantic and confusable scores", () => {
  const candidate = confusableWords.detectNewConfusableCandidate(belief, "牛肉", vocabulary);
  assert.equal(candidate.semanticScore, 4);
  assert.ok(candidate.confusableScore >= 8);
});

await test("17 the original high confidence threshold stays at 8", () => {
  assert.equal(confusableWords.NEW_CANDIDATE_SCORE_THRESHOLD, 8);
});

await test("18 economic → 香蕉 rejects banana at the confusion-rationale gate", () => {
  assert.equal(confusableWords.detectNewConfusableCandidate(economic, "香蕉", vocabulary), null);
  assert.equal(confusableWords.detectNewConfusableCandidate(economic, "香蕉", vocabulary, {
    recentWordIds: [banana.id],
  }), null);
});

await test("19 belief → 食物 rejects beef at the semantic gate", () => {
  assert.equal(confusableWords.detectNewConfusableCandidate(belief, "食物", vocabulary), null);
});

await test("20 an answer matching the current word never generates a new candidate", () => {
  assert.equal(confusableWords.detectNewConfusableCandidate(affect, "影响", vocabulary), null);
});

await test("21 principal → 原则 uniquely discovers principle", () => {
  assert.equal(confusableWords.detectNewConfusableCandidate(principal, "原则", vocabulary)?.word.word, "principle");
});

await test("22 top and second candidates need a two-point safety gap", () => {
  assert.equal(confusableWords.NEW_CANDIDATE_UNIQUENESS_GAP, 2);
  assert.equal(confusableWords.selectUniqueCandidate([{ score: 10 }, { score: 9 }]), null);
  assert.equal(confusableWords.selectUniqueCandidate([{ score: 10 }, { score: 8 }]).score, 10);
});

await test("23 words already paired with the current word are excluded from new discovery", () => {
  const saved = makePair(belief, beef);
  assert.equal(confusableWords.detectNewConfusableCandidate(belief, "牛肉", vocabulary, { personalPairs: saved.pairs }), null);
});

await test("24 new discovery never creates or mutates personal pairs", () => {
  const pairs = {};
  confusableWords.detectNewConfusableCandidate(belief, "牛肉", vocabulary, { personalPairs: pairs });
  assert.deepEqual(pairs, {});
});

await test("25 existing-pair AI payload contains only the minimum fields", () => {
  const candidate = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs)[0];
  const payload = confusableAi.buildExistingMatchPayload(adapt, "选择并开始使用某种方法", [candidate]);
  assert.deepEqual(Object.keys(payload), ["currentWord", "userAnswer", "candidates"]);
  assert.deepEqual(Object.keys(payload.candidates[0]), ["word", "coreMeaning", "shortMeaning", "meanings"]);
});

await test("26 existing-pair AI payload keeps meanings small", () => {
  const candidate = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs)[0];
  const payload = confusableAi.buildExistingMatchPayload(adapt, "x", [candidate]);
  assert.ok(payload.candidates.length <= 8);
  assert.ok(payload.candidates[0].meanings.length <= 4);
});

await test("27 existing-pair AI payload excludes history frequency examples and SRS", () => {
  const source = JSON.stringify(confusableAi.buildExistingMatchPayload(adapt, "x", confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs)));
  for (const forbidden of ["history", "frequency", "example", "nextReview", "srs"]) assert.doesNotMatch(source.toLowerCase(), new RegExp(forbidden.toLowerCase()));
});

await test("28 existing-pair client uses the dedicated endpoint", async () => {
  let requested = "";
  const loaded = loadBrowserModules(async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ match: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const candidate = loaded.confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs)[0];
  await loaded.confusableAi.matchExisting(adapt, "x", [candidate]);
  assert.match(requested, /\/api\/confusable-match-existing$/);
});

await test("29 high-confidence AI output exact-maps to a real pair candidate", () => {
  const candidates = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs);
  assert.equal(confusableWords.validateExistingPairAiMatch({ match: true, word: "adopt", confidence: "high" }, candidates)?.word.word, "adopt");
});

await test("30 medium-confidence AI output is discarded", () => {
  const candidates = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs);
  assert.equal(confusableWords.validateExistingPairAiMatch({ match: true, word: "adopt", confidence: "medium" }, candidates), null);
});

await test("31 an AI-invented word is discarded", () => {
  const candidates = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs);
  assert.equal(confusableWords.validateExistingPairAiMatch({ match: true, word: "invented", confidence: "high" }, candidates), null);
});

await test("32 ambiguous AI output produces no match", () => {
  const candidates = confusableWords.getPersonalPairCandidates(adapt, vocabulary, makePair(adapt, adopt).pairs);
  assert.equal(confusableWords.validateExistingPairAiMatch({ match: false, reason: "ambiguous" }, candidates), null);
});

function createDetectionService(matchExisting) {
  return confusableDetection.createService({ matchExisting });
}

await test("33 correct and partial never run confusable detection", () => {
  let calls = 0;
  const service = createDetectionService(async () => { calls += 1; return { match: false }; });
  for (const judgement of ["correct", "partial"]) {
    const result = service.detect({ currentWord: adapt, userAnswer: "x", judgement, answerEventId: judgement, words: vocabulary, personalPairs: makePair(adapt, adopt).pairs });
    assert.equal(result.immediate, null);
    assert.equal(result.pending, null);
  }
  assert.equal(calls, 0);
});

await test("34 local existing-pair hit costs zero AI calls", () => {
  let calls = 0;
  const service = createDetectionService(async () => { calls += 1; return { match: false }; });
  const result = service.detect({ currentWord: adapt, userAnswer: "采用", judgement: "wrong", answerEventId: "s:1", words: vocabulary, personalPairs: makePair(adapt, adopt).pairs });
  assert.equal(result.immediate.word.word, "adopt");
  assert.equal(calls, 0);
});

await test("35 local miss triggers at most one existing-pair AI call", async () => {
  let calls = 0;
  const service = createDetectionService(async () => { calls += 1; return { match: true, word: "adopt", confidence: "high" }; });
  const result = service.detect({ currentWord: adapt, userAnswer: "选择并开始使用某种方法", judgement: "wrong", answerEventId: "s:2", words: vocabulary, personalPairs: makePair(adapt, adopt).pairs });
  assert.equal((await result.pending).word.word, "adopt");
  assert.equal(calls, 1);
});

await test("36 five existing pairs are sent in one batch, not five calls", async () => {
  const fixtures = ["adept", "adaptation", "adapter", "adaption"].map((word, index) => ({ id: `fixture-${index}`, word, coreMeaning: `义${index}`, book: "cet4" }));
  let pairs = makePair(adapt, adopt).pairs;
  fixtures.forEach((word) => { pairs = makePair(adapt, word, pairs).pairs; });
  let calls = 0;
  let count = 0;
  const service = createDetectionService(async (_word, _answer, candidates) => { calls += 1; count = candidates.length; return { match: false }; });
  const result = service.detect({ currentWord: adapt, userAnswer: "完全无关", judgement: "wrong", answerEventId: "s:3", words: [...vocabulary, ...fixtures], personalPairs: pairs });
  await result.pending;
  assert.equal(calls, 1);
  assert.equal(count, 5);
});

await test("37 no existing pair and no local candidate costs zero AI calls", () => {
  let calls = 0;
  const service = createDetectionService(async () => { calls += 1; return { match: false }; });
  const result = service.detect({ currentWord: economic, userAnswer: "香蕉", judgement: "wrong", answerEventId: "s:4", words: vocabulary, personalPairs: {} });
  assert.equal(result.immediate, null);
  assert.equal(result.pending, null);
  assert.equal(calls, 0);
});

await test("38 the same answer event reuses one pending AI request", async () => {
  let calls = 0;
  const service = createDetectionService(async () => { calls += 1; return { match: false }; });
  const args = { currentWord: adapt, userAnswer: "改写释义", judgement: "wrong", answerEventId: "s:5", words: vocabulary, personalPairs: makePair(adapt, adopt).pairs };
  const first = service.detect(args);
  const second = service.detect(args);
  assert.equal(first.pending, second.pending);
  await first.pending;
  assert.equal(calls, 1);
});

await test("39 AI failure is nonfatal and continues local new-candidate discovery", async () => {
  const pair = makePair(belief, good);
  const service = createDetectionService(async () => { throw new Error("network"); });
  const result = service.detect({ currentWord: belief, userAnswer: "牛肉", judgement: "wrong", answerEventId: "s:6", words: vocabulary, personalPairs: pair.pairs });
  assert.equal((await result.pending)?.word.word, "beef");
});

await test("40 a new candidate remains unpaired and uncounted", () => {
  const service = createDetectionService(async () => ({ match: false }));
  const result = service.detect({ currentWord: belief, userAnswer: "牛肉", judgement: "wrong", answerEventId: "s:7", words: vocabulary, personalPairs: {} });
  assert.equal(result.immediate.word.word, "beef");
  assert.equal(result.immediate.pair, undefined);
});

await test("40A a new candidate uses the distinct suspected-confusion copy", () => {
  const source = read("js/study.js");
  assert.match(source, /confusionIcon\.textContent = "💡"/);
  assert.match(source, /`你的答案更像 \$\{candidate\.word\.word\}`/);
  assert.match(source, /`你可能把 \$\{question\.word\.word\} 和 \$\{candidate\.word\.word\} 混淆了。确认后可加入个人易混词。`/);
});

await test("41 app guards async results with session, sequence and word identity", () => {
  const source = read("js/study.js");
  const start = source.indexOf("    applyConfusionDetectionResult(question");
  const block = source.slice(start, source.indexOf("    getInteractionDuration(", start));
  assert.match(block, /studySessionId/);
  assert.match(block, /answerSequence/);
  assert.match(block, /currentWordId/);
});

await test("42 app retains event plus pair dedup before incrementing confusionCount", () => {
  const source = read("js/app.js");
  assert.match(source, /recordedConfusionEvents/);
  assert.match(source, /storage\.recordConfusableConfusion/);
  assert.match(source, /answerEventId.*pairKey/s);
});

await test("43 wrong result rendering is not awaited by semantic fallback", () => {
  const source = read("js/study.js");
  const start = source.indexOf("    applySubjectiveJudgement(judgement");
  const block = source.slice(start, source.indexOf("    getInteractionDuration(", start));
  assert.doesNotMatch(block, /await this\.onDetectConfusion/);
  assert.match(block, /this\.renderAnswerArea\(question\)/);
});

await test("44 Storage stays v15 and receives no fallback cache schema", () => {
  assert.match(read("js/storage.js"), /const DATA_VERSION = 15/);
  assert.doesNotMatch(read("js/storage.js"), /semanticFallback|confusableDetectionCache/);
});

await test("45 Worker validates a minimal existing-pair batch", () => {
  const result = worker.validateConfusableMatchExistingPayload({
    currentWord: "adapt",
    userAnswer: "选择并开始使用某种方法",
    candidates: [{ word: "adopt", coreMeaning: "采取；收养", shortMeaning: "采取；收养", meanings: ["采用"] }],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.candidates.length, 1);
}, { worker: true });

await test("46 Worker rejects unrelated or oversized existing-pair payload fields", () => {
  assert.ok(worker.validateConfusableMatchExistingPayload({ currentWord: "adapt", userAnswer: "x", candidates: [], history: [] }).error);
  assert.ok(worker.validateConfusableMatchExistingPayload({ currentWord: "adapt", userAnswer: "x", candidates: Array(9).fill({ word: "a", coreMeaning: "b", shortMeaning: "b", meanings: [] }) }).error);
}, { worker: true });

await test("47 Worker accepts only high-confidence unique matches", () => {
  assert.deepEqual(worker.normalizeConfusableMatchExistingModelResult('{"match":true,"word":"adopt","confidence":"high"}'), { match: true, word: "adopt", confidence: "high" });
  assert.equal(worker.normalizeConfusableMatchExistingModelResult('{"match":true,"word":"adopt","confidence":"medium"}'), null);
}, { worker: true });

await test("48 Worker preserves explicit ambiguous no-match", () => {
  assert.deepEqual(worker.normalizeConfusableMatchExistingModelResult('{"match":false,"reason":"ambiguous"}'), { match: false, reason: "ambiguous" });
}, { worker: true });

await test("49 Worker prompt limits matching to modern common meanings and supplied candidates", () => {
  const body = worker.buildConfusableMatchExistingDeepSeekBody({ currentWord: "adapt", userAnswer: "x", candidates: [] });
  const prompt = body.messages.map((item) => item.content).join("\n");
  assert.match(prompt, /现代|常见/);
  assert.match(prompt, /候选/);
  assert.match(prompt, /歧义|多个/);
}, { worker: true });

function workerRequest(payload) {
  return new Request("https://worker.example/api/confusable-match-existing", {
    method: "POST",
    headers: { Origin: "https://app.example", "Content-Type": "application/json", "X-App-Token": "token" },
    body: JSON.stringify(payload),
  });
}

const workerEnv = { ALLOWED_ORIGINS: "https://app.example", APP_PROXY_TOKEN: "token", DEEPSEEK_API_KEY: "key" };

await test("50 Worker serves the dedicated endpoint with one upstream request", async () => {
  let calls = 0;
  const response = await worker.handleRequest(workerRequest({
    currentWord: "adapt", userAnswer: "选择并开始使用某种方法",
    candidates: [{ word: "adopt", coreMeaning: "采取", shortMeaning: "采取", meanings: [] }],
  }), workerEnv, async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"match":true,"word":"adopt","confidence":"high"}' } }], usage: {} }), { status: 200 });
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).word, "adopt");
  assert.equal(calls, 1);
}, { worker: true });

await test("51 Worker downgrades a candidate-outside response to no match", async () => {
  const response = await worker.handleRequest(workerRequest({
    currentWord: "adapt", userAnswer: "x",
    candidates: [{ word: "adopt", coreMeaning: "采取", shortMeaning: "采取", meanings: [] }],
  }), workerEnv, async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"match":true,"word":"banana","confidence":"high"}' } }], usage: {} }), { status: 200 }));
  assert.deepEqual(await response.json(), { match: false, reason: "invalid_candidate", usage: { promptTokens: 0, completionTokens: 0 } });
}, { worker: true });

await test("52 Worker route reports invalid AI output clearly without changing judge schema", () => {
  assert.match(read("worker/src/index.js"), /confusable-match-existing/);
  assert.match(read("worker/src/index.js"), /VALID_RESULTS = new Set\(\["correct", "partial", "wrong"\]\)/);
}, { worker: true });

await test("53 detected-result actions remain at least 48px on touch screens", () => {
  assert.match(read("css/style.css"), /\.confusion-detected__actions > button\s*\{[^}]*min-height:\s*48px/s);
});

await test("54 protected vocabulary frequency and learning algorithms are unchanged", () => {
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--",
    "data/cet4.json", "data/cet6.json", "data/cet4-exam-frequency.json", "data/cet6-exam-frequency.json",
    "data/cet-frequency-report.json", "data/cet-learning-priority-overrides.json",
    "js/smart-learning-order.js", "js/review-scheduler.js", "js/review-recovery.js",
    "js/review-workload.js", "js/new-word-learning.js", "js/daily-group-service.js",
    "service-worker.js", "manifest.webmanifest",
  ], { cwd: ROOT, stdio: "pipe" });
});

await test("55 Phase16.5 verified mastery remains untouched", () => {
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", "js/exam-value.js"], { cwd: ROOT, stdio: "pipe" });
  assert.match(read("js/storage.js"), /markNewWordVerifiedMastered/);
});

console.log(`\nPhase16.5.1 tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
