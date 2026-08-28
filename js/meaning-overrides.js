/**
 * Phase16.6.1 · 个人释义覆盖纯函数。
 * 原始词库对象始终只读；学习展示优先个人释义，判题同时保留个人与原始参考。
 */

(function registerMeaningOverrides(app) {
  const VALID_SOURCES = new Set(["ai_accepted", "manual"]);
  const VALID_VERDICTS = new Set(["correct", "incomplete", "priority_issue", "misleading", "wrong"]);
  const MAX_MEANINGS = 12;

  function cleanText(value, maximum = 300) {
    return typeof value === "string" ? value.trim().slice(0, maximum) : "";
  }

  function normalizeMeaningList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
      .map((item) => cleanText(typeof item === "string" ? item : item?.meaning, 300))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .slice(0, MAX_MEANINGS);
  }

  function normalizeIsoTime(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  function normalizeAuditSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const verdict = VALID_VERDICTS.has(value.verdict) ? value.verdict : "";
    const suggestedCoreMeaning = cleanText(value.suggestedCoreMeaning, 300);
    if (!verdict && !suggestedCoreMeaning) return null;
    return { verdict, suggestedCoreMeaning };
  }

  function normalizeOverride(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const coreMeaning = cleanText(value.coreMeaning, 300);
    if (!coreMeaning) return null;
    const shortMeaning = cleanText(value.shortMeaning, 300) || coreMeaning;
    const meanings = normalizeMeaningList(value.meanings);
    return {
      coreMeaning,
      shortMeaning,
      meanings: meanings.length ? meanings : coreMeaning.split(/[；;,，、/|]+/).map((item) => item.trim()).filter(Boolean).slice(0, MAX_MEANINGS),
      note: cleanText(value.note, 500),
      source: VALID_SOURCES.has(value.source) ? value.source : "manual",
      createdAt: normalizeIsoTime(value.createdAt),
      updatedAt: normalizeIsoTime(value.updatedAt),
      aiAuditSnapshot: normalizeAuditSnapshot(value.aiAuditSnapshot),
    };
  }

  function normalizeOverrideMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([wordId, raw]) => {
      if (typeof wordId !== "string" || !wordId.trim()) return;
      const normalized = normalizeOverride(raw);
      if (normalized) result[wordId.trim()] = normalized;
    });
    return result;
  }

  function getWordId(word) {
    if (typeof word?.id === "string" && word.id.trim()) return word.id.trim();
    const book = word?.book === "cet6" ? "cet6" : word?.book === "cet4" ? "cet4" : "";
    const spelling = cleanText(word?.word, 100).toLocaleLowerCase("en-US");
    return book && spelling ? `${book}-${spelling}` : "";
  }

  function getBaseCoreMeaning(word) {
    return cleanText(word?.coreMeaning || word?.shortMeaning || word?.meaning, 500);
  }

  function getDisplayCoreMeaning(word, override) {
    return normalizeOverride(override)?.coreMeaning || getBaseCoreMeaning(word);
  }

  function applyPersonalOverride(word, override) {
    const normalized = normalizeOverride(override);
    if (!normalized || !word) return word;
    return {
      ...word,
      coreMeaning: normalized.coreMeaning,
      shortMeaning: normalized.shortMeaning,
      personalMeaningOverride: normalized,
      baseCoreMeaning: getBaseCoreMeaning(word),
    };
  }

  function normalizeBaseMeanings(word) {
    const result = [];
    const push = (pos, meaning) => {
      const value = cleanText(meaning, 500);
      if (!value || result.some((item) => item.meaning === value)) return;
      result.push({ pos: cleanText(pos, 30), meaning: value });
    };
    if (Array.isArray(word?.meanings)) {
      word.meanings.forEach((item) => push(item?.pos || item?.partOfSpeech, item?.meaning || item?.translation || item));
    }
    if (!result.length) push("", word?.meaning || getBaseCoreMeaning(word));
    return result.slice(0, 20);
  }

  function buildReferenceWord(word, override) {
    const normalized = normalizeOverride(override);
    if (!normalized || !word) return word;
    const personalMeanings = normalized.meanings.map((meaning) => ({ pos: "个人", meaning }));
    const baseMeanings = normalizeBaseMeanings(word);
    const meaningsByPos = { 个人释义: [...normalized.meanings] };
    if (word.meaningsByPos && typeof word.meaningsByPos === "object") {
      Object.entries(word.meaningsByPos).forEach(([pos, items]) => {
        const values = Array.isArray(items) ? items.map((item) => cleanText(item, 500)).filter(Boolean) : [];
        if (values.length) meaningsByPos[pos] = [...new Set(values)].slice(0, 8);
      });
    }
    return {
      ...word,
      coreMeaning: normalized.coreMeaning,
      shortMeaning: normalized.shortMeaning,
      meanings: [...personalMeanings, ...baseMeanings].slice(0, 20),
      meaningsByPos,
      personalMeaningOverride: normalized,
      baseCoreMeaning: getBaseCoreMeaning(word),
    };
  }

  function buildOverrideFromAudit(audit, now = Date.now()) {
    const suggestedCoreMeaning = cleanText(audit?.suggestedCoreMeaning, 300);
    if (!suggestedCoreMeaning) return null;
    const common = Array.isArray(audit?.commonMeanings)
      ? audit.commonMeanings.map((item) => cleanText(item?.meaning, 300)).filter(Boolean)
      : [];
    const secondary = normalizeMeaningList(audit?.secondaryMeanings);
    const timestamp = new Date(now).toISOString();
    return normalizeOverride({
      coreMeaning: suggestedCoreMeaning,
      shortMeaning: suggestedCoreMeaning.split(/[；;,，、/|]+/).slice(0, 2).join("；") || suggestedCoreMeaning,
      meanings: [...common, ...secondary],
      note: "",
      source: "ai_accepted",
      createdAt: timestamp,
      updatedAt: timestamp,
      aiAuditSnapshot: {
        verdict: audit?.verdict,
        suggestedCoreMeaning,
      },
    });
  }

  app.meaningOverrides = {
    VALID_SOURCES,
    VALID_VERDICTS,
    MAX_MEANINGS,
    normalizeMeaningList,
    normalizeOverride,
    normalizeOverrideMap,
    getWordId,
    getBaseCoreMeaning,
    getDisplayCoreMeaning,
    applyPersonalOverride,
    buildReferenceWord,
    buildOverrideFromAudit,
  };
})(window.CETWords);
