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
    }) {
      this.onExit = onExit;
      this.onAnswer = onAnswer;
      this.onToggleFavorite = onToggleFavorite;
      this.getWordProgress = getWordProgress;
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
      this.sessions = new Map();
      this.activeSession = null;
      this.isActive = false;
      this.isComposingMeaning = false;

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
        options: document.querySelector("#answer-options"),
        answerInstruction: document.querySelector("#answer-instruction"),
        keyboardHint: document.querySelector(".keyboard-hint"),
        meaningForm: document.querySelector("#meaning-answer-form"),
        meaningInput: document.querySelector("#meaning-answer-input"),
        meaningStatus: document.querySelector("#meaning-answer-status"),
        meaningSubmit: document.querySelector("#meaning-submit-button"),
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
      };

      this.breakTimer = null;

      this.bindEvents();
    }

    bindEvents() {
      this.elements.backButton.addEventListener("click", () => this.exit());
      this.elements.favoriteButton.addEventListener("click", () => this.toggleCurrentFavorite());
      this.elements.speakButton.addEventListener("click", () => this.speakCurrentWord());
      this.elements.detailSpeakButton.addEventListener("click", () => this.speakCurrentWord());
      this.elements.nextButton.addEventListener("click", () => this.nextQuestion());
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
          question.word,
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
      this.renderProgress();
      this.renderAnswerArea(question);

      if (question.selectedIndex === null) {
        this.elements.feedback.hidden = true;
        this.elements.aiFeedbackDetails.hidden = true;
        this.elements.manualActions.hidden = true;
        this.elements.details.hidden = true;
        this.elements.nextButton.hidden = true;
      } else {
        this.renderFeedback(question);
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
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
      const isSubjective = question.studyMode === "ai-meaning";
      const isFinalSubjectiveResult = isSubjective && activeRecallResult.isFinalResult(question);
      this.elements.options.hidden = isSubjective;
      this.elements.meaningForm.hidden = !isSubjective || isFinalSubjectiveResult;
      this.elements.keyboardHint.hidden = isSubjective;
      this.elements.questionScreen.classList.toggle("is-active-recall-result", isFinalSubjectiveResult);
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
      });
      question.answerResult = result;
      session.normalSessionAnswerSequence = result.answerSequence;
      session.book.completedToday = result.daily.completedNewWords;
      session.book.pendingReinforcementCount = result.pendingReinforcementCount
        ?? session.book.pendingReinforcementCount;
      session.book.reviewCompletedToday = result.daily.reviewWords;
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
        !session
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
      const localResult = aiJudge.localMeaningJudge(question.word, userAnswer);
      if (localResult.decision === "judged") {
        this.applySubjectiveJudgement(localResult.result, localResult);
        return;
      }

      question.aiPending = true;
      this.renderAnswerArea(question);
      this.elements.meaningStatus.textContent = "正在理解你的表述…";
      try {
        const result = await this.onAiJudgeMeaning({ word: question.word, userAnswer });
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
      });
      question.answerResult = result;
      session.normalSessionAnswerSequence = result.answerSequence;
      session.book.completedToday = result.daily.completedNewWords;
      session.book.pendingReinforcementCount = result.pendingReinforcementCount
        ?? session.book.pendingReinforcementCount;
      session.book.reviewCompletedToday = result.daily.reviewWords;
      if (result.groupPlan) session.book.groupPlan = result.groupPlan;
      if (result.groupProgress) session.book.groupProgress = result.groupProgress;
      this.syncReinforcementQueue(question, result);
      this.syncRecoveryQueue(question, result);
      this.renderAnswerArea(question);
      this.renderProgress();
      this.renderFeedback(question);
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
      const nextReview = progress ? reviewScheduler.formatReviewTime(progress.nextReviewTime) : "待安排";
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
      this.elements.nextButton.hidden = false;
      this.updateNextButtonLabel();
    }

    renderSubjectiveFeedback(question) {
      const judgement = question.judgement;
      const isCorrect = judgement === "correct";
      const isPartial = judgement === "partial";
      const progress = question.answerResult?.progress;
      const nextReview = progress ? reviewScheduler.formatReviewTime(progress.nextReviewTime) : "待安排";
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
      this.elements.nextButton.hidden = false;
      this.updateNextButtonLabel();
      this.scheduleFeedbackVisibility(question);
    }

    scheduleFeedbackVisibility(question) {
      if (!activeRecallResult.isFinalResult(question) || question.resultScrollHandled) return;
      window.requestAnimationFrame(() => {
        if (this.getCurrentQuestion() !== question || !activeRecallResult.isFinalResult(question)) return;
        activeRecallResult.scrollFeedbackIntoViewIfNeeded(this.elements.feedback, question);
      });
    }

    renderAiFeedbackDetails(question, judgementText) {
      this.elements.aiFeedbackUserAnswer.textContent = question.userAnswer || "（未填写）";
      this.elements.aiFeedbackStandardMeaning.textContent = question.word.coreMeaning
        || question.word.shortMeaning
        || question.word.meaning;
      this.elements.aiFeedbackJudgement.textContent = judgementText;
      this.elements.aiFeedbackDetails.hidden = false;
    }

    renderWordDetails(question) {
      this.elements.detailWord.textContent = question.word.word;
      this.elements.detailPhonetic.textContent = question.word.phonetic || "";
      this.elements.detailPhonetic.hidden = !question.word.phonetic;
      this.elements.detailMeaning.textContent = `核心义：${question.word.coreMeaning || question.word.shortMeaning || question.word.meaning}\n${question.word.meaning}`;
      const primaryExample = Array.isArray(question.word.examples) && question.word.examples.length
        ? question.word.examples[0]
        : { sentence: question.word.example, translation: question.word.translation };
      this.elements.detailExample.textContent = primaryExample?.sentence || "暂无例句";
      this.elements.detailTranslation.textContent = primaryExample?.translation || "";
      this.elements.detailTranslation.hidden = !primaryExample?.translation;
      this.elements.details.hidden = false;
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
      this.elements.resultTitle.textContent = session.waitingForReinforcement
        ? "本轮学习已完成"
        : titleByMode[session.sessionMode] || "本轮学习完成";
      this.elements.resultTotal.textContent = answerCount;
      this.elements.resultNote.textContent = session.sessionMode === "normal"
        ? session.waitingForReinforcement
          ? `待巩固 ${session.book.pendingReinforcementCount || 0} · 已同时保留题数与时间间隔`
          : `今日新词 ${session.book.completedToday} / ${session.book.dailyGoal} · 待巩固 ${session.book.pendingReinforcementCount || 0}`
        : session.sessionMode === "review"
          ? `本轮到期复习 · 今日完成 ${session.book.reviewCompletedToday} 个`
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
      this.elements.groupCompleteTitle.textContent = `第${group.index + 1}组完成`;
      this.elements.groupCompleteTotal.textContent = `${progress.completedNewWords} / ${book.dailyGoal}`;
      this.elements.groupCompletePercent.textContent = `今日完成 ${Math.round((progress.completedNewWords / book.dailyGoal) * 100)}%`;
      this.elements.groupCompleteNew.textContent = group.completedCount;
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
