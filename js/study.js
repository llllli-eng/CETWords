(function registerStudyController(app) {
  const {
    createStudyQuestion,
    getStudyModeLabel,
    normalizeStudyMode,
    STUDY_MODES,
    speakEnglish,
    reviewScheduler,
    newWordLearning,
    reviewRecovery,
    activeRecallResult,
    aiJudge,
    confusableWords,
  } = app;
  const OPTION_LABELS = ["A", "B", "C", "D"];

  function getCurrentDateKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  class StudyController {
    constructor({
      onExit,
      onAnswer,
      onToggleFavorite,
      getWordProgress,
      getExamValue,
      getStudyMode,
      onStudyModeChange,
      onRestart,
      onMessage,
      isAiReinforcementEnabled,
      onAiJudgeMeaning,
      onAiFallback,
      onComplete,
      onStartGroupBreak,
      onContinueGroup,
      onStopDailyGroups,
      onDailyGroupStarted,
      onReviewTaskStarted,
      onManualMaster,
      onUndoManualMaster,
      onVerifiedNewWordMastery,
      onUndoVerifiedNewWordMastery,
      onDeferToday,
      onOpenQuickCleanup,
      onStartReviewBreak,
      onContinueReviewTask,
      onStopReviewSession,
      onEncounterWord,
      onOpenConfusable,
      onDetectConfusion,
      onAcceptConfusion,
      onCreateConfusablePair,
      onStartConfusablePractice,
      getLearningWord,
      getMeaningReferenceWord,
      hasMeaningOverride,
      onOpenMeaningAudit,
      onEditMeaningOverride,
    }) {
      this.onExit = onExit;
      this.onAnswer = onAnswer;
      this.onToggleFavorite = onToggleFavorite;
      this.getWordProgress = getWordProgress;
      this.getExamValue = getExamValue;
      this.getStudyMode = getStudyMode;
      this.onStudyModeChange = onStudyModeChange;
      this.onRestart = onRestart;
      this.onMessage = onMessage;
      this.isAiReinforcementEnabled = isAiReinforcementEnabled;
      this.onAiJudgeMeaning = onAiJudgeMeaning;
      this.onAiFallback = onAiFallback;
      this.onComplete = onComplete;
      this.onStartGroupBreak = onStartGroupBreak;
      this.onContinueGroup = onContinueGroup;
      this.onStopDailyGroups = onStopDailyGroups;
      this.onDailyGroupStarted = onDailyGroupStarted;
      this.onReviewTaskStarted = onReviewTaskStarted;
      this.onManualMaster = onManualMaster;
      this.onUndoManualMaster = onUndoManualMaster;
      this.onVerifiedNewWordMastery = onVerifiedNewWordMastery;
      this.onUndoVerifiedNewWordMastery = onUndoVerifiedNewWordMastery;
      this.onDeferToday = onDeferToday;
      this.onOpenQuickCleanup = onOpenQuickCleanup;
      this.onStartReviewBreak = onStartReviewBreak;
      this.onContinueReviewTask = onContinueReviewTask;
      this.onStopReviewSession = onStopReviewSession;
      this.onEncounterWord = onEncounterWord;
      this.onOpenConfusable = onOpenConfusable;
      this.onDetectConfusion = onDetectConfusion;
      this.onAcceptConfusion = onAcceptConfusion;
      this.onCreateConfusablePair = onCreateConfusablePair;
      this.onStartConfusablePractice = onStartConfusablePractice;
      this.getLearningWord = getLearningWord;
      this.getMeaningReferenceWord = getMeaningReferenceWord;
      this.hasMeaningOverride = hasMeaningOverride;
      this.onOpenMeaningAudit = onOpenMeaningAudit;
      this.onEditMeaningOverride = onEditMeaningOverride;
      this.sessions = new Map();
      this.activeSession = null;
      this.isActive = false;
      this.isComposingMeaning = false;
      this.isComposingNewWordMastery = false;
      this.newWordMasteryState = null;

      this.elements = {
        root: document.querySelector("#study-view"),
        backButton: document.querySelector("#study-back-button"),
        bookBadge: document.querySelector("#study-book-badge"),
        modeBadge: document.querySelector("#study-mode-badge"),
        modeSwitch: document.querySelector("#study-mode-switch"),
        progressCaption: document.querySelector("#study-progress-caption"),
        progressText: document.querySelector("#study-progress-text"),
        progressBar: document.querySelector("#study-progress-bar"),
        questionScreen: document.querySelector("#question-screen"),
        questionNumber: document.querySelector("#question-number"),
        questionMode: document.querySelector("#study-question-mode"),
        learningPhase: document.querySelector("#study-learning-phase"),
        word: document.querySelector("#study-word"),
        phonetic: document.querySelector("#study-phonetic"),
        favoriteButton: document.querySelector("#study-favorite-button"),
        speakButton: document.querySelector("#study-speak-button"),
        examValue: document.querySelector("#study-exam-value"),
        examTier: document.querySelector("#study-exam-tier"),
        examCoverage: document.querySelector("#study-exam-coverage"),
        examOccurrences: document.querySelector("#study-exam-occurrences"),
        examSource: document.querySelector("#study-exam-source"),
        examIncomplete: document.querySelector("#study-exam-incomplete"),
        options: document.querySelector("#answer-options"),
        newWordMasteredButton: document.querySelector("#new-word-mastered-button"),
        answerInstruction: document.querySelector("#answer-instruction"),
        keyboardHint: document.querySelector(".keyboard-hint"),
        meaningForm: document.querySelector("#meaning-answer-form"),
        meaningInput: document.querySelector("#meaning-answer-input"),
        meaningStatus: document.querySelector("#meaning-answer-status"),
        meaningSubmit: document.querySelector("#meaning-submit-button"),
        reviewQuestionActions: document.querySelector("#review-question-actions"),
        reviewManualMaster: document.querySelector("#review-manual-master-button"),
        reviewMoreActions: document.querySelector("#review-more-actions"),
        reviewLater: document.querySelector("#review-later-button"),
        reviewDefer: document.querySelector("#review-defer-button"),
        feedback: document.querySelector("#answer-feedback"),
        feedbackIcon: document.querySelector("#feedback-icon"),
        feedbackTitle: document.querySelector("#feedback-title"),
        feedbackText: document.querySelector("#feedback-text"),
        aiFeedbackDetails: document.querySelector("#ai-feedback-details"),
        aiFeedbackUserAnswer: document.querySelector("#ai-feedback-user-answer"),
        aiFeedbackStandardMeaning: document.querySelector("#ai-feedback-standard-meaning"),
        aiFeedbackJudgement: document.querySelector("#ai-feedback-judgement"),
        manualActions: document.querySelector("#manual-judgement-actions"),
        manualCorrect: document.querySelector("#manual-correct-button"),
        manualWrong: document.querySelector("#manual-wrong-button"),
        manualLater: document.querySelector("#manual-later-button"),
        details: document.querySelector("#word-details"),
        detailWord: document.querySelector("#detail-word"),
        detailPhonetic: document.querySelector("#detail-phonetic"),
        detailMeaning: document.querySelector("#detail-meaning"),
        detailExample: document.querySelector("#detail-example"),
        detailTranslation: document.querySelector("#detail-translation"),
        detailSpeakButton: document.querySelector("#detail-speak-button"),
        confusableButton: document.querySelector("#study-confusable-button"),
        meaningTools: document.querySelector("#study-meaning-tools"),
        meaningStatus: document.querySelector("#study-meaning-status"),
        meaningAudit: document.querySelector("#study-meaning-audit"),
        meaningEdit: document.querySelector("#study-meaning-edit"),
        confusionDetected: document.querySelector("#study-confusion-detected"),
        confusionIcon: document.querySelector("#study-confusion-icon"),
        confusionTitle: document.querySelector("#study-confusion-title"),
        confusionCount: document.querySelector("#study-confusion-count"),
        confusionCurrentWord: document.querySelector("#study-confusion-current-word"),
        confusionCurrentMeaning: document.querySelector("#study-confusion-current-meaning"),
        confusionWord: document.querySelector("#study-confusion-word"),
        confusionMeaning: document.querySelector("#study-confusion-meaning"),
        confusionNote: document.querySelector("#study-confusion-note"),
        confusionAdd: document.querySelector("#study-confusion-add"),
        confusionPractice: document.querySelector("#study-confusion-practice"),
        confusionView: document.querySelector("#study-confusion-view"),
        nextButton: document.querySelector("#next-word-button"),
        resultScreen: document.querySelector("#result-screen"),
        resultTitle: document.querySelector("#result-title"),
        resultTotal: document.querySelector("#result-total"),
        resultNote: document.querySelector("#result-note"),
        resultCorrect: document.querySelector("#result-correct"),
        resultWrong: document.querySelector("#result-wrong"),
        resultPartial: document.querySelector("#result-partial"),
        resultAccuracy: document.querySelector("#result-accuracy"),
        resultHomeButton: document.querySelector("#result-home-button"),
        restartButton: document.querySelector("#restart-button"),
        groupCompleteScreen: document.querySelector("#group-complete-screen"),
        groupCompleteTitle: document.querySelector("#group-complete-title"),
        groupCompleteTotal: document.querySelector("#group-complete-total"),
        groupCompletePercent: document.querySelector("#group-complete-percent"),
        groupCompleteNew: document.querySelector("#group-complete-new"),
        groupCompleteVerified: document.querySelector("#group-complete-verified"),
        groupCompleteRecall: document.querySelector("#group-complete-recall"),
        groupCompleteCorrected: document.querySelector("#group-complete-corrected"),
        groupBreakSuggestion: document.querySelector("#group-break-suggestion"),
        groupStartBreak: document.querySelector("#group-start-break"),
        groupContinue: document.querySelector("#group-continue"),
        groupStopToday: document.querySelector("#group-stop-today"),
        groupBreakScreen: document.querySelector("#group-break-screen"),
        groupBreakTimer: document.querySelector("#group-break-timer"),
        groupBreakMessage: document.querySelector("#group-break-message"),
        groupBreakContinue: document.querySelector("#group-break-continue"),
        groupBreakStop: document.querySelector("#group-break-stop"),
        reviewSegmentScreen: document.querySelector("#review-segment-screen"),
        reviewSegmentTotal: document.querySelector("#review-segment-total"),
        reviewSegmentCurrent: document.querySelector("#review-segment-current"),
        reviewSegmentAnswered: document.querySelector("#review-segment-answered"),
        reviewSegmentManualMastered: document.querySelector("#review-segment-manual-mastered"),
        reviewSegmentDeferred: document.querySelector("#review-segment-deferred"),
        reviewSegmentRemaining: document.querySelector("#review-segment-remaining"),
        reviewSegmentBacklog: document.querySelector("#review-segment-backlog"),
        reviewSegmentStartBreak: document.querySelector("#review-segment-start-break"),
        reviewSegmentContinue: document.querySelector("#review-segment-continue"),
        reviewSegmentQuickCleanup: document.querySelector("#review-segment-quick-cleanup"),
        reviewSegmentStop: document.querySelector("#review-segment-stop"),
        reviewBreakScreen: document.querySelector("#review-break-screen"),
        reviewBreakTimer: document.querySelector("#review-break-timer"),
        reviewBreakMessage: document.querySelector("#review-break-message"),
        reviewBreakContinue: document.querySelector("#review-break-continue"),
        reviewBreakStop: document.querySelector("#review-break-stop"),
        newWordMasteryDialog: document.querySelector("#new-word-mastery-dialog"),
        newWordMasteryClose: document.querySelector("#new-word-mastery-close"),
        newWordMasteryWord: document.querySelector("#new-word-mastery-word"),
        newWordMasteryPhonetic: document.querySelector("#new-word-mastery-phonetic"),
        newWordMasteryForm: document.querySelector("#new-word-mastery-form"),
        newWordMasteryInput: document.querySelector("#new-word-mastery-input"),
        newWordMasteryStatus: document.querySelector("#new-word-mastery-status"),
        newWordMasterySubmit: document.querySelector("#new-word-mastery-submit"),
        newWordMasteryResult: document.querySelector("#new-word-mastery-result"),
        newWordMasteryResultTitle: document.querySelector("#new-word-mastery-result-title"),
        newWordMasteryUserAnswer: document.querySelector("#new-word-mastery-user-answer"),
        newWordMasteryStandard: document.querySelector("#new-word-mastery-standard"),
        newWordMasteryJudgement: document.querySelector("#new-word-mastery-judgement"),
        newWordMasteryResultNote: document.querySelector("#new-word-mastery-result-note"),
        newWordMasteryResultAction: document.querySelector("#new-word-mastery-result-action"),
      };

      this.breakTimer = null;

      this.bindEvents();
    }

    bindEvents() {
      this.elements.backButton.addEventListener("click", () => this.exit());
      this.elements.favoriteButton.addEventListener("click", () => this.toggleCurrentFavorite());
      this.elements.speakButton.addEventListener("click", () => this.speakCurrentWord());
      this.elements.detailSpeakButton.addEventListener("click", () => this.speakCurrentWord());
      this.elements.confusableButton.addEventListener("click", () => {
        const question = this.getCurrentQuestion();
        if (question?.selectedIndex !== null) this.onOpenConfusable?.(question.word, { source: "study-result" });
      });
      this.elements.meaningAudit.addEventListener("click", () => {
        const question = this.getCurrentQuestion();
        if (this.isMeaningAuditAvailable(question)) this.onOpenMeaningAudit?.(question.word, { source: "study-result" });
      });
      this.elements.meaningEdit.addEventListener("click", () => {
        const question = this.getCurrentQuestion();
        if (this.isMeaningAuditAvailable(question)) this.onEditMeaningOverride?.(question.word, { source: "study-result" });
      });
      this.elements.confusionAdd.addEventListener("click", () => this.addDetectedConfusion());
      this.elements.confusionPractice.addEventListener("click", () => this.practiceDetectedConfusion());
      this.elements.confusionView.addEventListener("click", () => this.viewDetectedConfusion());
      this.elements.nextButton.addEventListener("click", () => this.nextQuestion());
      this.elements.newWordMasteredButton.addEventListener("click", () => this.openNewWordMasteryDialog());
      this.elements.newWordMasteryClose.addEventListener("click", () => this.closeNewWordMasteryDialog());
      this.elements.newWordMasteryForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.isComposingNewWordMastery) return;
        this.submitNewWordMasteryMeaning();
      });
      this.elements.newWordMasteryInput.addEventListener("compositionstart", () => {
        this.isComposingNewWordMastery = true;
      });
      this.elements.newWordMasteryInput.addEventListener("compositionend", () => {
        this.isComposingNewWordMastery = false;
      });
      this.elements.newWordMasteryResultAction.addEventListener("click", () => this.finishNewWordMasteryDialog());
      this.elements.newWordMasteryDialog.addEventListener("cancel", (event) => {
        if (this.newWordMasteryState?.result?.changed) {
          event.preventDefault();
          this.finishNewWordMasteryDialog();
        }
      });
      this.elements.resultHomeButton.addEventListener("click", () => this.exit());
      this.elements.restartButton.addEventListener("click", () => this.restart());
      this.elements.groupStartBreak.addEventListener("click", () => this.startGroupBreak());
      this.elements.groupContinue.addEventListener("click", () => this.continueDailyGroup());
      this.elements.groupStopToday.addEventListener("click", () => this.stopDailyGroups());
      this.elements.groupBreakContinue.addEventListener("click", () => this.continueDailyGroup());
      this.elements.groupBreakStop.addEventListener("click", () => this.stopDailyGroups());
      this.elements.modeSwitch.addEventListener("click", () => this.switchStudyMode());
      this.elements.meaningForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.isComposingMeaning) return;
        this.submitMeaningAnswer();
      });
      this.elements.meaningInput.addEventListener("compositionstart", () => {
        this.isComposingMeaning = true;
      });
      this.elements.meaningInput.addEventListener("compositionend", () => {
        this.isComposingMeaning = false;
      });
      this.elements.manualCorrect.addEventListener("click", () => this.applyManualJudgement("correct"));
      this.elements.manualWrong.addEventListener("click", () => this.applyManualJudgement("wrong"));
      this.elements.manualLater.addEventListener("click", () => this.deferAiQuestion());
      this.elements.reviewManualMaster.addEventListener("click", () => this.manualMasterCurrentWord());
      this.elements.reviewLater.addEventListener("click", () => this.moveCurrentReviewLater());
      this.elements.reviewDefer.addEventListener("click", () => this.deferCurrentReviewToday());
      this.elements.reviewSegmentStartBreak.addEventListener("click", () => this.startReviewBreak());
      this.elements.reviewSegmentContinue.addEventListener("click", () => this.continueReviewTask());
      this.elements.reviewSegmentQuickCleanup.addEventListener("click", () => this.openReviewSegmentQuickCleanup());
      this.elements.reviewSegmentStop.addEventListener("click", () => this.stopReviewSession());
      this.elements.reviewBreakContinue.addEventListener("click", () => this.continueReviewTask());
      this.elements.reviewBreakStop.addEventListener("click", () => this.stopReviewSession());
      document.addEventListener("keydown", (event) => this.handleKeyboard(event));
    }

    createSession(book) {
      const sessionMode = book.sessionMode || "normal";
      return {
        key: `${book.id}:${sessionMode}`,
        sessionMode,
        book,
        isExtra: Boolean(book.isExtra),
        questions: book.studyItems.map((item) => ({
          word: item.word,
          taskType: item.taskType,
          learningPhase: item.learningPhase || newWordLearning.LEARNING_PHASES.STANDARD_REVIEW,
          forcedStudyMode: item.forcedStudyMode || null,
          learningState: item.learningState || null,
          recoveryState: item.recoveryState || null,
          studyMode: null,
          prompt: null,
          options: null,
          selectedIndex: null,
          answerResult: null,
          userAnswer: "",
          judgement: null,
          judgementSource: "",
          judgementFeedback: "",
          aiPending: false,
          resultScrollHandled: false,
          wasPresented: false,
          presentedAt: null,
          interactionDurationMs: null,
          confusionCandidate: null,
          confusionEventId: null,
        })),
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        partialCount: 0,
        normalSessionAnswerSequence: Number(book.normalSessionAnswerSequence) || 0,
        studySessionId: book.studySessionId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        recentWordIds: [],
        lastPresentedWordId: null,
        waitingForReinforcement: false,
        isComplete: false,
      };
    }

    start(book, { forceNew = false } = {}) {
      const sessionKey = `${book.id}:${book.sessionMode || "normal"}`;
      let session = this.sessions.get(sessionKey);

      if (forceNew || !session || session.isComplete) {
        session = this.createSession(book);
        this.sessions.set(sessionKey, session);
      } else {
        session.book = book;
      }

      this.activeSession = session;
      this.isActive = true;
      this.elements.bookBadge.textContent = this.getBookBadgeText(book);
      this.elements.resultHomeButton.textContent = book.returnLabel || "返回首页";
      this.elements.questionScreen.hidden = false;
      this.elements.resultScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = true;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      if (book.reviewTaskSummary?.breakStartedAt) {
        this.showReviewBreak(book);
        return;
      }
      if (book.reviewTaskSummary?.pendingBreak) {
        this.showReviewSegmentComplete(book);
        return;
      }
      this.renderQuestion();
    }

    getBookBadgeText(book) {
      if (book.sessionMode === "review") return `${book.shortName} · 今日复习`;
      if (book.sessionMode === "wrong") return `${book.shortName} · 错词`;
      if (book.sessionMode === "favorite") return `${book.shortName} · 收藏`;
      return `${book.shortName} · 每日计划`;
    }

    exit() {
      const mode = this.activeSession?.sessionMode || "normal";
      this.isActive = false;
      window.speechSynthesis?.cancel();
      this.clearBreakTimer();
      this.onExit(mode);
    }

    clearSessions(bookId) {
      [...this.sessions.keys()].forEach((key) => {
        if (key.startsWith(`${bookId}:`)) this.sessions.delete(key);
      });
      if (this.activeSession?.book.id === bookId) this.activeSession = null;
    }

    getCurrentQuestion() {
      return this.activeSession?.questions[this.activeSession.currentIndex] ?? null;
    }

    selectCurrentQuestion() {
      const session = this.activeSession;
      if (!session || !["normal", "review"].includes(session.sessionMode)) return Boolean(this.getCurrentQuestion());
      const remaining = session.questions.slice(session.currentIndex);
      const relativeIndex = newWordLearning.selectNextItemIndex({
        items: remaining,
        currentSequence: session.normalSessionAnswerSequence,
        dateKey: getCurrentDateKey(),
        now: Date.now(),
        pendingCount: session.book.pendingReinforcementCount || 0,
        recentWordIds: session.recentWordIds,
        studySessionId: session.studySessionId,
      });
      if (relativeIndex < 0) return false;
      const selectedIndex = session.currentIndex + relativeIndex;
      if (selectedIndex !== session.currentIndex) {
        const [selected] = session.questions.splice(selectedIndex, 1);
        session.questions.splice(session.currentIndex, 0, selected);
      }
      return true;
    }

    recordPresentedQuestion(question) {
      const session = this.activeSession;
      if (!session || !question || question.wasPresented) return;
      const wordId = question.word.word;
      question.wasPresented = true;
      question.presentedAt = Date.now();
      if (question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE) {
        this.onReviewTaskStarted?.(session.book.id, wordId);
      }
      if (
        session.sessionMode === "normal"
        && question.learningPhase === newWordLearning.LEARNING_PHASES.INTRO
        && session.book.groupPlan
        && !session.book.groupPlan.startedAt
      ) {
        session.book.groupPlan = this.onDailyGroupStarted?.(session.book.id) || session.book.groupPlan;
      }
      session.lastPresentedWordId = wordId;
      session.recentWordIds.push(wordId);
      session.recentWordIds = session.recentWordIds.slice(-3);
      this.onEncounterWord?.(question.word, {
        learningPhase: question.learningPhase,
        sessionMode: session.sessionMode,
      });
    }

    isAiSubjectiveQuestion(question) {
      return Boolean(
        question
        && (
          question.learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT
          || question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE
          || question.learningPhase === reviewRecovery.RECOVERY_PHASE
        ),
      );
    }

    getLearningWordView(word) {
      return this.getLearningWord?.(word) || word;
    }

    getMeaningReference(word) {
      return this.getMeaningReferenceWord?.(word) || word;
    }

    isMeaningAuditAvailable(question) {
      return Boolean(
        question
        && question.selectedIndex !== null
        && [
          newWordLearning.LEARNING_PHASES.INTRO,
          newWordLearning.LEARNING_PHASES.CHOICE_RETRY,
          newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT,
        ].includes(question.learningPhase),
      );
    }

    renderMeaningTools(question) {
      const visible = this.isMeaningAuditAvailable(question);
      this.elements.meaningTools.hidden = !visible;
      if (!visible) return;
      const overridden = Boolean(this.hasMeaningOverride?.(question.word));
      this.elements.meaningStatus.hidden = !overridden;
      this.elements.meaningAudit.textContent = overridden ? "✨ 再次 AI 核验" : "✨ AI核验词义";
      this.elements.meaningEdit.textContent = overridden ? "✏️ 编辑我的释义" : "✏️ 修改我的释义";
    }

    prepareCurrentQuestion() {
      const session = this.activeSession;
      let question = this.getCurrentQuestion();
      while (session && question && !question.options) {
        if (this.isAiSubjectiveQuestion(question)) {
          question.studyMode = "ai-meaning";
          const isFormalReview = question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE;
          const isRecovery = question.learningPhase === reviewRecovery.RECOVERY_PHASE;
          question.prompt = {
            primary: question.word.word,
            secondary: question.word.phonetic || "",
            instruction: isFormalReview
              ? `Level ${reviewScheduler.getMasteryLevel(this.getWordProgress(session.book.id, question.word.word))} · 请主动写出中文释义`
              : isRecovery
                ? `纠错巩固 · Level ${reviewScheduler.getMasteryLevel(this.getWordProgress(session.book.id, question.word.word))}`
                : "请写出你记得的中文意思",
            canSpeak: true,
          };
          question.options = [];
          return question;
        }
        const generated = createStudyQuestion(
          this.getLearningWordView(question.word),
          session.book.allWords,
          question.forcedStudyMode || this.getStudyMode(),
        );
        if (generated) {
          question.studyMode = generated.studyMode;
          question.prompt = generated.prompt;
          question.options = generated.options;
          return question;
        }

        session.questions.splice(session.currentIndex, 1);
        question = this.getCurrentQuestion();
      }
      return question;
    }

    renderQuestion() {
      const session = this.activeSession;
      if (!session) return;
      if (!this.selectCurrentQuestion()) {
        const hasRecovery = session.questions.slice(session.currentIndex)
          .some((item) => item.learningPhase === reviewRecovery.RECOVERY_PHASE);
        session.waitingForReinforcement = true;
        this.onMessage(hasRecovery
          ? "纠错正在形成随机记忆间隔，状态已保存，下次可继续"
          : "巩固正在形成记忆间隔，稍后继续效果更好");
        this.completeSession();
        return;
      }
      const question = this.prepareCurrentQuestion();
      if (!question) {
        this.completeSession();
        return;
      }
      this.recordPresentedQuestion(question);

      this.elements.questionScreen.hidden = false;
      this.elements.resultScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = true;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      this.elements.questionNumber.textContent = `第 ${session.currentIndex + 1} / ${session.questions.length} 词`;
      const isAiSubjective = question.studyMode === "ai-meaning";
      this.elements.questionMode.textContent = isAiSubjective
        ? question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE
          ? "主动释义复习"
          : question.learningPhase === reviewRecovery.RECOVERY_PHASE ? "Recovery 纠错" : "AI 释义巩固"
        : getStudyModeLabel(question.studyMode);
      const phaseLabels = {
        [newWordLearning.LEARNING_PHASES.INTRO]: "初学",
        [newWordLearning.LEARNING_PHASES.CHOICE_RETRY]: "四选一重试",
        [newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT]: "释义巩固",
        [reviewRecovery.FORMAL_REVIEW_PHASE]: `Level ${reviewScheduler.getMasteryLevel(this.getWordProgress(session.book.id, question.word.word))} · 到期复习`,
        [reviewRecovery.RECOVERY_PHASE]: `纠错巩固 · Level ${reviewScheduler.getMasteryLevel(this.getWordProgress(session.book.id, question.word.word))}`,
        [newWordLearning.LEARNING_PHASES.STANDARD_REVIEW]: question.taskType === "review" ? "到期复习" : "主动练习",
      };
      this.elements.learningPhase.textContent = phaseLabels[question.learningPhase] || "常规学习";
      this.elements.learningPhase.dataset.learningPhase = question.learningPhase;
      this.elements.word.textContent = question.prompt.primary;
      this.elements.phonetic.textContent = question.prompt.secondary;
      this.elements.phonetic.hidden = !question.prompt.secondary;
      this.elements.speakButton.hidden = !question.prompt.canSpeak;
      this.elements.answerInstruction.textContent = question.prompt.instruction;
      this.elements.questionScreen.dataset.studyMode = question.studyMode;
      this.renderModeControls(question);
      this.renderFavoriteState();
      this.renderExamValue(question);
      this.renderProgress();
      this.renderAnswerArea(question);
      this.renderReviewQuestionActions(question);

      if (question.selectedIndex === null) {
        this.elements.feedback.hidden = true;
        this.elements.aiFeedbackDetails.hidden = true;
        this.elements.manualActions.hidden = true;
        this.elements.details.hidden = true;
        this.elements.confusableButton.hidden = true;
        this.elements.meaningTools.hidden = true;
        this.elements.confusionDetected.hidden = true;
        this.elements.nextButton.hidden = true;
      } else {
        this.renderFeedback(question);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    renderExamValue(question = this.getCurrentQuestion()) {
      const session = this.activeSession;
      const visible = Boolean(
        session
        && question
        && session.sessionMode === "normal"
        && question.learningPhase === newWordLearning.LEARNING_PHASES.INTRO,
      );
      this.elements.examValue.hidden = !visible;
      if (!visible) return;
      const value = this.getExamValue?.(session.book.id, question.word) || {};
      this.elements.examValue.dataset.tier = value.effectiveTier || "unknown";
      this.elements.examValue.dataset.rawTier = value.rawTier || "";
      this.elements.examValue.title = value.neutral && value.rawTier
        ? `原始真题频率 ${value.rawTier} 档；功能词不参与智能加权前置`
        : "现有 2021—2025 真题语料统计";
      this.elements.examTier.textContent = value.tierLabel || "暂无完整真题统计";
      this.elements.examCoverage.textContent = value.coverageLabel || "";
      this.elements.examCoverage.hidden = !value.coverageLabel;
      this.elements.examOccurrences.textContent = value.occurrenceLabel || "";
      this.elements.examOccurrences.hidden = !value.occurrenceLabel;
      this.elements.examSource.textContent = value.sourceLabel || "";
      this.elements.examSource.hidden = !value.sourceLabel;
      this.elements.examIncomplete.textContent = value.incompleteLabel || "";
      this.elements.examIncomplete.hidden = !value.incompleteLabel;
    }

    renderModeControls(question = this.getCurrentQuestion()) {
      if (!question) return;
      if (question.studyMode === "ai-meaning") {
        this.elements.modeBadge.textContent = question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE
          ? "主动释义复习"
          : question.learningPhase === reviewRecovery.RECOVERY_PHASE ? "Recovery 纠错" : "AI 释义巩固";
        this.elements.modeSwitch.hidden = true;
        return;
      }
      this.elements.modeSwitch.hidden = false;
      const selectedMode = normalizeStudyMode(this.getStudyMode());
      this.elements.modeBadge.textContent = getStudyModeLabel(question.studyMode);
      this.elements.modeSwitch.textContent = selectedMode === question.studyMode
        ? "切换模式"
        : `下题：${getStudyModeLabel(selectedMode)}`;
      this.elements.modeSwitch.setAttribute(
        "aria-label",
        selectedMode === question.studyMode
          ? `切换为${getStudyModeLabel(question.studyMode === STUDY_MODES.EN_TO_ZH ? STUDY_MODES.ZH_TO_EN : STUDY_MODES.EN_TO_ZH)}`
          : `下一题将使用${getStudyModeLabel(selectedMode)}，点击可再次切换`,
      );
    }

    switchStudyMode() {
      if (this.getCurrentQuestion()?.studyMode === "ai-meaning") return;
      const currentPreference = normalizeStudyMode(this.getStudyMode());
      const nextMode = currentPreference === STUDY_MODES.EN_TO_ZH
        ? STUDY_MODES.ZH_TO_EN
        : STUDY_MODES.EN_TO_ZH;
      this.onStudyModeChange(nextMode);
      this.renderModeControls();
      this.onMessage(`已切换为${getStudyModeLabel(nextMode)}，下一题生效`);
    }

    renderFavoriteState() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question) return;

      const favorite = Boolean(this.getWordProgress(session.book.id, question.word.word).favorite);
      this.elements.favoriteButton.classList.toggle("is-favorite", favorite);
      this.elements.favoriteButton.setAttribute("aria-pressed", String(favorite));
      this.elements.favoriteButton.setAttribute(
        "aria-label",
        favorite ? "取消收藏当前单词" : "收藏当前单词",
      );
      this.elements.favoriteButton.querySelector("span:first-child").textContent = favorite ? "★" : "☆";
      this.elements.favoriteButton.querySelector("span:last-child").textContent = favorite ? "已收藏" : "收藏";
    }

    toggleCurrentFavorite() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question) return;

      const favorite = this.onToggleFavorite(session.book.id, question.word.word);
      this.renderFavoriteState();
      this.onMessage(favorite ? "已加入收藏" : "已取消收藏");
    }

    renderProgress() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      const answered = session.currentIndex + (question?.selectedIndex !== null ? 1 : 0);
      const groupStatus = session.sessionMode === "normal" ? session.book.groupProgress : null;
      const groupCaption = groupStatus?.activeGroup
        ? `第${groupStatus.activeGroupIndex + 1}/${groupStatus.groups.length}组 · ${groupStatus.activeGroup.completedCount}/${groupStatus.activeGroup.size}`
        : null;

      if (session.sessionMode === "wrong" || session.sessionMode === "favorite") {
        this.elements.progressCaption.textContent = session.sessionMode === "wrong" ? "错词复习" : "收藏复习";
        this.elements.progressText.textContent = `${answered} / ${session.questions.length}`;
        this.setProgressBar(answered, session.questions.length);
        return;
      }

      if (
        question?.learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY
        || question?.learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT
      ) {
        this.elements.progressCaption.textContent = groupCaption || "当日巩固";
        this.elements.progressText.textContent = `${session.book.completedToday} / ${session.book.dailyGoal}`;
        this.setProgressBar(session.book.completedToday, session.book.dailyGoal);
        return;
      }

      if (question?.learningPhase === reviewRecovery.RECOVERY_PHASE) {
        this.elements.progressCaption.textContent = "纠错巩固";
        this.elements.progressText.textContent = `${answered} / ${session.questions.length}`;
        this.setProgressBar(answered, session.questions.length);
        return;
      }

      if (session.sessionMode === "review" || question?.taskType === "review") {
        this.elements.progressCaption.textContent = "到期复习";
        this.elements.progressText.textContent = `${session.book.reviewCompletedToday} / ${session.book.reviewTarget}`;
        this.setProgressBar(session.book.reviewCompletedToday, session.book.reviewTarget);
        return;
      }

      this.elements.progressCaption.textContent = session.isExtra ? "额外新词" : "新词";
      if (!session.isExtra && groupCaption) this.elements.progressCaption.textContent = groupCaption;
      this.elements.progressText.textContent = `${session.book.completedToday} / ${session.book.dailyGoal}`;
      this.setProgressBar(session.book.completedToday, session.book.dailyGoal);
    }

    setProgressBar(completed, total) {
      const percent = total ? Math.min(100, (completed / total) * 100) : 0;
      this.elements.progressBar.style.width = `${percent}%`;
      this.elements.progressBar.parentElement.setAttribute("aria-valuenow", String(completed));
      this.elements.progressBar.parentElement.setAttribute("aria-valuemax", String(Math.max(total, completed, 1)));
    }

    renderOptions(question) {
      const fragment = document.createDocumentFragment();

      question.options.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-option";
        button.dataset.optionIndex = String(index);

        const label = document.createElement("span");
        label.className = "answer-option__label";
        label.textContent = OPTION_LABELS[index];

        const meaning = document.createElement("span");
        meaning.className = "answer-option__meaning";
        meaning.textContent = option.text;

        const state = document.createElement("span");
        state.className = "answer-option__state";
        state.setAttribute("aria-hidden", "true");

        button.append(label, meaning, state);
        button.addEventListener("click", () => this.answer(index));

        if (question.selectedIndex !== null) {
          button.disabled = true;
          if (option.isCorrect) {
            button.classList.add("is-correct");
            state.textContent = "✓";
          } else if (index === question.selectedIndex) {
            button.classList.add("is-wrong");
            state.textContent = "×";
          }
        }

        fragment.append(button);
      });

      this.elements.options.replaceChildren(fragment);
    }

    renderAnswerArea(question) {
      this.renderReviewQuestionActions(question);
      const isSubjective = question.studyMode === "ai-meaning";
      const isFinalSubjectiveResult = isSubjective && activeRecallResult.isFinalResult(question);
      this.elements.options.hidden = isSubjective;
      this.elements.meaningForm.hidden = !isSubjective || isFinalSubjectiveResult;
      this.elements.keyboardHint.hidden = isSubjective;
      this.elements.questionScreen.classList.toggle("is-active-recall-result", isFinalSubjectiveResult);
      this.renderNewWordMasteryAction(question);
      if (!isSubjective) {
        this.renderOptions(question);
        return;
      }

      this.elements.options.replaceChildren();
      if (isFinalSubjectiveResult) {
        this.elements.meaningInput.blur();
        this.elements.meaningStatus.textContent = "";
        this.elements.meaningStatus.classList.remove("is-error");
        return;
      }
      this.elements.meaningInput.value = question.userAnswer || "";
      this.elements.meaningInput.disabled = question.selectedIndex !== null || question.aiPending;
      this.elements.meaningSubmit.disabled = question.selectedIndex !== null || question.aiPending;
      this.elements.meaningSubmit.innerHTML = question.aiPending
        ? "AI 判断中…"
        : '提交答案 <span class="meaning-submit-shortcut">Ctrl + Enter</span>';
      this.elements.meaningStatus.textContent = "";
      this.elements.meaningStatus.classList.remove("is-error");
      if (question.selectedIndex === null && !question.aiPending) {
        window.setTimeout(() => {
          const activeElement = document.activeElement;
          const isStudyNavigation = activeElement === this.elements.nextButton
            || activeElement === this.elements.meaningSubmit
            || activeElement?.classList?.contains("answer-option");
          if (
            activeElement === document.body
            || activeElement === this.elements.meaningInput
            || isStudyNavigation
          ) {
            this.elements.meaningInput.focus();
          }
        }, 0);
      }
    }

    renderNewWordMasteryAction(question = this.getCurrentQuestion()) {
      const visible = Boolean(
        this.activeSession?.sessionMode === "normal"
        && question?.learningPhase === newWordLearning.LEARNING_PHASES.INTRO
        && question.selectedIndex === null
        && !question.aiPending
        && !this.getWordProgress(this.activeSession.book.id, question.word.word).learned,
      );
      this.elements.newWordMasteredButton.hidden = !visible;
    }

    isNewWordMasteryEligible(question = this.getCurrentQuestion()) {
      return Boolean(
        this.activeSession?.sessionMode === "normal"
        && question
        && question.learningPhase === newWordLearning.LEARNING_PHASES.INTRO
        && question.selectedIndex === null
        && !question.aiPending
        && !this.getWordProgress(this.activeSession.book.id, question.word.word).learned,
      );
    }

    openNewWordMasteryDialog() {
      const question = this.getCurrentQuestion();
      if (!this.isNewWordMasteryEligible(question)) return;
      this.newWordMasteryState = { question, pending: false, result: null, judgement: null };
      this.elements.newWordMasteryWord.textContent = question.word.word;
      this.elements.newWordMasteryPhonetic.textContent = question.word.phonetic || "";
      this.elements.newWordMasteryPhonetic.hidden = !question.word.phonetic;
      this.elements.newWordMasteryInput.value = "";
      this.elements.newWordMasteryInput.disabled = false;
      this.elements.newWordMasterySubmit.disabled = false;
      this.elements.newWordMasterySubmit.textContent = "确认释义";
      this.elements.newWordMasteryStatus.textContent = "";
      this.elements.newWordMasteryStatus.classList.remove("is-error");
      this.elements.newWordMasteryForm.hidden = false;
      this.elements.newWordMasteryResult.hidden = true;
      this.elements.newWordMasteryResult.classList.remove("is-error");
      if (typeof this.elements.newWordMasteryDialog.showModal === "function") {
        this.elements.newWordMasteryDialog.showModal();
      } else this.elements.newWordMasteryDialog.setAttribute("open", "");
      window.setTimeout(() => this.elements.newWordMasteryInput.focus(), 0);
    }

    closeNativeNewWordMasteryDialog() {
      if (typeof this.elements.newWordMasteryDialog.close === "function"
        && this.elements.newWordMasteryDialog.open) {
        this.elements.newWordMasteryDialog.close();
      } else this.elements.newWordMasteryDialog.removeAttribute("open");
    }

    closeNewWordMasteryDialog() {
      if (this.newWordMasteryState?.result?.changed) {
        this.finishNewWordMasteryDialog();
        return;
      }
      this.closeNativeNewWordMasteryDialog();
      this.newWordMasteryState = null;
    }

    async submitNewWordMasteryMeaning() {
      const state = this.newWordMasteryState;
      const question = this.getCurrentQuestion();
      if (!state || state.question !== question || state.pending || !this.isNewWordMasteryEligible(question)) return;
      const userAnswer = this.elements.newWordMasteryInput.value.trim();
      if (!userAnswer) {
        this.elements.newWordMasteryStatus.textContent = "请先写出你记得的中文意思";
        this.elements.newWordMasteryStatus.classList.add("is-error");
        this.elements.newWordMasteryInput.focus();
        return;
      }
      state.userAnswer = userAnswer;
      state.pending = true;
      this.elements.newWordMasteryInput.disabled = true;
      this.elements.newWordMasterySubmit.disabled = true;
      this.elements.newWordMasterySubmit.textContent = "正在判断…";
      this.elements.newWordMasteryStatus.textContent = "正在核对你的主动释义…";
      this.elements.newWordMasteryStatus.classList.remove("is-error");
      try {
        const referenceWord = this.getMeaningReference(question.word);
        const localResult = aiJudge.localMeaningJudge(referenceWord, userAnswer);
        const judgementResult = localResult.decision === "judged"
          ? localResult
          : await this.onAiJudgeMeaning({ word: referenceWord, userAnswer });
        if (this.newWordMasteryState !== state || this.getCurrentQuestion() !== question) return;
        state.pending = false;
        state.judgement = judgementResult.result;
        state.judgementDetails = judgementResult;
        if (judgementResult.result === "correct") {
          state.result = this.onVerifiedNewWordMastery?.({
            bookId: this.activeSession.book.id,
            wordId: question.word.word,
          }) || null;
          if (!state.result?.changed) throw new Error("VERIFIED_MASTERY_NOT_SAVED");
          this.applyVerifiedMasteryResultToBook(state.result);
        }
        this.renderNewWordMasteryResult(state);
      } catch (error) {
        if (this.newWordMasteryState !== state || this.getCurrentQuestion() !== question) return;
        state.pending = false;
        state.error = error;
        this.renderNewWordMasteryUnavailable(state);
      }
    }

    applyVerifiedMasteryResultToBook(result) {
      const session = this.activeSession;
      if (!session || !result) return;
      if (result.daily) {
        session.book.daily = result.daily;
        session.book.completedToday = result.daily.completedNewWords;
        session.book.normalCompletedToday = result.daily.completedNewWordIds?.length || 0;
        session.book.verifiedManualMasteredToday = result.daily.verifiedManualMasteredNewWordIds?.length || 0;
      }
      if (result.pendingReinforcementCount !== undefined) {
        session.book.pendingReinforcementCount = result.pendingReinforcementCount;
      }
      if (result.groupPlan) session.book.groupPlan = result.groupPlan;
      if (result.groupProgress) session.book.groupProgress = result.groupProgress;
      this.renderProgress();
    }

    renderNewWordMasteryResult(state) {
      const judgement = state.judgement;
      const correct = judgement === "correct" && state.result?.changed;
      const partial = judgement === "partial";
      this.elements.newWordMasteryForm.hidden = true;
      this.elements.newWordMasteryResult.hidden = false;
      this.elements.newWordMasteryResult.classList.toggle("is-error", !correct);
      this.elements.newWordMasteryResultTitle.textContent = correct
        ? "✓ 已确认掌握"
        : partial ? "释义接近，但还不能跳过学习" : "释义未通过确认";
      this.elements.newWordMasteryUserAnswer.textContent = state.userAnswer;
      const learningWord = this.getLearningWordView(state.question.word);
      this.elements.newWordMasteryStandard.textContent = learningWord.coreMeaning
        || learningWord.shortMeaning
        || learningWord.meaning;
      this.elements.newWordMasteryJudgement.textContent = state.judgementDetails?.feedback
        || (correct ? "核心意思正确" : partial ? "方向接近，但核心义不够完整" : "当前回答与核心义不匹配");
      this.elements.newWordMasteryResultNote.textContent = correct
        ? "已退出今日新词学习、当日巩固与长期 SRS；收藏状态保持不变，可在单词详情中恢复。"
        : "这个词不会被标记为已掌握，请继续正常四选一学习。";
      this.elements.newWordMasteryResultAction.textContent = correct ? "学习下一个新词" : "继续正常学习";
    }

    renderNewWordMasteryUnavailable(state) {
      this.elements.newWordMasteryForm.hidden = true;
      this.elements.newWordMasteryResult.hidden = false;
      this.elements.newWordMasteryResult.classList.add("is-error");
      this.elements.newWordMasteryResultTitle.textContent = "暂时无法确认掌握";
      this.elements.newWordMasteryUserAnswer.textContent = state.userAnswer;
      this.elements.newWordMasteryStandard.textContent = "未展示";
      this.elements.newWordMasteryJudgement.textContent = "AI 暂时无法判断，本次不会标记为已掌握";
      this.elements.newWordMasteryResultNote.textContent = "学习记录没有变化，请继续正常四选一学习。";
      this.elements.newWordMasteryResultAction.textContent = "继续正常学习";
    }

    finishNewWordMasteryDialog() {
      const state = this.newWordMasteryState;
      this.closeNativeNewWordMasteryDialog();
      this.newWordMasteryState = null;
      if (!state?.result?.changed) return;
      const session = this.activeSession;
      const question = state.question;
      const questionIndex = session?.questions.indexOf(question) ?? -1;
      if (!session || questionIndex < 0) return;
      session.questions.splice(questionIndex, 1);
      session.currentIndex = Math.min(questionIndex, Math.max(0, session.questions.length - 1));
      this.onMessage(`✓ ${question.word.word} 已确认掌握`, {
        actionLabel: "撤销",
        duration: 8000,
        onAction: () => {
          const restored = this.onUndoVerifiedNewWordMastery?.(state.result.undo);
          if (!restored) return;
          if (this.activeSession !== session) return;
          this.applyVerifiedMasteryResultToBook(restored);
          question.wasPresented = false;
          question.presentedAt = null;
          question.interactionDurationMs = null;
          session.questions.splice(Math.min(questionIndex, session.questions.length), 0, question);
          session.currentIndex = Math.min(questionIndex, session.questions.length - 1);
          this.elements.groupCompleteScreen.hidden = true;
          this.elements.resultScreen.hidden = true;
          this.renderQuestion();
        },
      });
      if (session.book.groupProgress?.awaitingNextGroup) {
        this.showGroupComplete(session.book);
      } else if (session.questions.length) {
        this.renderQuestion();
      } else {
        this.completeSession();
      }
    }

    renderReviewQuestionActions(question = this.getCurrentQuestion()) {
      const isFormal = question?.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE;
      const isRecovery = question?.learningPhase === reviewRecovery.RECOVERY_PHASE;
      const visible = Boolean((isFormal || isRecovery) && question.selectedIndex === null && !question.aiPending);
      this.elements.reviewQuestionActions.hidden = !visible;
      this.elements.reviewMoreActions.hidden = !isFormal;
      if (!visible) this.elements.reviewMoreActions.open = false;
    }

    answer(selectedIndex) {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex !== null) return;

      question.selectedIndex = selectedIndex;
      const isCorrect = question.options[selectedIndex].isCorrect;
      if (isCorrect) session.correctCount += 1;
      else session.wrongCount += 1;

      const result = this.onAnswer({
        bookId: session.book.id,
        wordId: question.word.word,
        correct: isCorrect,
        studyMode: question.studyMode,
        sessionMode: session.sessionMode,
        taskType: question.taskType,
        learningPhase: question.learningPhase,
        studySessionId: session.studySessionId,
        interactionDurationMs: this.getInteractionDuration(question),
      });
      question.answerResult = result;
      session.normalSessionAnswerSequence = result.answerSequence;
      session.book.completedToday = result.daily.completedNewWords;
      session.book.pendingReinforcementCount = result.pendingReinforcementCount
        ?? session.book.pendingReinforcementCount;
      session.book.reviewCompletedToday = result.daily.reviewWords;
      if (result.reviewTaskSummary) {
        session.book.reviewTaskSummary = result.reviewTaskSummary;
        session.book.reviewCompletedToday = result.reviewTaskSummary.handledCount;
      }
      if (result.groupPlan) session.book.groupPlan = result.groupPlan;
      if (result.groupProgress) session.book.groupProgress = result.groupProgress;
      this.syncReinforcementQueue(question, result);

      this.renderOptions(question);
      this.renderProgress();
      this.renderFeedback(question);
    }

    async submitMeaningAnswer() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (
        !this.isActive
        || !session
        || !question
        || question.studyMode !== "ai-meaning"
        || question.selectedIndex !== null
        || question.aiPending
      ) return;

      const userAnswer = this.elements.meaningInput.value.trim();
      if (!userAnswer) {
        this.elements.meaningStatus.textContent = "请输入你记得的中文意思";
        this.elements.meaningStatus.classList.add("is-error");
        this.elements.meaningInput.focus();
        return;
      }
      question.userAnswer = userAnswer;
      question.interactionDurationMs = this.getInteractionDuration(question);
      const referenceWord = this.getMeaningReference(question.word);
      const localResult = aiJudge.localMeaningJudge(referenceWord, userAnswer);
      if (localResult.decision === "judged") {
        this.applySubjectiveJudgement(localResult.result, localResult);
        return;
      }

      question.aiPending = true;
      this.renderAnswerArea(question);
      this.elements.meaningStatus.textContent = "正在理解你的表述…";
      try {
        const result = await this.onAiJudgeMeaning({ word: referenceWord, userAnswer });
        if (this.getCurrentQuestion() !== question || question.selectedIndex !== null) return;
        this.applySubjectiveJudgement(result.result, result);
      } catch (error) {
        if (this.getCurrentQuestion() !== question || question.selectedIndex !== null) return;
        question.aiPending = false;
        this.showAiUnavailable(question, error?.message || "AI 判断暂时不可用");
      }
    }

    applySubjectiveJudgement(judgement, details = {}) {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex !== null) return;

      question.aiPending = false;
      question.selectedIndex = -1;
      question.judgement = judgement;
      question.judgementSource = details.source || "deepseek";
      question.judgementFeedback = details.feedback || "";
      if (judgement === "correct") session.correctCount += 1;
      else if (judgement === "partial") session.partialCount += 1;
      else session.wrongCount += 1;

      const result = this.onAnswer({
        bookId: session.book.id,
        wordId: question.word.word,
        correct: judgement === "correct",
        judgement,
        judgementSource: question.judgementSource,
        aiUsage: details.usage,
        studyMode: question.studyMode,
        sessionMode: session.sessionMode,
        taskType: question.taskType,
        learningPhase: question.learningPhase,
        studySessionId: session.studySessionId,
        interactionDurationMs: question.interactionDurationMs,
      });
      question.answerResult = result;
      session.normalSessionAnswerSequence = result.answerSequence;
      session.book.completedToday = result.daily.completedNewWords;
      session.book.pendingReinforcementCount = result.pendingReinforcementCount
        ?? session.book.pendingReinforcementCount;
      session.book.reviewCompletedToday = result.daily.reviewWords;
      if (result.reviewTaskSummary) {
        session.book.reviewTaskSummary = result.reviewTaskSummary;
        session.book.reviewCompletedToday = result.reviewTaskSummary.handledCount;
      }
      if (result.groupPlan) session.book.groupPlan = result.groupPlan;
      if (result.groupProgress) session.book.groupProgress = result.groupProgress;
      this.syncReinforcementQueue(question, result);
      this.syncRecoveryQueue(question, result);
      question.confusionEventId = `${session.studySessionId}:${result.answerSequence}`;
      if (judgement === "wrong") {
        const detectionIdentity = {
          studySessionId: session.studySessionId,
          answerSequence: result.answerSequence,
          currentWordId: confusableWords.getWordId(question.word),
        };
        const detection = this.onDetectConfusion?.({
          word: question.word,
          userAnswer: question.userAnswer,
          judgement,
          answerEventId: question.confusionEventId,
          learningPhase: question.learningPhase,
          sessionMode: session.sessionMode,
        });
        if (detection && typeof detection.then === "function") {
          question.confusionDetectionPromise = detection;
          detection
            .then((candidate) => this.applyConfusionDetectionResult(question, candidate, detectionIdentity))
            .catch(() => {});
        } else {
          this.applyConfusionDetectionResult(question, detection || null, detectionIdentity);
        }
      }
      this.renderAnswerArea(question);
      this.renderProgress();
      this.renderFeedback(question);
    }

    applyConfusionDetectionResult(question, candidate, identity) {
      if (!candidate) return false;
      const session = this.activeSession;
      const currentQuestion = this.getCurrentQuestion();
      if (
        !this.isActive
        || !session
        || currentQuestion !== question
        || session.studySessionId !== identity.studySessionId
        || question.answerResult?.answerSequence !== identity.answerSequence
        || confusableWords.getWordId(currentQuestion.word) !== identity.currentWordId
      ) return false;
      const accepted = this.onAcceptConfusion?.({
        candidate,
        word: question.word,
        judgement: question.judgement,
        answerEventId: question.confusionEventId,
      }) || candidate;
      question.confusionCandidate = accepted;
      this.renderConfusableActions(question);
      return true;
    }

    getInteractionDuration(question = this.getCurrentQuestion()) {
      if (!question?.presentedAt) return null;
      return Math.max(1, Date.now() - question.presentedAt);
    }

    showAiUnavailable(question, message) {
      question.judgementFeedback = message;
      this.elements.meaningInput.disabled = true;
      this.elements.meaningSubmit.disabled = true;
      this.elements.meaningSubmit.textContent = "暂时无法判断";
      this.elements.meaningStatus.textContent = "AI 服务不可用，可在下方自行判断或稍后再试。";
      this.elements.meaningStatus.classList.add("is-error");
      this.elements.feedback.hidden = false;
      this.elements.feedback.classList.remove("is-success", "is-partial");
      this.elements.feedback.classList.add("is-error");
      this.elements.feedbackIcon.textContent = "!";
      this.elements.feedbackTitle.textContent = "AI 判断暂时不可用";
      this.elements.feedbackText.textContent = message;
      this.renderAiFeedbackDetails(question, "请根据标准释义自行判断");
      this.elements.manualActions.hidden = false;
      this.elements.details.hidden = true;
      this.elements.nextButton.hidden = true;
    }

    applyManualJudgement(judgement) {
      const question = this.getCurrentQuestion();
      if (!question || question.selectedIndex !== null || !question.userAnswer) return;
      this.applySubjectiveJudgement(judgement, {
        source: "manual-fallback",
        feedback: "AI 不可用，本次由你自行判断",
      });
    }

    deferAiQuestion() {
      const question = this.getCurrentQuestion();
      if (!question || question.selectedIndex !== null) return;
      this.onAiFallback?.("deferred");
      question.aiPending = false;
      question.selectedIndex = -1;
      question.judgement = "deferred";
      question.judgementSource = "manual-fallback";
      this.elements.manualActions.hidden = true;
      this.elements.feedback.hidden = false;
      this.elements.feedback.classList.remove("is-success", "is-error", "is-partial");
      this.elements.feedbackIcon.textContent = "↺";
      this.elements.feedbackTitle.textContent = "已保留待巩固";
      this.elements.feedbackText.textContent = "本次未修改学习记录，下次仍会继续巩固这个词。";
      this.renderAiFeedbackDetails(question, "稍后再试");
      this.elements.nextButton.hidden = false;
      this.updateNextButtonLabel();
      this.renderProgress();
    }

    applyReviewTaskSummary(summary) {
      if (!summary || !this.activeSession) return;
      this.activeSession.book.reviewTaskSummary = summary;
      this.activeSession.book.reviewCompletedToday = summary.handledCount;
      this.activeSession.book.reviewTarget = summary.target;
    }

    continueAfterReviewAction() {
      const session = this.activeSession;
      if (!session) return;
      const summary = session.book.reviewTaskSummary;
      if (summary?.pendingBreak) {
        this.showReviewSegmentComplete(session.book);
        return;
      }
      if (session.currentIndex >= session.questions.length || !session.questions.length) {
        this.completeSession();
        return;
      }
      this.renderQuestion();
    }

    manualMasterCurrentWord() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex !== null) return;
      if (![reviewRecovery.FORMAL_REVIEW_PHASE, reviewRecovery.RECOVERY_PHASE].includes(question.learningPhase)) return;
      const questionIndex = session.currentIndex;
      const result = this.onManualMaster?.({
        bookId: session.book.id,
        wordId: question.word.word,
        durationMs: this.getInteractionDuration(question),
      });
      if (!result?.changed) return;
      session.questions.splice(questionIndex, 1);
      this.applyReviewTaskSummary(result.reviewTaskSummary);
      this.onMessage("已标记为已掌握，已退出常规复习", {
        actionLabel: "撤销",
        duration: 8000,
        onAction: () => {
          const restored = this.onUndoManualMaster?.(result.undo);
          if (!restored) return;
          const restoredQuestion = {
            ...question,
            selectedIndex: null,
            answerResult: null,
            judgement: null,
            aiPending: false,
            wasPresented: false,
            presentedAt: null,
            interactionDurationMs: null,
          };
          session.questions.splice(Math.min(questionIndex, session.questions.length), 0, restoredQuestion);
          session.currentIndex = Math.min(questionIndex, session.questions.length - 1);
          this.applyReviewTaskSummary(restored.reviewTaskSummary);
          this.renderQuestion();
        },
      });
      this.continueAfterReviewAction();
    }

    deferCurrentReviewToday() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex !== null) return;
      if (question.learningPhase !== reviewRecovery.FORMAL_REVIEW_PHASE) return;
      const result = this.onDeferToday?.({
        bookId: session.book.id,
        wordId: question.word.word,
        durationMs: this.getInteractionDuration(question),
      });
      if (!result?.changed) return;
      session.questions.splice(session.currentIndex, 1);
      this.applyReviewTaskSummary(result.reviewTaskSummary);
      this.onMessage("已跳过今天，原复习日期和熟练度均未修改");
      this.elements.reviewMoreActions.open = false;
      this.continueAfterReviewAction();
    }

    moveCurrentReviewLater() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex !== null) return;
      if (question.learningPhase !== reviewRecovery.FORMAL_REVIEW_PHASE) return;
      if (session.questions.length - session.currentIndex < 2) {
        this.onMessage("今天任务中只剩这个词，无法再后移");
        return;
      }
      const [moved] = session.questions.splice(session.currentIndex, 1);
      moved.wasPresented = false;
      moved.presentedAt = null;
      moved.interactionDurationMs = null;
      session.questions.push(moved);
      this.elements.reviewMoreActions.open = false;
      this.onMessage("已移到今日任务队尾");
      this.renderQuestion();
    }

    syncReinforcementQueue(question, result) {
      const session = this.activeSession;
      if (!session || session.sessionMode !== "normal") return;
      const currentIndex = session.currentIndex;

      for (let index = session.questions.length - 1; index > currentIndex; index -= 1) {
        const candidate = session.questions[index];
        if (
          candidate.word.word === question.word.word
          && (
            candidate.learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY
            || candidate.learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT
          )
        ) {
          session.questions.splice(index, 1);
        }
      }

      if (!result.learningState || !newWordLearning.isPending(result.learningState)) return;
      if (
        question.learningPhase !== newWordLearning.LEARNING_PHASES.INTRO
        && question.learningPhase !== newWordLearning.LEARNING_PHASES.CHOICE_RETRY
        && question.learningPhase !== newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT
      ) return;

      const gap = Math.max(
        0,
        Number(result.learningState.eligibleAfterSequence) - Number(result.answerSequence),
      );
      const insertionIndex = newWordLearning.getInsertionIndex(
        currentIndex,
        session.questions.length,
        gap,
      );
      session.questions.splice(insertionIndex, 0, {
        word: question.word,
        taskType: "reinforcement",
        learningPhase: result.learningState.phase,
        learningState: result.learningState,
        forcedStudyMode: newWordLearning.getPendingStudyMode(result.learningState),
        studyMode: null,
        prompt: null,
        options: null,
        selectedIndex: null,
        answerResult: null,
        userAnswer: "",
        judgement: null,
        judgementSource: "",
        judgementFeedback: "",
        aiPending: false,
        resultScrollHandled: false,
        wasPresented: false,
      });
    }

    syncRecoveryQueue(question, result) {
      const session = this.activeSession;
      if (!session) return;
      const currentIndex = session.currentIndex;
      for (let index = session.questions.length - 1; index > currentIndex; index -= 1) {
        if (
          session.questions[index].word.word === question.word.word
          && session.questions[index].learningPhase === reviewRecovery.RECOVERY_PHASE
        ) session.questions.splice(index, 1);
      }
      if (!result.recoveryState?.active || result.recoveryState.pendingNextSession) return;
      const gap = Math.max(0, result.recoveryState.eligibleAfterQuestionIndex - result.answerSequence);
      const insertionIndex = newWordLearning.getInsertionIndex(currentIndex, session.questions.length, gap);
      session.questions.splice(insertionIndex, 0, {
        word: question.word,
        taskType: "recovery",
        learningPhase: reviewRecovery.RECOVERY_PHASE,
        recoveryState: result.recoveryState,
        studyMode: null,
        prompt: null,
        options: null,
        selectedIndex: null,
        answerResult: null,
        userAnswer: "",
        judgement: null,
        judgementSource: "",
        judgementFeedback: "",
        aiPending: false,
        resultScrollHandled: false,
        wasPresented: false,
      });
    }

    renderFeedback(question) {
      if (question.studyMode === "ai-meaning") {
        this.renderSubjectiveFeedback(question);
        return;
      }
      const selectedOption = question.options[question.selectedIndex];
      const isCorrect = selectedOption.isCorrect;
      const progress = question.answerResult?.progress;
      const mastery = progress ? reviewScheduler.getMasteryLevel(progress) : 0;
      const nextReview = progress ? reviewScheduler.formatReviewSchedule(progress) : "待安排";
      const isProtectedPractice = isCorrect && question.taskType === "practice";
      const isPendingPractice = question.answerResult?.learningState
        && newWordLearning.isPending(question.answerResult.learningState)
        && question.learningPhase === newWordLearning.LEARNING_PHASES.STANDARD_REVIEW;

      this.elements.feedback.hidden = false;
      this.elements.feedback.classList.toggle("is-success", isCorrect);
      this.elements.feedback.classList.toggle("is-error", !isCorrect);
      this.elements.feedback.classList.remove("is-partial");
      this.elements.feedback.dataset.learningPhase = question.learningPhase;
      this.elements.feedbackIcon.textContent = isCorrect ? "✓" : "×";
      if (question.learningPhase === newWordLearning.LEARNING_PHASES.INTRO) {
        this.elements.feedbackTitle.textContent = isCorrect ? "四选一门槛已通过" : "四选一门槛尚未通过";
        this.elements.feedbackText.textContent = isCorrect
          ? "稍后会进行中文释义巩固；释义正确后才会获得 Level 1。"
          : "稍后仍用相同方向的四选一重试；选对前不会进入释义巩固。";
      } else if (question.learningPhase === newWordLearning.LEARNING_PHASES.CHOICE_RETRY) {
        this.elements.feedbackTitle.textContent = isCorrect ? "四选一门槛已补过" : "四选一重试未通过";
        this.elements.feedbackText.textContent = isCorrect
          ? "门槛已通过，稍后进入中文释义巩固；当前熟练度仍为 Level 0。"
          : "仍保持 Level 0，稍后会按原题目方向再次出现。";
      } else if (question.learningPhase === newWordLearning.LEARNING_PHASES.AI_REINFORCEMENT) {
        this.elements.feedbackTitle.textContent = isCorrect ? "巩固通过" : "巩固未通过";
        this.elements.feedbackText.textContent = isCorrect
          ? `熟练度提升至 Level 1 · 下次复习：${nextReview}`
          : "仍保持 Level 0，稍后继续中文释义巩固。";
      } else {
        this.elements.feedbackTitle.textContent = isCorrect ? "回答正确" : "回答错误";
        this.elements.feedbackText.textContent = isPendingPractice
          ? "本次主动练习已记录，正式完成仍需通过每日计划中的当日巩固。"
          : isProtectedPractice
            ? `熟练度 ${mastery} / 5 · 尚未到期，原复习时间保持不变`
            : `熟练度 ${mastery} / 5 · 下次复习：${nextReview}`;
      }

      this.elements.aiFeedbackDetails.hidden = true;
      this.elements.manualActions.hidden = true;
      this.renderWordDetails(question);
      this.renderConfusableActions(question);
      this.renderMeaningTools(question);
      this.elements.nextButton.hidden = false;
      this.updateNextButtonLabel();
    }

    renderSubjectiveFeedback(question) {
      const judgement = question.judgement;
      const isCorrect = judgement === "correct";
      const isPartial = judgement === "partial";
      const progress = question.answerResult?.progress;
      const nextReview = progress ? reviewScheduler.formatReviewSchedule(progress) : "待安排";
      const isFormalReview = question.learningPhase === reviewRecovery.FORMAL_REVIEW_PHASE;
      const isRecovery = question.learningPhase === reviewRecovery.RECOVERY_PHASE;
      const level = progress ? reviewScheduler.getMasteryLevel(progress) : 0;
      const labels = isFormalReview ? {
        correct: { icon: "✓", title: "复习结果 · 回答正确", text: `熟练度提升至 Level ${level} · 下次复习：${nextReview}` },
        partial: { icon: "≈", title: "复习结果 · 部分正确", text: `熟练度保持 Level ${level}；稍后会在随机窗口后再次主动回忆。` },
        wrong: { icon: "×", title: "复习结果 · 未通过", text: `熟练度调整至 Level ${level}；稍后进入 Recovery 纠错。` },
      } : isRecovery ? {
        correct: { icon: "✓", title: "纠错结果 · 回答正确", text: `熟练度保持 Level ${level} · 下次正式复习：${nextReview}` },
        partial: { icon: "≈", title: "纠错结果 · 部分正确", text: `熟练度保持 Level ${level}；达到下一随机窗口后会再次出现。` },
        wrong: { icon: "×", title: "纠错结果 · 未通过", text: `熟练度保持 Level ${level}；本次不会再次降级。` },
      } : {
        correct: {
          icon: "✓",
          title: "巩固结果 · 回答正确",
          text: `意思正确，熟练度提升至 Level 1 · 下次复习：${nextReview}`,
        },
        partial: {
          icon: "≈",
          title: "巩固结果 · 部分正确",
          text: "核心方向接近，但还不够完整；本次不记错词，稍后会再次巩固。",
        },
        wrong: {
          icon: "×",
          title: "巩固结果 · 未通过",
          text: "这次释义不匹配，这个词稍后还会再次出现。",
        },
      };
      const display = labels[judgement] || labels.wrong;

      this.elements.feedback.hidden = false;
      this.elements.feedback.classList.toggle("is-success", isCorrect);
      this.elements.feedback.classList.toggle("is-partial", isPartial);
      this.elements.feedback.classList.toggle("is-error", !isCorrect && !isPartial);
      this.elements.feedback.dataset.learningPhase = question.learningPhase;
      this.elements.feedbackIcon.textContent = display.icon;
      this.elements.feedbackTitle.textContent = display.title;
      this.elements.feedbackText.textContent = display.text;
      this.renderAiFeedbackDetails(
        question,
        question.judgementFeedback || (isCorrect ? "意思正确" : isPartial ? "意思接近但不够完整" : "意思不匹配"),
      );
      this.elements.manualActions.hidden = true;
      this.renderWordDetails(question);
      this.renderConfusableActions(question);
      this.renderMeaningTools(question);
      this.elements.nextButton.hidden = false;
      this.updateNextButtonLabel();
      this.scheduleFeedbackVisibility(question);
    }

    scheduleFeedbackVisibility(question) {
      if (!activeRecallResult.isFinalResult(question) || question.resultScrollHandled) return;
      window.requestAnimationFrame(() => {
        if (this.getCurrentQuestion() !== question || !activeRecallResult.isFinalResult(question)) return;
        activeRecallResult.scrollFeedbackIntoViewIfNeeded(this.elements.feedback, question);
        const { rect } = activeRecallResult.getVisibility(this.elements.confusableButton);
        if (
          this.elements.confusableButton.hidden
          || !rect
          || (Number(rect.top) >= 0 && Number(rect.bottom) <= window.innerHeight)
        ) return;
        const reducedMotion = typeof window.matchMedia === "function"
          && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.elements.confusableButton.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
      });
    }

    renderAiFeedbackDetails(question, judgementText) {
      const learningWord = this.getLearningWordView(question.word);
      this.elements.aiFeedbackUserAnswer.textContent = question.userAnswer || "（未填写）";
      this.elements.aiFeedbackStandardMeaning.textContent = learningWord.coreMeaning
        || learningWord.shortMeaning
        || learningWord.meaning;
      this.elements.aiFeedbackJudgement.textContent = judgementText;
      this.elements.aiFeedbackDetails.hidden = false;
    }

    renderWordDetails(question) {
      const learningWord = this.getLearningWordView(question.word);
      this.elements.detailWord.textContent = learningWord.word;
      this.elements.detailPhonetic.textContent = learningWord.phonetic || "";
      this.elements.detailPhonetic.hidden = !learningWord.phonetic;
      this.elements.detailMeaning.textContent = `核心义：${learningWord.coreMeaning || learningWord.shortMeaning || learningWord.meaning}\n${learningWord.meaning}`;
      const primaryExample = Array.isArray(question.word.examples) && question.word.examples.length
        ? question.word.examples[0]
        : { sentence: question.word.example, translation: question.word.translation };
      this.elements.detailExample.textContent = primaryExample?.sentence || "暂无例句";
      this.elements.detailTranslation.textContent = primaryExample?.translation || "";
      this.elements.detailTranslation.hidden = !primaryExample?.translation;
      this.elements.details.hidden = false;
    }

    renderConfusableActions(question) {
      const answered = question?.selectedIndex !== null;
      this.elements.confusableButton.hidden = !answered;
      this.elements.confusableButton.textContent = question?.learningPhase === newWordLearning.LEARNING_PHASES.INTRO
        ? "⇄ 看易混词"
        : "⇄ 易混词";
      const candidate = answered ? question?.confusionCandidate : null;
      this.elements.confusionDetected.hidden = !candidate;
      if (candidate) {
        const learningWord = this.getLearningWordView(question.word);
        const currentMeaning = learningWord.coreMeaning || learningWord.shortMeaning || learningWord.meaning;
        const candidateMeaning = candidate.word?.coreMeaning || candidate.word?.shortMeaning || candidate.word?.meaning || "";
        const pair = candidate.pair || null;
        this.elements.confusionCurrentWord.textContent = question.word.word;
        this.elements.confusionCurrentMeaning.textContent = currentMeaning;
        this.elements.confusionWord.textContent = candidate.word?.word || "";
        this.elements.confusionMeaning.textContent = candidateMeaning;
        this.elements.confusionAdd.disabled = false;
        this.elements.confusionPractice.disabled = false;
        if (candidate.confirmationState === "added" || candidate.confirmationState === "existing") {
          this.elements.confusionIcon.textContent = "✓";
          this.elements.confusionTitle.textContent = candidate.confirmationState === "added"
            ? "已加入我的易混词"
            : "已在我的易混词中";
          this.elements.confusionCount.hidden = true;
          this.elements.confusionNote.textContent = "以后遇到这两个词时，系统会优先提醒你辨析。";
          this.elements.confusionAdd.hidden = true;
          this.elements.confusionPractice.textContent = "立即做3题辨析";
          this.elements.confusionView.hidden = false;
        } else if (pair) {
          this.elements.confusionIcon.textContent = "⚠";
          this.elements.confusionTitle.textContent = `你又把 ${question.word.word} 和 ${candidate.word.word} 混淆了`;
          this.elements.confusionCount.textContent = `这是你第 ${pair.confusionCount} 次出现这组混淆。`;
          this.elements.confusionCount.hidden = false;
          this.elements.confusionNote.textContent = "这组易混关系已记录，可立即做一次辨析巩固。";
          this.elements.confusionAdd.hidden = true;
          this.elements.confusionPractice.textContent = "立即做3题辨析";
          this.elements.confusionView.hidden = false;
        } else {
          this.elements.confusionIcon.textContent = "💡";
          this.elements.confusionTitle.textContent = `你的答案更像 ${candidate.word.word}`;
          this.elements.confusionCount.hidden = true;
          this.elements.confusionNote.textContent = `你可能把 ${question.word.word} 和 ${candidate.word.word} 混淆了。确认后可加入个人易混词。`;
          this.elements.confusionAdd.hidden = false;
          this.elements.confusionAdd.textContent = "加入我的易混词";
          this.elements.confusionPractice.textContent = "做3题辨析";
          this.elements.confusionView.hidden = true;
        }
      }
    }

    refreshCurrentMeaning() {
      const question = this.getCurrentQuestion();
      if (!question || question.selectedIndex === null) return;
      const learningWord = this.getLearningWordView(question.word);
      if (question.studyMode === STUDY_MODES.EN_TO_ZH && Array.isArray(question.options)) {
        question.options.forEach((option) => {
          if (!option.isCorrect) return;
          option.meaning = learningWord.coreMeaning || learningWord.shortMeaning || learningWord.meaning;
          option.text = option.meaning;
        });
        this.renderOptions(question);
      }
      if (question.studyMode === "ai-meaning") {
        this.renderAiFeedbackDetails(question, question.judgementFeedback || "已完成判断");
      }
      this.renderWordDetails(question);
      this.renderMeaningTools(question);
      this.renderConfusableActions(question);
    }

    getDetectedConfusionPairOptions(question, candidate) {
      return {
        source: "wrong_answer_detected",
        types: ["meaning"],
        reason: `释义回答更接近 ${candidate.word.word}`,
        initialConfusion: true,
        confusionEventId: question.confusionEventId,
      };
    }

    addDetectedConfusion() {
      const question = this.getCurrentQuestion();
      const candidate = question?.confusionCandidate;
      if (!question || !candidate) return;
      const result = this.onCreateConfusablePair?.(
        question.word,
        candidate.word,
        this.getDetectedConfusionPairOptions(question, candidate),
      );
      if (result?.pair) {
        question.confusionCandidate = {
          ...candidate,
          pair: result.pair,
          confirmationState: result.changed ? "added" : "existing",
        };
        this.renderConfusableActions(question);
      } else if (result?.error) {
        this.onMessage?.(result.error);
      }
    }

    practiceDetectedConfusion() {
      const question = this.getCurrentQuestion();
      const candidate = question?.confusionCandidate;
      if (!question || !candidate) return;
      const result = candidate.pair?.pairKey
        ? { pair: candidate.pair }
        : this.onCreateConfusablePair?.(
          question.word,
          candidate.word,
          this.getDetectedConfusionPairOptions(question, candidate),
        );
      if (result?.pair?.pairKey) {
        if (!candidate.pair) {
          question.confusionCandidate = {
            ...candidate,
            pair: result.pair,
            confirmationState: result.changed ? "added" : "existing",
          };
          this.renderConfusableActions(question);
        }
        this.onStartConfusablePractice?.(result.pair.pairKey, { source: "study-result" });
      } else if (result?.error) this.onMessage?.(result.error);
    }

    viewDetectedConfusion() {
      const question = this.getCurrentQuestion();
      if (!question?.confusionCandidate?.pair) return;
      this.onOpenConfusable?.(question.word, {
        source: "study-result",
        pairKey: question.confusionCandidate.pair.pairKey,
      });
    }

    syncConfusablePairState(pair, options = {}) {
      const question = this.getCurrentQuestion();
      const candidate = question?.confusionCandidate;
      if (!question || !candidate || !pair?.pairKey) return false;
      const candidatePairKey = candidate.pairKey || confusableWords.getPairKey(
        confusableWords.getWordId(question.word),
        confusableWords.getWordId(candidate.word),
      );
      if (candidatePairKey !== pair.pairKey) return false;
      question.confusionCandidate = {
        ...candidate,
        pair: options.removed ? null : pair,
        confirmationState: options.removed ? "" : options.confirmationState,
      };
      this.renderConfusableActions(question);
      return true;
    }

    updateNextButtonLabel() {
      this.elements.nextButton.querySelector("span:first-child").textContent =
        this.activeSession.currentIndex === this.activeSession.questions.length - 1
          ? "查看结果"
          : "下一词";
    }

    nextQuestion() {
      const session = this.activeSession;
      const question = this.getCurrentQuestion();
      if (!session || !question || question.selectedIndex === null) return;

      if (session.book.reviewTaskSummary?.pendingBreak) {
        this.showReviewSegmentComplete(session.book);
        return;
      }

      if (session.sessionMode === "normal" && session.book.groupProgress?.awaitingNextGroup) {
        this.showGroupComplete(session.book);
        return;
      }

      if (session.currentIndex < session.questions.length - 1) {
        session.currentIndex += 1;
        this.renderQuestion();
        return;
      }

      this.completeSession();
    }

    completeSession() {
      const session = this.activeSession;
      session.isComplete = true;
      const answerCount = session.correctCount + session.wrongCount + session.partialCount;
      const accuracy = answerCount ? Math.round((session.correctCount / answerCount) * 100) : 0;
      const titleByMode = {
        normal: "本轮学习完成",
        review: "今日复习完成",
        wrong: "错词复习完成",
        favorite: "收藏复习完成",
      };

      this.elements.questionScreen.hidden = true;
      this.elements.resultScreen.hidden = false;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      this.elements.resultTitle.textContent = session.waitingForReinforcement
        ? "本轮学习已完成"
        : titleByMode[session.sessionMode] || "本轮学习完成";
      this.elements.resultTotal.textContent = answerCount;
      this.elements.resultNote.textContent = session.sessionMode === "normal"
        ? session.waitingForReinforcement
          ? `待巩固 ${session.book.pendingReinforcementCount || 0} · 已同时保留题数与时间间隔`
          : `今日新词 ${session.book.completedToday} / ${session.book.dailyGoal} · 正常完成 ${session.book.normalCompletedToday || 0} · 已会词确认 ${session.book.verifiedManualMasteredToday || 0} · 待巩固 ${session.book.pendingReinforcementCount || 0}`
        : session.sessionMode === "review"
          ? session.book.reviewTaskSummary
            ? `今日任务 ${session.book.reviewTaskSummary.handledCount} / ${session.book.reviewTaskSummary.target} · 正常复习 ${session.book.reviewTaskSummary.answeredCount} · 已掌握 ${session.book.reviewTaskSummary.manualMasteredCount} · 今日跳过 ${session.book.reviewTaskSummary.deferredTodayCount}`
            : `本轮到期复习 · 今日完成 ${session.book.reviewCompletedToday} 个`
          : "本轮主动练习单词";
      this.elements.resultCorrect.textContent = session.correctCount;
      this.elements.resultWrong.textContent = session.wrongCount;
      this.elements.resultPartial.textContent = session.partialCount;
      this.elements.resultAccuracy.textContent = `${accuracy}%`;
      this.elements.restartButton.querySelector("span:first-child").textContent =
        session.sessionMode === "normal" ? "再学一组" : "再来一组";
      this.onComplete?.(session);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    clearBreakTimer() {
      if (this.breakTimer) window.clearInterval(this.breakTimer);
      this.breakTimer = null;
    }

    showGroupComplete(book) {
      this.clearBreakTimer();
      this.activeSession = {
        key: `${book.id}:normal`,
        sessionMode: "normal",
        book,
        questions: [],
        currentIndex: 0,
        isComplete: true,
      };
      this.isActive = true;
      const progress = book.groupProgress;
      const group = progress.activeGroup;
      const metrics = book.daily?.learningMetrics || {};
      const groupMetrics = group.ids.map((wordId) => metrics.words?.[wordId] || {});
      const recallCount = groupMetrics.reduce((total, entry) => total
        + (entry.reinforcementWrongCount || 0)
        + (entry.reinforcementPartialCount || 0)
        + (entry.eventuallyPassed ? 1 : 0), 0);
      const correctedCount = groupMetrics.filter((entry) => entry.eventuallyPassed && (
        (entry.choiceWrongCount || 0) > 0
        || (entry.reinforcementWrongCount || 0) > 0
        || (entry.reinforcementPartialCount || 0) > 0
      )).length;
      this.elements.bookBadge.textContent = `${book.shortName} · 每日计划`;
      this.elements.questionScreen.hidden = true;
      this.elements.resultScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = false;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      this.elements.groupCompleteTitle.textContent = `第${group.index + 1}组完成`;
      this.elements.groupCompleteTotal.textContent = `${progress.completedNewWords} / ${book.dailyGoal}`;
      this.elements.groupCompletePercent.textContent = `今日完成 ${Math.round((progress.completedNewWords / book.dailyGoal) * 100)}%`;
      this.elements.groupCompleteNew.textContent = group.normalCompletedCount ?? group.completedCount;
      this.elements.groupCompleteVerified.textContent = group.verifiedManualMasteredCount || 0;
      this.elements.groupCompleteRecall.textContent = recallCount;
      this.elements.groupCompleteCorrected.textContent = correctedCount;
      this.elements.groupBreakSuggestion.textContent = `建议休息 ${book.groupPlan.breakMinutes} 分钟`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    getBreakRemainingMs(now = Date.now()) {
      const plan = this.activeSession?.book?.groupPlan;
      if (!plan?.breakStartedAt) return 0;
      return Math.max(0, plan.breakStartedAt + plan.breakMinutes * 60 * 1000 - now);
    }

    renderBreakTimer() {
      const remaining = this.getBreakRemainingMs();
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      this.elements.groupBreakTimer.textContent = `${minutes}:${seconds}`;
      const ended = remaining <= 0;
      this.elements.groupBreakMessage.textContent = ended ? "可以开始下一组了" : "喝口水、看看远处";
      this.elements.groupBreakContinue.textContent = ended ? "开始下一组" : "提前开始下一组";
      if (ended) this.clearBreakTimer();
    }

    showGroupBreak(book) {
      this.clearBreakTimer();
      this.activeSession = {
        key: `${book.id}:normal`,
        sessionMode: "normal",
        book,
        questions: [],
        currentIndex: 0,
        isComplete: true,
      };
      this.isActive = true;
      this.elements.bookBadge.textContent = `${book.shortName} · 组间休息`;
      this.elements.questionScreen.hidden = true;
      this.elements.resultScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = false;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      this.renderBreakTimer();
      if (this.getBreakRemainingMs() > 0) {
        this.breakTimer = window.setInterval(() => this.renderBreakTimer(), 1000);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    startGroupBreak() {
      const book = this.activeSession?.book;
      if (!book) return;
      const plan = this.onStartGroupBreak?.(book.id);
      book.groupPlan = plan || { ...book.groupPlan, breakStartedAt: Date.now() };
      this.showGroupBreak(book);
    }

    continueDailyGroup() {
      const book = this.activeSession?.book;
      if (!book) return;
      this.clearBreakTimer();
      this.onContinueGroup?.(book.id);
    }

    stopDailyGroups() {
      this.clearBreakTimer();
      this.isActive = false;
      this.onStopDailyGroups?.();
    }

    showReviewSegmentComplete(book = this.activeSession?.book) {
      if (!book?.reviewTaskSummary) return;
      this.clearBreakTimer();
      if (this.activeSession) this.activeSession.book = book;
      this.isActive = true;
      const summary = book.reviewTaskSummary;
      this.renderProgress();
      this.elements.bookBadge.textContent = `${book.shortName} · 复习间歇`;
      this.elements.questionScreen.hidden = true;
      this.elements.resultScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      this.elements.reviewSegmentScreen.hidden = false;
      this.elements.reviewSegmentTotal.textContent = `${summary.handledCount} / ${summary.target}`;
      this.elements.reviewSegmentCurrent.textContent = `本段：${summary.segmentHandledCount} / ${summary.segmentTarget}`;
      this.elements.reviewSegmentAnswered.textContent = summary.answeredCount;
      this.elements.reviewSegmentManualMastered.textContent = summary.manualMasteredCount;
      this.elements.reviewSegmentDeferred.textContent = summary.deferredTodayCount;
      this.elements.reviewSegmentRemaining.textContent = summary.remainingCount;
      this.elements.reviewSegmentBacklog.textContent = summary.backlogCount;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    openReviewSegmentQuickCleanup() {
      const session = this.activeSession;
      if (!session?.book?.reviewTaskSummary) return;
      this.onOpenQuickCleanup?.({
        bookId: session.book.id,
        sessionMode: session.sessionMode,
      });
    }

    applyReviewSegmentQuickCleanup({ reviewTaskSummary, wordIds = [] } = {}) {
      const session = this.activeSession;
      if (!session || !reviewTaskSummary) return;
      const selected = new Set(Array.isArray(wordIds) ? wordIds : []);
      if (selected.size) {
        const removedBeforeCurrent = session.questions
          .slice(0, session.currentIndex)
          .filter((question) => selected.has(question.word.word)).length;
        session.questions = session.questions.filter((question) => !selected.has(question.word.word));
        session.currentIndex = Math.max(0, session.currentIndex - removedBeforeCurrent);
        session.currentIndex = Math.min(session.currentIndex, Math.max(0, session.questions.length - 1));
      }
      this.applyReviewTaskSummary(reviewTaskSummary);
      const taskCompleted = reviewTaskSummary.remainingCount === 0;
      if (!taskCompleted) {
        this.showReviewSegmentComplete(session.book);
        return;
      }

      this.elements.reviewSegmentScreen.hidden = true;
      const question = this.getCurrentQuestion();
      if (question?.selectedIndex !== null && session.currentIndex < session.questions.length - 1) {
        session.currentIndex += 1;
      } else if (question?.selectedIndex !== null) {
        this.onMessage("今日正式复习任务已完成，可以继续今天的新词");
        this.completeSession();
        return;
      }
      this.onMessage("今日正式复习任务已完成，可以继续今天的新词");
      if (this.getCurrentQuestion()) this.renderQuestion();
      else this.completeSession();
    }

    getReviewBreakRemainingMs(now = Date.now()) {
      const summary = this.activeSession?.book?.reviewTaskSummary;
      if (!summary?.breakStartedAt) return 0;
      return Math.max(0, summary.breakStartedAt + (summary.breakMinutes || 3) * 60 * 1000 - now);
    }

    renderReviewBreakTimer() {
      const remaining = this.getReviewBreakRemainingMs();
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      this.elements.reviewBreakTimer.textContent = `${minutes}:${seconds}`;
      const ended = remaining <= 0;
      this.elements.reviewBreakMessage.textContent = ended ? "可以继续复习了" : "喝口水、看看远处";
      this.elements.reviewBreakContinue.textContent = ended ? "继续复习" : "提前继续";
      if (ended) this.clearBreakTimer();
    }

    showReviewBreak(book = this.activeSession?.book) {
      if (!book?.reviewTaskSummary) return;
      this.clearBreakTimer();
      if (this.activeSession) this.activeSession.book = book;
      this.isActive = true;
      this.elements.bookBadge.textContent = `${book.shortName} · 复习间歇`;
      this.elements.questionScreen.hidden = true;
      this.elements.resultScreen.hidden = true;
      this.elements.groupCompleteScreen.hidden = true;
      this.elements.groupBreakScreen.hidden = true;
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = false;
      this.renderReviewBreakTimer();
      if (this.getReviewBreakRemainingMs() > 0) {
        this.breakTimer = window.setInterval(() => this.renderReviewBreakTimer(), 1000);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    startReviewBreak() {
      const book = this.activeSession?.book;
      if (!book) return;
      const result = this.onStartReviewBreak?.(book.id);
      if (result?.reviewTaskSummary) this.applyReviewTaskSummary(result.reviewTaskSummary);
      this.showReviewBreak(book);
    }

    continueReviewTask() {
      const book = this.activeSession?.book;
      if (!book) return;
      this.clearBreakTimer();
      const result = this.onContinueReviewTask?.(book.id);
      if (result?.reviewTaskSummary) this.applyReviewTaskSummary(result.reviewTaskSummary);
      this.elements.reviewSegmentScreen.hidden = true;
      this.elements.reviewBreakScreen.hidden = true;
      const question = this.getCurrentQuestion();
      if (question?.selectedIndex !== null && this.activeSession.currentIndex < this.activeSession.questions.length - 1) {
        this.activeSession.currentIndex += 1;
      } else if (question?.selectedIndex !== null) {
        this.completeSession();
        return;
      }
      if (this.getCurrentQuestion()) this.renderQuestion();
      else this.completeSession();
    }

    stopReviewSession() {
      this.clearBreakTimer();
      this.isActive = false;
      this.onStopReviewSession?.();
    }

    restart() {
      this.onRestart(this.activeSession?.sessionMode || "normal");
    }

    speakCurrentWord() {
      const question = this.getCurrentQuestion();
      if (!question) return;
      const didSpeak = speakEnglish(question.word.word);
      if (!didSpeak) this.onMessage("当前浏览器不支持语音朗读");
    }

    handleKeyboard(event) {
      if (!this.isActive || event.repeat || event.altKey) return;
      if (this.elements.newWordMasteryDialog.open) {
        if (
          event.key === "Enter"
          && (event.ctrlKey || event.metaKey)
          && !event.isComposing
          && !this.isComposingNewWordMastery
          && !this.newWordMasteryState?.pending
          && !this.newWordMasteryState?.result
        ) {
          event.preventDefault();
          this.submitNewWordMasteryMeaning();
        }
        return;
      }
      const question = this.getCurrentQuestion();
      if (!question) return;

      if (
        question.studyMode === "ai-meaning"
        && event.key === "Enter"
        && (event.ctrlKey || event.metaKey)
      ) {
        if (
          event.isComposing
          || this.isComposingMeaning
          || question.aiPending
          || question.selectedIndex !== null
        ) return;
        event.preventDefault();
        this.submitMeaningAnswer();
        return;
      }

      if (event.ctrlKey || event.metaKey) return;

      if (question.studyMode === "ai-meaning" && question.selectedIndex === null) return;

      const number = Number(event.key);
      if (question.selectedIndex === null && number >= 1 && number <= 4) {
        event.preventDefault();
        this.answer(number - 1);
        return;
      }

      if (question.selectedIndex !== null && event.key === "Enter") {
        event.preventDefault();
        this.nextQuestion();
      }
    }
  }

  app.StudyController = StudyController;
})(window.CETWords);
