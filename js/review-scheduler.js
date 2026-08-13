/**
 * 拾词 · 简单间隔重复调度器
 * 只负责熟练度、复习时间与答题后的状态变化，不读写界面或 localStorage。
 */

(function registerReviewScheduler(app) {
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;

  const REVIEW_INTERVALS = Object.freeze({
    0: 10 * MINUTE,
    1: 1 * DAY,
    2: 3 * DAY,
    3: 7 * DAY,
    4: 15 * DAY,
    5: 30 * DAY,
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

  function getNextReviewTime(level, now = Date.now()) {
    const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return safeNow + REVIEW_INTERVALS[getMasteryLevel({ masteryLevel: level })];
  }

  function isDueForReview(progress, now = Date.now()) {
    const nextReviewTime = Number(progress?.nextReviewTime);
    return Boolean(progress?.learned)
      && Number.isFinite(nextReviewTime)
      && nextReviewTime > 0
      && nextReviewTime <= Number(now);
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
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const wasLearned = Boolean(progress?.learned);
    const isNew = options.isNew ?? !wasLearned;
    const result = createProgressCopy(progress, now);

    result.correctCount += 1;
    result.consecutiveCorrect += 1;

    if (isNew) {
      result.masteryLevel = 1;
      result.nextReviewTime = getNextReviewTime(1, now);
    } else if (isReview) {
      result.masteryLevel = Math.min(5, result.masteryLevel + 1);
      result.reviewCount += 1;
      result.lastReviewTime = now;
      result.nextReviewTime = getNextReviewTime(result.masteryLevel, now);
    }

    if (result.masteryLevel >= 4 && result.consecutiveCorrect >= 3) {
      result.inWrongBook = false;
    }

    return result;
  }

  function handleWrong(progress, isReview, options = {}) {
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const wasLearned = Boolean(progress?.learned);
    const isNew = options.isNew ?? !wasLearned;
    const result = createProgressCopy(progress, now);

    result.wrongCount += 1;
    result.consecutiveCorrect = 0;
    result.inWrongBook = true;
    result.lastWrongTime = now;
    result.masteryLevel = isNew ? 0 : Math.max(0, result.masteryLevel - 2);
    result.nextReviewTime = getNextReviewTime(result.masteryLevel, now);

    if (isReview) {
      result.reviewCount += 1;
      result.lastReviewTime = now;
    }

    return result;
  }

  function calculateReviewPriority(progress, now = Date.now()) {
    const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const nextReviewTime = Number(progress?.nextReviewTime) || safeNow;
    const overdueDays = Math.max(0, safeNow - nextReviewTime) / DAY;
    const overdueScore = Math.min(50, overdueDays * 5);
    const masteryScore = ((5 - getMasteryLevel(progress)) / 5) * 25;
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

  function getDueWords(records, now = Date.now()) {
    return [...records]
      .filter((entry) => isDueForReview(entry.progress, now))
      .sort((a, b) => {
        const priorityDifference = calculateReviewPriority(b.progress, now).total
          - calculateReviewPriority(a.progress, now).total;
        return priorityDifference || a.progress.nextReviewTime - b.progress.nextReviewTime;
      });
  }

  function formatReviewTime(timestamp, now = Date.now()) {
    const reviewTime = Number(timestamp);
    if (!Number.isFinite(reviewTime) || reviewTime <= 0) return "待安排";

    const difference = reviewTime - Number(now);
    if (difference <= 0) return "已到期";
    if (difference < 60 * MINUTE) return `${Math.max(1, Math.ceil(difference / MINUTE))} 分钟后`;

    const reviewDate = new Date(reviewTime);
    const currentDate = new Date(now);
    const reviewDay = new Date(reviewDate.getFullYear(), reviewDate.getMonth(), reviewDate.getDate()).getTime();
    const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
    const dayDifference = Math.round((reviewDay - currentDay) / DAY);

    if (dayDifference === 0) return "今天";
    if (dayDifference === 1) return "明天";
    if (dayDifference <= 7) return `${dayDifference} 天后`;

    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(reviewDate);
  }

  app.reviewScheduler = {
    REVIEW_INTERVALS,
    MASTERY_LABELS,
    getMasteryLevel,
    getNextReviewTime,
    handleCorrect,
    handleWrong,
    calculateReviewPriority,
    isDueForReview,
    getDueWords,
    formatReviewTime,
  };
})(window.CETWords);
