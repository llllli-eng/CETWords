/**
 * 拾词 · 本地学习数据服务 v13
 * 保持原有 localStorage key，只保存用户状态，不复制词库正文。
 */

(function registerStorageService(app) {
  const { reviewScheduler, reviewRecovery, newWordLearning, smartLearningOrder, dailyGroupService } = app;
  const STORAGE_KEY = "cetwords-user-data-v1";
  const DATA_VERSION = 13;
  const AI_PROXY_TOKEN_KEY = "shi-ci-ai-proxy-token";
  const DEFAULT_STUDY_MODE = "en-to-zh";
  const DEFAULT_LEARNING_ORDER = "smart";
  const DAILY_GOAL_OPTIONS = Object.freeze([10, 20, 30, 40, 50, 80, 100]);

  const EMPTY_WORD_PROGRESS = {
    learned: false,
    correctCount: 0,
    partialCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    masteryLevel: 0,
    reviewCount: 0,
    favorite: false,
    inWrongBook: false,
    lastStudyTime: null,
    lastWrongTime: null,
    lastReviewTime: null,
    nextReviewTime: null,
    nextReviewDate: null,
    lastLongTermAnchorAt: null,
    earliestReviewAt: null,
    firstLearnDate: null,
  };

  const EMPTY_DAILY_STATS = {
    newWords: 0,
    reviewWords: 0,
    answerCount: 0,
    correctCount: 0,
    partialCount: 0,
    wrongCount: 0,
    modeStats: {},
    completedNewWords: 0,
    newWordIds: [],
    completedNewWordIds: [],
    reviewedWordIds: [],
    scheduledNewWordIds: [],
    normalSessionAnswerSequence: 0,
    learningMetrics: {
      firstChoice: { correct: 0, wrong: 0 },
      choiceRetryCount: 0,
      reinforcement: { correct: 0, partial: 0, wrong: 0 },
      formalReview: { correct: 0, partial: 0, wrong: 0 },
      recovery: { entered: 0, attempts: 0, correct: 0, partial: 0, wrong: 0, pendingCount: 0 },
      choiceModes: {
        "en-to-zh": { answerCount: 0, correctCount: 0, wrongCount: 0 },
        "zh-to-en": { answerCount: 0, correctCount: 0, wrongCount: 0 },
      },
      words: {},
    },
  };

  const EMPTY_AI_STATS = {
    requestCount: 0,
    localJudgeCount: 0,
    aiJudgeCount: 0,
    fallbackCount: 0,
    correctCount: 0,
    partialCount: 0,
    wrongCount: 0,
    promptTokens: 0,
    completionTokens: 0,
  };

  let memoryData = null;
  let storageAvailable = true;
  let recoveredInvalidData = false;
  let migrationPerformed = false;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getLocalDateKey(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createEmptyBookData() {
    return {
      words: {},
      daily: {},
      newWordQueue: [],
      smartNewWordQueue: smartLearningOrder.normalizeQueueState(null),
      newWordLearning: {},
      reviewRecovery: {},
      dailyReviews: {},
      dailyGroupPlans: {},
    };
  }

  function createDefaultData() {
    return {
      version: DATA_VERSION,
      currentBook: "cet4",
      preferences: {
        theme: null,
        dailyNewWordGoals: { cet4: 30, cet6: 30 },
        vocabularyScope: { cet4: "core", cet6: "core" },
        studyMode: DEFAULT_STUDY_MODE,
        learningOrder: DEFAULT_LEARNING_ORDER,
        aiJudge: { enabled: false, proxyUrl: "" },
        lastExportTime: null,
      },
      aiStats: deepClone(EMPTY_AI_STATS),
      books: {
        cet4: createEmptyBookData(),
        cet6: createEmptyBookData(),
      },
    };
  }

  function toNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function normalizeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeStringIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => typeof item === "string" && item.trim()))];
  }

  function normalizeGoal(value) {
    const goal = Number(value);
    return DAILY_GOAL_OPTIONS.includes(goal) ? goal : 30;
  }

  function normalizeVocabularyScope(value) {
    return value === "all" ? "all" : "core";
  }

  function normalizeStudyMode(value) {
    return value === "zh-to-en" ? "zh-to-en" : DEFAULT_STUDY_MODE;
  }

  function normalizeLearningOrder(value) {
    return value === "random" ? "random" : DEFAULT_LEARNING_ORDER;
  }

  function normalizeProxyUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function normalizeAiJudgeSettings(raw, sourceVersion = DATA_VERSION) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      enabled: sourceVersion >= 7 && Boolean(value.enabled),
      proxyUrl: normalizeProxyUrl(value.proxyUrl),
    };
  }

  function normalizeAiStats(raw) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const result = {};
    Object.keys(EMPTY_AI_STATS).forEach((key) => {
      result[key] = toNonNegativeInteger(value[key]);
    });
    return result;
  }

  function normalizeModeStats(raw) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const result = {};
    for (const mode of ["en-to-zh", "zh-to-en"]) {
      if (!value[mode] || typeof value[mode] !== "object") continue;
      result[mode] = {
        answerCount: toNonNegativeInteger(value[mode].answerCount),
        correctCount: toNonNegativeInteger(value[mode].correctCount),
        partialCount: toNonNegativeInteger(value[mode].partialCount),
        wrongCount: toNonNegativeInteger(value[mode].wrongCount),
      };
    }
    return result;
  }

  function normalizeLearningMetrics(raw) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const firstChoice = value.firstChoice && typeof value.firstChoice === "object" ? value.firstChoice : {};
    const reinforcement = value.reinforcement && typeof value.reinforcement === "object" ? value.reinforcement : {};
    const formalReview = value.formalReview && typeof value.formalReview === "object" ? value.formalReview : {};
    const recovery = value.recovery && typeof value.recovery === "object" ? value.recovery : {};
    const choiceModes = value.choiceModes && typeof value.choiceModes === "object" ? value.choiceModes : {};
    const words = {};
    if (value.words && typeof value.words === "object" && !Array.isArray(value.words)) {
      Object.entries(value.words).forEach(([wordId, entry]) => {
        if (typeof wordId !== "string" || !wordId.trim() || !entry || typeof entry !== "object") return;
        words[wordId] = {
          choiceWrongCount: toNonNegativeInteger(entry.choiceWrongCount),
          choiceRetryCount: toNonNegativeInteger(entry.choiceRetryCount),
          reinforcementWrongCount: toNonNegativeInteger(entry.reinforcementWrongCount),
          reinforcementPartialCount: toNonNegativeInteger(entry.reinforcementPartialCount),
          eventuallyPassed: Boolean(entry.eventuallyPassed),
          formalReviewResult: ["correct", "partial", "wrong"].includes(entry.formalReviewResult)
            ? entry.formalReviewResult
            : null,
          formalReviewPartialCount: toNonNegativeInteger(entry.formalReviewPartialCount),
          formalReviewWrongCount: toNonNegativeInteger(entry.formalReviewWrongCount),
          recoveryAttempts: toNonNegativeInteger(entry.recoveryAttempts),
          recoveryPartialCount: toNonNegativeInteger(entry.recoveryPartialCount),
          recoveryWrongCount: toNonNegativeInteger(entry.recoveryWrongCount),
          recoveryFinalResult: ["correct", "partial", "wrong"].includes(entry.recoveryFinalResult)
            ? entry.recoveryFinalResult
            : null,
          recoveryPending: Boolean(entry.recoveryPending),
        };
      });
    }
    return {
      firstChoice: {
        correct: toNonNegativeInteger(firstChoice.correct),
        wrong: toNonNegativeInteger(firstChoice.wrong),
      },
      choiceRetryCount: toNonNegativeInteger(value.choiceRetryCount),
      reinforcement: {
        correct: toNonNegativeInteger(reinforcement.correct),
        partial: toNonNegativeInteger(reinforcement.partial),
        wrong: toNonNegativeInteger(reinforcement.wrong),
      },
      formalReview: {
        correct: toNonNegativeInteger(formalReview.correct),
        partial: toNonNegativeInteger(formalReview.partial),
        wrong: toNonNegativeInteger(formalReview.wrong),
      },
      recovery: {
        entered: toNonNegativeInteger(recovery.entered),
        attempts: toNonNegativeInteger(recovery.attempts),
        correct: toNonNegativeInteger(recovery.correct),
        partial: toNonNegativeInteger(recovery.partial),
        wrong: toNonNegativeInteger(recovery.wrong),
        pendingCount: toNonNegativeInteger(recovery.pendingCount),
      },
      choiceModes: {
        "en-to-zh": {
          answerCount: toNonNegativeInteger(choiceModes["en-to-zh"]?.answerCount),
          correctCount: toNonNegativeInteger(choiceModes["en-to-zh"]?.correctCount),
          wrongCount: toNonNegativeInteger(choiceModes["en-to-zh"]?.wrongCount),
        },
        "zh-to-en": {
          answerCount: toNonNegativeInteger(choiceModes["zh-to-en"]?.answerCount),
          correctCount: toNonNegativeInteger(choiceModes["zh-to-en"]?.correctCount),
          wrongCount: toNonNegativeInteger(choiceModes["zh-to-en"]?.wrongCount),
        },
      },
      words,
    };
  }

  function normalizeDailyReviewRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const generatedAt = normalizeIsoTime(raw.generatedAt);
    const target = toNonNegativeInteger(raw.dailyTarget);
    const completedNewWords = toNonNegativeInteger(raw.completedNewWords);
    const reviewValue = raw.review && typeof raw.review === "object" && !Array.isArray(raw.review)
      ? raw.review
      : null;
    const normalizeReviewList = (value, maximum, length = 180) => Array.isArray(value)
      ? value.slice(0, maximum).map((item) => String(item || "").trim().slice(0, length)).filter(Boolean)
      : [];
    const review = reviewValue && String(reviewValue.summary || "").trim()
      ? {
        summary: String(reviewValue.summary).trim().slice(0, 400),
        strengths: normalizeReviewList(reviewValue.strengths, 5),
        weaknesses: normalizeReviewList(reviewValue.weaknesses, 5),
        focusWords: Array.isArray(reviewValue.focusWords)
          ? reviewValue.focusWords.slice(0, 10).map((entry) => ({
            word: String(entry?.word || "").trim().slice(0, 100),
            reason: String(entry?.reason || "").trim().slice(0, 220),
            suggestion: String(entry?.suggestion || "").trim().slice(0, 220),
          })).filter((entry) => entry.word && entry.reason && entry.suggestion)
          : [],
        tomorrowAdvice: normalizeReviewList(reviewValue.tomorrowAdvice, 5),
      }
      : null;
    if (!generatedAt || !review) return null;
    return {
      generatedAt,
      dailyTarget: target,
      completedNewWords,
      stale: Boolean(raw.stale),
      review,
      usage: {
        promptTokens: toNonNegativeInteger(raw.usage?.promptTokens),
        completionTokens: toNonNegativeInteger(raw.usage?.completionTokens),
      },
    };
  }

  function normalizeDailyGroupPlan(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const target = toNonNegativeInteger(raw.dailyTarget);
    const validation = dailyGroupService.validateGroupPlan({
      groupSizes: raw.groupSizes,
      breakMinutes: raw.breakMinutes,
      reason: raw.reason,
    }, target);
    if (!target || !validation.valid) return null;
    return {
      dailyTarget: target,
      ...validation.value,
      source: raw.source === "ai" ? "ai" : "local",
      createdAt: normalizeTimestamp(raw.createdAt) || Date.now(),
      startedAt: normalizeTimestamp(raw.startedAt),
      activeGroupIndex: Math.min(
        Math.max(0, toNonNegativeInteger(raw.activeGroupIndex)),
        validation.value.groupSizes.length - 1,
      ),
      completedGroupCount: Math.min(
        toNonNegativeInteger(raw.completedGroupCount),
        validation.value.groupSizes.length,
      ),
      breakStartedAt: normalizeTimestamp(raw.breakStartedAt),
      usage: {
        promptTokens: toNonNegativeInteger(raw.usage?.promptTokens),
        completionTokens: toNonNegativeInteger(raw.usage?.completionTokens),
      },
    };
  }

  function normalizeIsoTime(value) {
    if (typeof value !== "string") return null;
    return Number.isFinite(Date.parse(value)) ? value : null;
  }

  function normalizeWordProgress(raw, sourceVersion = DATA_VERSION, migrationNow = Date.now()) {
    const value = raw && typeof raw === "object" ? raw : {};
    const learned = Boolean(value.learned);
    const consecutiveCorrect = toNonNegativeInteger(value.consecutiveCorrect);
    const hasV2Mastery = sourceVersion >= 2 && Number.isFinite(Number(value.masteryLevel));
    const masteryLevel = hasV2Mastery
      ? Math.min(5, toNonNegativeInteger(value.masteryLevel))
      : learned
        ? Math.min(3, consecutiveCorrect)
        : 0;
    const lastStudyTime = normalizeTimestamp(value.lastStudyTime);
    const lastReviewTime = normalizeTimestamp(value.lastReviewTime);
    const savedNextReview = normalizeTimestamp(value.nextReviewTime);
    const legacyNextReview = savedNextReview || (sourceVersion < 5 && learned ? migrationNow : null);
    const storedLongTermAnchor = normalizeTimestamp(value.lastLongTermAnchorAt);
    const recentLegacyAnchor = [
      storedLongTermAnchor,
      normalizeTimestamp(value.recoveryCompletedAt),
      normalizeTimestamp(value.lastReviewAt),
      lastReviewTime,
      normalizeTimestamp(value.lastLearnedAt),
      normalizeTimestamp(value.lastStudyAt),
      lastStudyTime,
    ].filter(Boolean).sort((left, right) => right - left)[0] || null;
    const nextReviewDate = learned && masteryLevel > 0
      ? (sourceVersion >= 13
        ? reviewScheduler.normalizeLocalDateKey(value.nextReviewDate)
          || (legacyNextReview ? reviewScheduler.getLocalDateKey(legacyNextReview) : null)
        : legacyNextReview ? reviewScheduler.getLocalDateKey(legacyNextReview) : null)
      : null;
    const inferredLegacyL1Anchor = sourceVersion < 13 && masteryLevel === 1 && legacyNextReview
      ? legacyNextReview - reviewScheduler.REVIEW_INTERVALS[1]
      : null;
    const lastLongTermAnchorAt = learned && masteryLevel > 0 && nextReviewDate
      ? (sourceVersion >= 13
        ? storedLongTermAnchor
        : recentLegacyAnchor || inferredLegacyL1Anchor)
      : null;
    const savedEarliestReviewAt = sourceVersion >= 13
      ? normalizeTimestamp(value.earliestReviewAt)
      : null;
    const earliestReviewAt = learned && masteryLevel === 1 && nextReviewDate
      ? (savedEarliestReviewAt
        || (lastLongTermAnchorAt ? lastLongTermAnchorAt + reviewScheduler.L1_MINIMUM_DELAY : null))
      : null;

    return {
      learned,
      correctCount: toNonNegativeInteger(value.correctCount),
      partialCount: toNonNegativeInteger(value.partialCount),
      wrongCount: toNonNegativeInteger(value.wrongCount),
      consecutiveCorrect,
      masteryLevel,
      reviewCount: toNonNegativeInteger(value.reviewCount),
      favorite: Boolean(value.favorite),
      inWrongBook: Boolean(value.inWrongBook),
      lastStudyTime,
      lastWrongTime: normalizeTimestamp(value.lastWrongTime),
      lastReviewTime,
      nextReviewTime: learned && masteryLevel === 0 ? legacyNextReview : null,
      nextReviewDate,
      lastLongTermAnchorAt,
      earliestReviewAt,
      firstLearnDate:
        typeof value.firstLearnDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.firstLearnDate)
          ? value.firstLearnDate
          : null,
    };
  }

  function normalizeDailyStats(raw, sourceVersion = DATA_VERSION) {
    const value = raw && typeof raw === "object" ? raw : {};
    const newWordIds = normalizeStringIds(value.newWordIds);
    const completedNewWordIds = sourceVersion < 5
      ? [...newWordIds]
      : normalizeStringIds(value.completedNewWordIds);
    const completedNewWords = sourceVersion < 5
      ? Math.max(toNonNegativeInteger(value.newWords), completedNewWordIds.length)
      : completedNewWordIds.length;
    const reviewedWordIds = normalizeStringIds(value.reviewedWordIds);
    const scheduledNewWordIds = normalizeStringIds([
      ...normalizeStringIds(value.scheduledNewWordIds),
      ...newWordIds,
    ]);

    return {
      newWords: Math.max(toNonNegativeInteger(value.newWords), newWordIds.length),
      reviewWords: Math.max(toNonNegativeInteger(value.reviewWords), reviewedWordIds.length),
      answerCount: toNonNegativeInteger(value.answerCount),
      correctCount: toNonNegativeInteger(value.correctCount),
      partialCount: toNonNegativeInteger(value.partialCount),
      wrongCount: toNonNegativeInteger(value.wrongCount),
      modeStats: normalizeModeStats(value.modeStats),
      completedNewWords,
      newWordIds,
      completedNewWordIds,
      reviewedWordIds,
      scheduledNewWordIds,
      normalSessionAnswerSequence: toNonNegativeInteger(value.normalSessionAnswerSequence),
      learningMetrics: normalizeLearningMetrics(value.learningMetrics),
    };
  }

  function normalizeBookData(raw, sourceVersion, migrationNow) {
    const value = raw && typeof raw === "object" ? raw : {};
    const result = createEmptyBookData();
    result.newWordQueue = normalizeStringIds(value.newWordQueue);
    result.smartNewWordQueue = smartLearningOrder.normalizeQueueState(value.smartNewWordQueue);
    if (sourceVersion >= 11 && value.reviewRecovery && typeof value.reviewRecovery === "object" && !Array.isArray(value.reviewRecovery)) {
      Object.entries(value.reviewRecovery).forEach(([wordId, record]) => {
        if (typeof wordId !== "string" || !wordId.trim()) return;
        const normalized = reviewRecovery.normalizeRecord(record);
        if (normalized?.active) result.reviewRecovery[wordId] = normalized;
      });
    }
    if (sourceVersion >= 10 && value.dailyReviews && typeof value.dailyReviews === "object" && !Array.isArray(value.dailyReviews)) {
      Object.entries(value.dailyReviews).forEach(([dateKey, record]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
        const normalized = normalizeDailyReviewRecord(record);
        if (normalized) result.dailyReviews[dateKey] = normalized;
      });
    }
    if (sourceVersion >= 12 && value.dailyGroupPlans && typeof value.dailyGroupPlans === "object" && !Array.isArray(value.dailyGroupPlans)) {
      Object.entries(value.dailyGroupPlans).forEach(([dateKey, record]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
        const normalized = normalizeDailyGroupPlan(record);
        if (normalized) result.dailyGroupPlans[dateKey] = normalized;
      });
    }

    if (sourceVersion >= 5 && value.newWordLearning && typeof value.newWordLearning === "object" && !Array.isArray(value.newWordLearning)) {
      Object.entries(value.newWordLearning).forEach(([wordId, record]) => {
        if (typeof wordId === "string" && wordId.trim()) {
          result.newWordLearning[wordId] = newWordLearning.normalizeLearningRecord(record, {
            sourceVersion,
            migrationNow,
          });
        }
      });
    }

    if (value.words && typeof value.words === "object" && !Array.isArray(value.words)) {
      Object.entries(value.words).forEach(([wordId, progress]) => {
        if (typeof wordId === "string" && wordId.trim()) {
          result.words[wordId] = normalizeWordProgress(progress, sourceVersion, migrationNow);
        }
      });
    }

    if (value.daily && typeof value.daily === "object" && !Array.isArray(value.daily)) {
      Object.entries(value.daily).forEach(([dateKey, stats]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          result.daily[dateKey] = normalizeDailyStats(stats, sourceVersion);
        }
      });
    }

    return result;
  }

  function normalizeUserData(raw, migrationNow = Date.now()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return createDefaultData();
    }

    const sourceVersion = Math.max(1, toNonNegativeInteger(raw.version) || 1);
    if (sourceVersion > DATA_VERSION) {
      recoveredInvalidData = true;
      return createDefaultData();
    }

    const legacyGlobalGoal = normalizeGoal(raw.preferences?.dailyNewWordGoal);
    const rawGoals = raw.preferences?.dailyNewWordGoals;

    return {
      version: DATA_VERSION,
      currentBook: raw.currentBook === "cet6" ? "cet6" : "cet4",
      preferences: {
        theme: raw.preferences?.theme === "dark" || raw.preferences?.theme === "light"
          ? raw.preferences.theme
          : null,
        dailyNewWordGoals: {
          cet4: normalizeGoal(rawGoals?.cet4 ?? legacyGlobalGoal),
          cet6: normalizeGoal(rawGoals?.cet6 ?? legacyGlobalGoal),
        },
        vocabularyScope: {
          cet4: normalizeVocabularyScope(raw.preferences?.vocabularyScope?.cet4),
          cet6: normalizeVocabularyScope(raw.preferences?.vocabularyScope?.cet6),
        },
        studyMode: normalizeStudyMode(raw.preferences?.studyMode),
        learningOrder: sourceVersion >= 9
          ? normalizeLearningOrder(raw.preferences?.learningOrder)
          : DEFAULT_LEARNING_ORDER,
        aiJudge: normalizeAiJudgeSettings(raw.preferences?.aiJudge, sourceVersion),
        lastExportTime: normalizeIsoTime(raw.preferences?.lastExportTime),
      },
      aiStats: normalizeAiStats(raw.aiStats),
      books: {
        cet4: normalizeBookData(raw.books?.cet4, sourceVersion, migrationNow),
        cet6: normalizeBookData(raw.books?.cet6, sourceVersion, migrationNow),
      },
    };
  }

  function getMutableData() {
    if (memoryData) return memoryData;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        memoryData = createDefaultData();
        return memoryData;
      }

      const parsed = JSON.parse(stored);
      const previousVersion = toNonNegativeInteger(parsed?.version) || 1;
      memoryData = normalizeUserData(parsed);

      if (previousVersion < DATA_VERSION) {
        migrationPerformed = true;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryData));
        } catch {
          storageAvailable = false;
        }
      }

      return memoryData;
    } catch {
      storageAvailable = false;
      recoveredInvalidData = true;
      memoryData = createDefaultData();
      return memoryData;
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getMutableData()));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      return false;
    }
  }

  function ensureBook(bookId) {
    if (bookId !== "cet4" && bookId !== "cet6") {
      throw new Error(`未知词库：${bookId}`);
    }
    return getMutableData().books[bookId];
  }

  function ensureWordProgress(bookId, wordId) {
    const book = ensureBook(bookId);
    if (!book.words[wordId]) {
      book.words[wordId] = deepClone(EMPTY_WORD_PROGRESS);
    }
    return book.words[wordId];
  }

  function ensureDailyStats(bookId, dateKey) {
    const book = ensureBook(bookId);
    if (!book.daily[dateKey]) {
      book.daily[dateKey] = deepClone(EMPTY_DAILY_STATS);
    }
    return book.daily[dateKey];
  }

  function addUniqueId(list, wordId) {
    if (list.includes(wordId)) return false;
    list.push(wordId);
    return true;
  }

  function shuffleIds(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function isWordMastered(progress) {
    return reviewScheduler.getMasteryLevel(progress) >= 5;
  }

  function loadUserData() {
    return deepClone(getMutableData());
  }

  function saveUserData(data) {
    const previousVersion = toNonNegativeInteger(data?.version) || 1;
    memoryData = normalizeUserData(data);
    if (previousVersion < DATA_VERSION) migrationPerformed = true;
    return persist();
  }

  function getCurrentBook() {
    return getMutableData().currentBook;
  }

  function setCurrentBook(bookId) {
    ensureBook(bookId);
    getMutableData().currentBook = bookId;
    persist();
  }

  function getPreference(name) {
    if (name !== "theme") return null;
    const saved = getMutableData().preferences.theme;
    if (saved) return saved;

    try {
      const legacyTheme = window.localStorage.getItem("cetwords-theme");
      return legacyTheme === "dark" || legacyTheme === "light" ? legacyTheme : null;
    } catch {
      return null;
    }
  }

  function setPreference(name, value) {
    if (name !== "theme") return false;
    getMutableData().preferences.theme = value === "dark" ? "dark" : "light";
    return persist();
  }

  function getConfiguredDailyNewWordGoal(bookId) {
    ensureBook(bookId);
    return normalizeGoal(getMutableData().preferences.dailyNewWordGoals[bookId]);
  }

  function getDailyNewWordGoal(bookId, timestamp = Date.now()) {
    ensureBook(bookId);
    const configured = getConfiguredDailyNewWordGoal(bookId);
    const dateKey = getLocalDateKey(timestamp);
    const plan = getMutableData().books[bookId].dailyGroupPlans[dateKey];
    const daily = getMutableData().books[bookId].daily[dateKey];
    const startedCount = normalizeStringIds(daily?.newWordIds).length;
    if (plan && startedCount > 0 && configured < plan.dailyTarget) return plan.dailyTarget;
    return configured;
  }

  function setDailyNewWordGoal(bookId, goal) {
    ensureBook(bookId);
    const normalizedGoal = normalizeGoal(goal);
    getMutableData().preferences.dailyNewWordGoals[bookId] = normalizedGoal;
    const todayReview = getMutableData().books[bookId].dailyReviews[getLocalDateKey()];
    if (todayReview && normalizedGoal !== todayReview.dailyTarget) todayReview.stale = true;
    persist();
    return normalizedGoal;
  }

  function getDailyGroupPlan(bookId, dateKey = getLocalDateKey()) {
    const plan = ensureBook(bookId).dailyGroupPlans[dateKey];
    return plan ? deepClone(plan) : null;
  }

  function saveDailyGroupPlan(bookId, dateKey, record, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const normalized = normalizeDailyGroupPlan({ ...record, createdAt: record?.createdAt || now });
    if (!normalized) return null;
    ensureBook(bookId).dailyGroupPlans[dateKey] = normalized;
    persist();
    return deepClone(normalized);
  }

  function removeDailyGroupPlan(bookId, dateKey = getLocalDateKey()) {
    const book = ensureBook(bookId);
    if (!book.dailyGroupPlans[dateKey]) return false;
    delete book.dailyGroupPlans[dateKey];
    persist();
    return true;
  }

  function updateDailyGroupProgress(bookId, dateKey = getLocalDateKey()) {
    const book = ensureBook(bookId);
    const plan = book.dailyGroupPlans[dateKey];
    if (!plan) return null;
    const daily = ensureDailyStats(bookId, dateKey);
    const progress = dailyGroupService.getGroupProgress(
      plan,
      daily.scheduledNewWordIds,
      daily.completedNewWordIds,
      daily.newWordIds,
    );
    if (!progress) return null;
    plan.completedGroupCount = progress.completedGroupCount;
    if (progress.completedGroupCount >= plan.groupSizes.length) {
      plan.activeGroupIndex = Math.max(0, plan.groupSizes.length - 1);
      plan.breakStartedAt = null;
    }
    persist();
    return { plan: deepClone(plan), progress };
  }

  function startDailyGroupBreak(bookId, dateKey = getLocalDateKey(), now = Date.now()) {
    const plan = ensureBook(bookId).dailyGroupPlans[dateKey];
    if (!plan) return null;
    plan.breakStartedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    persist();
    return deepClone(plan);
  }

  function markDailyGroupStarted(bookId, dateKey = getLocalDateKey(), now = Date.now()) {
    const plan = ensureBook(bookId).dailyGroupPlans[dateKey];
    if (!plan) return null;
    if (!plan.startedAt) plan.startedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    persist();
    return deepClone(plan);
  }

  function advanceDailyGroup(bookId, dateKey = getLocalDateKey()) {
    const book = ensureBook(bookId);
    const plan = book.dailyGroupPlans[dateKey];
    if (!plan) return null;
    const progress = dailyGroupService.getGroupProgress(
      plan,
      ensureDailyStats(bookId, dateKey).scheduledNewWordIds,
      ensureDailyStats(bookId, dateKey).completedNewWordIds,
      ensureDailyStats(bookId, dateKey).newWordIds,
    );
    if (!progress?.activeGroup?.complete || progress.allComplete) return deepClone(plan);
    plan.activeGroupIndex = Math.min(plan.activeGroupIndex + 1, plan.groupSizes.length - 1);
    plan.completedGroupCount = Math.max(plan.completedGroupCount, plan.activeGroupIndex);
    plan.breakStartedAt = null;
    persist();
    return deepClone(plan);
  }

  function adjustDailyGroupPlanTarget(bookId, newTarget, dateKey = getLocalDateKey()) {
    const book = ensureBook(bookId);
    const plan = book.dailyGroupPlans[dateKey];
    if (!plan) return { action: "none", plan: null };
    const target = normalizeGoal(newTarget);
    const daily = ensureDailyStats(bookId, dateKey);
    if (daily.newWordIds.length === 0 && !plan.startedAt) {
      delete book.dailyGroupPlans[dateKey];
      persist();
      return { action: "regenerate", plan: null };
    }
    if (target === plan.dailyTarget) return { action: "unchanged", plan: deepClone(plan) };
    const progress = dailyGroupService.getGroupProgress(plan, daily.scheduledNewWordIds, daily.completedNewWordIds, daily.newWordIds);
    const protectedGroupCount = Math.min(plan.groupSizes.length, (progress?.activeGroupIndex || 0) + 1);
    const protectedSizes = plan.groupSizes.slice(0, protectedGroupCount);
    const protectedTarget = protectedSizes.reduce((total, size) => total + size, 0);
    if (target < protectedTarget || target < daily.newWordIds.length) {
      return {
        action: "deferred",
        plan: deepClone(plan),
        protectedTarget,
        introducedCount: daily.newWordIds.length,
      };
    }
    if (target > plan.dailyTarget) {
      plan.groupSizes.push(...dailyGroupService.createFallbackGroupSizes(target - plan.dailyTarget));
      plan.dailyTarget = target;
      plan.breakStartedAt = null;
      plan.source = "local";
      plan.reason = "已保留原有分组，新增目标使用本地稳定分组追加。";
      persist();
      return { action: "extended", plan: deepClone(plan) };
    }
    const remaining = target - protectedTarget;
    plan.dailyTarget = target;
    plan.groupSizes = [
      ...protectedSizes,
      ...dailyGroupService.createFallbackGroupSizes(remaining),
    ];
    plan.activeGroupIndex = Math.min(plan.activeGroupIndex, plan.groupSizes.length - 1);
    plan.completedGroupCount = Math.min(plan.completedGroupCount, plan.groupSizes.length);
    plan.breakStartedAt = null;
    plan.source = "local";
    plan.reason = target > protectedTarget
      ? "已保留完成组和当前组，新增目标使用本地稳定分组追加。"
      : "已保留完成组和当前组，并安全移除尚未开始的后续组。";
    persist();
    return { action: "reduced", plan: deepClone(plan) };
  }

  function getVocabularyScope(bookId) {
    ensureBook(bookId);
    return normalizeVocabularyScope(getMutableData().preferences.vocabularyScope[bookId]);
  }

  function getStudyMode() {
    return normalizeStudyMode(getMutableData().preferences.studyMode);
  }

  function getLearningOrder() {
    return normalizeLearningOrder(getMutableData().preferences.learningOrder);
  }

  function setLearningOrder(order) {
    const normalized = normalizeLearningOrder(order);
    getMutableData().preferences.learningOrder = normalized;
    persist();
    return normalized;
  }

  function setStudyMode(mode) {
    const normalizedMode = normalizeStudyMode(mode);
    getMutableData().preferences.studyMode = normalizedMode;
    persist();
    return normalizedMode;
  }

  function getAiJudgeSettings() {
    return { ...getMutableData().preferences.aiJudge };
  }

  function setAiJudgeSettings(settings = {}) {
    const current = getMutableData().preferences.aiJudge;
    getMutableData().preferences.aiJudge = normalizeAiJudgeSettings({
      enabled: settings.enabled ?? current.enabled,
      proxyUrl: settings.proxyUrl ?? current.proxyUrl,
    });
    persist();
    return getAiJudgeSettings();
  }

  function getAiProxyToken() {
    try {
      return String(window.localStorage.getItem(AI_PROXY_TOKEN_KEY) || "");
    } catch {
      return "";
    }
  }

  function setAiProxyToken(token) {
    const normalized = typeof token === "string" ? token.trim() : "";
    try {
      if (normalized) window.localStorage.setItem(AI_PROXY_TOKEN_KEY, normalized);
      else window.localStorage.removeItem(AI_PROXY_TOKEN_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function getAiStats() {
    return { ...getMutableData().aiStats };
  }

  function recordAiRequest() {
    getMutableData().aiStats.requestCount += 1;
    persist();
    return getAiStats();
  }

  function updateAiJudgementStats({ source, judgement, usage } = {}, shouldPersist = true) {
    const stats = getMutableData().aiStats;
    if (source === "local") stats.localJudgeCount += 1;
    if (source === "deepseek") stats.aiJudgeCount += 1;
    if (source === "manual-fallback") stats.fallbackCount += 1;
    if (["correct", "partial", "wrong"].includes(judgement)) {
      stats[`${judgement}Count`] += 1;
    }
    stats.promptTokens += toNonNegativeInteger(usage?.promptTokens);
    stats.completionTokens += toNonNegativeInteger(usage?.completionTokens);
    if (shouldPersist) persist();
    return getAiStats();
  }

  function recordAiJudgement(details) {
    return updateAiJudgementStats(details, true);
  }

  function setVocabularyScope(bookId, scope) {
    ensureBook(bookId);
    const normalizedScope = normalizeVocabularyScope(scope);
    getMutableData().preferences.vocabularyScope[bookId] = normalizedScope;
    persist();
    return normalizedScope;
  }

  function getLastExportTime() {
    return getMutableData().preferences.lastExportTime;
  }

  function setLastExportTime(timestamp) {
    const normalized = normalizeIsoTime(timestamp);
    if (!normalized) return false;
    getMutableData().preferences.lastExportTime = normalized;
    return persist();
  }

  function getWordProgress(bookId, wordId) {
    const stored = ensureBook(bookId).words[wordId];
    return normalizeWordProgress(stored || EMPTY_WORD_PROGRESS);
  }

  function updateWordProgress(bookId, wordId, isCorrect, context = {}) {
    const safeContext = typeof context === "number" ? { timestamp: context } : context;
    const timestamp = Number.isFinite(Number(safeContext.timestamp))
      ? Number(safeContext.timestamp)
      : Date.now();
    const book = ensureBook(bookId);
    const progress = ensureWordProgress(bookId, wordId);
    const dateKey = getLocalDateKey(timestamp);
    const daily = ensureDailyStats(bookId, dateKey);
    const judgement = ["correct", "partial", "wrong"].includes(safeContext.judgement)
      ? safeContext.judgement
      : isCorrect ? "correct" : "wrong";
    const correct = judgement === "correct";
    const wasLearned = progress.learned;
    const wasDue = reviewScheduler.isDueForReview(progress, timestamp);
    const taskType = safeContext.taskType || (!wasLearned ? "new" : wasDue ? "review" : "practice");
    const studyMode = normalizeStudyMode(safeContext.studyMode);
    const sessionMode = safeContext.sessionMode
      || (taskType === "review" ? "review" : "normal");
    const phaseValues = [
      ...Object.values(newWordLearning.LEARNING_PHASES),
      reviewRecovery.FORMAL_REVIEW_PHASE,
      reviewRecovery.RECOVERY_PHASE,
    ];
    let learningPhase = phaseValues.includes(safeContext.learningPhase)
      ? safeContext.learningPhase
      : (!wasLearned && taskType === "new" && sessionMode === "normal"
        ? newWordLearning.LEARNING_PHASES.INTRO
        : newWordLearning.LEARNING_PHASES.STANDARD_REVIEW);
    if (
      sessionMode !== "normal"
      && learningPhase !== reviewRecovery.FORMAL_REVIEW_PHASE
      && learningPhase !== reviewRecovery.RECOVERY_PHASE
    ) learningPhase = newWordLearning.LEARNING_PHASES.STANDARD_REVIEW;

    const existingLearningState = book.newWordLearning[wordId]
      ? newWordLearning.normalizeLearningRecord(book.newWordLearning[wordId])
      : null;
    const isPendingReinforcement = Boolean(existingLearningState)
      && newWordLearning.isPending(existingLearningState);
    if (
      (learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY
        || learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT)
      && !isPendingReinforcement
    ) {
      learningPhase = newWordLearning.LEARNING_PHASES.STANDARD_REVIEW;
    }
    if (
      isPendingReinforcement
      && learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY
      && !newWordLearning.isChoiceRetry(existingLearningState)
    ) learningPhase = newWordLearning.LEARNING_PHASES.STANDARD_REVIEW;
    if (
      isPendingReinforcement
      && learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT
      && !newWordLearning.isAiReinforcement(existingLearningState)
    ) learningPhase = newWordLearning.LEARNING_PHASES.STANDARD_REVIEW;

    if (sessionMode === "normal" || sessionMode === "review") daily.normalSessionAnswerSequence += 1;
    const answerSequence = daily.normalSessionAnswerSequence;
    const isFormalReview = learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE
      && wasLearned
      && taskType === "review";
    const isRecovery = learningPhase === reviewRecovery.RECOVERY_PHASE
      && wasLearned
      && Boolean(book.reviewRecovery[wordId]?.active);

    let updated;
    let learningState = existingLearningState;
    let recoveryState = book.reviewRecovery[wordId]
      ? reviewRecovery.normalizeRecord(book.reviewRecovery[wordId])
      : null;
    if (learningPhase === newWordLearning.LEARNING_PHASES.INTRO && !wasLearned) {
      updated = newWordLearning.handleIntro(progress, correct, { now: timestamp });
      learningState = newWordLearning.createPendingRecord({
        introStudyMode: studyMode,
        introCorrect: correct,
        now: timestamp,
        dateKey,
        sequence: answerSequence,
        random: safeContext.random || Math.random,
      });
      book.newWordLearning[wordId] = learningState;
      newWordLearning.debugSchedule(wordId, learningState);
    } else if (learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY) {
      updated = newWordLearning.handleChoiceAttempt(progress, correct, { now: timestamp });
      learningState = newWordLearning.markChoiceResult(existingLearningState, correct, {
        now: timestamp,
        dateKey,
        sequence: answerSequence,
        random: safeContext.random || Math.random,
      });
      book.newWordLearning[wordId] = learningState;
      newWordLearning.debugSchedule(wordId, learningState);
    } else if (learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT) {
      updated = judgement === "partial"
        ? newWordLearning.handleReinforcementPartial(progress, { now: timestamp })
        : newWordLearning.handleReinforcement(progress, correct, { now: timestamp });
      learningState = newWordLearning.markAiResult(existingLearningState, judgement, {
        now: timestamp,
        dateKey,
        sequence: answerSequence,
        random: safeContext.random || Math.random,
      });
      book.newWordLearning[wordId] = learningState;
      if (correct) addUniqueId(daily.completedNewWordIds, wordId);
      else newWordLearning.debugSchedule(wordId, learningState);
    } else if (isFormalReview) {
      if (judgement === "correct") {
        updated = reviewScheduler.handleCorrect(progress, true, { now: timestamp, isNew: false });
        delete book.reviewRecovery[wordId];
        recoveryState = null;
      } else {
        updated = judgement === "partial"
          ? reviewScheduler.handleFormalPartial(progress, { now: timestamp })
          : reviewScheduler.handleWrong(progress, true, { now: timestamp, isNew: false });
        updated = reviewScheduler.clearReviewSchedule(updated);
        recoveryState = reviewRecovery.createRecovery({
          sourceReviewResult: judgement,
          currentLevel: updated.masteryLevel,
          sessionId: safeContext.studySessionId,
          sequence: answerSequence,
          now: timestamp,
          random: safeContext.random || Math.random,
        });
        book.reviewRecovery[wordId] = recoveryState;
      }
    } else if (isRecovery) {
      updated = reviewScheduler.handleRecovery(progress, judgement, { now: timestamp });
      recoveryState = reviewRecovery.markRecoveryResult(recoveryState, judgement, {
        sessionId: safeContext.studySessionId,
        sequence: answerSequence,
        now: timestamp,
        random: safeContext.random || Math.random,
      });
      if (recoveryState?.active) {
        updated = reviewScheduler.clearReviewSchedule(updated);
        book.reviewRecovery[wordId] = recoveryState;
      } else {
        delete book.reviewRecovery[wordId];
      }
    } else if (isPendingReinforcement) {
      updated = newWordLearning.handlePendingPractice(progress, correct, { now: timestamp });
    } else {
      updated = correct
        ? reviewScheduler.handleCorrect(progress, isFormalReview, { now: timestamp, isNew: !wasLearned })
        : reviewScheduler.handleWrong(progress, isFormalReview, { now: timestamp, isNew: !wasLearned });
    }

    if (!updated.firstLearnDate) updated.firstLearnDate = dateKey;
    Object.assign(progress, normalizeWordProgress(updated));

    const learningMetrics = daily.learningMetrics;
    const isChoicePhase = sessionMode === "normal" && (
      learningPhase === newWordLearning.LEARNING_PHASES.INTRO
      || learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY
    );
    const isReinforcementPhase = sessionMode === "normal"
      && learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT;
    if ((isChoicePhase || isReinforcementPhase || isFormalReview || isRecovery) && !learningMetrics.words[wordId]) {
      learningMetrics.words[wordId] = {
        choiceWrongCount: 0,
        choiceRetryCount: 0,
        reinforcementWrongCount: 0,
        reinforcementPartialCount: 0,
        eventuallyPassed: false,
        formalReviewResult: null,
        formalReviewPartialCount: 0,
        formalReviewWrongCount: 0,
        recoveryAttempts: 0,
        recoveryPartialCount: 0,
        recoveryWrongCount: 0,
        recoveryFinalResult: null,
        recoveryPending: false,
      };
    }
    const wordMetrics = learningMetrics.words[wordId] || null;
    if (isChoicePhase) {
      const choiceMode = normalizeStudyMode(safeContext.studyMode);
      learningMetrics.choiceModes[choiceMode].answerCount += 1;
      learningMetrics.choiceModes[choiceMode][correct ? "correctCount" : "wrongCount"] += 1;
    }
    if (sessionMode === "normal" && learningPhase === newWordLearning.LEARNING_PHASES.INTRO) {
      learningMetrics.firstChoice[correct ? "correct" : "wrong"] += 1;
      if (!correct && wordMetrics) wordMetrics.choiceWrongCount += 1;
    }
    if (sessionMode === "normal" && learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY) {
      learningMetrics.choiceRetryCount += 1;
      if (wordMetrics) wordMetrics.choiceRetryCount += 1;
      if (!correct && wordMetrics) wordMetrics.choiceWrongCount += 1;
    }
    if (sessionMode === "normal" && learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT) {
      learningMetrics.reinforcement[judgement] += 1;
      if (judgement === "wrong" && wordMetrics) wordMetrics.reinforcementWrongCount += 1;
      if (judgement === "partial" && wordMetrics) wordMetrics.reinforcementPartialCount += 1;
      if (judgement === "correct" && wordMetrics) wordMetrics.eventuallyPassed = true;
    }
    if (isFormalReview) {
      learningMetrics.formalReview[judgement] += 1;
      if (wordMetrics) {
        wordMetrics.formalReviewResult = judgement;
        if (judgement === "partial") wordMetrics.formalReviewPartialCount += 1;
        if (judgement === "wrong") wordMetrics.formalReviewWrongCount += 1;
        wordMetrics.recoveryPending = judgement !== "correct";
      }
      if (judgement !== "correct") learningMetrics.recovery.entered += 1;
    }
    if (isRecovery) {
      learningMetrics.recovery.attempts += 1;
      learningMetrics.recovery[judgement] += 1;
      if (wordMetrics) {
        wordMetrics.recoveryAttempts += 1;
        if (judgement === "partial") wordMetrics.recoveryPartialCount += 1;
        if (judgement === "wrong") wordMetrics.recoveryWrongCount += 1;
        wordMetrics.recoveryFinalResult = judgement;
        wordMetrics.recoveryPending = Boolean(recoveryState?.active);
      }
    }
    learningMetrics.recovery.pendingCount = Object.values(book.reviewRecovery)
      .filter((record) => record?.active && record.pendingNextSession).length;

    daily.answerCount += 1;
    if (!daily.modeStats[studyMode]) {
      daily.modeStats[studyMode] = { answerCount: 0, correctCount: 0, partialCount: 0, wrongCount: 0 };
    }
    daily.modeStats[studyMode].answerCount += 1;
    if (!wasLearned && addUniqueId(daily.newWordIds, wordId)) daily.newWords += 1;
    if (isFormalReview && wasDue && addUniqueId(daily.reviewedWordIds, wordId)) daily.reviewWords += 1;
    daily.completedNewWords = daily.completedNewWordIds.length;

    if (judgement === "correct") {
      daily.correctCount += 1;
      daily.modeStats[studyMode].correctCount += 1;
    } else if (judgement === "partial") {
      daily.partialCount += 1;
      daily.modeStats[studyMode].partialCount += 1;
    } else {
      daily.wrongCount += 1;
      daily.modeStats[studyMode].wrongCount += 1;
    }

    if (["local", "deepseek", "manual-fallback"].includes(safeContext.judgementSource)) {
      updateAiJudgementStats({
        source: safeContext.judgementSource,
        judgement,
        usage: safeContext.aiUsage,
      }, false);
    }

    persist();
    return {
      progress: normalizeWordProgress(progress),
      daily: normalizeDailyStats(daily),
      mastered: isWordMastered(progress),
      taskType,
      studyMode,
      sessionMode,
      learningPhase,
      judgement,
      learningState: learningState ? newWordLearning.normalizeLearningRecord(learningState) : null,
      recoveryState: recoveryState ? reviewRecovery.normalizeRecord(recoveryState) : null,
      answerSequence,
      wasDue,
    };
  }

  function toggleFavorite(bookId, wordId) {
    const progress = ensureWordProgress(bookId, wordId);
    progress.favorite = !progress.favorite;
    persist();
    return progress.favorite;
  }

  function removeWrongWord(bookId, wordId) {
    const progress = ensureWordProgress(bookId, wordId);
    progress.inWrongBook = false;
    persist();
    return normalizeWordProgress(progress);
  }

  function setWrongBookState(bookId, wordId, inWrongBook) {
    const progress = ensureWordProgress(bookId, wordId);
    progress.inWrongBook = Boolean(inWrongBook);
    persist();
    return normalizeWordProgress(progress);
  }

  function getDailyStats(bookId, dateKey = getLocalDateKey()) {
    const stored = ensureBook(bookId).daily[dateKey];
    return normalizeDailyStats(stored || EMPTY_DAILY_STATS);
  }

  function getDailyReviewRecord(bookId, dateKey = getLocalDateKey()) {
    const record = ensureBook(bookId).dailyReviews[dateKey];
    return record ? deepClone(record) : null;
  }

  function saveDailyReviewRecord(bookId, dateKey, record, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const normalized = normalizeDailyReviewRecord({
      generatedAt: new Date(now).toISOString(),
      dailyTarget: record?.dailyTarget,
      completedNewWords: record?.completedNewWords,
      stale: false,
      review: record?.review,
      usage: record?.usage,
    });
    if (!normalized) return null;
    ensureBook(bookId).dailyReviews[dateKey] = normalized;
    persist();
    return deepClone(normalized);
  }

  function getNewWordLearningState(bookId, wordId) {
    const record = ensureBook(bookId).newWordLearning[wordId];
    return record ? newWordLearning.normalizeLearningRecord(record) : null;
  }

  function getReviewRecoveryState(bookId, wordId) {
    const record = ensureBook(bookId).reviewRecovery[wordId];
    return record ? reviewRecovery.normalizeRecord(record) : null;
  }

  function beginReviewRecoverySession(bookId, sessionId, validWordIds) {
    const book = ensureBook(bookId);
    const allowed = Array.isArray(validWordIds) ? new Set(validWordIds) : null;
    let changed = false;
    Object.entries(book.reviewRecovery).forEach(([wordId, record]) => {
      if (
        (!allowed || allowed.has(wordId))
        && record?.active
        && record.lastSessionId !== String(sessionId || "")
      ) {
        book.reviewRecovery[wordId] = reviewRecovery.beginSession(record, sessionId);
        changed = true;
      }
    });
    if (changed) persist();
    return changed;
  }

  function getReviewRecoveries(bookId, validWordIds, context = {}) {
    const book = ensureBook(bookId);
    const allowed = Array.isArray(validWordIds) ? new Set(validWordIds) : null;
    return Object.entries(book.reviewRecovery)
      .filter(([wordId, record]) => (!allowed || allowed.has(wordId)) && record?.active)
      .map(([wordId, record]) => {
        const recoveryState = reviewRecovery.normalizeRecord(record);
        return {
          wordId,
          recoveryState,
          progress: normalizeWordProgress(book.words[wordId] || EMPTY_WORD_PROGRESS),
          priority: reviewRecovery.getPriority(recoveryState, context),
        };
      })
      .sort((left, right) => left.priority - right.priority
        || Number(right.recoveryState.pendingNextSession) - Number(left.recoveryState.pendingNextSession)
        || (left.recoveryState.createdAt || 0) - (right.recoveryState.createdAt || 0));
  }

  function getReviewRecoverySummary(bookId, validWordIds, context = {}) {
    const entries = getReviewRecoveries(bookId, validWordIds, context);
    return {
      count: entries.length,
      pendingCount: entries.filter((entry) => entry.recoveryState.pendingNextSession).length,
      eligibleCount: entries.filter((entry) => Number.isFinite(entry.priority)).length,
      entries,
    };
  }

  function getPendingReinforcements(bookId, validWordIds, now = Date.now()) {
    const book = ensureBook(bookId);
    const allowed = Array.isArray(validWordIds) ? new Set(validWordIds) : null;
    const dateKey = getLocalDateKey(now);
    const daily = getDailyStats(bookId, dateKey);
    return Object.entries(book.newWordLearning)
      .filter(([wordId, record]) => {
        return (!allowed || allowed.has(wordId)) && newWordLearning.isPending(record);
      })
      .map(([wordId, record]) => {
        const learningState = newWordLearning.normalizeLearningRecord(record);
        return {
          wordId,
          learningState,
          eligible: newWordLearning.isEligible(
            learningState,
            daily.normalSessionAnswerSequence,
            dateKey,
            now,
          ),
          crossDay: newWordLearning.isCrossDayPending(learningState, dateKey),
          fallbackEligible: newWordLearning.isFallbackEligible(
            learningState,
            daily.normalSessionAnswerSequence,
            dateKey,
            now,
          ),
          riskScore: newWordLearning.getRiskScore(learningState),
        };
      })
      .sort((left, right) => {
        if (left.crossDay !== right.crossDay) return left.crossDay ? -1 : 1;
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
        return newWordLearning.comparePendingItems(left, right);
      });
  }

  function getPendingReinforcementSummary(bookId, validWordIds, now = Date.now()) {
    const dateKey = getLocalDateKey(now);
    const daily = getDailyStats(bookId, dateKey);
    const items = getPendingReinforcements(bookId, validWordIds, now);
    return {
      count: items.length,
      eligibleCount: items.filter((item) => item.eligible).length,
      normalSessionAnswerSequence: daily.normalSessionAnswerSequence,
      items,
    };
  }

  /**
   * Return today's persisted new-word assignment, extending but never replacing it.
   * A stored queue is consumed before it is refilled, so every unseen word receives
   * a turn before previously skipped words are shuffled into a later cycle.
   */
  function getOrCreateDailyNewWordIds(bookId, validWordIds, requestedCount, options = {}) {
    const book = ensureBook(bookId);
    const timestamp = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const random = typeof options.random === "function" ? options.random : Math.random;
    const learningOrder = normalizeLearningOrder(options.learningOrder);
    const dateKey = getLocalDateKey(timestamp);
    const daily = ensureDailyStats(bookId, dateKey);
    const validIds = normalizeStringIds(validWordIds);
    const allowed = new Set(validIds);
    const isUnlearned = (wordId) => !normalizeWordProgress(book.words[wordId] || EMPTY_WORD_PROGRESS).learned;

    // Today's assignment is immutable across refresh, scope changes, and order changes.
    daily.scheduledNewWordIds = normalizeStringIds(daily.scheduledNewWordIds);
    const scheduled = new Set(daily.scheduledNewWordIds);

    const target = Math.max(0, Math.floor(Number(requestedCount)) || 0);
    let needed = Math.max(0, target - daily.scheduledNewWordIds.length);
    if (needed > 0) {
      let additions = [];
      if (learningOrder === "smart" && options.frequencyByWord instanceof Map) {
        const available = validIds.filter((wordId) => isUnlearned(wordId) && !scheduled.has(wordId));
        book.smartNewWordQueue = smartLearningOrder.reconcileQueueState({
          state: book.smartNewWordQueue,
          candidateIds: available,
          frequencyByWord: options.frequencyByWord,
          overridesByWord: options.overridesByWord,
          scopeKey: options.scopeKey || `${bookId}:core`,
          random,
        });
        const draw = smartLearningOrder.takeFromQueue(book.smartNewWordQueue, needed);
        book.smartNewWordQueue = draw.state;
        additions = draw.ids;
      } else {
        book.newWordQueue = normalizeStringIds(book.newWordQueue)
          .filter((wordId) => allowed.has(wordId) && isUnlearned(wordId) && !scheduled.has(wordId));
        const queued = new Set(book.newWordQueue);
        const available = validIds.filter(
          (wordId) => isUnlearned(wordId) && !scheduled.has(wordId) && !queued.has(wordId),
        );
        book.newWordQueue.push(...shuffleIds(available, random));
        additions = book.newWordQueue.splice(0, needed);
      }
      additions.forEach((wordId) => {
        if (addUniqueId(daily.scheduledNewWordIds, wordId)) scheduled.add(wordId);
      });
      needed -= additions.length;
    }

    persist();
    return [...daily.scheduledNewWordIds];
  }

  function getWrongWords(bookId) {
    return Object.entries(ensureBook(bookId).words)
      .filter(([, progress]) => Boolean(progress.inWrongBook))
      .map(([wordId, progress]) => ({ wordId, progress: normalizeWordProgress(progress) }))
      .sort((a, b) => {
        if (b.progress.wrongCount !== a.progress.wrongCount) {
          return b.progress.wrongCount - a.progress.wrongCount;
        }
        return (b.progress.lastWrongTime || 0) - (a.progress.lastWrongTime || 0);
      });
  }

  function getFavoriteWords(bookId) {
    return Object.entries(ensureBook(bookId).words)
      .filter(([, progress]) => Boolean(progress.favorite))
      .map(([wordId, progress]) => ({ wordId, progress: normalizeWordProgress(progress) }))
      .sort((a, b) => (b.progress.lastStudyTime || 0) - (a.progress.lastStudyTime || 0));
  }

  function getDueWords(bookId, validWordIds, now = Date.now()) {
    const book = ensureBook(bookId);
    const allowed = Array.isArray(validWordIds) ? new Set(validWordIds) : null;
    const records = Object.entries(book.words)
      .filter(([wordId]) => (!allowed || allowed.has(wordId)) && !book.reviewRecovery[wordId]?.active)
      .map(([wordId, progress]) => ({ wordId, progress: normalizeWordProgress(progress) }));
    return reviewScheduler.getDueWords(records, now);
  }

  function getDailyReviewSummary(bookId, validWordIds, now = Date.now()) {
    const daily = getDailyStats(bookId, getLocalDateKey(now));
    const reviewed = new Set(daily.reviewedWordIds);
    const dueWords = getDueWords(bookId, validWordIds, now);
    const newlyDueCount = dueWords.filter((entry) => !reviewed.has(entry.wordId)).length;

    return {
      completed: daily.reviewWords,
      total: daily.reviewWords + newlyDueCount,
      dueCount: dueWords.length,
      dueWords,
    };
  }

  function getBookSummary(bookId, validWordIds) {
    const book = ensureBook(bookId);
    const wordIds = Array.isArray(validWordIds) ? validWordIds : Object.keys(book.words);
    let learned = 0;
    let mastered = 0;
    let wrong = 0;
    let favorite = 0;

    wordIds.forEach((wordId) => {
      const progress = normalizeWordProgress(book.words[wordId] || EMPTY_WORD_PROGRESS);
      if (progress.learned) learned += 1;
      if (progress.learned && isWordMastered(progress)) mastered += 1;
      if (progress.inWrongBook) wrong += 1;
      if (progress.favorite) favorite += 1;
    });

    return {
      total: wordIds.length,
      learned,
      mastered,
      remaining: Math.max(0, wordIds.length - learned),
      wrong,
      favorite,
      today: getDailyStats(bookId),
    };
  }

  function clearBook(bookId) {
    ensureBook(bookId);
    getMutableData().books[bookId] = createEmptyBookData();
    persist();
  }

  function resetAllData() {
    memoryData = createDefaultData();
    try {
      window.localStorage.removeItem(AI_PROXY_TOKEN_KEY);
    } catch {
      storageAvailable = false;
    }
    return persist();
  }

  function getStatus() {
    return {
      key: STORAGE_KEY,
      version: DATA_VERSION,
      storageAvailable,
      recoveredInvalidData,
      migrationPerformed,
    };
  }

  app.storage = {
    STORAGE_KEY,
    AI_PROXY_TOKEN_KEY,
    DATA_VERSION,
    DAILY_GOAL_OPTIONS,
    loadUserData,
    saveUserData,
    getCurrentBook,
    setCurrentBook,
    getPreference,
    setPreference,
    getDailyNewWordGoal,
    getConfiguredDailyNewWordGoal,
    setDailyNewWordGoal,
    getDailyGroupPlan,
    saveDailyGroupPlan,
    removeDailyGroupPlan,
    updateDailyGroupProgress,
    startDailyGroupBreak,
    markDailyGroupStarted,
    advanceDailyGroup,
    adjustDailyGroupPlanTarget,
    getVocabularyScope,
    setVocabularyScope,
    getStudyMode,
    setStudyMode,
    getLearningOrder,
    setLearningOrder,
    getAiJudgeSettings,
    setAiJudgeSettings,
    getAiProxyToken,
    setAiProxyToken,
    getAiStats,
    recordAiRequest,
    recordAiJudgement,
    getLastExportTime,
    setLastExportTime,
    getWordProgress,
    updateWordProgress,
    toggleFavorite,
    removeWrongWord,
    setWrongBookState,
    getDailyStats,
    getDailyReviewRecord,
    saveDailyReviewRecord,
    getNewWordLearningState,
    getReviewRecoveryState,
    beginReviewRecoverySession,
    getReviewRecoveries,
    getReviewRecoverySummary,
    getPendingReinforcements,
    getPendingReinforcementSummary,
    getOrCreateDailyNewWordIds,
    getWrongWords,
    getFavoriteWords,
    getDueWords,
    getDailyReviewSummary,
    getBookSummary,
    isWordMastered,
    clearBook,
    resetAllData,
    getLocalDateKey,
    getStatus,
  };
})(window.CETWords);
