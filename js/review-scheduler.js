/**
 * 拾词 · 间隔重复调度器
 * L0 使用精确时间；L1～L5 使用浏览器本地自然日，不读写界面或 localStorage。
 */

(function registerReviewScheduler(app) {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const L1_MINIMUM_DELAY = 6 * HOUR;

  // 保留原常量供旧调用方识别 L0 精确间隔；L1～L5 不再用毫秒相加调度。
  const REVIEW_INTERVALS = Object.freeze({
    0: 10 * MINUTE,
    1: 1 * DAY,
    2: 3 * DAY,
    3: 7 * DAY,
    4: 15 * DAY,
    5: 30 * DAY,
  });

  const LONG_TERM_INTERVAL_DAYS = Object.freeze({
    1: 1,
    2: 3,
    3: 7,
    4: 15,
    5: 30,
  });

  const MASTERY_LABELS = Object.freeze([
    "完全不会",
    "陌生",
    "有印象",
    "基本掌握",
    "熟练",
    "已掌握",
  ]);

  function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function getMasteryLevel(progress) {
    const level = toNonNegativeInteger(progress?.masteryLevel);
    return Math.min(5, level);
  }

  function getSafeTimestamp(value = Date.now()) {
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  }

  function getLocalDateKey(timestamp = Date.now()) {
    const date = new Date(getSafeTimestamp(timestamp));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) return null;
    return { year, month, day, date };
  }

  function normalizeLocalDateKey(value) {
    const parsed = parseLocalDateKey(value);
    if (!parsed) return null;
    return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
  }

  function addLocalCalendarDays(value, days) {
    const source = typeof value === "string"
      ? parseLocalDateKey(value)
      : parseLocalDateKey(getLocalDateKey(value));
    if (!source) return null;
    const date = new Date(source.year, source.month - 1, source.day, 12);
    date.setDate(date.getDate() + Math.trunc(Number(days) || 0));
    return getLocalDateKey(date.getTime());
  }

  function getCalendarDayOrdinal(dateKey) {
    const parsed = parseLocalDateKey(dateKey);
    return parsed ? Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / DAY) : null;
  }

  function getCalendarDayDifference(leftDateKey, rightDateKey) {
    const left = getCalendarDayOrdinal(leftDateKey);
    const right = getCalendarDayOrdinal(rightDateKey);
    return left === null || right === null ? null : left - right;
  }

  function getNextReviewSchedule(level, now = Date.now()) {
    const safeNow = getSafeTimestamp(now);
    const masteryLevel = getMasteryLevel({ masteryLevel: level });
    if (masteryLevel === 0) {
      return {
        nextReviewTime: safeNow + REVIEW_INTERVALS[0],
        nextReviewDate: null,
        lastLongTermAnchorAt: null,
        earliestReviewAt: null,
      };
    }

    return {
      nextReviewTime: null,
      nextReviewDate: addLocalCalendarDays(safeNow, LONG_TERM_INTERVAL_DAYS[masteryLevel]),
      lastLongTermAnchorAt: safeNow,
      earliestReviewAt: masteryLevel === 1 ? safeNow + L1_MINIMUM_DELAY : null,
    };
  }

  function getNextReviewTime(level, now = Date.now()) {
    return getNextReviewSchedule(level, now).nextReviewTime;
  }

  function clearReviewSchedule(progress) {
    return {
      ...progress,
      nextReviewTime: null,
      nextReviewDate: null,
      lastLongTermAnchorAt: null,
      earliestReviewAt: null,
    };
  }

  function applyNextReviewSchedule(progress, level, now = Date.now()) {
    return {
      ...progress,
      ...getNextReviewSchedule(level, now),
    };
  }

  function isDueForReview(progress, now = Date.now()) {
    if (!progress?.learned) return false;
    const safeNow = getSafeTimestamp(now);
    const level = getMasteryLevel(progress);
    if (level === 0) {
      const nextReviewTime = Number(progress.nextReviewTime);
      return Number.isFinite(nextReviewTime) && nextReviewTime > 0 && nextReviewTime <= safeNow;
    }

    const nextReviewDate = normalizeLocalDateKey(progress.nextReviewDate);
    if (!nextReviewDate || getLocalDateKey(safeNow) < nextReviewDate) return false;
    if (level !== 1) return true;

    const earliestReviewAt = Number(progress.earliestReviewAt);
    return Number.isFinite(earliestReviewAt) && earliestReviewAt > 0 && safeNow >= earliestReviewAt;
  }

  function createProgressCopy(progress, now) {
    return {
      ...progress,
      learned: true,
      correctCount: toNonNegativeInteger(progress?.correctCount),
      wrongCount: toNonNegativeInteger(progress?.wrongCount),
      consecutiveCorrect: toNonNegativeInteger(progress?.consecutiveCorrect),
      masteryLevel: getMasteryLevel(progress),
      reviewCount: toNonNegativeInteger(progress?.reviewCount),
      lastStudyTime: now,
    };
  }

  function handleCorrect(progress, isReview, options = {}) {
    const now = getSafeTimestamp(options.now);
    const wasLearned = Boolean(progress?.learned);
    const isNew = options.isNew ?? !wasLearned;
    let result = createProgressCopy(progress, now);

    result.correctCount += 1;
    result.consecutiveCorrect += 1;

    if (isNew) {
      result.masteryLevel = 1;
      result = applyNextReviewSchedule(result, 1, now);
    } else if (isReview) {
      result.masteryLevel = Math.min(5, result.masteryLevel + 1);
      result.reviewCount += 1;
      result.lastReviewTime = now;
      result = applyNextReviewSchedule(result, result.masteryLevel, now);
    }

    if (result.masteryLevel >= 4 && result.consecutiveCorrect >= 3) {
      result.inWrongBook = false;
    }

    return result;
  }

  function handleWrong(progress, isReview, options = {}) {
    const now = getSafeTimestamp(options.now);
    const wasLearned = Boolean(progress?.learned);
    const isNew = options.isNew ?? !wasLearned;
    let result = createProgressCopy(progress, now);

    result.wrongCount += 1;
    result.consecutiveCorrect = 0;
    result.inWrongBook = true;
    result.lastWrongTime = now;
    result.masteryLevel = isNew ? 0 : Math.max(0, result.masteryLevel - 2);
    result = applyNextReviewSchedule(result, result.masteryLevel, now);

    if (isReview) {
      result.reviewCount += 1;
      result.lastReviewTime = now;
    }

    return result;
  }

  function handleFormalPartial(progress, options = {}) {
    const now = getSafeTimestamp(options.now);
    let result = createProgressCopy(progress, now);
    result.partialCount = toNonNegativeInteger(progress?.partialCount) + 1;
    result.consecutiveCorrect = 0;
    result.reviewCount += 1;
    result.lastReviewTime = now;
    result = clearReviewSchedule(result);
    return result;
  }

  function handleRecovery(progress, judgement, options = {}) {
    const now = getSafeTimestamp(options.now);
    let result = createProgressCopy(progress, now);
    const normalized = judgement === "correct" ? "correct" : judgement === "partial" ? "partial" : "wrong";
    if (normalized === "correct") {
      result.correctCount += 1;
      result.consecutiveCorrect += 1;
      result = applyNextReviewSchedule(result, result.masteryLevel, now);
    } else if (normalized === "partial") {
      result.partialCount = toNonNegativeInteger(progress?.partialCount) + 1;
      result.consecutiveCorrect = 0;
      result = clearReviewSchedule(result);
    } else {
      result.wrongCount += 1;
      result.consecutiveCorrect = 0;
      result.inWrongBook = true;
      result.lastWrongTime = now;
      result = clearReviewSchedule(result);
    }
    return result;
  }

  function calculateReviewPriority(progress, now = Date.now()) {
    const safeNow = getSafeTimestamp(now);
    const level = getMasteryLevel(progress);
    let overdueDays = 0;
    if (level === 0) {
      const nextReviewTime = Number(progress?.nextReviewTime) || safeNow;
      overdueDays = Math.max(0, safeNow - nextReviewTime) / DAY;
    } else {
      overdueDays = Math.max(
        0,
        getCalendarDayDifference(getLocalDateKey(safeNow), progress?.nextReviewDate) || 0,
      );
    }
    const overdueScore = Math.min(50, overdueDays * 5);
    const masteryScore = ((5 - level) / 5) * 25;
    const correctCount = toNonNegativeInteger(progress?.correctCount);
    const wrongCount = toNonNegativeInteger(progress?.wrongCount);
    const answerCount = correctCount + wrongCount;
    const errorRateScore = answerCount ? (wrongCount / answerCount) * 15 : 0;
    const lastWrongTime = Number(progress?.lastWrongTime);
    const wrongAge = Number.isFinite(lastWrongTime) ? Math.max(0, safeNow - lastWrongTime) : Number.POSITIVE_INFINITY;
    const recentWrongScore = wrongAge <= 7 * DAY ? (1 - wrongAge / (7 * DAY)) * 10 : 0;
    return {
      total: overdueScore + masteryScore + errorRateScore + recentWrongScore,
      overdueScore,
      masteryScore,
      errorRateScore,
      recentWrongScore,
    };
  }

  function getScheduleSortValue(progress) {
    if (getMasteryLevel(progress) === 0) return Number(progress?.nextReviewTime) || Number.POSITIVE_INFINITY;
    const ordinal = getCalendarDayOrdinal(progress?.nextReviewDate);
    return ordinal === null ? Number.POSITIVE_INFINITY : ordinal * DAY + (Number(progress?.earliestReviewAt) || 0) / DAY;
  }

  function getDueWords(records, now = Date.now()) {
    return [...records]
      .filter((entry) => isDueForReview(entry.progress, now))
      .sort((a, b) => {
        const priorityDifference = calculateReviewPriority(b.progress, now).total
          - calculateReviewPriority(a.progress, now).total;
        return priorityDifference || getScheduleSortValue(a.progress) - getScheduleSortValue(b.progress);
      });
  }

  function formatReviewTime(timestamp, now = Date.now()) {
    const reviewTime = Number(timestamp);
    if (!Number.isFinite(reviewTime) || reviewTime <= 0) return "待安排";

    const safeNow = getSafeTimestamp(now);
    const difference = reviewTime - safeNow;
    if (difference <= 0) return "已到期";
    if (difference < 60 * MINUTE) return `${Math.max(1, Math.ceil(difference / MINUTE))} 分钟后`;

    const dayDifference = getCalendarDayDifference(getLocalDateKey(reviewTime), getLocalDateKey(safeNow));
    if (dayDifference === 0) return "今天";
    if (dayDifference === 1) return "明天";
    if (dayDifference !== null && dayDifference <= 7) return `${dayDifference} 天后`;

    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(reviewTime));
  }

  function formatReviewSchedule(progress, now = Date.now()) {
    if (!progress?.learned) return "待安排";
    const safeNow = getSafeTimestamp(now);
    if (getMasteryLevel(progress) === 0) return formatReviewTime(progress.nextReviewTime, safeNow);
    const nextReviewDate = normalizeLocalDateKey(progress.nextReviewDate);
    if (!nextReviewDate) return "待安排";
    if (isDueForReview(progress, safeNow)) return "已到期";

    const today = getLocalDateKey(safeNow);
    const dayDifference = getCalendarDayDifference(nextReviewDate, today);
    if (dayDifference !== null && dayDifference <= 0 && getMasteryLevel(progress) === 1) {
      const earliest = Number(progress.earliestReviewAt);
      if (Number.isFinite(earliest) && earliest > safeNow) {
        const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(earliest));
        return `今天 ${time} 后`;
      }
    }
    if (dayDifference === 0) return "今天";
    if (dayDifference === 1) return "明天";
    if (dayDifference !== null && dayDifference <= 7) return `${dayDifference} 天后`;

    const parsed = parseLocalDateKey(nextReviewDate);
    return parsed
      ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(parsed.date)
      : "待安排";
  }

  app.reviewScheduler = {
    REVIEW_INTERVALS,
    LONG_TERM_INTERVAL_DAYS,
    L1_MINIMUM_DELAY,
    MASTERY_LABELS,
    getMasteryLevel,
    getLocalDateKey,
    normalizeLocalDateKey,
    addLocalCalendarDays,
    getCalendarDayDifference,
    getNextReviewSchedule,
    getNextReviewTime,
    clearReviewSchedule,
    applyNextReviewSchedule,
    handleCorrect,
    handleWrong,
    handleFormalPartial,
    handleRecovery,
    calculateReviewPriority,
    isDueForReview,
    getDueWords,
    formatReviewTime,
    formatReviewSchedule,
  };
})(window.CETWords);
