/**
 * 拾词 · 应用入口
 * 协调本地存储、复习调度、每日任务、集合页、设置页与四种学习模式。
 */

const {
  StudyController,
  loadWordBook,
  speakEnglish,
  shuffleArray,
  storage,
  reviewScheduler,
  wordLibrary,
  statisticsService,
  backupService,
  STUDY_MODES,
  getStudyModeLabel,
  newWordLearning,
  aiJudge,
  smartLearningOrder,
  dailyReviewService,
} = window.CETWords;

const appState = {
  activeBookId: storage.getCurrentBook(),
  currentView: "home",
  collectionMode: "wrong",
  wordList: { query: "", filter: "all", sort: "default", page: 1, detailWordId: null },
  pendingImport: null,
  resetAllStep: 1,
  frequency: {
    status: "loading",
    maps: { cet4: null, cet6: null },
    overrides: new Map(),
    error: null,
  },
  dailyReview: { generating: false, session: null },
  books: {
    cet4: {
      id: "cet4",
      name: "四级词汇",
      shortName: "CET-4",
      dailyGoal: storage.getDailyNewWordGoal("cet4"),
      words: [],
      source: "loading",
    },
    cet6: {
      id: "cet6",
      name: "六级词汇",
      shortName: "CET-6",
      dailyGoal: storage.getDailyNewWordGoal("cet6"),
      words: [],
      source: "loading",
    },
  },
};

const elements = {
  homeView: document.querySelector("#home-view"),
  studyView: document.querySelector("#study-view"),
  collectionView: document.querySelector("#collection-view"),
  wordListView: document.querySelector("#word-list-view"),
  statisticsView: document.querySelector("#statistics-view"),
  settingsView: document.querySelector("#settings-view"),
  bookOptions: document.querySelectorAll(".book-option"),
  currentBookBadge: document.querySelector("#current-book-badge"),
  dailyProgressRing: document.querySelector("#daily-progress-ring"),
  dailyPercent: document.querySelector("#daily-percent"),
  newCompleted: document.querySelector("#new-completed"),
  newTotal: document.querySelector("#new-total"),
  newProgressBar: document.querySelector("#new-progress-bar"),
  pendingReinforcementCount: document.querySelector("#pending-reinforcement-count"),
  reviewCompleted: document.querySelector("#review-completed"),
  reviewTotal: document.querySelector("#review-total"),
  reviewProgressBar: document.querySelector("#review-progress-bar"),
  taskHint: document.querySelector(".task-hint"),
  overallPercent: document.querySelector("#overall-percent"),
  overallScopeLabel: document.querySelector("#overall-scope-label"),
  overallProgressBar: document.querySelector("#overall-progress-bar"),
  learnedCount: document.querySelector("#learned-count"),
  masteredCount: document.querySelector("#mastered-count"),
  remainingCount: document.querySelector("#remaining-count"),
  wrongWordCount: document.querySelector("#wrong-word-count"),
  favoriteWordCount: document.querySelector("#favorite-word-count"),
  dueReviewCount: document.querySelector("#due-review-count"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector(".theme-icon"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  todayLabel: document.querySelector("#today-label"),
  continueButton: document.querySelector("#continue-button"),
  homeStudyModeButton: document.querySelector("#home-study-mode-button"),
  collectionBackButton: document.querySelector("#collection-back-button"),
  collectionBookBadge: document.querySelector("#collection-book-badge"),
  collectionKicker: document.querySelector("#collection-kicker"),
  collectionTitle: document.querySelector("#collection-title"),
  collectionCountLabel: document.querySelector("#collection-count-label"),
  collectionStudyButton: document.querySelector("#collection-study-button"),
  collectionSearch: document.querySelector("#collection-search"),
  collectionList: document.querySelector("#collection-list"),
  collectionEmpty: document.querySelector("#collection-empty"),
  collectionEmptyIcon: document.querySelector("#collection-empty-icon"),
  collectionEmptyTitle: document.querySelector("#collection-empty-title"),
  collectionEmptyText: document.querySelector("#collection-empty-text"),
  collectionEmptyAction: document.querySelector("#collection-empty-action"),
  wordListBackButton: document.querySelector("#word-list-back-button"),
  wordListBookBadge: document.querySelector("#word-list-book-badge"),
  wordListTitle: document.querySelector("#word-list-title"),
  wordListCountLabel: document.querySelector("#word-list-count-label"),
  wordListSearch: document.querySelector("#word-list-search"),
  wordFilterButtons: document.querySelectorAll("[data-word-filter]"),
  wordListSort: document.querySelector("#word-list-sort"),
  wordListRange: document.querySelector("#word-list-range"),
  wordListGrid: document.querySelector("#word-list-grid"),
  wordListEmpty: document.querySelector("#word-list-empty"),
  wordListPagination: document.querySelector("#word-list-pagination"),
  wordListPrev: document.querySelector("#word-list-prev"),
  wordListNext: document.querySelector("#word-list-next"),
  wordListPageLabel: document.querySelector("#word-list-page-label"),
  wordDetailDialog: document.querySelector("#word-detail-dialog"),
  wordDetailClose: document.querySelector("#word-detail-close"),
  wordDetailBook: document.querySelector("#word-detail-book"),
  wordDetailTitle: document.querySelector("#word-detail-title"),
  wordDetailPhonetic: document.querySelector("#word-detail-phonetic"),
  wordDetailSpeak: document.querySelector("#word-detail-speak"),
  wordDetailMeaning: document.querySelector("#word-detail-meaning"),
  wordDetailCoreMeaning: document.querySelector("#word-detail-core-meaning"),
  wordDetailMeaningGroups: document.querySelector("#word-detail-meaning-groups"),
  wordDetailExample: document.querySelector("#word-detail-example"),
  wordDetailTranslation: document.querySelector("#word-detail-translation"),
  wordDetailExampleList: document.querySelector("#word-detail-example-list"),
  wordDetailMastery: document.querySelector("#word-detail-mastery"),
  wordDetailLearningState: document.querySelector("#word-detail-learning-state"),
  wordDetailCorrect: document.querySelector("#word-detail-correct"),
  wordDetailWrong: document.querySelector("#word-detail-wrong"),
  wordDetailFirstDate: document.querySelector("#word-detail-first-date"),
  wordDetailLastDate: document.querySelector("#word-detail-last-date"),
  wordDetailNextDate: document.querySelector("#word-detail-next-date"),
  wordDetailFavorite: document.querySelector("#word-detail-favorite"),
  wordDetailWrongBook: document.querySelector("#word-detail-wrong-book"),
  wordDetailFrequencyTier: document.querySelector("#word-detail-frequency-tier"),
  wordDetailFrequencySessions: document.querySelector("#word-detail-frequency-sessions"),
  wordDetailFrequencyPapers: document.querySelector("#word-detail-frequency-papers"),
  wordDetailFrequencyTokens: document.querySelector("#word-detail-frequency-tokens"),
  wordDetailFrequencyNote: document.querySelector("#word-detail-frequency-note"),
  statisticsBackButton: document.querySelector("#statistics-back-button"),
  statisticsBookBadge: document.querySelector("#statistics-book-badge"),
  statisticsDescription: document.querySelector("#statistics-description"),
  currentStreak: document.querySelector("#current-streak"),
  longestStreak: document.querySelector("#longest-streak"),
  statsLearned: document.querySelector("#stats-learned"),
  statsMastered: document.querySelector("#stats-mastered"),
  statsUnlearned: document.querySelector("#stats-unlearned"),
  statsWrongWords: document.querySelector("#stats-wrong-words"),
  statsAnswers: document.querySelector("#stats-answers"),
  statsCorrect: document.querySelector("#stats-correct"),
  statsWrongAnswers: document.querySelector("#stats-wrong-answers"),
  statsAccuracy: document.querySelector("#stats-accuracy"),
  todayAccuracy: document.querySelector("#today-accuracy"),
  todayNewWords: document.querySelector("#today-new-words"),
  todayReviewWords: document.querySelector("#today-review-words"),
  todayAnswers: document.querySelector("#today-answers"),
  todayCorrect: document.querySelector("#today-correct"),
  todayWrong: document.querySelector("#today-wrong"),
  sevenDayChart: document.querySelector("#seven-day-chart"),
  masteryDistribution: document.querySelector("#mastery-distribution"),
  settingsBackButton: document.querySelector("#settings-back-button"),
  settingsBookBadge: document.querySelector("#settings-book-badge"),
  dailyGoalOptions: document.querySelectorAll("[data-daily-goal]"),
  dailyGoalDescription: document.querySelector("#daily-goal-description"),
  vocabularyScopeOptions: document.querySelectorAll("[data-vocabulary-scope]"),
  vocabularyScopeDescription: document.querySelector("#vocabulary-scope-description"),
  studyModeOptions: document.querySelectorAll("[data-study-mode]"),
  studyModeDescription: document.querySelector("#study-mode-description"),
  learningOrderOptions: document.querySelectorAll("[data-learning-order]"),
  learningOrderDescription: document.querySelector("#learning-order-description"),
  learningOrderStatus: document.querySelector("#learning-order-status"),
  aiConnectionStatus: document.querySelector("#ai-connection-status"),
  aiProxyUrl: document.querySelector("#ai-proxy-url"),
  aiProxyToken: document.querySelector("#ai-proxy-token"),
  aiTestConnection: document.querySelector("#ai-test-connection"),
  aiDisableButton: document.querySelector("#ai-disable-button"),
  dataOverviewCet4: document.querySelector("#data-overview-cet4"),
  dataOverviewCet6: document.querySelector("#data-overview-cet6"),
  lastExportTime: document.querySelector("#last-export-time"),
  exportDataButton: document.querySelector("#export-data-button"),
  importDataInput: document.querySelector("#import-data-input"),
  importDialog: document.querySelector("#import-confirm-dialog"),
  importSummaryCet4: document.querySelector("#import-summary-cet4"),
  importSummaryCet6: document.querySelector("#import-summary-cet6"),
  importSummaryFavorite: document.querySelector("#import-summary-favorite"),
  importSummaryWrong: document.querySelector("#import-summary-wrong"),
  importCancelButton: document.querySelector("#import-cancel-button"),
  importConfirmButton: document.querySelector("#import-confirm-button"),
  clearBookDescription: document.querySelector("#clear-book-description"),
  clearBookButton: document.querySelector("#clear-book-button"),
  clearDialog: document.querySelector("#clear-confirm-dialog"),
  clearDialogMessage: document.querySelector("#clear-dialog-message"),
  clearCancelButton: document.querySelector("#clear-cancel-button"),
  clearConfirmButton: document.querySelector("#clear-confirm-button"),
  resetAllButton: document.querySelector("#reset-all-button"),
  resetAllDialog: document.querySelector("#reset-all-dialog"),
  resetAllDialogTitle: document.querySelector("#reset-all-dialog-title"),
  resetAllDialogMessage: document.querySelector("#reset-all-dialog-message"),
  resetAllCancel: document.querySelector("#reset-all-cancel"),
  resetAllConfirm: document.querySelector("#reset-all-confirm"),
  dailyReviewPanel: document.querySelector("#daily-review-panel"),
  dailyReviewCompleted: document.querySelector("#daily-review-completed"),
  dailyReviewTotalAnswers: document.querySelector("#daily-review-total-answers"),
  dailyReviewChoiceAccuracy: document.querySelector("#daily-review-choice-accuracy"),
  dailyReviewChoiceRetries: document.querySelector("#daily-review-choice-retries"),
  dailyReviewReinforcementRate: document.querySelector("#daily-review-reinforcement-rate"),
  dailyReviewRepeatErrors: document.querySelector("#daily-review-repeat-errors"),
  dailyReviewWeakList: document.querySelector("#daily-review-weak-list"),
  dailyReviewStatus: document.querySelector("#daily-review-status"),
  dailyReviewGenerate: document.querySelector("#daily-review-generate"),
  dailyReviewResult: document.querySelector("#daily-review-result"),
  dailyReviewSummary: document.querySelector("#daily-review-summary"),
  dailyReviewStrengths: document.querySelector("#daily-review-strengths"),
  dailyReviewWeaknesses: document.querySelector("#daily-review-weaknesses"),
  dailyReviewFocus: document.querySelector("#daily-review-focus"),
  dailyReviewAdvice: document.querySelector("#daily-review-advice"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getPercent(completed, total) {
  if (!total) return 0;
  return Math.min(100, (completed / total) * 100);
}

function formatProgressPercent(value) {
  const number = Math.max(0, Math.min(100, Number(value) || 0));
  if (number === 0 || number === 100) return `${Math.round(number)}%`;
  if (number < 1) return `${number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
  return `${number.toFixed(1).replace(/\.0$/, "")}%`;
}

function getActiveBook() {
  const book = appState.books[appState.activeBookId];
  book.dailyGoal = storage.getDailyNewWordGoal(book.id);
  return book;
}

function getAllBookWordIds(book) {
  return book.words.map((item) => item.word);
}

function getVocabularyScope(book) {
  return storage.getVocabularyScope(book.id);
}

function getScopedWords(book) {
  return getVocabularyScope(book) === "all" ? book.words : book.words.filter((word) => word.isCore);
}

function getScopedWordIds(book) {
  return getScopedWords(book).map((item) => item.word);
}

function getBookSummary(book) {
  return storage.getBookSummary(book.id, getScopedWordIds(book));
}

function getFullBookSummary(book) {
  return storage.getBookSummary(book.id, getAllBookWordIds(book));
}

function getScopedDailyIdCount(book, daily, fieldName, fallback = 0) {
  const ids = Array.isArray(daily[fieldName]) ? daily[fieldName] : [];
  if (!ids.length) return fallback;
  return ids.length;
}

function getScopedIntroducedNewWordCount(book, daily) {
  return getScopedDailyIdCount(book, daily, "newWordIds", daily.newWords);
}

function getScopedCompletedNewWordCount(book, daily) {
  return getScopedDailyIdCount(book, daily, "completedNewWordIds", daily.completedNewWords);
}

function getScopeLabel(book) {
  return getVocabularyScope(book) === "all" ? "核心 + 补充" : "核心词汇";
}

function getWordSourceLabel(word) {
  if (word.isCore) return word.book === "cet6" ? "CET-6" : "CET-4";
  if (word.book === "cet6" && word.sourceLevel === "cet4") return "CET-4 先修";
  if (word.book === "cet4" && word.sourceLevel === "high-school") return "高中补充";
  return "补充词";
}

function getStudyMode() {
  return storage.getStudyMode();
}

function setStudyMode(mode, { announce = true } = {}) {
  const savedMode = storage.setStudyMode(mode);
  elements.homeStudyModeButton.textContent = `当前模式：${getStudyModeLabel(savedMode)}`;
  if (announce) showToast(`学习模式已切换为${getStudyModeLabel(savedMode)}`);
  return savedMode;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  elements.themeIcon.textContent = isDark ? "☀" : "☾";
  elements.themeToggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
  elements.themeToggle.title = isDark ? "切换浅色模式" : "切换深色模式";
  elements.themeColor.setAttribute("content", isDark ? "#101916" : "#f4f6f1");
  storage.setPreference("theme", theme);
}

function initializeTheme() {
  const savedTheme = storage.getPreference("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));
}

function setTodayLabel() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  elements.todayLabel.textContent = formatter.format(new Date());
}

function setVisibleView(viewName) {
  const views = {
    home: elements.homeView,
    study: elements.studyView,
    collection: elements.collectionView,
    words: elements.wordListView,
    statistics: elements.statisticsView,
    settings: elements.settingsView,
  };

  Object.entries(views).forEach(([name, view]) => {
    view.hidden = name !== viewName;
  });

  appState.currentView = viewName;
  document.body.classList.toggle("is-study-mode", viewName === "study");
  document.body.classList.toggle(
    "is-subpage-mode",
    viewName === "collection" || viewName === "words" || viewName === "statistics" || viewName === "settings",
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setTaskHint(icon, text) {
  const iconNode = document.createElement("span");
  iconNode.setAttribute("aria-hidden", "true");
  iconNode.textContent = icon;
  elements.taskHint.replaceChildren(iconNode, document.createTextNode(` ${text}`));
}

function updateTaskHint(todayNew, pendingCount, book, reviewSummary) {
  const newRemaining = Math.max(0, book.dailyGoal - todayNew);

  if (reviewSummary.dueCount > 0) {
    setTaskHint("↺", `先复习 ${reviewSummary.dueCount} 个到期单词，再学习新词`);
  } else if (pendingCount > 0) {
    setTaskHint("◇", `还有 ${pendingCount} 个新词等待当日巩固`);
  } else if (newRemaining > 0) {
    setTaskHint("✦", `再学习 ${newRemaining} 个新词，完成今日目标`);
  } else {
    setTaskHint("✓", "今日任务已完成，今天辛苦了，可以继续加练");
  }
}

function updateDashboard(bookId = appState.activeBookId) {
  const book = appState.books[bookId];
  if (!book) return;

  appState.activeBookId = bookId;
  book.dailyGoal = storage.getDailyNewWordGoal(bookId);
  storage.setCurrentBook(bookId);

  elements.bookOptions.forEach((option) => {
    const isActive = option.dataset.book === bookId;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
  });

  const allWordIds = getAllBookWordIds(book);
  const summary = getBookSummary(book);
  const fullSummary = getFullBookSummary(book);
  const reviewSummary = storage.getDailyReviewSummary(book.id, allWordIds);
  const pendingSummary = storage.getPendingReinforcementSummary(book.id, allWordIds);
  const todayNew = getScopedCompletedNewWordCount(book, summary.today);
  const todayReview = summary.today.reviewWords;
  const taskTotal = book.dailyGoal + reviewSummary.total;
  const taskCompleted = Math.min(todayNew, book.dailyGoal)
    + Math.min(todayReview, reviewSummary.total);
  const dailyPercent = getPercent(taskCompleted, taskTotal);
  const overallPercent = getPercent(summary.learned, summary.total);

  elements.currentBookBadge.textContent = `${book.name} · ${getVocabularyScope(book) === "all" ? "含补充" : "仅核心"}`;
  elements.dailyPercent.textContent = formatProgressPercent(dailyPercent);
  elements.dailyProgressRing.style.setProperty("--progress", dailyPercent);
  elements.dailyProgressRing.setAttribute("aria-label", `今日任务已完成 ${dailyPercent}%`);

  elements.newCompleted.textContent = todayNew;
  elements.newTotal.textContent = book.dailyGoal;
  elements.newProgressBar.style.width = `${getPercent(todayNew, book.dailyGoal)}%`;
  elements.pendingReinforcementCount.textContent = formatNumber(pendingSummary.count);
  elements.reviewCompleted.textContent = todayReview;
  elements.reviewTotal.textContent = reviewSummary.total;
  elements.reviewProgressBar.style.width = `${getPercent(todayReview, reviewSummary.total)}%`;
  elements.dueReviewCount.textContent = formatNumber(reviewSummary.dueCount);
  updateTaskHint(todayNew, pendingSummary.count, book, reviewSummary);

  elements.overallPercent.textContent = formatProgressPercent(overallPercent);
  elements.overallScopeLabel.textContent = `${getScopeLabel(book)} · ${formatNumber(summary.total)} 词`;
  elements.overallProgressBar.style.width = `${overallPercent}%`;
  elements.learnedCount.textContent = formatNumber(summary.learned);
  elements.masteredCount.textContent = formatNumber(summary.mastered);
  elements.remainingCount.textContent = formatNumber(summary.remaining);
  elements.wrongWordCount.textContent = formatNumber(fullSummary.wrong);
  elements.favoriteWordCount.textContent = formatNumber(fullSummary.favorite);
  elements.homeStudyModeButton.textContent = `当前模式：${getStudyModeLabel(getStudyMode())}`;

  const hasUnlearned = summary.remaining > 0;
  const buttonLabel = elements.continueButton.querySelector("span:first-child");
  if (reviewSummary.dueCount > 0) buttonLabel.textContent = "先复习，再学新词";
  else if (pendingSummary.count > 0) buttonLabel.textContent = "继续巩固";
  else if (todayNew < book.dailyGoal) buttonLabel.textContent = "继续学习";
  else if (hasUnlearned) buttonLabel.textContent = "再学 10 个新词";
  else buttonLabel.textContent = "查看学习状态";
}

function showHome() {
  setVisibleView("home");
  document.title = "拾词 · 四六级背单词";
  updateDashboard();
}

function mapEntriesToItems(book, entries) {
  const wordMap = new Map(book.words.map((item) => [item.word, item]));
  return entries
    .map((entry) => {
      const word = wordMap.get(entry.wordId);
      if (!word) return null;
      const taskType = !entry.progress.learned
        ? "new"
        : reviewScheduler.isDueForReview(entry.progress)
          ? "review"
          : "practice";
      return {
        word,
        taskType,
        learningPhase: newWordLearning.LEARNING_PHASES.STANDARD_REVIEW,
      };
    })
    .filter(Boolean);
}

function getModeStudyPlan(book, sessionMode) {
  const allWordIds = getAllBookWordIds(book);
  const eligibleNewWordIds = getScopedWordIds(book);
  let rawDaily = storage.getDailyStats(book.id);
  let daily = {
    ...rawDaily,
    introducedNewWords: getScopedIntroducedNewWordCount(book, rawDaily),
    completedNewWords: getScopedCompletedNewWordCount(book, rawDaily),
  };
  const reviewSummary = storage.getDailyReviewSummary(book.id, allWordIds);

  if (sessionMode === "review") {
    return {
      studyItems: mapEntriesToItems(book, reviewSummary.dueWords).map((item) => ({ ...item, taskType: "review" })),
      isExtra: false,
      reviewSummary,
      daily,
    };
  }

  if (sessionMode === "wrong" || sessionMode === "favorite") {
    const entries = sessionMode === "wrong" ? storage.getWrongWords(book.id) : storage.getFavoriteWords(book.id);
    return {
      studyItems: shuffleArray(mapEntriesToItems(book, entries)).slice(0, book.dailyGoal),
      isExtra: false,
      reviewSummary,
      daily,
    };
  }

  const dueItems = mapEntriesToItems(book, reviewSummary.dueWords)
    .map((item) => ({ ...item, taskType: "review" }));
  const wordMap = new Map(book.words.map((word) => [word.word, word]));
  const pendingEntries = storage.getPendingReinforcements(book.id, allWordIds);
  const pendingItems = pendingEntries
    .map((entry) => {
      const word = wordMap.get(entry.wordId);
      if (!word) return null;
      return {
        word,
        taskType: "reinforcement",
        learningPhase: entry.learningState.phase,
        forcedStudyMode: newWordLearning.getPendingStudyMode(entry.learningState),
        learningState: entry.learningState,
      };
    })
    .filter(Boolean);
  const assignmentTarget = book.dailyGoal;
  const preferredOrder = storage.getLearningOrder();
  const effectiveOrder = preferredOrder === "smart" && appState.frequency.status === "ready"
    ? "smart"
    : "random";
  const schedulingOptions = {
    learningOrder: effectiveOrder,
    frequencyByWord: appState.frequency.maps[book.id],
    overridesByWord: appState.frequency.overrides,
    scopeKey: `${book.id}:${getVocabularyScope(book)}`,
  };
  let scheduledNewWordIds = storage.getOrCreateDailyNewWordIds(
    book.id,
    eligibleNewWordIds,
    assignmentTarget,
    schedulingOptions,
  );
  rawDaily = storage.getDailyStats(book.id);
  daily = {
    ...rawDaily,
    introducedNewWords: getScopedIntroducedNewWordCount(book, rawDaily),
    completedNewWords: getScopedCompletedNewWordCount(book, rawDaily),
  };
  const isExtra = daily.completedNewWords >= book.dailyGoal
    && dueItems.length === 0
    && pendingItems.length === 0;
  const newLimit = isExtra ? 10 : scheduledNewWordIds.length;
  let unlearnedScheduledWords = scheduledNewWordIds
    .map((wordId) => wordMap.get(wordId))
    .filter((word) => word && !storage.getWordProgress(book.id, word.word).learned);
  if (isExtra && unlearnedScheduledWords.length < newLimit) {
    scheduledNewWordIds = storage.getOrCreateDailyNewWordIds(
      book.id,
      eligibleNewWordIds,
      scheduledNewWordIds.length + (newLimit - unlearnedScheduledWords.length),
      schedulingOptions,
    );
    unlearnedScheduledWords = scheduledNewWordIds
      .map((wordId) => wordMap.get(wordId))
      .filter((word) => word && !storage.getWordProgress(book.id, word.word).learned);
  }
  const newItems = unlearnedScheduledWords
    .slice(0, pendingItems.length >= newWordLearning.MAX_PENDING_REINFORCEMENT ? 0 : newLimit)
    .map((word) => ({
      word,
      taskType: "new",
      learningPhase: newWordLearning.LEARNING_PHASES.INTRO,
    }));

  const studyItems = newWordLearning.buildNormalQueue({
    dueItems,
    pendingItems,
    introItems: newItems,
    currentSequence: daily.normalSessionAnswerSequence,
    dateKey: storage.getLocalDateKey(),
    now: Date.now(),
  });

  return {
    studyItems,
    isExtra,
    reviewSummary,
    daily,
  };
}

function showStudy(sessionMode = "normal", { forceNew = false } = {}) {
  const book = getActiveBook();
  if (!book.words.length) {
    showToast("词库仍在准备中，请稍后再试");
    return;
  }

  const plan = getModeStudyPlan(book, sessionMode);
  if (!plan.studyItems.length) {
    if (sessionMode === "review") {
      showToast("今天暂时没有需要复习的单词 🎉");
      showHome();
    } else if (sessionMode === "wrong" || sessionMode === "favorite") {
      showToast(sessionMode === "wrong" ? "错词本还是空的" : "还没有收藏单词");
      showCollection(sessionMode);
    } else {
      showToast("今日任务已完成，当前词库也没有未学习的新词");
      showHome();
    }
    return;
  }

  setVisibleView("study");
  document.title = `${book.shortName} 学习 · 拾词`;
  studyController.start(
    {
      id: book.id,
      shortName: book.shortName,
      dailyGoal: book.dailyGoal,
      completedToday: plan.daily.completedNewWords,
      pendingReinforcementCount: storage.getPendingReinforcementSummary(
        book.id,
        getAllBookWordIds(book),
      ).count,
      normalSessionAnswerSequence: plan.daily.normalSessionAnswerSequence,
      reviewCompletedToday: plan.daily.reviewWords,
      reviewTarget: plan.reviewSummary.total,
      sessionMode,
      isExtra: plan.isExtra,
      studyItems: plan.studyItems,
      allWords: book.words,
      returnLabel:
        sessionMode === "wrong" ? "返回错词本" : sessionMode === "favorite" ? "返回收藏" : "返回首页",
    },
    { forceNew },
  );
}

function handleStudyExit(mode) {
  if (mode === "wrong" || mode === "favorite") showCollection(mode);
  else showHome();
}

function handleAnswer({
  bookId,
  wordId,
  correct,
  judgement,
  judgementSource,
  aiUsage,
  studyMode,
  sessionMode,
  taskType,
  learningPhase,
}) {
  const result = storage.updateWordProgress(bookId, wordId, correct, {
    judgement,
    judgementSource,
    aiUsage,
    studyMode,
    sessionMode,
    taskType,
    learningPhase,
  });
  const book = appState.books[bookId];
  if (book) {
    result.daily.completedNewWords = getScopedCompletedNewWordCount(book, result.daily);
    result.pendingReinforcementCount = storage.getPendingReinforcementSummary(
      book.id,
      getAllBookWordIds(book),
    ).count;
  }
  return result;
}

function handleToggleFavorite(bookId, wordId) {
  return storage.toggleFavorite(bookId, wordId);
}

function isAiReinforcementConfigured() {
  const settings = storage.getAiJudgeSettings();
  return Boolean(settings.enabled && settings.proxyUrl && storage.getAiProxyToken());
}

async function handleAiJudgeMeaning({ word, userAnswer }) {
  const settings = storage.getAiJudgeSettings();
  storage.recordAiRequest();
  return aiJudge.judgeMeaning({
    word,
    userAnswer,
    proxyUrl: settings.proxyUrl,
    token: storage.getAiProxyToken(),
  });
}

function handleAiFallback(type) {
  storage.recordAiJudgement({ source: "manual-fallback", fallbackType: type });
}

function buildTodayLocalReview(bookId) {
  const book = appState.books[bookId];
  const dateKey = storage.getLocalDateKey();
  return dailyReviewService.buildLocalReview({
    bookId,
    dailyTarget: storage.getDailyNewWordGoal(bookId),
    daily: { ...storage.getDailyStats(bookId, dateKey), dateKey },
    words: book.words,
    getProgress: (wordId) => storage.getWordProgress(bookId, wordId),
  });
}

function replaceReviewList(element, items, emptyText) {
  const values = Array.isArray(items) && items.length ? items : [emptyText];
  element.replaceChildren(...values.map((value) => createElement("li", "", value)));
}

function renderAiDailyReview(review) {
  elements.dailyReviewSummary.textContent = review.summary;
  replaceReviewList(elements.dailyReviewStrengths, review.strengths, "今天暂无足够数据可总结。 ");
  replaceReviewList(elements.dailyReviewWeaknesses, review.weaknesses, "今天未发现明确的薄弱模式。 ");
  replaceReviewList(elements.dailyReviewAdvice, review.tomorrowAdvice, "按系统安排继续完成明日学习。 ");
  elements.dailyReviewFocus.replaceChildren(...review.focusWords.map((entry) => {
    const card = createElement("article", "daily-review-focus__item");
    card.append(
      createElement("strong", "", entry.word),
      createElement("p", "", entry.reason),
      createElement("span", "", entry.suggestion),
    );
    return card;
  }));
  elements.dailyReviewFocus.hidden = review.focusWords.length === 0;
  elements.dailyReviewResult.hidden = false;
}

function getDailyReviewErrorMessage(error) {
  const code = error?.message || "";
  if (code === "AI_NOT_CONFIGURED") return "AI 尚未配置；本地统计和薄弱词仍可正常查看。请先在设置中启用 AI。";
  if (code === "AI_TIMEOUT") return "AI 复盘请求超时；本地统计没有受到影响，可以稍后重试。";
  if (code === "AI_INVALID_RESPONSE") return "AI 返回格式异常；本地统计没有受到影响，可以稍后重试。";
  return "AI 复盘暂时不可用；本地统计没有受到影响，可以稍后重试。";
}

function renderDailyReviewPanel(session, { error = null } = {}) {
  const isEligibleSession = session?.sessionMode === "normal";
  const localReview = isEligibleSession ? buildTodayLocalReview(session.book.id) : null;
  const isVisible = Boolean(localReview?.canGenerate);
  elements.dailyReviewPanel.hidden = !isVisible;
  if (!isVisible) return;

  const stats = localReview.statistics;
  elements.dailyReviewCompleted.textContent = `${stats.completedNewWords} / ${stats.dailyTarget}`;
  elements.dailyReviewTotalAnswers.textContent = formatNumber(stats.totalAnswers);
  elements.dailyReviewChoiceAccuracy.textContent = `${stats.firstChoiceAccuracy}%`;
  elements.dailyReviewChoiceRetries.textContent = formatNumber(stats.choiceRetryCount);
  elements.dailyReviewReinforcementRate.textContent = `${stats.reinforcementPassRate}%`;
  elements.dailyReviewRepeatErrors.textContent = formatNumber(stats.repeatedErrorWords);
  elements.dailyReviewWeakList.replaceChildren(...(
    localReview.weakWords.length
      ? localReview.weakWords.map((entry) => {
        const item = createElement("li", "daily-review-weak-item");
        const riskClass = entry.dailyRiskScore >= 80
          ? "is-critical"
          : entry.dailyRiskScore >= 60
            ? "is-high"
            : entry.dailyRiskScore >= 40 ? "is-medium" : "is-low";
        const badge = createElement("span", `daily-review-risk ${riskClass}`, `风险 ${entry.dailyRiskScore}`);
        item.append(
          createElement("strong", "", entry.word),
          createElement("span", "daily-review-weak-item__meaning", entry.coreMeaning),
          badge,
        );
        return item;
      })
      : [createElement("li", "daily-review-weak-item is-empty", "今天暂无明显薄弱词。")]
  ));

  const dateKey = storage.getLocalDateKey();
  const cached = storage.getDailyReviewRecord(session.book.id, dateKey);
  const isStale = Boolean(cached && (cached.stale || cached.dailyTarget !== stats.dailyTarget));
  const isCurrent = Boolean(cached && !isStale);
  elements.dailyReviewResult.hidden = true;
  if (isCurrent) renderAiDailyReview(cached.review);
  else if (isStale) renderAiDailyReview(cached.review);

  elements.dailyReviewGenerate.hidden = isCurrent;
  elements.dailyReviewGenerate.disabled = appState.dailyReview.generating;
  elements.dailyReviewGenerate.querySelector("span:first-child").textContent = appState.dailyReview.generating
    ? "正在生成复盘…"
    : isStale ? "重新生成今日复盘" : "生成 AI 今日复盘";
  if (error) elements.dailyReviewStatus.textContent = getDailyReviewErrorMessage(error);
  else if (isCurrent) elements.dailyReviewStatus.textContent = "今日 AI 复盘已生成，并已保存在这台设备中。";
  else if (isStale) elements.dailyReviewStatus.textContent = "学习目标已调整，上方旧复盘已过期；请重新生成当前目标的复盘。";
  else elements.dailyReviewStatus.textContent = "复盘只会发送上方聚合统计与最多 10 个薄弱词，不包含答题原文或完整词库。";
}

async function generateDailyReview() {
  const session = appState.dailyReview.session;
  if (!session || appState.dailyReview.generating) return;
  const localReview = buildTodayLocalReview(session.book.id);
  if (!localReview.canGenerate) return;
  appState.dailyReview.generating = true;
  renderDailyReviewPanel(session);
  let caughtError = null;
  try {
    const settings = storage.getAiJudgeSettings();
    if (!settings.enabled) throw new Error("AI_NOT_CONFIGURED");
    const result = await dailyReviewService.requestDailyReview({
      payload: dailyReviewService.buildRequestPayload(localReview),
      proxyUrl: settings.proxyUrl,
      token: storage.getAiProxyToken(),
    });
    storage.saveDailyReviewRecord(session.book.id, localReview.date, {
      dailyTarget: localReview.statistics.dailyTarget,
      completedNewWords: localReview.statistics.completedNewWords,
      review: result.review,
      usage: result.usage,
    });
  } catch (error) {
    caughtError = error;
  } finally {
    appState.dailyReview.generating = false;
    renderDailyReviewPanel(session, { error: caughtError });
  }
}

function handleStudyComplete(session) {
  appState.dailyReview.session = session;
  renderDailyReviewPanel(session);
}

const studyController = new StudyController({
  onExit: handleStudyExit,
  onAnswer: handleAnswer,
  onToggleFavorite: handleToggleFavorite,
  getWordProgress: (bookId, wordId) => storage.getWordProgress(bookId, wordId),
  getStudyMode,
  onStudyModeChange: (mode) => setStudyMode(mode, { announce: false }),
  onRestart: (mode) => showStudy(mode, { forceNew: true }),
  onMessage: showToast,
  isAiReinforcementEnabled: isAiReinforcementConfigured,
  onAiJudgeMeaning: handleAiJudgeMeaning,
  onAiFallback: handleAiFallback,
  onComplete: handleStudyComplete,
});

elements.dailyReviewGenerate.addEventListener("click", generateDailyReview);

function formatStudyTime(timestamp) {
  if (!timestamp) return "尚未学习";
  const studiedDate = new Date(timestamp);
  const today = new Date();
  const studiedKey = storage.getLocalDateKey(timestamp);
  const todayKey = storage.getLocalDateKey(today.getTime());
  if (studiedKey === todayKey) return "今天";

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (studiedKey === storage.getLocalDateKey(yesterday.getTime())) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(studiedDate);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createMasteryStatus(progress) {
  const level = reviewScheduler.getMasteryLevel(progress);
  const wrapper = createElement("div", "mastery-status");
  const heading = createElement(
    "div",
    "mastery-status__heading",
    `熟练度 ${level} / 5 · ${reviewScheduler.MASTERY_LABELS[level]}`,
  );
  const dots = createElement("div", "mastery-dots");
  dots.setAttribute("aria-label", `熟练度 ${level} / 5`);
  for (let index = 1; index <= 5; index += 1) {
    dots.append(createElement("span", index <= level ? "is-filled" : ""));
  }
  wrapper.append(heading, dots);
  return wrapper;
}

function createCollectionCard(word, progress, mode) {
  const card = createElement("article", "collection-word-card");
  const heading = createElement("div", "collection-word-card__heading");
  const identity = createElement("div", "collection-word-card__identity");
  const sourceTag = createElement(
    "span",
    `word-source-tag${word.isCore ? "" : " word-source-tag--supplemental"}`,
    getWordSourceLabel(word),
  );
  identity.append(createElement("h2", "", word.word), createElement("p", "", word.phonetic), sourceTag);

  const actions = createElement("div", "collection-word-card__actions");
  const speakButton = createElement("button", "circle-action", "🔊");
  speakButton.type = "button";
  speakButton.setAttribute("aria-label", `朗读 ${word.word}`);
  speakButton.addEventListener("click", () => {
    if (!speakEnglish(word.word)) showToast("当前浏览器不支持语音朗读");
  });

  const favoriteButton = createElement(
    "button",
    `circle-action${progress.favorite ? " is-favorite" : ""}`,
    progress.favorite ? "★" : "☆",
  );
  favoriteButton.type = "button";
  favoriteButton.setAttribute("aria-label", progress.favorite ? `取消收藏 ${word.word}` : `收藏 ${word.word}`);
  favoriteButton.setAttribute("aria-pressed", String(progress.favorite));
  favoriteButton.addEventListener("click", () => {
    storage.toggleFavorite(appState.activeBookId, word.word);
    renderCollection();
    updateDashboard();
  });

  actions.append(speakButton, favoriteButton);
  heading.append(identity, actions);
  card.append(
    heading,
    createElement("p", "collection-word-card__meaning", word.coreMeaning || word.shortMeaning || word.meaning),
    createMasteryStatus(progress),
    createElement(
      "p",
      "collection-word-card__review-time",
      `下次复习：${reviewScheduler.formatReviewTime(progress.nextReviewTime)}`,
    ),
  );

  if (mode === "wrong") {
    const stats = createElement("div", "collection-word-card__stats");
    stats.append(
      createElement("span", "is-wrong-stat", `错误 ${progress.wrongCount} 次`),
      createElement("span", "", `正确 ${progress.correctCount} 次`),
      createElement("span", "", `最近学习：${formatStudyTime(progress.lastStudyTime)}`),
    );
    card.append(stats);

    const removeButton = createElement("button", "text-action text-action--danger", "移出错词本");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => {
      storage.removeWrongWord(appState.activeBookId, word.word);
      renderCollection();
      updateDashboard();
      showToast("已移出错词本，历史答题次数仍然保留");
    });
    card.append(removeButton);
  } else {
    const removeButton = createElement("button", "text-action", "取消收藏");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => {
      storage.toggleFavorite(appState.activeBookId, word.word);
      renderCollection();
      updateDashboard();
      showToast("已取消收藏");
    });
    card.append(removeButton);
  }

  return card;
}

function getCollectionRecords(mode) {
  const book = getActiveBook();
  const entries = mode === "wrong" ? storage.getWrongWords(book.id) : storage.getFavoriteWords(book.id);
  const wordMap = new Map(book.words.map((item) => [item.word, item]));
  return entries
    .map((entry) => ({ word: wordMap.get(entry.wordId), progress: entry.progress }))
    .filter((entry) => Boolean(entry.word));
}

function renderCollection() {
  const mode = appState.collectionMode;
  const records = getCollectionRecords(mode);
  const query = elements.collectionSearch.value.trim().toLocaleLowerCase("zh-CN");
  const filtered = records.filter(({ word }) => {
    if (!query) return true;
    return word.word.toLocaleLowerCase("en-US").includes(query)
      || word.meaning.includes(query)
      || (word.coreMeaning || "").includes(query);
  });

  elements.collectionCountLabel.textContent = mode === "wrong"
    ? `共 ${records.length} 个错词`
    : `共 ${records.length} 个收藏单词`;
  elements.collectionStudyButton.disabled = records.length === 0;
  elements.collectionList.replaceChildren(
    ...filtered.map(({ word, progress }) => createCollectionCard(word, progress, mode)),
  );

  const showEmpty = filtered.length === 0;
  elements.collectionEmpty.hidden = !showEmpty;
  elements.collectionList.hidden = showEmpty;
  if (!showEmpty) return;

  if (records.length > 0) {
    elements.collectionEmptyIcon.textContent = "⌕";
    elements.collectionEmptyTitle.textContent = "没有找到匹配的单词";
    elements.collectionEmptyText.textContent = "换一个英文或中文关键词试试。";
    elements.collectionEmptyAction.textContent = "清除搜索";
    return;
  }

  elements.collectionEmptyIcon.textContent = mode === "wrong" ? "🎉" : "☆";
  elements.collectionEmptyTitle.textContent = mode === "wrong" ? "暂无错词" : "暂无收藏";
  elements.collectionEmptyText.textContent = mode === "wrong"
    ? "继续保持，你做得很好。"
    : "在学习页面点击星标，就能把重点单词收进这里。";
  elements.collectionEmptyAction.textContent = "去背单词";
}

function showCollection(mode) {
  const book = getActiveBook();
  if (!book.words.length) {
    showToast("词库仍在准备中，请稍后再试");
    return;
  }

  appState.collectionMode = mode;
  setVisibleView("collection");
  elements.collectionBookBadge.textContent = book.shortName;
  elements.collectionKicker.textContent = mode === "wrong" ? "REVIEW & REMEMBER" : "WORDS YOU SAVED";
  elements.collectionTitle.textContent = mode === "wrong" ? "错词本" : "收藏单词";
  elements.collectionStudyButton.querySelector("span:first-child").textContent =
    mode === "wrong" ? "开始复习错词" : "复习收藏";
  elements.collectionSearch.placeholder = mode === "wrong"
    ? "搜索错词的英文或中文释义"
    : "搜索收藏单词的英文或中文释义";
  elements.collectionSearch.value = "";
  document.title = `${mode === "wrong" ? "错词本" : "收藏单词"} · 拾词`;
  renderCollection();
}

function formatCalendarDate(dateKey) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" })
    .format(new Date(year, month - 1, day));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function createWordListCard(record) {
  const { word, progress } = record;
  const card = createElement("article", "word-list-card");
  const mainButton = createElement("button", "word-list-card__main");
  mainButton.type = "button";
  mainButton.setAttribute("aria-label", `查看 ${word.word} 详情`);

  const identity = createElement("div", "word-list-card__identity");
  const sourceTag = createElement(
    "span",
    `word-source-tag${word.isCore ? "" : " word-source-tag--supplemental"}`,
    getWordSourceLabel(word),
  );
  identity.append(createElement("h2", "", word.word), createElement("p", "", word.phonetic), sourceTag);
  mainButton.append(
    identity,
    createElement("p", "word-list-card__meaning", word.coreMeaning || word.shortMeaning || word.meaning),
    createMasteryStatus(progress),
    createElement(
      "p",
      "word-list-card__review-time",
      progress.learned
        ? `下次复习：${reviewScheduler.formatReviewTime(progress.nextReviewTime)}`
        : "尚未学习",
    ),
  );
  mainButton.addEventListener("click", () => openWordDetail(word.word));

  const actions = createElement("div", "word-list-card__actions");
  const speakButton = createElement("button", "circle-action", "🔊");
  speakButton.type = "button";
  speakButton.setAttribute("aria-label", `朗读 ${word.word}`);
  speakButton.addEventListener("click", () => {
    if (!speakEnglish(word.word)) showToast("当前浏览器不支持语音朗读");
  });

  const favoriteButton = createElement(
    "button",
    `circle-action${progress.favorite ? " is-favorite" : ""}`,
    progress.favorite ? "★" : "☆",
  );
  favoriteButton.type = "button";
  favoriteButton.setAttribute("aria-label", progress.favorite ? `取消收藏 ${word.word}` : `收藏 ${word.word}`);
  favoriteButton.setAttribute("aria-pressed", String(progress.favorite));
  favoriteButton.addEventListener("click", () => {
    storage.toggleFavorite(appState.activeBookId, word.word);
    renderWordList();
    updateDashboard();
  });
  actions.append(speakButton, favoriteButton);
  card.append(mainButton, actions);
  return card;
}

function renderWordList() {
  const book = getActiveBook();
  const state = appState.wordList;
  const records = wordLibrary.filterAndSort(
    book.words,
    (wordId) => storage.getWordProgress(book.id, wordId),
    state,
  );
  const page = wordLibrary.paginate(records, state.page);
  state.page = page.page;

  elements.wordListBookBadge.textContent = book.shortName;
  elements.wordListTitle.textContent = `${book.shortName} 单词`;
  const coreCount = book.words.filter((word) => word.isCore).length;
  elements.wordListCountLabel.textContent = `全部 ${formatNumber(book.words.length)} 词 · 核心 ${formatNumber(coreCount)} · 补充 ${formatNumber(book.words.length - coreCount)}`;
  elements.wordFilterButtons.forEach((button) => {
    const active = button.dataset.wordFilter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.wordListRange.textContent = page.total
    ? `找到 ${page.total} 个 · 当前显示 ${page.start}–${page.end}`
    : "找到 0 个单词";
  elements.wordListGrid.replaceChildren(...page.items.map(createWordListCard));
  elements.wordListGrid.hidden = page.total === 0;
  elements.wordListEmpty.hidden = page.total !== 0;
  elements.wordListPagination.hidden = page.total === 0;
  elements.wordListPageLabel.textContent = `第 ${page.page} / ${page.pageCount} 页`;
  elements.wordListPrev.disabled = page.page <= 1;
  elements.wordListNext.disabled = page.page >= page.pageCount;
}

function showWordList() {
  const book = getActiveBook();
  if (!book.words.length) {
    showToast("词库仍在准备中，请稍后再试");
    return;
  }
  appState.wordList = { query: "", filter: "all", sort: "default", page: 1, detailWordId: null };
  elements.wordListSearch.value = "";
  elements.wordListSort.value = "default";
  setVisibleView("words");
  document.title = `${book.shortName} 单词列表 · 拾词`;
  renderWordList();
}

function getDetailWord() {
  const book = getActiveBook();
  return book.words.find((word) => word.word === appState.wordList.detailWordId) || null;
}

function renderWordDetail() {
  const book = getActiveBook();
  const word = getDetailWord();
  if (!word) return;
  const progress = storage.getWordProgress(book.id, word.word);
  const level = reviewScheduler.getMasteryLevel(progress);

  elements.wordDetailBook.textContent = `${book.shortName} WORD · ${getWordSourceLabel(word)}`;
  elements.wordDetailTitle.textContent = word.word;
  elements.wordDetailPhonetic.textContent = word.phonetic || "";
  elements.wordDetailPhonetic.hidden = !word.phonetic;
  elements.wordDetailCoreMeaning.textContent = word.coreMeaning || word.shortMeaning || word.meaning;
  const meaningsByPos = word.meaningsByPos && typeof word.meaningsByPos === "object"
    ? word.meaningsByPos
    : {};
  elements.wordDetailMeaningGroups.replaceChildren(
    ...Object.entries(meaningsByPos).map(([partOfSpeech, meanings]) => {
      const group = createElement("section", "word-detail-meaning-group");
      group.append(
        createElement("strong", "", partOfSpeech),
        createElement("p", "", meanings.join("\n")),
      );
      return group;
    }),
  );
  elements.wordDetailMeaning.textContent = word.meaning;
  elements.wordDetailMeaning.hidden = true;
  elements.wordDetailExample.textContent = word.example || "暂无例句";
  elements.wordDetailExample.hidden = true;
  elements.wordDetailTranslation.textContent = word.translation || "";
  elements.wordDetailTranslation.hidden = true;
  const examples = Array.isArray(word.examples) && word.examples.length
    ? word.examples.slice(0, 3)
    : [{ sentence: word.example || "暂无例句", translation: word.translation || "" }];
  elements.wordDetailExampleList.replaceChildren(
    ...examples.map((example, index) => {
      const item = createElement("article", "word-detail-example-item");
      if (index > 0) item.append(createElement("span", "", "更多例句"));
      item.append(createElement("p", "", example.sentence));
      if (example.translation) item.append(createElement("p", "", example.translation));
      return item;
    }),
  );
  elements.wordDetailMastery.replaceChildren(createMasteryStatus(progress));
  elements.wordDetailLearningState.textContent = progress.learned
    ? `熟练度 ${level} / 5 · ${reviewScheduler.MASTERY_LABELS[level]}`
    : "尚未学习";
  elements.wordDetailCorrect.textContent = `${progress.correctCount} 次`;
  elements.wordDetailWrong.textContent = `${progress.wrongCount} 次`;
  elements.wordDetailFirstDate.textContent = formatCalendarDate(progress.firstLearnDate);
  elements.wordDetailLastDate.textContent = formatStudyTime(progress.lastStudyTime);
  elements.wordDetailNextDate.textContent = progress.learned
    ? reviewScheduler.formatReviewTime(progress.nextReviewTime)
    : "待安排";
  const priority = smartLearningOrder.getLearningPriority(
    word.word,
    appState.frequency.maps[book.id],
    appState.frequency.overrides,
  );
  const frequency = priority.frequency;
  elements.wordDetailFrequencyTier.textContent = frequency
    ? `${frequency.frequencyTier}（学习优先级 ${priority.effectiveLearningTier}）`
    : "暂无统计";
  elements.wordDetailFrequencySessions.textContent = frequency
    ? `${frequency.sessionCount} / ${frequency.sessionCountPossible || 10}`
    : "—";
  elements.wordDetailFrequencyPapers.textContent = frequency
    ? `${frequency.paperCount} / ${frequency.paperCountPossible || 30}`
    : "—";
  elements.wordDetailFrequencyTokens.textContent = frequency ? formatNumber(frequency.tokenCount) : "—";
  elements.wordDetailFrequencyNote.textContent = priority.priorityAdjustmentReason
    || (frequency
      ? "智能顺序只使用频率层级；同层级内独立随机，不按出现次数或分数暗中排序。"
      : "这个词暂未匹配到真题频率记录，智能顺序按保守层级处理。 ");
  elements.wordDetailFavorite.textContent = progress.favorite ? "★ 已收藏" : "☆ 收藏";
  elements.wordDetailFavorite.setAttribute("aria-pressed", String(progress.favorite));
  elements.wordDetailWrongBook.textContent = progress.inWrongBook ? "移出错词本" : "加入错词本";
  elements.wordDetailWrongBook.setAttribute("aria-pressed", String(progress.inWrongBook));
}

function openWordDetail(wordId) {
  appState.wordList.detailWordId = wordId;
  renderWordDetail();
  if (typeof elements.wordDetailDialog.showModal === "function") elements.wordDetailDialog.showModal();
  else elements.wordDetailDialog.setAttribute("open", "");
}

function closeWordDetail() {
  if (typeof elements.wordDetailDialog.close === "function" && elements.wordDetailDialog.open) {
    elements.wordDetailDialog.close();
  } else {
    elements.wordDetailDialog.removeAttribute("open");
  }
}

function renderStatistics() {
  const book = getActiveBook();
  const statistics = statisticsService.getBookStatistics(book.id, getScopedWordIds(book));
  elements.statisticsBookBadge.textContent = book.shortName;
  elements.statisticsDescription.textContent = `${getScopeLabel(book)} · 共 ${formatNumber(statistics.total)} 词，回顾当前范围的每一步积累。`;
  elements.currentStreak.textContent = `${statistics.currentStreak} 天`;
  elements.longestStreak.textContent = `${statistics.longestStreak} 天`;
  elements.statsLearned.textContent = formatNumber(statistics.learned);
  elements.statsMastered.textContent = formatNumber(statistics.mastered);
  elements.statsUnlearned.textContent = formatNumber(statistics.unlearned);
  elements.statsWrongWords.textContent = formatNumber(statistics.wrongWords);
  elements.statsAnswers.textContent = formatNumber(statistics.answerCount);
  elements.statsCorrect.textContent = formatNumber(statistics.correctAnswers);
  elements.statsWrongAnswers.textContent = formatNumber(statistics.wrongAnswers);
  elements.statsAccuracy.textContent = formatPercent(statistics.accuracy);
  elements.todayAccuracy.textContent = formatPercent(statistics.today.accuracy);
  elements.todayNewWords.textContent = formatNumber(statistics.today.newWords);
  elements.todayReviewWords.textContent = formatNumber(statistics.today.reviewWords);
  elements.todayAnswers.textContent = formatNumber(statistics.today.answerCount);
  elements.todayCorrect.textContent = formatNumber(statistics.today.correctCount);
  elements.todayWrong.textContent = formatNumber(statistics.today.wrongCount);

  const maximumWords = Math.max(1, ...statistics.last7Days.map((day) => day.totalWords));
  elements.sevenDayChart.replaceChildren(
    ...statistics.last7Days.map((day) => {
      const column = createElement("div", "chart-day");
      column.setAttribute(
        "aria-label",
        `${day.label}，新词 ${day.newWords}，复习 ${day.reviewWords}，共 ${day.totalWords}`,
      );
      const value = createElement("strong", "", String(day.totalWords));
      const bar = createElement("div", "chart-bar");
      const newBar = createElement("span", "chart-bar__new");
      const reviewBar = createElement("span", "chart-bar__review");
      newBar.style.height = `${(day.newWords / maximumWords) * 100}%`;
      reviewBar.style.height = `${(day.reviewWords / maximumWords) * 100}%`;
      bar.append(newBar, reviewBar);
      column.append(value, bar, createElement("span", "chart-day__label", day.label));
      return column;
    }),
  );

  const learnedTotal = Math.max(1, statistics.learned);
  elements.masteryDistribution.replaceChildren(
    ...statistics.masteryDistribution.map((entry) => {
      const row = createElement("div", "mastery-distribution__row");
      const label = createElement("div", "mastery-distribution__label");
      label.append(
        createElement("span", "", `Level ${entry.level} · ${entry.label}`),
        createElement("strong", "", formatNumber(entry.count)),
      );
      const track = createElement("div", "mastery-distribution__track");
      const fill = createElement("span");
      fill.style.width = `${(entry.count / learnedTotal) * 100}%`;
      track.append(fill);
      row.append(label, track);
      return row;
    }),
  );
}

function showStatistics() {
  const book = getActiveBook();
  if (!book.words.length) {
    showToast("词库仍在准备中，请稍后再试");
    return;
  }
  setVisibleView("statistics");
  document.title = `${book.shortName} 学习统计 · 拾词`;
  renderStatistics();
}

function formatExportTime(timestamp) {
  if (!timestamp) return "未知";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderDataOverview() {
  const cet4 = appState.books.cet4;
  const cet6 = appState.books.cet6;
  elements.dataOverviewCet4.textContent = formatNumber(getFullBookSummary(cet4).learned);
  elements.dataOverviewCet6.textContent = formatNumber(getFullBookSummary(cet6).learned);
  elements.lastExportTime.textContent = formatExportTime(storage.getLastExportTime());
}

function closeImportDialog() {
  if (typeof elements.importDialog.close === "function" && elements.importDialog.open) {
    elements.importDialog.close();
  } else {
    elements.importDialog.removeAttribute("open");
  }
  appState.pendingImport = null;
  elements.importDataInput.value = "";
}

async function prepareImport(file) {
  if (!file) return;
  try {
    const validation = backupService.validateBackup(await file.text());
    if (!validation.valid) {
      showToast(validation.error || "备份文件格式不正确");
      elements.importDataInput.value = "";
      return;
    }
    appState.pendingImport = validation;
    elements.importSummaryCet4.textContent = formatNumber(validation.summary.cet4Learned);
    elements.importSummaryCet6.textContent = formatNumber(validation.summary.cet6Learned);
    elements.importSummaryFavorite.textContent = formatNumber(validation.summary.favorite);
    elements.importSummaryWrong.textContent = formatNumber(validation.summary.wrong);
    if (typeof elements.importDialog.showModal === "function") elements.importDialog.showModal();
    else elements.importDialog.setAttribute("open", "");
  } catch {
    showToast("备份文件格式不正确");
    elements.importDataInput.value = "";
  }
}

function confirmImport() {
  if (!appState.pendingImport) return;
  try {
    backupService.importBackup(appState.pendingImport.data);
    studyController.clearSessions("cet4");
    studyController.clearSessions("cet6");
    appState.activeBookId = storage.getCurrentBook();
    appState.books.cet4.dailyGoal = storage.getDailyNewWordGoal("cet4");
    appState.books.cet6.dailyGoal = storage.getDailyNewWordGoal("cet6");
    closeImportDialog();
    initializeTheme();
    showHome();
    showToast("学习数据已恢复，CET-4 与 CET-6 状态已同时更新");
  } catch (error) {
    closeImportDialog();
    showToast(error.message || "恢复学习数据失败");
  }
}

function openResetAllDialog() {
  appState.resetAllStep = 1;
  elements.resetAllDialogTitle.textContent = "删除全部学习记录？";
  elements.resetAllDialogMessage.textContent = "将删除 CET-4 和 CET-6 的全部学习记录。是否继续？";
  elements.resetAllConfirm.textContent = "继续";
  if (typeof elements.resetAllDialog.showModal === "function") elements.resetAllDialog.showModal();
  else elements.resetAllDialog.setAttribute("open", "");
}

function closeResetAllDialog() {
  if (typeof elements.resetAllDialog.close === "function" && elements.resetAllDialog.open) {
    elements.resetAllDialog.close();
  } else {
    elements.resetAllDialog.removeAttribute("open");
  }
  appState.resetAllStep = 1;
}

function confirmResetAll() {
  if (appState.resetAllStep === 1) {
    appState.resetAllStep = 2;
    elements.resetAllDialogTitle.textContent = "此操作无法恢复";
    elements.resetAllDialogMessage.textContent = "建议先导出备份。再次确认后，两个词库的全部本地数据都会被删除。";
    elements.resetAllConfirm.textContent = "确定全部删除";
    return;
  }

  storage.resetAllData();
  studyController.clearSessions("cet4");
  studyController.clearSessions("cet6");
  appState.activeBookId = storage.getCurrentBook();
  closeResetAllDialog();
  initializeTheme();
  showHome();
  showToast("全部本地学习数据已重置");
}

function renderGoalPicker() {
  const book = getActiveBook();
  elements.dailyGoalOptions.forEach((option) => {
    const isSelected = Number(option.dataset.dailyGoal) === book.dailyGoal;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  elements.dailyGoalDescription.textContent = `${book.shortName} 当前每天学习 ${book.dailyGoal} 个新词。`;
}

function renderVocabularyScopePicker() {
  const book = getActiveBook();
  const scope = getVocabularyScope(book);
  const coreCount = book.words.filter((word) => word.isCore).length;
  elements.vocabularyScopeOptions.forEach((option) => {
    const isSelected = option.dataset.vocabularyScope === scope;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
  elements.vocabularyScopeDescription.textContent = scope === "all"
    ? `${book.shortName} 每日新词可从 ${formatNumber(book.words.length)} 个核心及补充词中安排。`
    : `${book.shortName} 每日新词只从 ${formatNumber(coreCount)} 个核心词中安排，补充词仍可搜索和复习。`;
}

function renderStudyModePicker() {
  const studyMode = getStudyMode();
  elements.studyModeOptions.forEach((option) => {
    const isSelected = option.dataset.studyMode === studyMode;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
  elements.studyModeDescription.textContent = studyMode === STUDY_MODES.ZH_TO_EN
    ? "题目显示精简中文释义，从四个英文单词中选择答案。"
    : "题目显示英文单词，从四个中文释义中选择答案。";
}

function renderLearningOrderPicker() {
  const order = storage.getLearningOrder();
  elements.learningOrderOptions.forEach((option) => {
    const isSelected = option.dataset.learningOrder === order;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
  elements.learningOrderDescription.textContent = order === "smart"
    ? "优先安排真题覆盖更广的词；每个频率层级独立洗牌，不按层内词频排序。"
    : "使用原有持久随机队列，未学词全部轮到一次后再开启下一轮。";
  elements.learningOrderStatus.dataset.status = appState.frequency.status;
  elements.learningOrderStatus.textContent = appState.frequency.status === "ready"
    ? "词频数据已加载 · 智能顺序可用"
    : appState.frequency.status === "fallback-random"
      ? "词频数据暂不可用 · 本次自动回退为完全随机"
      : "词频数据准备中…";
}

function setAiConnectionStatus(status, message) {
  elements.aiConnectionStatus.dataset.status = status;
  elements.aiConnectionStatus.textContent = `状态：${message}`;
}

function renderAiJudgeSettings() {
  const settings = storage.getAiJudgeSettings();
  const token = storage.getAiProxyToken();
  elements.aiProxyUrl.value = settings.proxyUrl;
  elements.aiProxyToken.value = token;
  elements.aiDisableButton.hidden = !settings.enabled;
  if (settings.enabled && settings.proxyUrl && token) {
    setAiConnectionStatus("connected", "已启用");
  } else if (settings.proxyUrl || token) {
    setAiConnectionStatus("unconfigured", "配置未完成或尚未通过测试");
  } else {
    setAiConnectionStatus("unconfigured", "未配置");
  }
}

async function saveAndTestAiConnection() {
  const proxyUrl = elements.aiProxyUrl.value.trim();
  const token = elements.aiProxyToken.value.trim();
  storage.setAiJudgeSettings({ enabled: false, proxyUrl });
  storage.setAiProxyToken(token);
  elements.aiTestConnection.disabled = true;
  elements.aiTestConnection.textContent = "正在测试…";
  setAiConnectionStatus("testing", "正在连接");
  try {
    await aiJudge.testConnection({ proxyUrl, token });
    storage.setAiJudgeSettings({ enabled: true, proxyUrl });
    studyController.clearSessions("cet4");
    studyController.clearSessions("cet6");
    setAiConnectionStatus("connected", "连接正常，已启用");
    showToast("AI 中文释义巩固已启用");
  } catch (error) {
    storage.setAiJudgeSettings({ enabled: false, proxyUrl });
    setAiConnectionStatus("error", error?.message || "连接失败");
    showToast(error?.message || "AI 代理连接失败");
  } finally {
    elements.aiTestConnection.disabled = false;
    elements.aiTestConnection.textContent = "保存并测试连接";
    elements.aiDisableButton.hidden = !storage.getAiJudgeSettings().enabled;
  }
}

function disableAiReinforcement() {
  const settings = storage.getAiJudgeSettings();
  storage.setAiJudgeSettings({ enabled: false, proxyUrl: settings.proxyUrl });
  studyController.clearSessions("cet4");
  studyController.clearSessions("cet6");
  renderAiJudgeSettings();
  showToast("已停用远程 AI；释义巩固仍可使用本地判定或手动确认");
}

function showSettings() {
  const book = getActiveBook();
  setVisibleView("settings");
  elements.settingsBookBadge.textContent = book.shortName;
  elements.clearBookDescription.textContent = `只清空 ${book.shortName} 的进度、错词与收藏，不影响另一个词库。`;
  renderGoalPicker();
  renderVocabularyScopePicker();
  renderStudyModePicker();
  renderLearningOrderPicker();
  renderAiJudgeSettings();
  renderDataOverview();
  document.title = "设置 · 拾词";
}

function openClearDialog() {
  const book = getActiveBook();
  elements.clearDialogMessage.textContent = `将清空 ${book.shortName} 的全部学习记录，该操作无法撤销。`;
  if (typeof elements.clearDialog.showModal === "function") elements.clearDialog.showModal();
  else elements.clearDialog.setAttribute("open", "");
}

function closeClearDialog() {
  if (typeof elements.clearDialog.close === "function" && elements.clearDialog.open) {
    elements.clearDialog.close();
  } else {
    elements.clearDialog.removeAttribute("open");
  }
}

function confirmClearBook() {
  const book = getActiveBook();
  storage.clearBook(book.id);
  studyController.clearSessions(book.id);
  closeClearDialog();
  updateDashboard();
  renderDataOverview();
  showToast(`${book.shortName} 学习记录已清空，另一个词库未受影响`);
}

async function initializeWordBooks() {
  elements.continueButton.disabled = true;
  elements.continueButton.querySelector("span:first-child").textContent = "正在准备词库";

  try {
    const [cet4Result, cet6Result, frequencyResult] = await Promise.all([
      loadWordBook("cet4"),
      loadWordBook("cet6"),
      smartLearningOrder.loadFrequencyResources(),
    ]);
    appState.books.cet4.words = cet4Result.words;
    appState.books.cet4.source = cet4Result.source;
    appState.books.cet6.words = cet6Result.words;
    appState.books.cet6.source = cet6Result.source;
    appState.frequency = frequencyResult;

    elements.continueButton.disabled = false;
    updateDashboard(appState.activeBookId);

    const isFallback = [cet4Result, cet6Result].some((result) => result.source === "fallback");
    if (storage.getStatus().migrationPerformed) {
      showToast("旧版学习记录已无损升级，现有错词、收藏与答题次数均已保留");
    } else if (frequencyResult.status !== "ready") {
      showToast("真题词频数据暂不可用，本次已自动回退为完全随机顺序");
    } else if (isFallback) {
      showToast("当前使用内置测试词；通过本地服务运行可读取完整 JSON 词库");
    } else if (storage.getStatus().recoveredInvalidData) {
      showToast("检测到异常的本地记录，已安全恢复为可用数据");
    }
  } catch (error) {
    elements.continueButton.querySelector("span:first-child").textContent = "词库加载失败";
    showToast(error.message || "词库加载失败，请检查数据文件");
  }
}

elements.bookOptions.forEach((option) => {
  option.addEventListener("click", () => updateDashboard(option.dataset.book));
});

elements.themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme;
  setTheme(currentTheme === "dark" ? "light" : "dark");
});

elements.continueButton.addEventListener("click", () => showStudy("normal", { forceNew: true }));
elements.homeStudyModeButton.addEventListener("click", () => {
  const nextMode = getStudyMode() === STUDY_MODES.EN_TO_ZH
    ? STUDY_MODES.ZH_TO_EN
    : STUDY_MODES.EN_TO_ZH;
  setStudyMode(nextMode);
});
elements.collectionBackButton.addEventListener("click", showHome);
elements.collectionStudyButton.addEventListener("click", () => {
  showStudy(appState.collectionMode, { forceNew: true });
});
elements.collectionSearch.addEventListener("input", renderCollection);
elements.collectionEmptyAction.addEventListener("click", () => {
  if (elements.collectionSearch.value) {
    elements.collectionSearch.value = "";
    renderCollection();
  } else {
    showStudy("normal", { forceNew: true });
  }
});

elements.wordListBackButton.addEventListener("click", showHome);
elements.wordListSearch.addEventListener("input", () => {
  appState.wordList.query = elements.wordListSearch.value;
  appState.wordList.page = 1;
  renderWordList();
});
elements.wordFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    appState.wordList.filter = button.dataset.wordFilter;
    appState.wordList.page = 1;
    renderWordList();
  });
});
elements.wordListSort.addEventListener("change", () => {
  appState.wordList.sort = elements.wordListSort.value;
  appState.wordList.page = 1;
  renderWordList();
});
elements.wordListPrev.addEventListener("click", () => {
  appState.wordList.page -= 1;
  renderWordList();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.wordListNext.addEventListener("click", () => {
  appState.wordList.page += 1;
  renderWordList();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.wordDetailClose.addEventListener("click", closeWordDetail);
elements.wordDetailDialog.addEventListener("click", (event) => {
  if (event.target === elements.wordDetailDialog) closeWordDetail();
});
elements.wordDetailSpeak.addEventListener("click", () => {
  const word = getDetailWord();
  if (word && !speakEnglish(word.word)) showToast("当前浏览器不支持语音朗读");
});
elements.wordDetailFavorite.addEventListener("click", () => {
  const book = getActiveBook();
  const word = getDetailWord();
  if (!word) return;
  storage.toggleFavorite(book.id, word.word);
  renderWordDetail();
  renderWordList();
  updateDashboard();
});
elements.wordDetailWrongBook.addEventListener("click", () => {
  const book = getActiveBook();
  const word = getDetailWord();
  if (!word) return;
  const progress = storage.getWordProgress(book.id, word.word);
  storage.setWrongBookState(book.id, word.word, !progress.inWrongBook);
  renderWordDetail();
  renderWordList();
  updateDashboard();
});

elements.statisticsBackButton.addEventListener("click", showHome);

elements.settingsBackButton.addEventListener("click", showHome);
elements.aiTestConnection.addEventListener("click", saveAndTestAiConnection);
elements.aiDisableButton.addEventListener("click", disableAiReinforcement);
elements.dailyGoalOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const book = getActiveBook();
    book.dailyGoal = storage.setDailyNewWordGoal(book.id, Number(option.dataset.dailyGoal));
    renderGoalPicker();
    updateDashboard();
    showToast(`${book.shortName} 每日新词目标已改为 ${book.dailyGoal} 个`);
  });
});
elements.vocabularyScopeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const book = getActiveBook();
    const scope = storage.setVocabularyScope(book.id, option.dataset.vocabularyScope);
    studyController.clearSessions(book.id);
    renderVocabularyScopePicker();
    updateDashboard();
    showToast(scope === "all" ? "每日新词已包含补充词汇" : "每日新词已切换为仅核心词汇");
  });
});
elements.studyModeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const savedMode = setStudyMode(option.dataset.studyMode, { announce: false });
    renderStudyModePicker();
    updateDashboard();
    showToast(`学习模式已切换为${getStudyModeLabel(savedMode)}`);
  });
});
elements.learningOrderOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const savedOrder = storage.setLearningOrder(option.dataset.learningOrder);
    studyController.clearSessions("cet4");
    studyController.clearSessions("cet6");
    renderLearningOrderPicker();
    showToast(savedOrder === "smart" ? "新词已切换为真题智能顺序" : "新词已切换为完全随机顺序");
  });
});
elements.exportDataButton.addEventListener("click", () => {
  const result = backupService.exportBackup();
  renderDataOverview();
  showToast(`已导出 ${result.fileName}，包含两个词库的全部学习数据`);
});
elements.importDataInput.addEventListener("change", () => prepareImport(elements.importDataInput.files?.[0]));
elements.importCancelButton.addEventListener("click", closeImportDialog);
elements.importConfirmButton.addEventListener("click", confirmImport);
elements.importDialog.addEventListener("click", (event) => {
  if (event.target === elements.importDialog) closeImportDialog();
});
elements.clearBookButton.addEventListener("click", openClearDialog);
elements.clearCancelButton.addEventListener("click", closeClearDialog);
elements.clearConfirmButton.addEventListener("click", confirmClearBook);
elements.clearDialog.addEventListener("click", (event) => {
  if (event.target === elements.clearDialog) closeClearDialog();
});
elements.resetAllButton.addEventListener("click", openResetAllDialog);
elements.resetAllCancel.addEventListener("click", closeResetAllDialog);
elements.resetAllConfirm.addEventListener("click", confirmResetAll);
elements.resetAllDialog.addEventListener("click", (event) => {
  if (event.target === elements.resetAllDialog) closeResetAllDialog();
});

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    if (page === "wrong" || page === "favorite") showCollection(page);
    if (page === "words") showWordList();
    if (page === "statistics") showStatistics();
    if (page === "settings") showSettings();
  });
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => showStudy(button.dataset.mode, { forceNew: true }));
});

document.querySelectorAll("[data-feature]").forEach((button) => {
  button.addEventListener("click", () => showToast(`${button.dataset.feature}将在后续阶段开放`));
});

document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  showHome();
});

setTodayLabel();
initializeTheme();
updateDashboard(appState.activeBookId);
initializeWordBooks();
