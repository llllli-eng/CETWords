(function registerReviewRecovery(app) {
  const FORMAL_REVIEW_PHASE = "formal-review";
  const RECOVERY_PHASE = "review-recovery";
  const MAX_ATTEMPTS_PER_SESSION = 3;
  const RECOVERY_WINDOWS = Object.freeze({
    1: Object.freeze({ questionMin: 3, questionMax: 6, delayMinMs: 45_000, delayMaxMs: 90_000 }),
    2: Object.freeze({ questionMin: 5, questionMax: 9, delayMinMs: 60_000, delayMaxMs: 120_000 }),
    3: Object.freeze({ questionMin: 7, questionMax: 12, delayMinMs: 90_000, delayMaxMs: 180_000 }),
  });

  function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function normalizeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeResult(value) {
    return ["correct", "partial", "wrong"].includes(value) ? value : null;
  }

  function randomInteger(minimum, maximum, random = Math.random) {
    const safeRandom = Math.min(0.999999999, Math.max(0, Number(random()) || 0));
    return minimum + Math.floor(safeRandom * (maximum - minimum + 1));
  }

  function calculateRecoverySchedule(attemptNumber, { sequence = 0, now = Date.now(), random = Math.random } = {}) {
    const safeAttempt = Math.min(3, Math.max(1, toNonNegativeInteger(attemptNumber) || 1));
    const rule = RECOVERY_WINDOWS[safeAttempt];
    const questionGap = randomInteger(rule.questionMin, rule.questionMax, random);
    const minDelayMs = randomInteger(rule.delayMinMs, rule.delayMaxMs, random);
    const scheduledAtSequence = toNonNegativeInteger(sequence);
    const scheduledAtTime = normalizeTimestamp(now) || Date.now();
    return {
      questionGap,
      minDelayMs,
      scheduledAtSequence,
      scheduledAtTime,
      eligibleAfterSequence: scheduledAtSequence + questionGap,
      eligibleAfterTime: scheduledAtTime + minDelayMs,
    };
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const active = Boolean(raw.active);
    const currentLevel = Math.min(5, toNonNegativeInteger(raw.currentLevel));
    const attemptsThisSession = Math.min(MAX_ATTEMPTS_PER_SESSION, toNonNegativeInteger(raw.attemptsThisSession));
    return {
      active,
      createdAt: normalizeTimestamp(raw.createdAt),
      sourceReviewResult: ["partial", "wrong"].includes(raw.sourceReviewResult)
        ? raw.sourceReviewResult
        : "wrong",
      currentLevel,
      lastSessionId: typeof raw.lastSessionId === "string" ? raw.lastSessionId.slice(0, 120) : "",
      attemptsThisSession,
      totalAttempts: toNonNegativeInteger(raw.totalAttempts),
      questionGap: toNonNegativeInteger(raw.questionGap),
      minDelayMs: toNonNegativeInteger(raw.minDelayMs),
      scheduledAtSequence: toNonNegativeInteger(raw.scheduledAtSequence),
      scheduledAtTime: normalizeTimestamp(raw.scheduledAtTime),
      eligibleAfterQuestionIndex: toNonNegativeInteger(raw.eligibleAfterQuestionIndex ?? raw.eligibleAfterSequence),
      eligibleAfterTime: normalizeTimestamp(raw.eligibleAfterTime),
      lastResult: normalizeResult(raw.lastResult),
      pendingNextSession: Boolean(raw.pendingNextSession),
      crossSessionReady: Boolean(raw.crossSessionReady),
    };
  }

  function beginSession(record, sessionId) {
    const normalized = normalizeRecord(record);
    if (!normalized?.active) return normalized;
    const nextSessionId = String(sessionId || "").slice(0, 120);
    if (normalized.lastSessionId !== nextSessionId) {
      normalized.lastSessionId = nextSessionId;
      normalized.attemptsThisSession = 0;
      normalized.pendingNextSession = false;
      normalized.crossSessionReady = true;
      normalized.eligibleAfterQuestionIndex = 0;
      normalized.eligibleAfterTime = 1;
    }
    return normalized;
  }

  function createRecovery({ sourceReviewResult, currentLevel, sessionId, sequence = 0, now = Date.now(), random = Math.random }) {
    const schedule = calculateRecoverySchedule(1, { sequence, now, random });
    return normalizeRecord({
      active: true,
      createdAt: now,
      sourceReviewResult,
      currentLevel,
      lastSessionId: sessionId,
      attemptsThisSession: 0,
      totalAttempts: 0,
      ...schedule,
      eligibleAfterQuestionIndex: schedule.eligibleAfterSequence,
      lastResult: sourceReviewResult,
      pendingNextSession: false,
      crossSessionReady: false,
    });
  }

  function isCrossSession(record, sessionId) {
    const normalized = normalizeRecord(record);
    if (!normalized?.active) return false;
    if (normalized.crossSessionReady && normalized.lastSessionId === String(sessionId || "")) return true;
    if (normalized.pendingNextSession) return normalized.lastSessionId !== String(sessionId || "");
    return Boolean(normalized.lastSessionId && normalized.lastSessionId !== String(sessionId || ""));
  }

  function getAttemptsThisSession(record, sessionId) {
    const normalized = normalizeRecord(record);
    if (!normalized?.active || normalized.lastSessionId !== String(sessionId || "")) return 0;
    return normalized.attemptsThisSession;
  }

  function isEligible(record, { sessionId, sequence = 0, now = Date.now() } = {}) {
    const normalized = normalizeRecord(record);
    if (!normalized?.active) return false;
    if (getAttemptsThisSession(normalized, sessionId) >= MAX_ATTEMPTS_PER_SESSION) return false;
    if (isCrossSession(normalized, sessionId)) return true;
    return normalized.eligibleAfterQuestionIndex <= toNonNegativeInteger(sequence)
      && Boolean(normalized.eligibleAfterTime)
      && normalized.eligibleAfterTime <= Number(now);
  }

  function getPriority(record, context = {}) {
    if (isCrossSession(record, context.sessionId) && getAttemptsThisSession(record, context.sessionId) < MAX_ATTEMPTS_PER_SESSION) {
      return 1;
    }
    return isEligible(record, context) ? 2 : Number.POSITIVE_INFINITY;
  }

  function markRecoveryResult(record, judgement, {
    sessionId,
    sequence = 0,
    now = Date.now(),
    random = Math.random,
  } = {}) {
    const normalized = normalizeRecord(record);
    if (!normalized?.active) return normalized;
    const result = normalizeResult(judgement) || "wrong";
    const previousAttempts = normalized.lastSessionId === String(sessionId || "")
      ? normalized.attemptsThisSession
      : 0;
    normalized.lastSessionId = String(sessionId || "").slice(0, 120);
    normalized.crossSessionReady = false;
    normalized.attemptsThisSession = Math.min(MAX_ATTEMPTS_PER_SESSION, previousAttempts + 1);
    normalized.totalAttempts += 1;
    normalized.lastResult = result;
    normalized.currentLevel = Math.min(5, toNonNegativeInteger(normalized.currentLevel));

    if (result === "correct") {
      normalized.active = false;
      normalized.pendingNextSession = false;
      normalized.crossSessionReady = false;
      normalized.questionGap = 0;
      normalized.minDelayMs = 0;
      normalized.eligibleAfterQuestionIndex = 0;
      normalized.eligibleAfterTime = null;
      return normalized;
    }

    if (normalized.attemptsThisSession >= MAX_ATTEMPTS_PER_SESSION) {
      normalized.pendingNextSession = true;
      normalized.crossSessionReady = false;
      normalized.eligibleAfterQuestionIndex = 0;
      normalized.eligibleAfterTime = null;
      return normalized;
    }

    normalized.pendingNextSession = false;
    const nextAttempt = normalized.attemptsThisSession + 1;
    const schedule = calculateRecoverySchedule(nextAttempt, { sequence, now, random });
    normalized.questionGap = schedule.questionGap;
    normalized.minDelayMs = schedule.minDelayMs;
    normalized.scheduledAtSequence = schedule.scheduledAtSequence;
    normalized.scheduledAtTime = schedule.scheduledAtTime;
    normalized.eligibleAfterQuestionIndex = schedule.eligibleAfterSequence;
    normalized.eligibleAfterTime = schedule.eligibleAfterTime;
    return normalized;
  }

  app.reviewRecovery = {
    FORMAL_REVIEW_PHASE,
    RECOVERY_PHASE,
    MAX_ATTEMPTS_PER_SESSION,
    RECOVERY_WINDOWS,
    randomInteger,
    calculateRecoverySchedule,
    normalizeRecord,
    beginSession,
    createRecovery,
    isCrossSession,
    getAttemptsThisSession,
    isEligible,
    getPriority,
    markRecoveryResult,
  };
})(window.CETWords);
