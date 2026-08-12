(function registerNewWordLearning(app) {
  const { reviewScheduler } = app;

  // Legacy defaults remain exported for version 5 compatibility only. New
  // schedules are always produced by SMART_REINFORCEMENT_RULES.
  const REINFORCEMENT_GAP = 7;
  const REINFORCEMENT_RETRY_GAP = 5;
  const MIN_REINFORCEMENT_QUESTION_GAP = 3;
  const MIN_REINFORCEMENT_DELAY_MS = 90 * 1000;
  const MAX_REINFORCEMENT_QUESTION_GAP = 10;
  const MAX_REINFORCEMENT_DELAY_MS = 8 * 60 * 1000;
  const MAX_PENDING_REINFORCEMENT = 10;
  const FALLBACK_MIN_QUESTION_GAP = 2;
  const DEBUG_REINFORCEMENT = false;

  const SMART_REINFORCEMENT_RULES = Object.freeze({
    introWrong: Object.freeze({ questionGap: 4, minDelayMs: 90 * 1000, reason: "intro-wrong" }),
    introCorrectEnToZh: Object.freeze({
      questionGap: 6,
      minDelayMs: 3 * 60 * 1000,
      reason: "intro-correct-en-to-zh",
    }),
    introCorrectZhToEn: Object.freeze({
      questionGap: 8,
      minDelayMs: 4 * 60 * 1000,
      reason: "intro-correct-zh-to-en",
    }),
    retryWrongFirst: Object.freeze({
      questionGap: 4,
      minDelayMs: 2 * 60 * 1000,
      reason: "retry-first-wrong",
    }),
    retryWrongRepeated: Object.freeze({
      questionGap: 3,
      minDelayMs: 90 * 1000,
      reason: "retry-repeated-wrong",
    }),
    aiPartial: Object.freeze({
      questionGap: 4,
      minDelayMs: 2 * 60 * 1000,
      reason: "ai-partial",
    }),
  });

  const LEARNING_PHASES = Object.freeze({
    INTRO: "intro",
    REINFORCEMENT: "reinforcement",
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

  function calculateReinforcementSchedule({
    phase,
    correct,
    judgement,
    studyMode,
    reinforcementAttempts = 0,
    currentSequence = 0,
    now = Date.now(),
  }) {
    let rule;
    if (phase === LEARNING_PHASES.INTRO) {
      if (!correct) rule = SMART_REINFORCEMENT_RULES.introWrong;
      else if (normalizeStudyMode(studyMode) === "zh-to-en") {
        rule = SMART_REINFORCEMENT_RULES.introCorrectZhToEn;
      } else {
        rule = SMART_REINFORCEMENT_RULES.introCorrectEnToZh;
      }
    } else if (judgement === "partial") {
      rule = SMART_REINFORCEMENT_RULES.aiPartial;
    } else if (toNonNegativeInteger(reinforcementAttempts) === 0) {
      rule = SMART_REINFORCEMENT_RULES.retryWrongFirst;
    } else {
      rule = SMART_REINFORCEMENT_RULES.retryWrongRepeated;
    }

    const questionGap = Math.round(clamp(
      rule.questionGap,
      MIN_REINFORCEMENT_QUESTION_GAP,
      MAX_REINFORCEMENT_QUESTION_GAP,
    ));
    const minDelayMs = Math.round(clamp(
      rule.minDelayMs,
      MIN_REINFORCEMENT_DELAY_MS,
      MAX_REINFORCEMENT_DELAY_MS,
    ));
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
    const sourceVersion = toNonNegativeInteger(options.sourceVersion) || 6;
    const migrationNow = normalizeTimestamp(options.migrationNow) || Date.now();
    const stage = value.stage === LEARNING_STAGES.COMPLETED
      ? LEARNING_STAGES.COMPLETED
      : LEARNING_STAGES.PENDING;
    const introducedDate = normalizeDateKey(value.introducedDate)
      || normalizeDateKey(value.introDate)
      || normalizeDateKey(value.eligibilityDate);
    const completedDate = normalizeDateKey(value.completedDate);
    const legacySequence = toNonNegativeInteger(
      value.eligibleAfterSequence ?? value.reinforcementEligibleAfter,
    );
    const isLegacyPending = sourceVersion < 6 && stage === LEARNING_STAGES.PENDING;
    const defaultGap = REINFORCEMENT_GAP;
    const questionGap = stage === LEARNING_STAGES.PENDING
      ? Math.round(clamp(
        value.questionGap ?? defaultGap,
        MIN_REINFORCEMENT_QUESTION_GAP,
        MAX_REINFORCEMENT_QUESTION_GAP,
      ))
      : 0;
    const minDelayMs = stage === LEARNING_STAGES.PENDING
      ? Math.round(clamp(
        value.minDelayMs ?? MIN_REINFORCEMENT_DELAY_MS,
        MIN_REINFORCEMENT_DELAY_MS,
        MAX_REINFORCEMENT_DELAY_MS,
      ))
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

    return {
      stage,
      introStudyMode: normalizeStudyMode(value.introStudyMode),
      introCorrect: typeof value.introCorrect === "boolean" ? value.introCorrect : null,
      introducedAt,
      introducedDate,
      // Retained aliases keep older UI/tests and version 5 backups readable.
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
        ? "legacy-v5"
        : (typeof value.scheduleReason === "string" && value.scheduleReason.trim()
          ? value.scheduleReason
          : stage === LEARNING_STAGES.PENDING ? "legacy-v5" : null),
      reinforcementAttempts: toNonNegativeInteger(value.reinforcementAttempts),
      lastReinforcementAt: normalizeTimestamp(value.lastReinforcementAt),
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
    const schedule = calculateReinforcementSchedule({
      phase: LEARNING_PHASES.INTRO,
      correct: introCorrect,
      studyMode: introStudyMode,
      reinforcementAttempts: 0,
      currentSequence: sequence,
      now,
    });
    const record = normalizeLearningRecord({
      stage: LEARNING_STAGES.PENDING,
      introStudyMode,
      introCorrect: Boolean(introCorrect),
      introducedAt: now,
      introducedDate: dateKey,
      reinforcementAttempts: 0,
      ...schedule,
      scheduleReason: schedule.reason,
    });
    return applySchedule(record, schedule);
  }

  function markReinforcementResult(record, judgement, { now, dateKey, sequence }) {
    const result = normalizeLearningRecord(record);
    const normalizedJudgement = judgement === true || judgement === "correct"
      ? "correct"
      : judgement === "partial" ? "partial" : "wrong";
    result.lastReinforcementAt = now;
    if (normalizedJudgement === "correct") {
      result.stage = LEARNING_STAGES.COMPLETED;
      result.completedAt = now;
      result.completedDate = dateKey;
      return normalizeLearningRecord(result);
    }

    const schedule = calculateReinforcementSchedule({
      phase: LEARNING_PHASES.REINFORCEMENT,
      correct: false,
      judgement: normalizedJudgement,
      studyMode: result.introStudyMode,
      reinforcementAttempts: result.reinforcementAttempts,
      currentSequence: sequence,
      now,
    });
    result.stage = LEARNING_STAGES.PENDING;
    result.reinforcementAttempts += 1;
    result.completedAt = null;
    result.completedDate = null;
    applySchedule(result, schedule);
    return normalizeLearningRecord(result);
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

  function handleIntro(progress, correct, { now }) {
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

  function handlePendingPractice(progress, correct, { now }) {
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

  function isPending(record) {
    return normalizeLearningRecord(record).stage === LEARNING_STAGES.PENDING;
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
    return answeredSinceSchedule >= FALLBACK_MIN_QUESTION_GAP
      || waitedMs >= MIN_REINFORCEMENT_DELAY_MS;
  }

  function getRiskScore(record) {
    const normalized = normalizeLearningRecord(record);
    let score = 0;
    if (normalized.introCorrect === false) score += 40;
    if (normalized.reinforcementAttempts > 0) {
      score += 30 + Math.max(0, normalized.reinforcementAttempts - 1) * 10;
    }
    if (normalized.introStudyMode === "en-to-zh") score += 10;
    return score;
  }

  function comparePendingItems(left, right) {
    const leftState = normalizeLearningRecord(left.learningState || left);
    const rightState = normalizeLearningRecord(right.learningState || right);
    const riskDifference = getRiskScore(rightState) - getRiskScore(leftState);
    if (riskDifference) return riskDifference;
    return (leftState.introducedAt || 0) - (rightState.introducedAt || 0);
  }

  function buildNormalQueue({
    dueItems = [],
    pendingItems = [],
    introItems = [],
    currentSequence = 0,
    dateKey,
    now = Date.now(),
  }) {
    const crossDay = [];
    const ready = [];
    const waiting = [];
    pendingItems.forEach((item) => {
      if (isCrossDayPending(item.learningState, dateKey)) crossDay.push(item);
      else if (isEligible(item.learningState, currentSequence, dateKey, now)) ready.push(item);
      else waiting.push(item);
    });
    crossDay.sort(comparePendingItems);
    ready.sort(comparePendingItems);
    waiting.sort((left, right) => {
      const leftState = normalizeLearningRecord(left.learningState);
      const rightState = normalizeLearningRecord(right.learningState);
      return leftState.eligibleAfterSequence - rightState.eligibleAfterSequence
        || comparePendingItems(left, right);
    });
    return [...dueItems, ...crossDay, ...ready, ...introItems, ...waiting];
  }

  function getInsertionIndex(currentIndex, questionCount, gap) {
    const safeCurrentIndex = Math.max(0, toNonNegativeInteger(currentIndex));
    const target = safeCurrentIndex + 1 + Math.max(0, toNonNegativeInteger(gap));
    return Math.min(Math.max(safeCurrentIndex + 1, target), Math.max(0, toNonNegativeInteger(questionCount)));
  }

  function getItemPriority(item, context) {
    if (item.taskType === "review") return 0;
    if (item.learningPhase === LEARNING_PHASES.REINFORCEMENT) {
      if (isCrossDayPending(item.learningState, context.dateKey)) return 1;
      if (isEligible(item.learningState, context.currentSequence, context.dateKey, context.now)) return 2;
      if (isFallbackEligible(item.learningState, context.currentSequence, context.dateKey, context.now)) return 4;
      return Number.POSITIVE_INFINITY;
    }
    if (item.learningPhase === LEARNING_PHASES.INTRO) {
      return context.pendingCount >= MAX_PENDING_REINFORCEMENT
        ? Number.POSITIVE_INFINITY
        : 3;
    }
    return 3;
  }

  function getItemWordId(item) {
    return item.word?.word || item.wordId || item.id || "";
  }

  function selectNextItemIndex({
    items,
    currentSequence = 0,
    dateKey,
    now = Date.now(),
    pendingCount = 0,
    recentWordIds = [],
  }) {
    const context = { currentSequence, dateKey, now, pendingCount };
    const candidates = items
      .map((item, index) => ({ item, index, priority: getItemPriority(item, context) }))
      .filter((candidate) => Number.isFinite(candidate.priority));
    if (!candidates.length) return -1;

    const bestPriority = Math.min(...candidates.map((candidate) => candidate.priority));
    const best = candidates.filter((candidate) => candidate.priority === bestPriority);
    if (bestPriority === 1 || bestPriority === 2 || bestPriority === 4) {
      best.sort((left, right) => comparePendingItems(left.item, right.item));
    }

    const recent = new Set(recentWordIds.slice(-3));
    return (best.find((candidate) => !recent.has(getItemWordId(candidate.item))) || best[0]).index;
  }

  function debugSchedule(wordId, record) {
    if (!DEBUG_REINFORCEMENT) return;
    const state = normalizeLearningRecord(record);
    console.info("[reinforcement]", {
      word: wordId,
      reason: state.scheduleReason,
      questionGap: state.questionGap,
      minDelay: `${Math.round(state.minDelayMs / 1000)}s`,
      eligibleSequence: state.eligibleAfterSequence,
      eligibleTime: state.eligibleAfterTime ? new Date(state.eligibleAfterTime).toLocaleTimeString() : null,
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
    calculateReinforcementSchedule,
    createPendingRecord,
    markReinforcementResult,
    handleIntro,
    handleReinforcement,
    handleReinforcementPartial,
    handlePendingPractice,
    isPending,
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
