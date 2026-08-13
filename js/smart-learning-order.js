(function registerSmartLearningOrder(app) {
  const FREQUENCY_TIERS = Object.freeze(["S", "A", "B", "C", "D", "E"]);
  const NEUTRAL_TIER = "neutral";
  const QUEUE_TIERS = Object.freeze([...FREQUENCY_TIERS, NEUTRAL_TIER]);
  const SMART_TIER_WEIGHTS = Object.freeze({ S: 40, A: 30, B: 15, C: 8, D: 5, E: 2 });
  const NEUTRAL_DRAW_INTERVAL = 20;
  const DEFAULT_EFFECTIVE_TIER = "E";

  function buildWeightedPattern(weights = SMART_TIER_WEIGHTS) {
    const tiers = FREQUENCY_TIERS.filter((tier) => Number(weights[tier]) > 0);
    const total = tiers.reduce((sum, tier) => sum + Number(weights[tier]), 0);
    const current = Object.fromEntries(tiers.map((tier) => [tier, 0]));
    const pattern = [];
    for (let index = 0; index < total; index += 1) {
      tiers.forEach((tier) => { current[tier] += Number(weights[tier]); });
      const selected = tiers.reduce((best, tier) => (
        current[tier] > current[best] ? tier : best
      ), tiers[0]);
      pattern.push(selected);
      current[selected] -= total;
    }
    return pattern;
  }

  const SMART_TIER_PATTERN = Object.freeze(buildWeightedPattern());

  function hashSeed(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seed) {
    let state = hashSeed(seed) || 0x9e3779b9;
    return function seededRandom() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleIds(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function normalizeTier(value) {
    return FREQUENCY_TIERS.includes(value) ? value : DEFAULT_EFFECTIVE_TIER;
  }

  function normalizeEffectiveTier(value) {
    return value === NEUTRAL_TIER ? NEUTRAL_TIER : normalizeTier(value);
  }

  function normalizeOverride(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return {
      effectiveLearningTier: normalizeEffectiveTier(raw.effectiveLearningTier),
      frequencyBoostEligible: raw.frequencyBoostEligible !== false,
      priorityAdjustmentReason: typeof raw.priorityAdjustmentReason === "string"
        ? raw.priorityAdjustmentReason.trim()
        : "",
    };
  }

  function getLearningPriority(wordId, frequencyByWord, overridesByWord) {
    const normalizedWord = String(wordId || "").trim().toLowerCase();
    const frequency = frequencyByWord instanceof Map ? frequencyByWord.get(normalizedWord) : null;
    const override = overridesByWord instanceof Map ? normalizeOverride(overridesByWord.get(normalizedWord)) : null;
    const rawFrequencyTier = normalizeTier(frequency?.frequencyTier);
    return {
      rawFrequencyTier,
      effectiveLearningTier: override?.effectiveLearningTier || rawFrequencyTier,
      frequencyBoostEligible: override?.frequencyBoostEligible ?? true,
      priorityAdjustmentReason: override?.priorityAdjustmentReason || "",
      frequency: frequency || null,
    };
  }

  function createEmptyQueues() {
    return Object.fromEntries(QUEUE_TIERS.map((tier) => [tier, []]));
  }

  function normalizeQueueState(raw) {
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const queues = createEmptyQueues();
    QUEUE_TIERS.forEach((tier) => {
      const ids = Array.isArray(value.queues?.[tier]) ? value.queues[tier] : [];
      queues[tier] = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
    });
    return {
      scopeKey: typeof value.scopeKey === "string" ? value.scopeKey : "",
      cursor: Math.max(0, Math.floor(Number(value.cursor)) || 0) % SMART_TIER_PATTERN.length,
      weightedDrawsUntilNeutral: Number.isFinite(Number(value.weightedDrawsUntilNeutral))
        ? Math.max(0, Math.floor(Number(value.weightedDrawsUntilNeutral)))
        : NEUTRAL_DRAW_INTERVAL,
      queues,
    };
  }

  function groupCandidates(candidateIds, frequencyByWord, overridesByWord) {
    const groups = createEmptyQueues();
    [...new Set(candidateIds)].forEach((wordId) => {
      const tier = getLearningPriority(wordId, frequencyByWord, overridesByWord).effectiveLearningTier;
      groups[tier].push(wordId);
    });
    return groups;
  }

  function rebuildQueueState({
    candidateIds,
    frequencyByWord,
    overridesByWord,
    scopeKey,
    random = Math.random,
  }) {
    const groups = groupCandidates(candidateIds, frequencyByWord, overridesByWord);
    QUEUE_TIERS.forEach((tier) => { groups[tier] = shuffleIds(groups[tier], random); });
    return {
      scopeKey: String(scopeKey || ""),
      cursor: 0,
      weightedDrawsUntilNeutral: NEUTRAL_DRAW_INTERVAL,
      queues: groups,
    };
  }

  function reconcileQueueState({
    state,
    candidateIds,
    frequencyByWord,
    overridesByWord,
    scopeKey,
    random = Math.random,
  }) {
    const candidates = [...new Set(candidateIds)];
    const allowed = new Set(candidates);
    if (!state || state.scopeKey !== String(scopeKey || "")) {
      return rebuildQueueState({ candidateIds: candidates, frequencyByWord, overridesByWord, scopeKey, random });
    }

    const result = normalizeQueueState(state);
    const queued = new Set();
    const reconciledQueues = createEmptyQueues();
    QUEUE_TIERS.forEach((tier) => {
      result.queues[tier].forEach((wordId) => {
        if (!allowed.has(wordId) || queued.has(wordId)) return false;
        queued.add(wordId);
        const effectiveTier = getLearningPriority(wordId, frequencyByWord, overridesByWord).effectiveLearningTier;
        reconciledQueues[effectiveTier].push(wordId);
        return true;
      });
    });
    result.queues = reconciledQueues;
    const additions = groupCandidates(candidates.filter((wordId) => !queued.has(wordId)), frequencyByWord, overridesByWord);
    QUEUE_TIERS.forEach((tier) => result.queues[tier].push(...shuffleIds(additions[tier], random)));
    result.scopeKey = String(scopeKey || "");
    return result;
  }

  function takeNextTier(state) {
    for (let offset = 0; offset < SMART_TIER_PATTERN.length; offset += 1) {
      const patternIndex = (state.cursor + offset) % SMART_TIER_PATTERN.length;
      const tier = SMART_TIER_PATTERN[patternIndex];
      if (state.queues[tier]?.length) {
        state.cursor = (patternIndex + 1) % SMART_TIER_PATTERN.length;
        return tier;
      }
    }
    return null;
  }

  function takeFromQueue(rawState, count) {
    const state = normalizeQueueState(rawState);
    const result = [];
    const target = Math.max(0, Math.floor(Number(count)) || 0);
    while (result.length < target) {
      if (state.queues[NEUTRAL_TIER].length && state.weightedDrawsUntilNeutral <= 0) {
        result.push(state.queues[NEUTRAL_TIER].shift());
        state.weightedDrawsUntilNeutral = NEUTRAL_DRAW_INTERVAL;
        continue;
      }
      const tier = takeNextTier(state);
      if (!tier) {
        if (!state.queues[NEUTRAL_TIER].length) break;
        result.push(state.queues[NEUTRAL_TIER].shift());
        state.weightedDrawsUntilNeutral = NEUTRAL_DRAW_INTERVAL;
        continue;
      }
      result.push(state.queues[tier].shift());
      if (state.queues[NEUTRAL_TIER].length) state.weightedDrawsUntilNeutral -= 1;
    }
    return { ids: result, state };
  }

  function createFrequencyMap(payload) {
    const words = Array.isArray(payload?.words) ? payload.words : [];
    return new Map(words
      .filter((entry) => typeof entry?.word === "string" && entry.word.trim())
      .map((entry) => [entry.word.trim().toLowerCase(), entry]));
  }

  function createOverrideMap(payload) {
    const overrides = Array.isArray(payload?.overrides) ? payload.overrides : [];
    return new Map(overrides
      .filter((entry) => typeof entry?.word === "string" && entry.word.trim())
      .map((entry) => [entry.word.trim().toLowerCase(), entry]));
  }

  async function loadFrequencyResources(fetchImpl = window.fetch.bind(window)) {
    try {
      const paths = [
        "data/cet4-exam-frequency.json",
        "data/cet6-exam-frequency.json",
        "data/cet-learning-priority-overrides.json",
      ];
      const responses = await Promise.all(paths.map((path) => fetchImpl(path)));
      if (responses.some((response) => !response.ok)) throw new Error("frequency-resource-unavailable");
      const [cet4, cet6, overrides] = await Promise.all(responses.map((response) => response.json()));
      return {
        status: "ready",
        maps: { cet4: createFrequencyMap(cet4), cet6: createFrequencyMap(cet6) },
        overrides: createOverrideMap(overrides),
        error: null,
      };
    } catch (error) {
      return {
        status: "fallback-random",
        maps: { cet4: null, cet6: null },
        overrides: new Map(),
        error: error?.message || "frequency-resource-unavailable",
      };
    }
  }

  app.smartLearningOrder = {
    FREQUENCY_TIERS,
    NEUTRAL_TIER,
    QUEUE_TIERS,
    SMART_TIER_WEIGHTS,
    SMART_TIER_PATTERN,
    NEUTRAL_DRAW_INTERVAL,
    buildWeightedPattern,
    createSeededRandom,
    shuffleIds,
    normalizeQueueState,
    getLearningPriority,
    rebuildQueueState,
    reconcileQueueState,
    takeFromQueue,
    createFrequencyMap,
    createOverrideMap,
    loadFrequencyResources,
  };
})(window.CETWords);
