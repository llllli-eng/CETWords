/**
 * 拾词 · 学习统计服务
 * 所有统计口径集中在这里，页面只负责展示。
 */

(function registerStatisticsService(app) {
  const { storage, reviewScheduler } = app;

  function getDateKey(date) {
    return storage.getLocalDateKey(date.getTime());
  }

  function dateFromKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function dateOrdinal(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }

  function getDaily(bookDaily, dateKey) {
    const daily = bookDaily?.[dateKey] || {};
    const completedNewWords = Number.isFinite(Number(daily.completedNewWords))
      ? Number(daily.completedNewWords)
      : Number(daily.newWords);
    return {
      newWords: Math.max(0, completedNewWords || 0),
      reviewWords: Math.max(0, Number(daily.reviewWords) || 0),
      answerCount: Math.max(0, Number(daily.answerCount) || 0),
      correctCount: Math.max(0, Number(daily.correctCount) || 0),
      partialCount: Math.max(0, Number(daily.partialCount) || 0),
      wrongCount: Math.max(0, Number(daily.wrongCount) || 0),
    };
  }

  function hasActivity(daily) {
    return daily.newWords > 0 || daily.reviewWords > 0 || daily.answerCount > 0;
  }

  function getLast7DaysStatistics(bookId, now = Date.now()) {
    const data = storage.loadUserData();
    const bookDaily = data.books[bookId].daily;
    const current = new Date(now);
    const days = [];

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(current.getFullYear(), current.getMonth(), current.getDate() - offset, 12);
      const dateKey = getDateKey(date);
      const daily = getDaily(bookDaily, dateKey);
      days.push({
        dateKey,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        ...daily,
        totalWords: daily.newWords + daily.reviewWords,
      });
    }

    return days;
  }

  function getCurrentStreak(bookId, now = Date.now()) {
    const data = storage.loadUserData();
    const bookDaily = data.books[bookId].daily;
    const current = new Date(now);
    let streak = 0;

    for (let offset = 0; ; offset += 1) {
      const date = new Date(current.getFullYear(), current.getMonth(), current.getDate() - offset, 12);
      if (!hasActivity(getDaily(bookDaily, getDateKey(date)))) break;
      streak += 1;
    }

    return streak;
  }

  function getLongestStreak(bookId) {
    const data = storage.loadUserData();
    const bookDaily = data.books[bookId].daily;
    const activeOrdinals = Object.keys(bookDaily)
      .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && hasActivity(getDaily(bookDaily, dateKey)))
      .map(dateOrdinal)
      .sort((a, b) => a - b);

    let longest = 0;
    let current = 0;
    let previous = null;
    activeOrdinals.forEach((ordinal) => {
      current = previous !== null && ordinal === previous + 1 ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous = ordinal;
    });
    return longest;
  }

  function getMasteryDistribution(bookId, validWordIds) {
    const counts = [0, 0, 0, 0, 0, 0];
    validWordIds.forEach((wordId) => {
      const progress = storage.getWordProgress(bookId, wordId);
      if (!progress.learned) return;
      counts[reviewScheduler.getMasteryLevel(progress)] += 1;
    });
    return counts.map((count, level) => ({
      level,
      label: reviewScheduler.MASTERY_LABELS[level],
      count,
    }));
  }

  function getTodayStatistics(bookId, now = Date.now()) {
    const daily = storage.getDailyStats(bookId, storage.getLocalDateKey(now));
    const accuracy = daily.answerCount ? (daily.correctCount / daily.answerCount) * 100 : 0;
    return { ...daily, accuracy };
  }

  function getBookStatistics(bookId, validWordIds, now = Date.now()) {
    let learned = 0;
    let mastered = 0;
    let wrongWords = 0;
    let favoriteWords = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;

    validWordIds.forEach((wordId) => {
      const progress = storage.getWordProgress(bookId, wordId);
      if (progress.learned) learned += 1;
      if (progress.learned && progress.masteryLevel >= 5) mastered += 1;
      if (progress.inWrongBook) wrongWords += 1;
      if (progress.favorite) favoriteWords += 1;
      correctAnswers += progress.correctCount;
      wrongAnswers += progress.wrongCount;
    });

    const answerCount = correctAnswers + wrongAnswers;
    return {
      total: validWordIds.length,
      learned,
      mastered,
      unlearned: Math.max(0, validWordIds.length - learned),
      wrongWords,
      favoriteWords,
      answerCount,
      correctAnswers,
      wrongAnswers,
      accuracy: answerCount ? (correctAnswers / answerCount) * 100 : 0,
      today: getTodayStatistics(bookId, now),
      last7Days: getLast7DaysStatistics(bookId, now),
      currentStreak: getCurrentStreak(bookId, now),
      longestStreak: getLongestStreak(bookId),
      masteryDistribution: getMasteryDistribution(bookId, validWordIds),
    };
  }

  app.statisticsService = {
    getBookStatistics,
    getTodayStatistics,
    getLast7DaysStatistics,
    getCurrentStreak,
    getLongestStreak,
    getMasteryDistribution,
    dateFromKey,
  };
})(window.CETWords);
