(function registerDailyReviewService(app) {
  const MAX_WEAK_WORDS = 10;
  const MAX_CORRECTED_WORDS = 5;
  const REQUEST_TIMEOUT_MS = 20 * 1000;
  const VALID_REVIEW_KEYS = new Set(["summary", "strengths", "weaknesses", "focusWords", "tomorrowAdvice"]);

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function calculateAccuracy(correct, total) {
    return total ? Math.round((toCount(correct) / toCount(total)) * 100) : 0;
  }

  function calculateDailyRiskScore(metrics, progress = {}) {
    const choiceWrongScore = Math.min(40, toCount(metrics.choiceWrongCount) * 20);
    const choiceRetryScore = Math.min(20, toCount(metrics.choiceRetryCount) * 10);
    const reinforcementWrongScore = Math.min(20, toCount(metrics.reinforcementWrongCount) * 20);
    const reinforcementPartialScore = Math.min(10, toCount(metrics.reinforcementPartialCount) * 10);
    const repeatedErrorScore = (
      toCount(metrics.choiceWrongCount)
      + toCount(metrics.reinforcementWrongCount)
      + toCount(metrics.reinforcementPartialCount)
    ) >= 2 ? 10 : 0;
    const correctCount = toCount(progress.correctCount);
    const wrongCount = toCount(progress.wrongCount);
    const historicalAnswers = correctCount + wrongCount;
    const historicalErrorScore = historicalAnswers ? Math.min(10, (wrongCount / historicalAnswers) * 10) : 0;
    const correctedDiscount = metrics.eventuallyPassed ? 10 : 0;
    const formalReviewScore = toCount(metrics.formalReviewWrongCount) * 25
      + toCount(metrics.formalReviewPartialCount) * 12;
    const recoveryScore = Math.min(24, toCount(metrics.recoveryErrorCount) * 8);
    const recoveryPendingScore = metrics.recoveryPending ? 15 : 0;
    const recoveryCorrectedDiscount = metrics.recoveryFinalResult === "correct" ? 5 : 0;
    return Math.round(clamp(
      choiceWrongScore
      + choiceRetryScore
      + reinforcementWrongScore
      + reinforcementPartialScore
      + repeatedErrorScore
      + historicalErrorScore
      + formalReviewScore
      + recoveryScore
      + recoveryPendingScore
      - correctedDiscount
      - recoveryCorrectedDiscount,
      0,
      100,
    ));
  }

  function normalizeMeaningList(word) {
    const result = [];
    const seen = new Set();
    const add = (value) => {
      const text = String(value || "").trim();
      if (!text || seen.has(text) || result.length >= 4) return;
      seen.add(text);
      result.push(text.slice(0, 120));
    };
    (Array.isArray(word?.meanings) ? word.meanings : []).forEach((entry) => add(entry?.meaning));
    if (!result.length) add(word?.meaning);
    return result;
  }

  function createWordSummary(wordId, metrics, word, progress) {
    const choiceWrongCount = toCount(metrics.choiceWrongCount);
    const choiceRetryCount = toCount(metrics.choiceRetryCount);
    const reinforcementWrongCount = toCount(metrics.reinforcementWrongCount);
    const reinforcementPartialCount = toCount(metrics.reinforcementPartialCount);
    const formalReviewPartialCount = toCount(metrics.formalReviewPartialCount);
    const formalReviewWrongCount = toCount(metrics.formalReviewWrongCount);
    const recoveryAttempts = toCount(metrics.recoveryAttempts);
    const recoveryErrorCount = toCount(metrics.recoveryPartialCount) + toCount(metrics.recoveryWrongCount);
    const errorEvents = choiceWrongCount
      + reinforcementWrongCount
      + reinforcementPartialCount
      + formalReviewPartialCount
      + formalReviewWrongCount
      + recoveryErrorCount;
    return {
      word: wordId,
      coreMeaning: String(word?.coreMeaning || word?.shortMeaning || word?.meaning || "").slice(0, 180),
      commonMeanings: normalizeMeaningList(word),
      choiceWrongCount,
      choiceRetryCount,
      reinforcementWrongCount,
      reinforcementPartialCount,
      formalReviewResult: ["correct", "partial", "wrong"].includes(metrics.formalReviewResult)
        ? metrics.formalReviewResult
        : null,
      recoveryAttempts,
      recoveryFinalResult: ["correct", "partial", "wrong"].includes(metrics.recoveryFinalResult)
        ? metrics.recoveryFinalResult
        : null,
      recoveryPending: Boolean(metrics.recoveryPending),
      eventuallyPassed: Boolean(metrics.eventuallyPassed),
      repeatedError: errorEvents >= 2,
      historicalErrorRate: calculateAccuracy(toCount(progress?.wrongCount), toCount(progress?.correctCount) + toCount(progress?.wrongCount)),
      dailyRiskScore: calculateDailyRiskScore({
        ...metrics,
        formalReviewPartialCount,
        formalReviewWrongCount,
        recoveryErrorCount,
      }, progress),
    };
  }

  function buildLocalReview({ bookId, dailyTarget, daily, words = [], getProgress = () => ({}) }) {
    const metrics = daily?.learningMetrics || {};
    const firstChoice = metrics.firstChoice || {};
    const reinforcement = metrics.reinforcement || {};
    const formalReview = metrics.formalReview || {};
    const recovery = metrics.recovery || {};
    const firstChoiceTotal = toCount(firstChoice.correct) + toCount(firstChoice.wrong);
    const reinforcementTotal = toCount(reinforcement.correct) + toCount(reinforcement.partial) + toCount(reinforcement.wrong);
    const wordMap = new Map(words.map((word) => [word.word, word]));
    const wordMetrics = metrics.words && typeof metrics.words === "object" ? metrics.words : {};
    const summaries = Object.entries(wordMetrics).map(([wordId, entry]) => (
      createWordSummary(wordId, entry, wordMap.get(wordId), getProgress(wordId))
    ));
    const weakWords = summaries
      .filter((entry) => entry.dailyRiskScore > 0)
      .sort((left, right) => right.dailyRiskScore - left.dailyRiskScore
        || Number(right.repeatedError) - Number(left.repeatedError)
        || left.word.localeCompare(right.word))
      .slice(0, MAX_WEAK_WORDS);
    const correctedWords = summaries
      .filter((entry) => (entry.eventuallyPassed || entry.recoveryFinalResult === "correct") && (
        entry.choiceWrongCount + entry.reinforcementWrongCount + entry.reinforcementPartialCount > 0
        || entry.formalReviewResult === "partial"
        || entry.formalReviewResult === "wrong"
      ))
      .sort((left, right) => right.dailyRiskScore - left.dailyRiskScore || left.word.localeCompare(right.word))
      .slice(0, MAX_CORRECTED_WORDS);
    const target = toCount(dailyTarget);
    const completedNewWords = toCount(daily?.completedNewWords);
    return {
      date: String(daily?.dateKey || ""),
      level: bookId,
      canGenerate: target > 0 && completedNewWords >= target,
      statistics: {
        dailyTarget: target,
        completedNewWords,
        totalAnswers: toCount(daily?.answerCount),
        firstChoiceCorrect: toCount(firstChoice.correct),
        firstChoiceWrong: toCount(firstChoice.wrong),
        firstChoiceAccuracy: calculateAccuracy(firstChoice.correct, firstChoiceTotal),
        choiceRetryCount: toCount(metrics.choiceRetryCount),
        reinforcementCorrect: toCount(reinforcement.correct),
        reinforcementPartial: toCount(reinforcement.partial),
        reinforcementWrong: toCount(reinforcement.wrong),
        reinforcementPassRate: calculateAccuracy(reinforcement.correct, reinforcementTotal),
        formalReviewStats: {
          correct: toCount(formalReview.correct),
          partial: toCount(formalReview.partial),
          wrong: toCount(formalReview.wrong),
        },
        recoveryStats: {
          entered: toCount(recovery.entered),
          attempts: toCount(recovery.attempts),
          correct: toCount(recovery.correct),
          partial: toCount(recovery.partial),
          wrong: toCount(recovery.wrong),
          pendingCount: toCount(recovery.pendingCount),
        },
        enToZh: {
          answers: toCount(metrics?.choiceModes?.["en-to-zh"]?.answerCount),
          correct: toCount(metrics?.choiceModes?.["en-to-zh"]?.correctCount),
          partial: 0,
          wrong: toCount(metrics?.choiceModes?.["en-to-zh"]?.wrongCount),
          accuracy: calculateAccuracy(
            metrics?.choiceModes?.["en-to-zh"]?.correctCount,
            metrics?.choiceModes?.["en-to-zh"]?.answerCount,
          ),
        },
        zhToEn: {
          answers: toCount(metrics?.choiceModes?.["zh-to-en"]?.answerCount),
          correct: toCount(metrics?.choiceModes?.["zh-to-en"]?.correctCount),
          partial: 0,
          wrong: toCount(metrics?.choiceModes?.["zh-to-en"]?.wrongCount),
          accuracy: calculateAccuracy(
            metrics?.choiceModes?.["zh-to-en"]?.correctCount,
            metrics?.choiceModes?.["zh-to-en"]?.answerCount,
          ),
        },
        repeatedErrorWords: summaries.filter((entry) => entry.repeatedError).length,
        correctedWords: correctedWords.length,
      },
      weakWords,
      correctedWords,
    };
  }

  function buildRequestPayload(localReview) {
    return {
      date: localReview.date,
      level: localReview.level,
      statistics: localReview.statistics,
      weakWords: localReview.weakWords.slice(0, MAX_WEAK_WORDS).map((entry) => ({ ...entry })),
      correctedWords: localReview.correctedWords.slice(0, MAX_CORRECTED_WORDS).map((entry) => ({ ...entry })),
    };
  }

  function normalizeStringArray(value, maximum, itemLength = 180) {
    if (!Array.isArray(value)) throw new Error("AI_INVALID_RESPONSE");
    return value.slice(0, maximum).map((item) => String(item || "").trim().slice(0, itemLength)).filter(Boolean);
  }

  function normalizeAiReview(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AI_INVALID_RESPONSE");
    if (Object.keys(raw).some((key) => !VALID_REVIEW_KEYS.has(key))) throw new Error("AI_INVALID_RESPONSE");
    const summary = String(raw.summary || "").trim().slice(0, 400);
    if (!summary) throw new Error("AI_INVALID_RESPONSE");
    const focusWords = Array.isArray(raw.focusWords) ? raw.focusWords.slice(0, MAX_WEAK_WORDS).map((entry) => ({
      word: String(entry?.word || "").trim().slice(0, 100),
      reason: String(entry?.reason || "").trim().slice(0, 220),
      suggestion: String(entry?.suggestion || "").trim().slice(0, 220),
    })).filter((entry) => entry.word && entry.reason && entry.suggestion) : [];
    return {
      summary,
      strengths: normalizeStringArray(raw.strengths, 5),
      weaknesses: normalizeStringArray(raw.weaknesses, 5),
      focusWords,
      tomorrowAdvice: normalizeStringArray(raw.tomorrowAdvice, 5),
    };
  }

  function normalizeProxyUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  async function requestDailyReview({ payload, proxyUrl, token, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = window.fetch.bind(window) }) {
    const baseUrl = normalizeProxyUrl(proxyUrl);
    if (!baseUrl || !String(token || "").trim()) throw new Error("AI_NOT_CONFIGURED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/daily-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Token": String(token).trim() },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      const { usage: rawUsage, ...reviewData } = data || {};
      return {
        review: normalizeAiReview(reviewData),
        usage: {
          promptTokens: toCount(rawUsage?.promptTokens),
          completionTokens: toCount(rawUsage?.completionTokens),
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  app.dailyReviewService = {
    MAX_WEAK_WORDS,
    MAX_CORRECTED_WORDS,
    REQUEST_TIMEOUT_MS,
    calculateAccuracy,
    calculateDailyRiskScore,
    buildLocalReview,
    buildRequestPayload,
    normalizeAiReview,
    requestDailyReview,
  };
})(window.CETWords);
