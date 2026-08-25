/**
 * 拾词 · 个人易混词核心服务
 * 只处理关系、查找、候选验证和独立辨析题，不读写 SRS。
 */

(function registerConfusableWords(app) {
  const VALID_TYPES = Object.freeze(["spelling", "meaning", "usage"]);
  const VALID_SOURCES = Object.freeze(["manual", "ai_suggested", "wrong_answer_detected"]);
  const SEARCH_LIMIT = 10;
  const RECENT_LIMIT = 30;
  const PRACTICE_QUESTION_COUNT = 3;
  const CHINESE_SEARCH_ALIASES = Object.freeze({
    "采用": ["采取", "采纳"],
    "采取": ["采用", "采纳"],
    "采纳": ["采用", "采取"],
  });

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function normalizeTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeWordId(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function normalizeTypes(value) {
    return [...new Set(Array.isArray(value) ? value : [])]
      .filter((type) => VALID_TYPES.includes(type))
      .slice(0, 2);
  }

  function getWordId(word) {
    if (!word || typeof word !== "object") return "";
    return normalizeWordId(word.id)
      || (normalizeWordId(word.word) ? `${word.book || "word"}-${word.word}` : "");
  }

  function getPairKey(wordIdA, wordIdB) {
    const ids = [normalizeWordId(wordIdA), normalizeWordId(wordIdB)].filter(Boolean).sort();
    return ids.length === 2 && ids[0] !== ids[1] ? ids.join("::") : "";
  }

  function normalizePair(raw, fallbackKey = "") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const pairKey = getPairKey(raw.wordIdA, raw.wordIdB) || fallbackKey;
    if (!pairKey) return null;
    const [wordIdA, wordIdB] = pairKey.split("::");
    if (!wordIdA || !wordIdB || wordIdA === wordIdB) return null;
    const correctCount = toCount(raw.correctCount);
    const wrongCount = toCount(raw.wrongCount);
    return {
      pairKey,
      wordIdA,
      wordIdB,
      types: normalizeTypes(raw.types),
      source: VALID_SOURCES.includes(raw.source) ? raw.source : "manual",
      reason: String(raw.reason || "").trim().slice(0, 120),
      difference: String(raw.difference || "").trim().slice(0, 160),
      createdAt: normalizeTimestamp(raw.createdAt) || Date.now(),
      lastPracticedAt: normalizeTimestamp(raw.lastPracticedAt),
      practiceCount: toCount(raw.practiceCount),
      correctCount,
      wrongCount,
      lastPracticeCorrectCount: Math.min(3, toCount(raw.lastPracticeCorrectCount)),
      lastPracticeWrongCount: Math.min(3, toCount(raw.lastPracticeWrongCount)),
      confusionCount: toCount(raw.confusionCount),
      lastConfusedAt: normalizeTimestamp(raw.lastConfusedAt),
    };
  }

  function normalizePairs(raw) {
    const result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    Object.entries(raw).forEach(([key, value]) => {
      const pair = normalizePair(value, key);
      if (pair) result[pair.pairKey] = pair;
    });
    return result;
  }

  function upsertPair(rawPairs, wordIdA, wordIdB, options = {}) {
    const pairs = normalizePairs(rawPairs);
    const pairKey = getPairKey(wordIdA, wordIdB);
    if (!pairKey) return { pairs, pair: null, changed: false, error: "不能把单词和自己设为易混词" };
    if (pairs[pairKey]) return { pairs, pair: pairs[pairKey], changed: false, error: "这组易混词已经存在" };
    const [first, second] = pairKey.split("::");
    const pair = normalizePair({
      pairKey,
      wordIdA: first,
      wordIdB: second,
      types: options.types,
      source: options.source,
      reason: options.reason,
      difference: options.difference,
      createdAt: options.createdAt || options.now || Date.now(),
      lastPracticedAt: null,
      practiceCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastPracticeCorrectCount: 0,
      lastPracticeWrongCount: 0,
      confusionCount: options.initialConfusion ? 1 : 0,
      lastConfusedAt: options.initialConfusion ? (options.confusedAt || options.now || Date.now()) : null,
    });
    pairs[pairKey] = pair;
    return { pairs, pair, changed: true, error: "" };
  }

  function removePair(rawPairs, wordIdA, wordIdB) {
    const pairs = normalizePairs(rawPairs);
    const pairKey = getPairKey(wordIdA, wordIdB);
    const changed = Boolean(pairKey && pairs[pairKey]);
    if (changed) delete pairs[pairKey];
    return { pairs, pairKey, changed };
  }

  function getPairsForWord(rawPairs, wordId) {
    const normalizedId = normalizeWordId(wordId);
    return Object.values(normalizePairs(rawPairs))
      .filter((pair) => pair.wordIdA === normalizedId || pair.wordIdB === normalizedId);
  }

  function recordPractice(rawPair, correctCount, now = Date.now()) {
    const pair = normalizePair(rawPair, rawPair?.pairKey);
    if (!pair) return null;
    const correct = Math.min(PRACTICE_QUESTION_COUNT, toCount(correctCount));
    const wrong = PRACTICE_QUESTION_COUNT - correct;
    return normalizePair({
      ...pair,
      lastPracticedAt: now,
      practiceCount: pair.practiceCount + 1,
      correctCount: pair.correctCount + correct,
      wrongCount: pair.wrongCount + wrong,
      lastPracticeCorrectCount: correct,
      lastPracticeWrongCount: wrong,
    }, pair.pairKey);
  }

  function recordConfusion(rawPair, now = Date.now()) {
    const pair = normalizePair(rawPair, rawPair?.pairKey);
    if (!pair) return null;
    return normalizePair({
      ...pair,
      confusionCount: pair.confusionCount + 1,
      lastConfusedAt: now,
    }, pair.pairKey);
  }

  function sortPairs(rawPairs) {
    return Object.values(normalizePairs(rawPairs)).sort((left, right) => {
      const leftConfused = left.lastConfusedAt || 0;
      const rightConfused = right.lastConfusedAt || 0;
      if (leftConfused !== rightConfused) return rightConfused - leftConfused;
      if (left.confusionCount !== right.confusionCount) return right.confusionCount - left.confusionCount;
      const leftNever = left.practiceCount === 0 ? 1 : 0;
      const rightNever = right.practiceCount === 0 ? 1 : 0;
      if (leftNever !== rightNever) return rightNever - leftNever;
      const leftAnswers = left.correctCount + left.wrongCount;
      const rightAnswers = right.correctCount + right.wrongCount;
      const leftRate = leftAnswers ? left.wrongCount / leftAnswers : 0;
      const rightRate = rightAnswers ? right.wrongCount / rightAnswers : 0;
      if (leftRate !== rightRate) return rightRate - leftRate;
      const leftPracticed = left.lastPracticedAt || 0;
      const rightPracticed = right.lastPracticedAt || 0;
      if (leftPracticed !== rightPracticed) return leftPracticed - rightPracticed;
      return right.createdAt - left.createdAt;
    });
  }

  function normalizeRecent(raw, limit = RECENT_LIMIT) {
    const maximum = Math.max(1, toCount(limit) || RECENT_LIMIT);
    const seen = new Set();
    const entries = (Array.isArray(raw) ? raw : [])
      .map((entry) => typeof entry === "string"
        ? { wordId: normalizeWordId(entry), encounteredAt: null }
        : {
          wordId: normalizeWordId(entry?.wordId),
          encounteredAt: normalizeTimestamp(entry?.encounteredAt),
        })
      .filter((entry) => entry.wordId)
      .sort((left, right) => (right.encounteredAt || 0) - (left.encounteredAt || 0));
    return entries.filter((entry) => {
      if (seen.has(entry.wordId)) return false;
      seen.add(entry.wordId);
      return true;
    }).slice(0, maximum);
  }

  function recordRecent(raw, wordId, now = Date.now(), limit = RECENT_LIMIT) {
    const normalizedId = normalizeWordId(wordId);
    if (!normalizedId) return normalizeRecent(raw, limit);
    return normalizeRecent([
      { wordId: normalizedId, encounteredAt: normalizeTimestamp(now) || Date.now() },
      ...(Array.isArray(raw) ? raw : []),
    ], limit);
  }

  function normalizeText(value) {
    return String(value || "").trim().toLocaleLowerCase("en-US");
  }

  function compactChinese(value) {
    return String(value || "")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s，。；、,.!！?？:：()（）\[\]【】/\\-]+/g, "");
  }

  function stripMeaningPosPrefix(value) {
    const partOfSpeech = "(?:adj|adv|n|v|vt|vi|prep|pron|conj|num|art|aux|modal|int|interj|det|abbr|phr|phrase)";
    return String(value || "").replace(
      new RegExp(`^(?:${partOfSpeech}(?:\\s*&\\s*${partOfSpeech})?\\.?\\s*)+`, "i"),
      "",
    );
  }

  function normalizeMeaningSegment(value) {
    return stripMeaningPosPrefix(String(value || "").trim().toLocaleLowerCase("zh-CN"))
      .replace(/[\s。.!！?？:：()（）\[\]【】"“”'‘’\\-]+/g, "");
  }

  function splitMeaningSegments(value) {
    const segments = String(value || "")
      .split(/[；;，,、/\\|｜\r\n]+/)
      .map(normalizeMeaningSegment)
      .filter(Boolean);
    return [...new Set(segments)];
  }

  function collectMeaningFields(word) {
    const fields = [];
    const push = (value, priority, source) => {
      if (typeof value !== "string" || !value.trim()) return;
      fields.push({
        value: value.trim(),
        normalized: compactChinese(value),
        segments: splitMeaningSegments(value),
        priority,
        source,
      });
    };
    push(word?.coreMeaning, 0, "coreMeaning");
    push(word?.shortMeaning, 1, "shortMeaning");
    if (Array.isArray(word?.meanings)) {
      word.meanings.forEach((item) => push(typeof item === "string" ? item : item?.meaning, 2, "meanings"));
    }
    if (word?.meaningsByPos && typeof word.meaningsByPos === "object") {
      Object.values(word.meaningsByPos).forEach((items) => {
        (Array.isArray(items) ? items : []).forEach((item) => push(item, 3, "meaningsByPos"));
      });
    }
    push(word?.meaning, 4, "meaning");
    return fields;
  }

  function findIndependentMeaningMatch(word, userAnswer, maximumPriority = 3) {
    const answerSegments = splitMeaningSegments(userAnswer);
    if (answerSegments.length !== 1) return null;
    const [answer] = answerSegments;
    if (answer.length < 2) return null;
    const answerVariants = new Set([
      answer,
      ...(CHINESE_SEARCH_ALIASES[answer] || []).map(normalizeMeaningSegment),
    ]);
    return collectMeaningFields(word)
      .filter((field) => (
        field.priority <= maximumPriority
        && field.segments.some((segment) => answerVariants.has(segment))
      ))
      .sort((left, right) => left.priority - right.priority)[0] || null;
  }

  function detectPersonalPairMeaningConfusion(currentWord, userAnswer, words, rawPairs) {
    if (findIndependentMeaningMatch(currentWord, userAnswer)) return null;
    const sourceWords = Array.isArray(words) ? words : [];
    const byId = new Map();
    sourceWords.forEach((word) => {
      const wordId = getWordId(word);
      if (wordId) byId.set(wordId, word);
    });
    const currentId = getWordId(currentWord);
    const currentSpelling = normalizeText(currentWord?.word);
    if (!currentId || !currentSpelling) return null;
    const matchesBySpelling = new Map();

    Object.values(normalizePairs(rawPairs)).forEach((pair) => {
      const wordA = byId.get(pair.wordIdA);
      const wordB = byId.get(pair.wordIdB);
      if (!wordA || !wordB) return;
      const aMatches = pair.wordIdA === currentId || normalizeText(wordA.word) === currentSpelling;
      const bMatches = pair.wordIdB === currentId || normalizeText(wordB.word) === currentSpelling;
      if (aMatches === bMatches) return;
      const otherWord = aMatches ? wordB : wordA;
      const otherWordId = aMatches ? pair.wordIdB : pair.wordIdA;
      const otherSpelling = normalizeText(otherWord.word);
      if (!otherSpelling || otherSpelling === currentSpelling) return;
      const meaningMatch = findIndependentMeaningMatch(otherWord, userAnswer);
      if (!meaningMatch) return;
      const candidate = {
        word: otherWord,
        wordId: otherWordId,
        pair,
        pairKey: pair.pairKey,
        matchedMeaning: meaningMatch.value,
        meaningSource: meaningMatch.source,
        detectionSource: "personal_pair",
        exactCurrentWordId: pair.wordIdA === currentId || pair.wordIdB === currentId,
      };
      const existing = matchesBySpelling.get(otherSpelling);
      if (!existing || (!existing.exactCurrentWordId && candidate.exactCurrentWordId)) {
        matchesBySpelling.set(otherSpelling, candidate);
      }
    });

    const matches = [...matchesBySpelling.values()];
    return matches.length === 1 ? matches[0] : null;
  }

  function damerauLevenshtein(leftValue, rightValue) {
    const left = normalizeText(leftValue);
    const right = normalizeText(rightValue);
    if (!left) return right.length;
    if (!right) return left.length;
    const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let index = 0; index <= left.length; index += 1) matrix[index][0] = index;
    for (let index = 0; index <= right.length; index += 1) matrix[0][index] = index;
    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        const cost = left[row - 1] === right[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + cost,
        );
        if (
          row > 1
          && column > 1
          && left[row - 1] === right[column - 2]
          && left[row - 2] === right[column - 1]
        ) {
          matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
        }
      }
    }
    return matrix[left.length][right.length];
  }

  function getFuzzyLimit(query) {
    if (query.length <= 4) return 1;
    if (query.length <= 8) return 2;
    return 3;
  }

  function searchWords(words, query, options = {}) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];
    const maximum = Math.max(1, Math.min(12, toCount(options.limit) || SEARCH_LIMIT));
    const excludeWordId = normalizeWordId(options.excludeWordId);
    const excludeWord = normalizeText(options.excludeWord);
    const anchorWord = normalizeText(options.anchorWord);
    const isEnglishQuery = /^[a-z][a-z' -]*$/i.test(normalizedQuery);
    const seen = new Set();
    const ranked = [];
    const sourceWords = [...(Array.isArray(words) ? words : [])].sort((left, right) => (
      Number(right?.book === options.preferredBook) - Number(left?.book === options.preferredBook)
    ));

    sourceWords.forEach((word, originalIndex) => {
      const wordId = getWordId(word);
      const spelling = normalizeText(word?.word);
      if (!wordId || !spelling || wordId === excludeWordId || (excludeWord && spelling === excludeWord)) return;
      if (seen.has(spelling)) return;
      seen.add(spelling);
      if (isEnglishQuery) {
        let rank = 4;
        let distance = 99;
        if (spelling === normalizedQuery) rank = 0;
        else if (spelling.startsWith(normalizedQuery)) rank = 1;
        else if (spelling.includes(normalizedQuery)) rank = 2;
        else {
          distance = damerauLevenshtein(spelling, normalizedQuery);
          if (distance <= getFuzzyLimit(normalizedQuery)) rank = 3;
        }
        if (rank < 4) ranked.push({
          word,
          wordId,
          matchType: ["exact", "prefix", "substring", "fuzzy"][rank],
          rank,
          distance,
          anchorDistance: anchorWord ? damerauLevenshtein(spelling, anchorWord) : 99,
          originalIndex,
        });
        return;
      }

      const compactQuery = compactChinese(normalizedQuery);
      const queryVariants = [compactQuery, ...(CHINESE_SEARCH_ALIASES[compactQuery] || []).map(compactChinese)];
      const matching = collectMeaningFields(word)
        .filter((field) => queryVariants.some((variant) => variant && field.normalized.includes(variant)))
        .sort((left, right) => left.priority - right.priority)[0];
      if (matching) ranked.push({
        word,
        wordId,
        matchType: "meaning",
        rank: matching.priority,
        distance: 0,
        meaningSource: matching.source,
        originalIndex,
      });
    });

    return ranked.sort((left, right) => (
      left.rank - right.rank
      || left.anchorDistance - right.anchorDistance
      || left.distance - right.distance
      || normalizeText(left.word.word).localeCompare(normalizeText(right.word.word), "en")
      || left.originalIndex - right.originalIndex
    )).slice(0, maximum);
  }

  function findExactWord(words, spelling, preferredBook) {
    const normalized = normalizeText(spelling);
    return (Array.isArray(words) ? words : [])
      .filter((word) => normalizeText(word?.word) === normalized)
      .sort((left, right) => Number(right.book === preferredBook) - Number(left.book === preferredBook))[0] || null;
  }

  function validateAiSuggestions(items, words, currentWord, rawPairs, options = {}) {
    const maximum = Math.max(1, Math.min(5, toCount(options.limit) || 4));
    const currentWordId = getWordId(currentWord);
    const currentSpelling = normalizeText(currentWord?.word);
    const pairs = normalizePairs(rawPairs);
    const seen = new Set();
    const result = [];
    for (const item of (Array.isArray(items) ? items : [])) {
      if (result.length >= maximum) break;
      const word = findExactWord(words, item?.word, currentWord?.book);
      const wordId = getWordId(word);
      const spelling = normalizeText(word?.word);
      if (!word || !wordId || spelling === currentSpelling || seen.has(spelling)) continue;
      if (pairs[getPairKey(currentWordId, wordId)]) continue;
      seen.add(spelling);
      result.push({
        word,
        wordId,
        types: normalizeTypes(item?.types),
        reason: String(item?.reason || "").trim().slice(0, 120),
        difference: String(item?.difference || "").trim().slice(0, 160),
      });
    }
    return result;
  }

  function detectMeaningConfusion(currentWord, userAnswer, words, options = {}) {
    const personalMatch = detectPersonalPairMeaningConfusion(
      currentWord,
      userAnswer,
      words,
      options.personalPairs,
    );
    if (personalMatch) return personalMatch;
    const answer = compactChinese(userAnswer);
    if (answer.length < 2) return null;
    if (collectMeaningFields(currentWord).some((field) => field.normalized.includes(answer))) return null;
    const recent = new Set((options.recentWordIds || []).map(normalizeWordId));
    const currentSpelling = normalizeText(currentWord?.word);
    const currentId = getWordId(currentWord);
    const candidates = [];
    const seenSpellings = new Set();
    for (const word of (Array.isArray(words) ? words : [])) {
      const wordId = getWordId(word);
      const spelling = normalizeText(word?.word);
      if (!wordId || wordId === currentId || spelling === currentSpelling || seenSpellings.has(spelling)) continue;
      seenSpellings.add(spelling);
      const match = collectMeaningFields(word)
        .filter((field) => field.normalized.includes(answer))
        .sort((left, right) => left.priority - right.priority)[0];
      if (!match || match.priority > 1) continue;
      const distance = damerauLevenshtein(currentSpelling, word.word);
      const spellingSignal = distance <= 1 ? 5 : distance === 2 ? 3 : 0;
      const score = (match.priority === 0 ? 6 : 5) + spellingSignal + (recent.has(wordId) ? 2 : 0);
      if (score >= 8) candidates.push({ word, wordId, score, distance, matchedMeaning: match.value });
    }
    candidates.sort((left, right) => right.score - left.score || left.distance - right.distance);
    if (!candidates.length) return null;
    if (candidates[1] && candidates[0].score - candidates[1].score < 2) return null;
    return candidates[0];
  }

  function buildPracticeQuestions(rawPair, wordA, wordB) {
    const pair = normalizePair(rawPair, rawPair?.pairKey);
    if (!pair || !wordA || !wordB) return [];
    const meaningA = wordA.coreMeaning || wordA.shortMeaning || wordA.meaning;
    const meaningB = wordB.coreMeaning || wordB.shortMeaning || wordB.meaning;
    const flip = pair.practiceCount % 2 === 1;
    const makeOptions = (correct, incorrect, shouldFlip) => {
      const options = [
        { text: correct.text, wordId: correct.wordId, isCorrect: true },
        { text: incorrect.text, wordId: incorrect.wordId, isCorrect: false },
      ];
      return shouldFlip ? options.reverse() : options;
    };
    return [
      {
        type: "en-to-zh",
        prompt: `${wordA.word} = ?`,
        options: makeOptions(
          { text: meaningA, wordId: pair.wordIdA },
          { text: meaningB, wordId: pair.wordIdB },
          flip,
        ),
      },
      {
        type: "zh-to-en",
        prompt: `“${meaningB}”对应：`,
        options: makeOptions(
          { text: wordB.word, wordId: pair.wordIdB },
          { text: wordA.word, wordId: pair.wordIdA },
          !flip,
        ),
      },
      {
        type: "en-to-zh",
        prompt: `${wordB.word} = ?`,
        options: makeOptions(
          { text: meaningB, wordId: pair.wordIdB },
          { text: meaningA, wordId: pair.wordIdA },
          flip,
        ),
      },
    ];
  }

  app.confusableWords = {
    VALID_TYPES,
    VALID_SOURCES,
    SEARCH_LIMIT,
    RECENT_LIMIT,
    PRACTICE_QUESTION_COUNT,
    normalizeTypes,
    getWordId,
    getPairKey,
    normalizePair,
    normalizePairs,
    upsertPair,
    removePair,
    getPairsForWord,
    recordPractice,
    recordConfusion,
    sortPairs,
    normalizeRecent,
    recordRecent,
    collectMeaningFields,
    normalizeMeaningSegment,
    splitMeaningSegments,
    findIndependentMeaningMatch,
    detectPersonalPairMeaningConfusion,
    damerauLevenshtein,
    searchWords,
    findExactWord,
    validateAiSuggestions,
    detectMeaningConfusion,
    buildPracticeQuestions,
  };
})(window.CETWords);
