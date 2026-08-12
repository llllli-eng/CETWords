(function registerStudyModes(app) {
  const { generateOptions, getPrimaryPartOfSpeech, shuffleArray } = app;

  const STUDY_MODES = Object.freeze({
    EN_TO_ZH: "en-to-zh",
    ZH_TO_EN: "zh-to-en",
  });

  const STUDY_MODE_LABELS = Object.freeze({
    [STUDY_MODES.EN_TO_ZH]: "英文选中文",
    [STUDY_MODES.ZH_TO_EN]: "中文选英文",
  });

  function normalizeStudyMode(value) {
    return value === STUDY_MODES.ZH_TO_EN ? STUDY_MODES.ZH_TO_EN : STUDY_MODES.EN_TO_ZH;
  }

  function getStudyModeLabel(value) {
    return STUDY_MODE_LABELS[normalizeStudyMode(value)];
  }

  function getChinesePrompt(word) {
    const shortMeaning = typeof word?.shortMeaning === "string" ? word.shortMeaning.trim() : "";
    const fullMeaning = typeof word?.meaning === "string" ? word.meaning.trim() : "";
    const source = shortMeaning || fullMeaning;
    if (!source) {
      console.warn(`[学习模式] ${word?.word || "未知单词"} 缺少 shortMeaning 和 meaning，已跳过中文选英文题目。`);
      return null;
    }

    let partOfSpeech = typeof word?.meanings?.[0]?.partOfSpeech === "string"
      ? word.meanings[0].partOfSpeech.trim()
      : "";
    let meaning = source;

    if (partOfSpeech && source.toLocaleLowerCase("en-US").startsWith(partOfSpeech.toLocaleLowerCase("en-US"))) {
      meaning = source.slice(partOfSpeech.length).trim();
    } else {
      const leadingPartOfSpeech = source.match(/^([A-Za-z]+\.)\s*/);
      if (leadingPartOfSpeech) {
        partOfSpeech = partOfSpeech || leadingPartOfSpeech[1];
        meaning = source.slice(leadingPartOfSpeech[0].length).trim();
      }
    }

    return {
      partOfSpeech,
      meaning: meaning || source,
      source,
    };
  }

  function normalizeEnglishKey(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  /** Generate one correct English word and three unique, part-of-speech-aware distractors. */
  function generateEnglishOptions(currentWord, wordList, random = Math.random) {
    const correctKey = normalizeEnglishKey(currentWord?.word);
    if (!correctKey) return [];

    const correctPartOfSpeech = getPrimaryPartOfSpeech(currentWord);
    const correctLength = correctKey.length;
    const uniqueCandidates = new Map();

    for (const item of wordList) {
      const key = normalizeEnglishKey(item?.word);
      if (!key || key === correctKey || uniqueCandidates.has(key)) continue;
      uniqueCandidates.set(key, item);
    }

    if (uniqueCandidates.size < 3) {
      throw new Error("当前词库中没有足够的不重复英文单词来生成四个选项。");
    }

    const bySimilarLength = (left, right) => {
      const lengthDifference = Math.abs(left.word.length - correctLength) - Math.abs(right.word.length - correctLength);
      return lengthDifference || left.word.localeCompare(right.word, "en");
    };
    const shuffled = shuffleArray([...uniqueCandidates.values()], random);
    const samePartOfSpeech = shuffled
      .filter((item) => correctPartOfSpeech && getPrimaryPartOfSpeech(item) === correctPartOfSpeech)
      .sort(bySimilarLength);
    const otherPartsOfSpeech = shuffled
      .filter((item) => !correctPartOfSpeech || getPrimaryPartOfSpeech(item) !== correctPartOfSpeech)
      .sort(bySimilarLength);
    const distractors = [...samePartOfSpeech, ...otherPartsOfSpeech].slice(0, 3);
    const options = [
      { text: currentWord.word, word: currentWord.word, isCorrect: true },
      ...distractors.map((item) => ({ text: item.word, word: item.word, isCorrect: false })),
    ];
    return shuffleArray(options, random);
  }

  function createStudyQuestion(currentWord, wordList, studyMode, random = Math.random) {
    const normalizedMode = normalizeStudyMode(studyMode);

    if (normalizedMode === STUDY_MODES.ZH_TO_EN) {
      const prompt = getChinesePrompt(currentWord);
      if (!prompt) return null;
      return {
        studyMode: normalizedMode,
        prompt: {
          primary: prompt.meaning,
          secondary: prompt.partOfSpeech,
          instruction: "请选择对应的英文单词",
          canSpeak: false,
        },
        options: generateEnglishOptions(currentWord, wordList, random),
      };
    }

    return {
      studyMode: normalizedMode,
      prompt: {
        primary: currentWord.word,
        secondary: currentWord.phonetic || "",
        instruction: "请选择正确的中文释义",
        canSpeak: true,
      },
      options: generateOptions(currentWord, wordList, random)
        .map((option) => ({ ...option, text: option.meaning })),
    };
  }

  app.STUDY_MODES = STUDY_MODES;
  app.STUDY_MODE_LABELS = STUDY_MODE_LABELS;
  app.normalizeStudyMode = normalizeStudyMode;
  app.getStudyModeLabel = getStudyModeLabel;
  app.getChinesePrompt = getChinesePrompt;
  app.generateEnglishOptions = generateEnglishOptions;
  app.createStudyQuestion = createStudyQuestion;
})(window.CETWords);
