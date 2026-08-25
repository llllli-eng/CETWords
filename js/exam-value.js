(function registerExamValue(app) {
  const DISPLAY_TIERS = Object.freeze(["S", "A", "B", "C", "D", "E"]);
  const CORPUS_SESSION_TOTAL = 10;
  const CORPUS_PAPER_TOTAL = 30;

  function optionalCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
  }

  function getSourceLabel(word) {
    if (word?.isCore) return word.book === "cet6" ? "CET6 核心词" : "CET4 核心词";
    if (word?.book === "cet6" && word?.sourceLevel === "cet4") return "CET4 先修补充词";
    return word?.book === "cet6" ? "CET6 补充词" : "CET4 补充词";
  }

  function buildExamValue(word, priority = {}) {
    const frequency = priority.frequency && typeof priority.frequency === "object"
      ? priority.frequency
      : null;
    const effectiveTier = priority.effectiveLearningTier === "neutral"
      ? "neutral"
      : DISPLAY_TIERS.includes(priority.effectiveLearningTier)
        ? priority.effectiveLearningTier
        : null;
    const rawTier = DISPLAY_TIERS.includes(priority.rawFrequencyTier)
      ? priority.rawFrequencyTier
      : DISPLAY_TIERS.includes(frequency?.frequencyTier) ? frequency.frequencyTier : null;
    const sessionCount = optionalCount(frequency?.sessionCount);
    const sessionTotal = frequency ? optionalCount(frequency.sessionCountPossible) || CORPUS_SESSION_TOTAL : null;
    const paperCount = optionalCount(frequency?.paperCount);
    const paperTotal = frequency ? optionalCount(frequency.paperCountPossible) || CORPUS_PAPER_TOTAL : null;
    const tokenCount = optionalCount(frequency?.tokenCount);
    const hasFrequencyDetail = Boolean(frequency) && [
      sessionCount,
      paperCount,
      tokenCount,
    ].some((value) => value !== null);

    return {
      available: hasFrequencyDetail,
      effectiveTier,
      rawTier,
      neutral: effectiveTier === "neutral",
      tierLabel: effectiveTier === "neutral"
        ? "真题功能词"
        : effectiveTier ? `真题 ${effectiveTier} 档` : "暂无完整真题统计",
      sourceLabel: getSourceLabel(word),
      sessionCount,
      sessionTotal,
      paperCount,
      paperTotal,
      tokenCount,
      coverageLabel: sessionCount !== null && sessionTotal
        ? `覆盖 ${sessionCount}/${sessionTotal} 场`
        : sessionCount !== null ? `覆盖 ${sessionCount} 场` : "",
      occurrenceLabel: tokenCount !== null ? `出现 ${tokenCount} 次` : "",
      incompleteLabel: hasFrequencyDetail ? "" : "暂无完整真题统计",
    };
  }

  app.examValue = {
    DISPLAY_TIERS,
    buildExamValue,
    getSourceLabel,
  };
})(window.CETWords);
