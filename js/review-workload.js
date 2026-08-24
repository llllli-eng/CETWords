/**
 * 拾词 · 每日复习负担控制
 * 只负责今日任务截取、分段和速度估算，不改变 SRS 优先级算法。
 */

(function registerReviewWorkloadService(app) {
  const DEFAULT_DAILY_REVIEW_LIMIT = 120;
  const DAILY_REVIEW_LIMIT_OPTIONS = Object.freeze([60, 100, 120, 150, 200, "unlimited"]);
  const REVIEW_SEGMENT_SIZE = 20;
  const REVIEW_BREAK_MINUTES = 3;
  const QUICK_CLEANUP_LIMIT = 20;
  const MINIMUM_PACE_SAMPLES = 5;
  const MAXIMUM_PACE_SAMPLE_SECONDS = 60;
  const PACE_EWMA_ALPHA = 0.25;

  function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function normalizeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => typeof item === "string" && item.trim()))];
  }

  function normalizeLimit(value) {
    if (value === "unlimited" || value === null || value === Infinity) return "unlimited";
    const number = Number(value);
    return DAILY_REVIEW_LIMIT_OPTIONS.includes(number) ? number : DEFAULT_DAILY_REVIEW_LIMIT;
  }

  function getTargetCount(dueCount, limit) {
    const count = toNonNegativeInteger(dueCount);
    const normalized = normalizeLimit(limit);
    return normalized === "unlimited" ? count : Math.min(count, normalized);
  }

  function normalizeTask(raw, dateKey = "") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ""))
      ? String(raw.date)
      : /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) ? String(dateKey) : "";
    if (!date) return null;
    const taskWordIds = normalizeIds(raw.taskWordIds);
    const allowed = new Set(taskWordIds);
    const withinTask = (value) => normalizeIds(value).filter((wordId) => allowed.has(wordId));
    const completedWordIds = withinTask(raw.completedWordIds);
    const manualMasteredWordIds = withinTask(raw.manualMasteredWordIds)
      .filter((wordId) => !completedWordIds.includes(wordId));
    const deferredTodayWordIds = withinTask(raw.deferredTodayWordIds)
      .filter((wordId) => !completedWordIds.includes(wordId) && !manualMasteredWordIds.includes(wordId));
    const handled = new Set([...completedWordIds, ...manualMasteredWordIds, ...deferredTodayWordIds]);
    const startedWordIds = withinTask(raw.startedWordIds);
    const segmentSize = Math.max(1, toNonNegativeInteger(raw.segmentSize) || REVIEW_SEGMENT_SIZE);
    const completedSegments = Math.floor(handled.size / segmentSize);
    return {
      date,
      limit: normalizeLimit(raw.limit),
      sourceDueCount: Math.max(taskWordIds.length, toNonNegativeInteger(raw.sourceDueCount)),
      taskWordIds,
      createdAt: normalizeTimestamp(raw.createdAt) || Date.now(),
      startedWordIds,
      completedWordIds,
      manualMasteredWordIds,
      deferredTodayWordIds,
      segmentSize,
      acknowledgedSegmentCount: Math.min(
        completedSegments,
        toNonNegativeInteger(raw.acknowledgedSegmentCount),
      ),
      currentSegmentIndex: Math.min(
        Math.max(0, Math.ceil(Math.max(1, taskWordIds.length) / segmentSize) - 1),
        Math.floor(handled.size / segmentSize),
      ),
      breakStartedAt: normalizeTimestamp(raw.breakStartedAt),
    };
  }

  function createTask({ date, dueWordIds, limit, now = Date.now(), segmentSize = REVIEW_SEGMENT_SIZE }) {
    const orderedDueIds = normalizeIds(dueWordIds);
    const normalizedLimit = normalizeLimit(limit);
    return normalizeTask({
      date,
      limit: normalizedLimit,
      sourceDueCount: orderedDueIds.length,
      taskWordIds: orderedDueIds.slice(0, getTargetCount(orderedDueIds.length, normalizedLimit)),
      createdAt: now,
      startedWordIds: [],
      completedWordIds: [],
      manualMasteredWordIds: [],
      deferredTodayWordIds: [],
      segmentSize,
      acknowledgedSegmentCount: 0,
      currentSegmentIndex: 0,
      breakStartedAt: null,
    }, date);
  }

  function getHandledWordIds(task) {
    const normalized = normalizeTask(task, task?.date);
    return normalized
      ? normalizeIds([
        ...normalized.completedWordIds,
        ...normalized.manualMasteredWordIds,
        ...normalized.deferredTodayWordIds,
      ])
      : [];
  }

  function getSegmentStatus(task) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized) return null;
    const handledCount = getHandledWordIds(normalized).length;
    const target = normalized.taskWordIds.length;
    const completedSegmentCount = Math.floor(handledCount / normalized.segmentSize);
    const pendingBreak = handledCount > 0
      && handledCount < target
      && completedSegmentCount > normalized.acknowledgedSegmentCount;
    const segmentStart = normalized.acknowledgedSegmentCount * normalized.segmentSize;
    const segmentTarget = Math.max(0, Math.min(normalized.segmentSize, target - segmentStart));
    return {
      handledCount,
      target,
      remainingCount: Math.max(0, target - handledCount),
      completed: target === 0 || handledCount >= target,
      completedSegmentCount,
      segmentNumber: Math.min(
        Math.max(1, completedSegmentCount + (pendingBreak ? 0 : 1)),
        Math.max(1, Math.ceil(target / normalized.segmentSize)),
      ),
      segmentHandledCount: handledCount >= target && target > 0
        ? target - segmentStart
        : pendingBreak
          ? Math.min(normalized.segmentSize, handledCount - segmentStart)
          : handledCount % normalized.segmentSize,
      segmentTarget,
      pendingBreak,
      breakStartedAt: normalized.breakStartedAt,
      breakMinutes: REVIEW_BREAK_MINUTES,
    };
  }

  function summarizeTask(task, { currentDueWordIds = [], outsideBacklogWordIds = [] } = {}) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized) return null;
    const handledWordIds = getHandledWordIds(normalized);
    const handled = new Set(handledWordIds);
    const due = new Set(normalizeIds(currentDueWordIds));
    const pendingTaskWordIds = normalized.taskWordIds.filter((wordId) => !handled.has(wordId));
    return {
      ...getSegmentStatus(normalized),
      date: normalized.date,
      limit: normalized.limit,
      sourceDueCount: normalized.sourceDueCount,
      taskWordIds: [...normalized.taskWordIds],
      pendingTaskWordIds,
      handledWordIds,
      answeredCount: normalized.completedWordIds.length,
      manualMasteredCount: normalized.manualMasteredWordIds.length,
      deferredTodayCount: normalized.deferredTodayWordIds.length,
      totalDueCount: due.size,
      backlogCount: normalizeIds(outsideBacklogWordIds).length,
      started: normalized.startedWordIds.length > 0 || handledWordIds.length > 0,
    };
  }

  function markStarted(task, wordId) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized || !normalized.taskWordIds.includes(wordId)) return normalized;
    if (!normalized.startedWordIds.includes(wordId)) normalized.startedWordIds.push(wordId);
    return normalizeTask(normalized, normalized.date);
  }

  function markHandled(task, wordId, type) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized || !normalized.taskWordIds.includes(wordId)) return normalized;
    for (const field of ["completedWordIds", "manualMasteredWordIds", "deferredTodayWordIds"]) {
      normalized[field] = normalized[field].filter((candidate) => candidate !== wordId);
    }
    const field = type === "manual-mastered"
      ? "manualMasteredWordIds"
      : type === "deferred" ? "deferredTodayWordIds" : "completedWordIds";
    normalized[field].push(wordId);
    if (!normalized.startedWordIds.includes(wordId)) normalized.startedWordIds.push(wordId);
    return normalizeTask(normalized, normalized.date);
  }

  function adjustTask(task, { dueWordIds, limit, now = Date.now() }) {
    const normalized = normalizeTask(task, task?.date);
    const orderedDueIds = normalizeIds(dueWordIds);
    const nextLimit = normalizeLimit(limit);
    if (!normalized) return { action: "created", task: createTask({ date: "", dueWordIds: orderedDueIds, limit: nextLimit, now }) };
    const handled = new Set(getHandledWordIds(normalized));
    const protectedIds = new Set([...normalized.startedWordIds, ...handled]);
    if (!protectedIds.size) {
      return {
        action: "rebuilt",
        task: createTask({
          date: normalized.date,
          dueWordIds: orderedDueIds,
          limit: nextLimit,
          now,
          segmentSize: normalized.segmentSize,
        }),
      };
    }

    const pool = normalizeIds([...normalized.taskWordIds, ...orderedDueIds]);
    const desired = Math.max(
      protectedIds.size,
      nextLimit === "unlimited" ? pool.length : Math.min(Number(nextLimit), pool.length),
    );
    let taskWordIds = normalized.taskWordIds.filter((wordId, index) => index < desired || protectedIds.has(wordId));
    const selected = new Set(taskWordIds);
    for (const wordId of orderedDueIds) {
      if (taskWordIds.length >= desired) break;
      if (!selected.has(wordId)) {
        taskWordIds.push(wordId);
        selected.add(wordId);
      }
    }
    const previousLength = normalized.taskWordIds.length;
    const next = normalizeTask({
      ...normalized,
      limit: nextLimit,
      sourceDueCount: Math.max(normalized.sourceDueCount, orderedDueIds.length),
      taskWordIds,
    }, normalized.date);
    return {
      action: taskWordIds.length > previousLength ? "extended" : taskWordIds.length < previousLength ? "reduced" : "unchanged",
      task: next,
    };
  }

  function acknowledgeSegment(task) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized) return null;
    const status = getSegmentStatus(normalized);
    normalized.acknowledgedSegmentCount = Math.max(
      normalized.acknowledgedSegmentCount,
      status.completedSegmentCount,
    );
    normalized.currentSegmentIndex = normalized.acknowledgedSegmentCount;
    normalized.breakStartedAt = null;
    return normalizeTask(normalized, normalized.date);
  }

  function startBreak(task, now = Date.now()) {
    const normalized = normalizeTask(task, task?.date);
    if (!normalized || !getSegmentStatus(normalized).pendingBreak) return normalized;
    normalized.breakStartedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return normalizeTask(normalized, normalized.date);
  }

  function moveWordToEnd(wordIds, currentIndex, wordId) {
    const result = [...wordIds];
    const index = Math.max(toNonNegativeInteger(currentIndex), result.indexOf(wordId));
    if (index < 0 || index >= result.length || result.length < 2) return result;
    const [entry] = result.splice(index, 1);
    result.push(entry);
    return result;
  }

  function normalizePace(raw) {
    const secondsPerItem = Number(raw?.secondsPerItem);
    return {
      secondsPerItem: Number.isFinite(secondsPerItem) && secondsPerItem > 0
        ? Math.min(MAXIMUM_PACE_SAMPLE_SECONDS, secondsPerItem)
        : null,
      sampleCount: toNonNegativeInteger(raw?.sampleCount),
    };
  }

  function updatePace(raw, durationMs) {
    const current = normalizePace(raw);
    const rawSeconds = Number(durationMs) / 1000;
    if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) return current;
    const sample = Math.min(MAXIMUM_PACE_SAMPLE_SECONDS, Math.max(1, rawSeconds));
    return {
      secondsPerItem: current.secondsPerItem === null
        ? sample
        : current.secondsPerItem * (1 - PACE_EWMA_ALPHA) + sample * PACE_EWMA_ALPHA,
      sampleCount: current.sampleCount + 1,
    };
  }

  function estimateRemaining(pace, remainingItems) {
    const normalized = normalizePace(pace);
    const remaining = toNonNegativeInteger(remainingItems);
    if (normalized.sampleCount < MINIMUM_PACE_SAMPLES || !normalized.secondsPerItem || !remaining) return null;
    const minutes = (normalized.secondsPerItem * remaining) / 60;
    if (minutes < 5) return { minutes: Math.max(1, Math.ceil(minutes)), label: "不到 5 分钟" };
    const rounded = minutes <= 60 ? Math.max(5, Math.round(minutes / 5) * 5) : Math.round(minutes / 10) * 10;
    return { minutes: rounded, label: `约 ${rounded} 分钟` };
  }

  function getQuickCleanupWordIds(taskSummary, orderedDueWordIds, limit = QUICK_CLEANUP_LIMIT) {
    const maximum = Math.max(1, toNonNegativeInteger(limit) || QUICK_CLEANUP_LIMIT);
    const handled = new Set(normalizeIds(taskSummary?.handledWordIds));
    return normalizeIds([
      ...(taskSummary?.pendingTaskWordIds || []),
      ...normalizeIds(orderedDueWordIds).filter((wordId) => !handled.has(wordId)),
    ]).slice(0, maximum);
  }

  app.reviewWorkload = {
    DEFAULT_DAILY_REVIEW_LIMIT,
    DAILY_REVIEW_LIMIT_OPTIONS,
    REVIEW_SEGMENT_SIZE,
    REVIEW_BREAK_MINUTES,
    QUICK_CLEANUP_LIMIT,
    MINIMUM_PACE_SAMPLES,
    MAXIMUM_PACE_SAMPLE_SECONDS,
    normalizeLimit,
    getTargetCount,
    normalizeTask,
    createTask,
    summarizeTask,
    getHandledWordIds,
    getSegmentStatus,
    markStarted,
    markHandled,
    adjustTask,
    acknowledgeSegment,
    startBreak,
    moveWordToEnd,
    normalizePace,
    updatePace,
    estimateRemaining,
    getQuickCleanupWordIds,
  };
})(window.CETWords);
