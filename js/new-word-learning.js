(function registerNewWordLearning(app) {
  const { reviewScheduler } = app;

  const REINFORCEMENT_GAP = 7;
  const REINFORCEMENT_RETRY_GAP = 5;
  const MIN_REINFORCEMENT_QUESTION_GAP = 3;
  const MIN_REINFORCEMENT_DELAY_MS = 60 * 1000;
  const MAX_REINFORCEMENT_QUESTION_GAP = 10;
  const MAX_REINFORCEMENT_DELAY_MS = 8 * 60 * 1000;
  const MAX_PENDING_REINFORCEMENT = 10;
  const FALLBACK_MIN_QUESTION_GAP = 2;
  const DEBUG_REINFORCEMENT = false;

  const SMART_REINFORCEMENT_RULES = Object.freeze({
    choiceWrongFirst: Object.freeze({ questionGap: 5, minDelayMs: 90 * 1000, reason: "choice-first-wrong" }),
    choiceWrongRepeated: Object.freeze({ questionGap: 4, minDelayMs: 75 * 1000, reason: "choice-repeated-wrong" }),
    choiceCorrectEnToZh: Object.freeze({ questionGap: 6, minDelayMs: 3 * 60 * 1000, reason: "choice-passed-en-to-zh" }),
    choiceCorrectZhToEn: Object.freeze({ questionGap: 8, minDelayMs: 4 * 60 * 1000, reason: "choice-passed-zh-to-en" }),
    choiceCorrectAfterRetry: Object.freeze({ questionGap: 4, minDelayMs: 90 * 1000, reason: "choice-retry-passed" }),
    aiPartial: Object.freeze({ questionGap: 4, minDelayMs: 2 * 60 * 1000, reason: "ai-partial" }),
    aiWrong: Object.freeze({ questionGap: 3, minDelayMs: 90 * 1000, reason: "ai-wrong" }),
  });

  const LEARNING_PHASES = Object.freeze({
    INTRO: "intro",
    CHOICE_RETRY: "choice-retry",
    AI_REINFORCEMENT: "ai-reinforcement",
    // Compatibility alias used by older call sites and backups.
    REINFORCEMENT: "ai-reinforcement",
    STANDARD_REVIEW: "standard-review",
  });

  const LEARNING_STAGES = Object.freeze({
    UNSEEN: "unseen",
    INTRODUCED: "introduced",
    PENDING: "pending-reinforcement",
    COMPLETED: "completed",
  });

  function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function normalizeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  function normalizeStudyMode(value) {
    return value === "zh-to-en" ? "zh-to-en" : "en-to-zh";
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || minimum));
  }

  function getReinforcementMode(introMode) {
    return normalizeStudyMode(introMode) === "en-to-zh" ? "zh-to-en" : "en-to-zh";
  }

  function getPendingStudyMode(record) {
    const normalized = normalizeLearningRecord(record);
    return normalized.phase === LEARNING_PHASES.CHOICE_RETRY
      ? normalized.introStudyMode
      : getReinforcementMode(normalized.introStudyMode);
  }

  function selectScheduleRule({ phase, correct, judgement, studyMode, choiceWrongCount = 0, choiceAttempts = 0 }) {
    if (phase === LEARNING_PHASES.INTRO || phase === LEARNING_PHASES.CHOICE_RETRY) {
      if (!correct) {
        return toNonNegativeInteger(choiceWrongCount) > 0
          ? SMART_REINFORCEMENT_RULES.choiceWrongRepeated
          : SMART_REINFORCEMENT_RULES.choiceWrongFirst;
      }
      if (phase === LEARNING_PHASES.CHOICE_RETRY || toNonNegativeInteger(choiceAttempts) > 1) {
        return SMART_REINFORCEMENT_RULES.choiceCorrectAfterRetry;
      }
      return normalizeStudyMode(studyMode) === "zh-to-en"
        ? SMART_REINFORCEMENT_RULES.choiceCorrectZhToEn
        : SMART_REINFORCEMENT_RULES.choiceCorrectEnToZh;
    }
    return judgement === "partial" ? SMART_REINFORCEMENT_RULES.aiPartial : SMART_REINFORCEMENT_RULES.aiWrong;
  }

  function calculateReinforcementSchedule({
    phase,
    correct,
    judgement,
    studyMode,
    choiceWrongCount = 0,
    choiceAttempts = 0,
    currentSequence = 0,
    now = Date.now(),
  }) {
    const rule = selectScheduleRule({ phase, correct, judgement, studyMode, choiceWrongCount, choiceAttempts });
    const questionGap = Math.round(clamp(rule.questionGap, MIN_REINFORCEMENT_QUESTION_GAP, MAX_REINFORCEMENT_QUESTION_GAP));
    const minDelayMs = Math.round(clamp(rule.minDelayMs, MIN_REINFORCEMENT_DELAY_MS, MAX_REINFORCEMENT_DELAY_MS));
    const scheduledAtSequence = toNonNegativeInteger(currentSequence);
    const scheduledAtTime = normalizeTimestamp(now) || Date.now();
    return {
      questionGap,
      minDelayMs,
      scheduledAtSequence,
      scheduledAtTime,
      eligibleAfterSequence: scheduledAtSequence + questionGap,
      eligibleAfterTime: scheduledAtTime + minDelayMs,
      reason: rule.reason,
    };
  }

  function normalizeLearningRecord(raw, options = {}) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const sourceVersion = toNonNegativeInteger(options.sourceVersion) || 9;
    const migrationNow = normalizeTimestamp(options.migrationNow) || Date.now();
    const stage = value.stage === LEARNING_STAGES.COMPLETED ? LEARNING_STAGES.COMPLETED : LEARNING_STAGES.PENDING;
    const isLegacyPending = sourceVersion < 9 && stage === LEARNING_STAGES.PENDING;
    const explicitGate = typeof value.choiceGatePassed === "boolean" ? value.choiceGatePassed : null;
    const choiceGatePassed = stage === LEARNING_STAGES.COMPLETED || explicitGate === true || isLegacyPending;
    let phase = value.phase;
    if (stage === LEARNING_STAGES.COMPLETED) phase = LEARNING_PHASES.AI_REINFORCEMENT;
    else if (isLegacyPending) phase = LEARNING_PHASES.AI_REINFORCEMENT;
    else if (phase !== LEARNING_PHASES.CHOICE_RETRY && phase !== LEARNING_PHASES.AI_REINFORCEMENT) {
      phase = choiceGatePassed ? LEARNING_PHASES.AI_REINFORCEMENT : LEARNING_PHASES.CHOICE_RETRY;
    }
    if (phase === LEARNING_PHASES.CHOICE_RETRY && choiceGatePassed) phase = LEARNING_PHASES.AI_REINFORCEMENT;

    const introducedDate = normalizeDateKey(value.introducedDate)
      || normalizeDateKey(value.introDate)
      || normalizeDateKey(value.eligibilityDate);
    const completedDate = normalizeDateKey(value.completedDate);
    const legacySequence = toNonNegativeInteger(value.eligibleAfterSequence ?? value.reinforcementEligibleAfter);
    const questionGap = stage === LEARNING_STAGES.PENDING
      ? Math.round(clamp(value.questionGap ?? REINFORCEMENT_GAP, MIN_REINFORCEMENT_QUESTION_GAP, MAX_REINFORCEMENT_QUESTION_GAP))
      : 0;
    const minDelayMs = stage === LEARNING_STAGES.PENDING
      ? Math.round(clamp(value.minDelayMs ?? MIN_REINFORCEMENT_DELAY_MS, MIN_REINFORCEMENT_DELAY_MS, MAX_REINFORCEMENT_DELAY_MS))
      : 0;
    const introducedAt = normalizeTimestamp(value.introducedAt);
    const eligibleAfterTime = stage === LEARNING_STAGES.PENDING
      ? (isLegacyPending ? migrationNow : normalizeTimestamp(value.eligibleAfterTime) || migrationNow)
      : normalizeTimestamp(value.eligibleAfterTime);
    const scheduledAtSequence = stage === LEARNING_STAGES.PENDING
      ? toNonNegativeInteger(value.scheduledAtSequence ?? Math.max(0, legacySequence - questionGap))
      : toNonNegativeInteger(value.scheduledAtSequence);
    const scheduledAtTime = stage === LEARNING_STAGES.PENDING
      ? (normalizeTimestamp(value.scheduledAtTime)
        || (eligibleAfterTime ? Math.max(1, eligibleAfterTime - minDelayMs) : introducedAt)
        || migrationNow)
      : normalizeTimestamp(value.scheduledAtTime);
    const choiceAttempts = Math.max(
      phase === LEARNING_PHASES.CHOICE_RETRY || choiceGatePassed ? 1 : 0,
      toNonNegativeInteger(value.choiceAttempts),
    );
    const choiceWrongCount = Math.max(
      phase === LEARNING_PHASES.CHOICE_RETRY ? 1 : 0,
      toNonNegativeInteger(value.choiceWrongCount),
    );

    return {
      stage,
      phase,
      choiceGatePassed,
      choiceAttempts,
      choiceWrongCount,
      aiAttempts: toNonNegativeInteger(value.aiAttempts ?? value.reinforcementAttempts),
      introStudyMode: normalizeStudyMode(value.introStudyMode),
      introCorrect: typeof value.introCorrect === "boolean" ? value.introCorrect : null,
      introducedAt,
      introducedDate,
      introDate: introducedDate,
      eligibilityDate: introducedDate,
      questionGap,
      minDelayMs,
      scheduledAtSequence,
      scheduledAtTime,
      eligibleAfterSequence: legacySequence,
      eligibleAfterTime,
      reinforcementEligibleAfter: legacySequence,
      scheduleReason: isLegacyPending
        ? "legacy-v8-choice-gate-assumed-passed"
        : (typeof value.scheduleReason === "string" && value.scheduleReason.trim()
          ? value.scheduleReason
          : stage === LEARNING_STAGES.PENDING ? "pending" : null),
      reinforcementAttempts: toNonNegativeInteger(value.aiAttempts ?? value.reinforcementAttempts),
      lastChoiceAt: normalizeTimestamp(value.lastChoiceAt),
      lastReinforcementAt: normalizeTimestamp(value.lastReinforcementAt),
      lastJudgement: ["correct", "partial", "wrong"].includes(value.lastJudgement) ? value.lastJudgement : null,
      completedAt: stage === LEARNING_STAGES.COMPLETED ? normalizeTimestamp(value.completedAt) : null,
      completedDate: stage === LEARNING_STAGES.COMPLETED ? completedDate : null,
    };
  }

  function applySchedule(record, schedule) {
    record.questionGap = schedule.questionGap;
    record.minDelayMs = schedule.minDelayMs;
    record.scheduledAtSequence = schedule.scheduledAtSequence;
    record.scheduledAtTime = schedule.scheduledAtTime;
    record.eligibleAfterSequence = schedule.eligibleAfterSequence;
    record.eligibleAfterTime = schedule.eligibleAfterTime;
    record.reinforcementEligibleAfter = schedule.eligibleAfterSequence;
    record.scheduleReason = schedule.reason;
    return record;
  }

  function createPendingRecord({ introStudyMode, introCorrect, now, dateKey, sequence }) {
    const correct = Boolean(introCorrect);
    const schedule = calculateReinforcementSchedule({
      phase: LEARNING_PHASES.INTRO,
      correct,
      studyMode: introStudyMode,
      choiceAttempts: 1,
      choiceWrongCount: 0,
      currentSequence: sequence,
      now,
    });
    const record = normalizeLearningRecord({
      stage: LEARNING_STAGES.PENDING,
      phase: correct ? LEARNING_PHASES.AI_REINFORCEMENT : LEARNING_PHASES.CHOICE_RETRY,
      choiceGatePassed: correct,
      choiceAttempts: 1,
      choiceWrongCount: correct ? 0 : 1,
      aiAttempts: 0,
      introStudyMode,
      introCorrect: correct,
      introducedAt: now,
      introducedDate: dateKey,
      lastChoiceAt: now,
      ...schedule,
      scheduleReason: schedule.reason,
    });
    return applySchedule(record, schedule);
  }

  function markChoiceResult(record, correct, { now, sequence }) {
    const result = normalizeLearningRecord(record);
    result.stage = LEARNING_STAGES.PENDING;
    result.choiceAttempts += 1;
    result.lastChoiceAt = now;
    result.lastJudgement = correct ? "correct" : "wrong";
    if (correct) {
      result.choiceGatePassed = true;
      result.phase = LEARNING_PHASES.AI_REINFORCEMENT;
    } else {
      result.choiceGatePassed = false;
      result.choiceWrongCount += 1;
      result.phase = LEARNING_PHASES.CHOICE_RETRY;
    }
    result.completedAt = null;
    result.completedDate = null;
    const schedule = calculateReinforcementSchedule({
      phase: LEARNING_PHASES.CHOICE_RETRY,
      correct,
      studyMode: result.introStudyMode,
      choiceAttempts: result.choiceAttempts,
      choiceWrongCount: correct ? result.choiceWrongCount : Math.max(1, result.choiceWrongCount - 1),
      currentSequence: sequence,
      now,
    });
    applySchedule(result, schedule);
    return normalizeLearningRecord(result);
  }

  function markAiResult(record, judgement, { now, dateKey, sequence }) {
    const result = normalizeLearningRecord(record);
    const normalizedJudgement = judgement === true || judgement === "correct"
      ? "correct"
      : judgement === "partial" ? "partial" : "wrong";
    if (!result.choiceGatePassed) return result;
    result.phase = LEARNING_PHASES.AI_REINFORCEMENT;
    result.lastReinforcementAt = now;
    result.lastJudgement = normalizedJudgement;
    result.aiAttempts += 1;
    result.reinforcementAttempts = result.aiAttempts;
    if (normalizedJudgement === "correct") {
      result.stage = LEARNING_STAGES.COMPLETED;
      result.completedAt = now;
      result.completedDate = dateKey;
      return normalizeLearningRecord(result);
    }
    result.stage = LEARNING_STAGES.PENDING;
    result.completedAt = null;
    result.completedDate = null;
    const schedule = calculateReinforcementSchedule({
      phase: LEARNING_PHASES.AI_REINFORCEMENT,
      correct: false,
      judgement: normalizedJudgement,
      studyMode: result.introStudyMode,
      currentSequence: sequence,
      now,
    });
    applySchedule(result, schedule);
    return normalizeLearningRecord(result);
  }

  function markReinforcementResult(record, judgement, context) {
    const normalized = normalizeLearningRecord(record);
    return normalized.phase === LEARNING_PHASES.CHOICE_RETRY
      ? markChoiceResult(normalized, judgement === true || judgement === "correct", context)
      : markAiResult(normalized, judgement, context);
  }

  function createProgressCopy(progress, now) {
    return {
      ...progress,
      learned: true,
      correctCount: toNonNegativeInteger(progress?.correctCount),
      wrongCount: toNonNegativeInteger(progress?.wrongCount),
      consecutiveCorrect: toNonNegativeInteger(progress?.consecutiveCorrect),
      masteryLevel: 0,
      reviewCount: toNonNegativeInteger(progress?.reviewCount),
      lastStudyTime: now,
      nextReviewTime: null,
    };
  }

  function handleChoiceAttempt(progress, correct, { now }) {
    const result = createProgressCopy(progress, now);
    if (correct) {
      result.correctCount += 1;
      result.consecutiveCorrect += 1;
    } else {
      result.wrongCount += 1;
      result.consecutiveCorrect = 0;
      result.inWrongBook = true;
      result.lastWrongTime = now;
    }
    return result;
  }

  function handleIntro(progress, correct, context) {
    return handleChoiceAttempt(progress, correct, context);
  }

  function handleReinforcement(progress, correct, { now }) {
    const result = createProgressCopy(progress, now);
    if (correct) {
      result.correctCount += 1;
      result.consecutiveCorrect += 1;
      result.masteryLevel = 1;
      result.nextReviewTime = reviewScheduler.getNextReviewTime(1, now);
    } else {
      result.wrongCount += 1;
      result.consecutiveCorrect = 0;
      result.inWrongBook = true;
      result.lastWrongTime = now;
    }
    return result;
  }

  function handleReinforcementPartial(progress, { now }) {
    const result = createProgressCopy(progress, now);
    result.consecutiveCorrect = 0;
    return result;
  }

  function handlePendingPractice(progress, correct, context) {
    return handleChoiceAttempt(progress, correct, context);
  }

  function isPending(record) {
    return normalizeLearningRecord(record).stage === LEARNING_STAGES.PENDING;
  }

  function isChoiceRetry(record) {
    const normalized = normalizeLearningRecord(record);
    return normalized.stage === LEARNING_STAGES.PENDING && normalized.phase === LEARNING_PHASES.CHOICE_RETRY;
  }

  function isAiReinforcement(record) {
    const normalized = normalizeLearningRecord(record);
    return normalized.stage === LEARNING_STAGES.PENDING
      && normalized.phase === LEARNING_PHASES.AI_REINFORCEMENT
      && normalized.choiceGatePassed;
  }

  function isCrossDayPending(record, currentDateKey) {
    const normalized = normalizeLearningRecord(record);
    return normalized.stage === LEARNING_STAGES.PENDING
      && Boolean(normalized.introducedDate)
      && normalized.introducedDate < currentDateKey;
  }

  function isEligible(record, currentSequence, currentDateKey, now = Date.now()) {
    const normalized = normalizeLearningRecord(record);
    if (normalized.stage !== LEARNING_STAGES.PENDING) return false;
    if (isCrossDayPending(normalized, currentDateKey)) return true;
    return normalized.eligibleAfterSequence <= toNonNegativeInteger(currentSequence)
      && Boolean(normalized.eligibleAfterTime)
      && normalized.eligibleAfterTime <= now;
  }

  function isFallbackEligible(record, currentSequence, currentDateKey, now = Date.now()) {
    const normalized = normalizeLearningRecord(record);
    if (normalized.stage !== LEARNING_STAGES.PENDING) return false;
    if (isCrossDayPending(normalized, currentDateKey)) return true;
    const answeredSinceSchedule = toNonNegativeInteger(currentSequence) - normalized.scheduledAtSequence;
    const waitedMs = now - (normalized.scheduledAtTime || normalized.introducedAt || now);
    return answeredSinceSchedule >= FALLBACK_MIN_QUESTION_GAP || waitedMs >= MIN_REINFORCEMENT_DELAY_MS;
  }

  function getRiskScore(record) {
    const normalized = normalizeLearningRecord(record);
    let score = normalized.phase === LEARNING_PHASES.CHOICE_RETRY ? 50 : 0;
    score += normalized.choiceWrongCount * 12;
    score += normalized.aiAttempts * 8;
    if (normalized.introStudyMode === "en-to-zh") score += 5;
    return score;
  }

  function comparePendingItems(left, right) {
    const leftState = normalizeLearningRecord(left.learningState || left);
    const rightState = normalizeLearningRecord(right.learningState || right);
    const riskDifference = getRiskScore(rightState) - getRiskScore(leftState);
    return riskDifference || (leftState.introducedAt || 0) - (rightState.introducedAt || 0);
  }

  function getPendingPriority(item, context) {
    if (isCrossDayPending(item.learningState, context.dateKey)) return 1;
    if (isEligible(item.learningState, context.currentSequence, context.dateKey, context.now)) {
      return isChoiceRetry(item.learningState) ? 2 : 3;
    }
    if (isFallbackEligible(item.learningState, context.currentSequence, context.dateKey, context.now)) return 5;
    return Number.POSITIVE_INFINITY;
  }

  function buildNormalQueue({ dueItems = [], pendingItems = [], introItems = [], currentSequence = 0, dateKey, now = Date.now() }) {
    const context = { currentSequence, dateKey, now };
    const sortedPending = [...pendingItems].sort((left, right) => {
      const priorityDifference = getPendingPriority(left, context) - getPendingPriority(right, context);
      return priorityDifference || comparePendingItems(left, right);
    });
    const available = sortedPending.filter((item) => Number.isFinite(getPendingPriority(item, context)) && getPendingPriority(item, context) < 5);
    const fallback = sortedPending.filter((item) => getPendingPriority(item, context) === 5);
    const waiting = sortedPending.filter((item) => !Number.isFinite(getPendingPriority(item, context)));
    return [...dueItems, ...available, ...introItems, ...fallback, ...waiting];
  }

  function getInsertionIndex(currentIndex, questionCount, gap) {
    const safeCurrentIndex = Math.max(0, toNonNegativeInteger(currentIndex));
    const target = safeCurrentIndex + 1 + Math.max(0, toNonNegativeInteger(gap));
    return Math.min(Math.max(safeCurrentIndex + 1, target), Math.max(0, toNonNegativeInteger(questionCount)));
  }

  function getItemPriority(item, context) {
    if (item.taskType === "review") return 0;
    if (item.learningState && isPending(item.learningState)) return getPendingPriority(item, context);
    if (item.learningPhase === LEARNING_PHASES.INTRO) {
      return context.pendingCount >= MAX_PENDING_REINFORCEMENT ? Number.POSITIVE_INFINITY : 4;
    }
    return 4;
  }

  function getItemWordId(item) {
    return item.word?.word || item.wordId || item.id || "";
  }

  function selectNextItemIndex({ items, currentSequence = 0, dateKey, now = Date.now(), pendingCount = 0, recentWordIds = [] }) {
    const context = { currentSequence, dateKey, now, pendingCount };
    const candidates = items
      .map((item, index) => ({ item, index, priority: getItemPriority(item, context) }))
      .filter((candidate) => Number.isFinite(candidate.priority));
    if (!candidates.length) return -1;
    const bestPriority = Math.min(...candidates.map((candidate) => candidate.priority));
    const best = candidates.filter((candidate) => candidate.priority === bestPriority);
    if ([1, 2, 3, 5].includes(bestPriority)) best.sort((left, right) => comparePendingItems(left.item, right.item));
    const recent = new Set(recentWordIds.slice(-3));
    return (best.find((candidate) => !recent.has(getItemWordId(candidate.item))) || best[0]).index;
  }

  function debugSchedule(wordId, record) {
    if (!DEBUG_REINFORCEMENT) return;
    const state = normalizeLearningRecord(record);
    console.info("[reinforcement]", {
      word: wordId,
      phase: state.phase,
      reason: state.scheduleReason,
      questionGap: state.questionGap,
      minDelay: `${Math.round(state.minDelayMs / 1000)}s`,
    });
  }

  app.newWordLearning = {
    REINFORCEMENT_GAP,
    REINFORCEMENT_RETRY_GAP,
    MIN_REINFORCEMENT_QUESTION_GAP,
    MIN_REINFORCEMENT_DELAY_MS,
    MAX_REINFORCEMENT_QUESTION_GAP,
    MAX_REINFORCEMENT_DELAY_MS,
    MAX_PENDING_REINFORCEMENT,
    FALLBACK_MIN_QUESTION_GAP,
    DEBUG_REINFORCEMENT,
    SMART_REINFORCEMENT_RULES,
    LEARNING_PHASES,
    LEARNING_STAGES,
    normalizeLearningRecord,
    getReinforcementMode,
    getPendingStudyMode,
    calculateReinforcementSchedule,
    createPendingRecord,
    markChoiceResult,
    markAiResult,
    markReinforcementResult,
    handleChoiceAttempt,
    handleIntro,
    handleReinforcement,
    handleReinforcementPartial,
    handlePendingPractice,
    isPending,
    isChoiceRetry,
    isAiReinforcement,
    isCrossDayPending,
    isEligible,
    isFallbackEligible,
    getRiskScore,
    comparePendingItems,
    buildNormalQueue,
    getInsertionIndex,
    selectNextItemIndex,
    debugSchedule,
  };
})(window.CETWords);
