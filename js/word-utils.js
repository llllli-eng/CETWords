(function registerWordUtils(app) {
  const { FALLBACK_WORDS } = app;

  const WORD_BOOK_FILES = {
    cet4: new URL("data/cet4.json", window.location.href),
    cet6: new URL("data/cet6.json", window.location.href),
  };
  const REQUIRED_FIELDS = ["id", "word", "meaning"];
  const wordBookCache = new Map();

  function shuffleArray(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function buildStableId(bookId, word) {
    const slug = String(word || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^\p{L}\p{N}_]+/gu, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
    return `${bookId}-${slug || "word"}`;
  }

  function normalizeMeanings(value, fallbackMeaning) {
    const result = Array.isArray(value)
      ? value
        .map((item) => ({
          partOfSpeech: typeof item?.partOfSpeech === "string" ? item.partOfSpeech.trim() : "",
          translation: typeof item?.translation === "string" ? item.translation.trim() : "",
        }))
        .filter((item) => item.translation)
      : [];
    return result.length ? result : [{ partOfSpeech: "", translation: fallbackMeaning }];
  }

  function normalizeExamples(value, example, translation) {
    const result = Array.isArray(value)
      ? value
        .map((item) => ({
          sentence: typeof item?.sentence === "string" ? item.sentence.trim() : "",
          translation: typeof item?.translation === "string" ? item.translation.trim() : "",
        }))
        .filter((item) => item.sentence)
      : [];
    if (!result.length && example) result.push({ sentence: example, translation });
    return result;
  }

  function normalizeWord(item, bookId) {
    const word = typeof item?.word === "string" ? item.word.trim() : "";
    const meaning = typeof item?.meaning === "string" ? item.meaning.trim() : "";
    const example = typeof item?.example === "string" ? item.example.trim() : "";
    const translation = typeof item?.translation === "string" ? item.translation.trim() : "";
    const phoneticUS = typeof item?.phoneticUS === "string" ? item.phoneticUS.trim() : "";
    const phoneticUK = typeof item?.phoneticUK === "string" ? item.phoneticUK.trim() : "";
    const phonetic = typeof item?.phonetic === "string" ? item.phonetic.trim() : (phoneticUK || phoneticUS);
    const sourceLevel = typeof item?.sourceLevel === "string" && item.sourceLevel.trim()
      ? item.sourceLevel.trim()
      : bookId;
    return {
      ...item,
      id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : buildStableId(bookId, word),
      word,
      book: bookId,
      sourceLevel,
      isCore: typeof item?.isCore === "boolean" ? item.isCore : sourceLevel === bookId,
      phonetic,
      phoneticUS,
      phoneticUK,
      meaning,
      shortMeaning: typeof item?.shortMeaning === "string" && item.shortMeaning.trim()
        ? item.shortMeaning.trim()
        : meaning,
      meanings: normalizeMeanings(item?.meanings, meaning),
      example,
      translation,
      examples: normalizeExamples(item?.examples, example, translation),
    };
  }

  function normalizeMeaningKey(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
  }

  function getPrimaryPartOfSpeech(word) {
    const structured = word?.meanings?.[0]?.partOfSpeech;
    const source = typeof structured === "string" && structured.trim()
      ? structured
      : String(word?.meaning || "").match(/^([A-Za-z]+)\./)?.[1] || "";
    const normalized = source.toLocaleLowerCase("en-US").replace(/[^a-z]/g, "");
    if (["v", "vt", "vi", "verb"].includes(normalized)) return "v";
    if (["a", "adj", "adjective"].includes(normalized)) return "adj";
    if (["ad", "adv", "adverb"].includes(normalized)) return "adv";
    if (["n", "noun"].includes(normalized)) return "n";
    if (["prep", "preposition"].includes(normalized)) return "prep";
    if (["conj", "conjunction"].includes(normalized)) return "conj";
    if (["pron", "pronoun"].includes(normalized)) return "pron";
    if (["num", "numeral"].includes(normalized)) return "num";
    return normalized;
  }

  /** Generate one correct meaning and three unique, part-of-speech-aware distractors. */
  function generateOptions(currentWord, wordList, random = Math.random) {
    const correctKey = normalizeMeaningKey(currentWord.meaning);
    const correctPartOfSpeech = getPrimaryPartOfSpeech(currentWord);
    const uniqueDistractors = new Map();

    for (const item of wordList) {
      const meaningKey = normalizeMeaningKey(item.meaning);
      if (item.id === currentWord.id || item.word === currentWord.word || !meaningKey || meaningKey === correctKey) {
        continue;
      }
      if (!uniqueDistractors.has(meaningKey)) uniqueDistractors.set(meaningKey, item);
    }

    if (uniqueDistractors.size < 3) {
      throw new Error("当前词库中没有足够的不重复释义来生成四个选项。");
    }

    const candidates = [...uniqueDistractors.values()];
    const samePartOfSpeech = candidates.filter(
      (item) => correctPartOfSpeech && getPrimaryPartOfSpeech(item) === correctPartOfSpeech,
    );
    const otherPartsOfSpeech = candidates.filter(
      (item) => !correctPartOfSpeech || getPrimaryPartOfSpeech(item) !== correctPartOfSpeech,
    );
    const distractors = [
      ...shuffleArray(samePartOfSpeech, random),
      ...shuffleArray(otherPartsOfSpeech, random),
    ].slice(0, 3);
    const options = [
      { meaning: currentWord.meaning, isCorrect: true },
      ...distractors.map((item) => ({ meaning: item.meaning, isCorrect: false })),
    ];
    return shuffleArray(options, random);
  }

  function validateWordList(rawWords, bookId) {
    if (!Array.isArray(rawWords) || rawWords.length < 4) {
      throw new Error(`${bookId.toUpperCase()} 词库至少需要 4 个单词。`);
    }

    const words = rawWords.map((item) => normalizeWord(item, bookId));
    const ids = new Set();
    const wordKeys = new Set();
    words.forEach((item, index) => {
      const isValid = REQUIRED_FIELDS.every(
        (field) => typeof item[field] === "string" && item[field].trim().length > 0,
      );
      if (!isValid) throw new Error(`${bookId.toUpperCase()} 词库第 ${index + 1} 条数据不完整。`);
      if (item.book !== bookId || typeof item.sourceLevel !== "string" || typeof item.isCore !== "boolean") {
        throw new Error(`${bookId.toUpperCase()} 词库第 ${index + 1} 条来源标记无效。`);
      }

      const wordKey = item.word.toLocaleLowerCase("en-US");
      if (ids.has(item.id)) throw new Error(`${bookId.toUpperCase()} 词库存在重复 ID：${item.id}`);
      if (wordKeys.has(wordKey)) throw new Error(`${bookId.toUpperCase()} 词库存在重复单词：${item.word}`);
      ids.add(item.id);
      wordKeys.add(wordKey);
    });
    return words;
  }

  async function fetchWordBook(bookId) {
    const fileUrl = WORD_BOOK_FILES[bookId];
    if (!fileUrl) throw new Error(`未知词库：${bookId}`);
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`词库请求失败：${response.status}`);
      return { words: validateWordList(await response.json(), bookId), source: "json" };
    } catch (error) {
      const fallback = FALLBACK_WORDS[bookId];
      if (!fallback) throw error;
      return { words: validateWordList(fallback, bookId), source: "fallback" };
    }
  }

  function loadWordBook(bookId) {
    if (!wordBookCache.has(bookId)) wordBookCache.set(bookId, fetchWordBook(bookId));
    return wordBookCache.get(bookId);
  }

  app.shuffleArray = shuffleArray;
  app.generateOptions = generateOptions;
  app.getPrimaryPartOfSpeech = getPrimaryPartOfSpeech;
  app.validateWordList = validateWordList;
  app.loadWordBook = loadWordBook;
})(window.CETWords);
