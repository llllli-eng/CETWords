/**
 * 拾词 · wrong 答案易混检测编排
 * 保持本地优先、existing pair 单次批量 AI，以及未配对候选的高精度本地发现。
 */

(function registerConfusableDetection(app) {
  const MAX_CACHED_ANSWER_EVENTS = 200;

  function createService(options = {}) {
    const matchExisting = typeof options.matchExisting === "function"
      ? options.matchExisting
      : async () => ({ match: false });
    const answerEventCache = new Map();

    function remember(answerEventId, entry) {
      if (!answerEventId) return;
      answerEventCache.set(answerEventId, entry);
      while (answerEventCache.size > MAX_CACHED_ANSWER_EVENTS) {
        answerEventCache.delete(answerEventCache.keys().next().value);
      }
    }

    function detect(input = {}) {
      const {
        currentWord,
        userAnswer,
        judgement,
        answerEventId,
        words,
        personalPairs,
        recentWordIds,
        historicalWordIds,
      } = input;
      if (judgement !== "wrong" || !currentWord || !String(userAnswer || "").trim()) {
        return { immediate: null, pending: null };
      }

      const cached = answerEventId ? answerEventCache.get(answerEventId) : null;
      if (cached?.state === "resolved") return { immediate: cached.candidate, pending: null };
      if (cached?.state === "pending") return { immediate: null, pending: cached.promise };

      const commonOptions = { personalPairs, recentWordIds, historicalWordIds };
      if (app.confusableWords.scoreModernCommonMeaning(currentWord, userAnswer)) {
        remember(answerEventId, { state: "resolved", candidate: null });
        return { immediate: null, pending: null };
      }

      const localPairMatch = app.confusableWords.detectPersonalPairMeaningConfusion(
        currentWord,
        userAnswer,
        words,
        personalPairs,
      );
      if (localPairMatch) {
        remember(answerEventId, { state: "resolved", candidate: localPairMatch });
        return { immediate: localPairMatch, pending: null };
      }

      const pairCandidates = app.confusableWords.getPersonalPairCandidates(
        currentWord,
        words,
        personalPairs,
      );
      if (!pairCandidates.length) {
        const candidate = app.confusableWords.detectNewConfusableCandidate(
          currentWord,
          userAnswer,
          words,
          commonOptions,
        );
        remember(answerEventId, { state: "resolved", candidate });
        return { immediate: candidate, pending: null };
      }

      const pending = Promise.resolve()
        .then(() => matchExisting(currentWord, userAnswer, pairCandidates))
        .then((result) => app.confusableWords.validateExistingPairAiMatch(result, pairCandidates))
        .catch(() => null)
        .then((pairMatch) => pairMatch || app.confusableWords.detectNewConfusableCandidate(
          currentWord,
          userAnswer,
          words,
          commonOptions,
        ))
        .then((candidate) => {
          remember(answerEventId, { state: "resolved", candidate });
          return candidate;
        });
      remember(answerEventId, { state: "pending", promise: pending });
      return { immediate: null, pending };
    }

    function clear() {
      answerEventCache.clear();
    }

    return { detect, clear, answerEventCache };
  }

  app.confusableDetection = {
    MAX_CACHED_ANSWER_EVENTS,
    createService,
  };
})(window.CETWords);
