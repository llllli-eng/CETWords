(function registerDailyGroupService(app) {
  const DEFAULT_BREAK_MINUTES = 5;
  const MIN_GROUP_SIZE = 5;
  const MAX_GROUP_SIZE = 15;
  const MIN_BREAK_MINUTES = 2;
  const MAX_BREAK_MINUTES = 10;
  const MAX_REASON_LENGTH = 180;
  const REQUEST_TIMEOUT_MS = 15 * 1000;
  const REQUEST_FIELDS = Object.freeze([
    "dailyTarget",
    "todayDueReviewCount",
    "todayRecoveryPendingCount",
    "todayPendingReinforcementCount",
    "todayChoiceRetryCount",
    "yesterdayStudied",
    "yesterdayDailyTarget",
    "yesterdayCompletedNewWords",
    "yesterdayTaskCompleted",
    "yesterdayTotalAnswers",
    "yesterdayActiveRecallPerformance",
    "recentCompletionRate",
    "recentAverageAnswers",
  ]);

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function createFallbackGroupSizes(dailyTarget) {
    const target = toCount(dailyTarget);
    if (!target) return [];
    if (target < MIN_GROUP_SIZE) return [target];
    const groupCount = Math.max(1, Math.ceil(target / 10));
    const baseSize = Math.floor(target / groupCount);
    const remainder = target % groupCount;
    return Array.from({ length: groupCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
  }

  function createFallbackPlan(dailyTarget, reason = "AI 分组暂不可用，已使用约 10 个新词一组的本地方案。") {
    return {
      groupSizes: createFallbackGroupSizes(dailyTarget),
      breakMinutes: DEFAULT_BREAK_MINUTES,
      reason: String(reason).trim().slice(0, MAX_REASON_LENGTH),
    };
  }

  function validateGroupPlan(raw, dailyTarget) {
    const target = toCount(dailyTarget);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !target) {
      return { valid: false, error: "INVALID_GROUP_PLAN" };
    }
    const allowed = new Set(["groupSizes", "breakMinutes", "reason"]);
    if (Object.keys(raw).some((key) => !allowed.has(key))) {
      return { valid: false, error: "INVALID_GROUP_PLAN_FIELDS" };
    }
    if (!Array.isArray(raw.groupSizes) || raw.groupSizes.length === 0) {
      return { valid: false, error: "INVALID_GROUP_SIZES" };
    }
    const groupSizes = raw.groupSizes.map(Number);
    if (groupSizes.some((size) => !Number.isInteger(size) || size <= 0)) {
      return { valid: false, error: "INVALID_GROUP_SIZE" };
    }
    if (target >= MIN_GROUP_SIZE && groupSizes.some((size) => size < MIN_GROUP_SIZE || size > MAX_GROUP_SIZE)) {
      return { valid: false, error: "GROUP_SIZE_OUT_OF_RANGE" };
    }
    if (target < MIN_GROUP_SIZE && (groupSizes.length !== 1 || groupSizes[0] !== target)) {
      return { valid: false, error: "SMALL_TARGET_MUST_USE_ONE_GROUP" };
    }
    if (groupSizes.reduce((total, size) => total + size, 0) !== target) {
      return { valid: false, error: "GROUP_TOTAL_MISMATCH" };
    }
    const breakMinutes = Number(raw.breakMinutes);
    if (!Number.isInteger(breakMinutes) || breakMinutes < MIN_BREAK_MINUTES || breakMinutes > MAX_BREAK_MINUTES) {
      return { valid: false, error: "BREAK_MINUTES_OUT_OF_RANGE" };
    }
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      return { valid: false, error: "INVALID_GROUP_REASON" };
    }
    return { valid: true, value: { groupSizes, breakMinutes, reason } };
  }

  function normalizeGroupPlan(raw, dailyTarget) {
    const validation = validateGroupPlan(raw, dailyTarget);
    return validation.valid ? validation.value : createFallbackPlan(dailyTarget);
  }

  function buildGroupBoundaries(groupSizes) {
    let start = 0;
    return (Array.isArray(groupSizes) ? groupSizes : []).map((rawSize, index) => {
      const size = toCount(rawSize);
      const boundary = { index, start, end: start + size, size };
      start += size;
      return boundary;
    });
  }

  function getGroupProgress(plan, scheduledNewWordIds = [], completedNewWordIds = [], introducedNewWordIds = []) {
    if (!plan || !Array.isArray(plan.groupSizes) || !plan.groupSizes.length) return null;
    const scheduled = Array.isArray(scheduledNewWordIds) ? scheduledNewWordIds : [];
    const completed = new Set(Array.isArray(completedNewWordIds) ? completedNewWordIds : []);
    const introduced = new Set(Array.isArray(introducedNewWordIds) ? introducedNewWordIds : []);
    const boundaries = buildGroupBoundaries(plan.groupSizes);
    const groups = boundaries.map((boundary) => {
      const ids = scheduled.slice(boundary.start, boundary.end);
      const completedCount = ids.filter((wordId) => completed.has(wordId)).length;
      const introducedCount = ids.filter((wordId) => introduced.has(wordId)).length;
      return {
        ...boundary,
        ids,
        completedCount,
        introducedCount,
        complete: ids.length === boundary.size && completedCount === boundary.size,
      };
    });
    let completedGroupCount = 0;
    while (groups[completedGroupCount]?.complete) completedGroupCount += 1;
    const activeGroupIndex = Math.min(
      Math.max(0, Number.isInteger(plan.activeGroupIndex) ? plan.activeGroupIndex : 0),
      Math.max(0, groups.length - 1),
    );
    const activeGroup = groups[activeGroupIndex] || null;
    const allComplete = completedGroupCount === groups.length;
    const awaitingNextGroup = Boolean(activeGroup?.complete && !allComplete);
    return {
      groups,
      activeGroup,
      activeGroupIndex,
      completedGroupCount,
      allComplete,
      awaitingNextGroup,
      allowedIntroIds: scheduled.slice(0, activeGroup?.end || 0),
      completedNewWords: groups.reduce((total, group) => total + group.completedCount, 0),
      totalNewWords: plan.groupSizes.reduce((total, size) => total + size, 0),
    };
  }

  function buildRequestPayload(input = {}) {
    const result = {};
    REQUEST_FIELDS.forEach((key) => {
      if (input[key] !== undefined) result[key] = input[key];
    });
    return result;
  }

  function normalizeProxyUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  async function requestDailyGroupPlan({ payload, proxyUrl, token, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = window.fetch.bind(window) }) {
    const baseUrl = normalizeProxyUrl(proxyUrl);
    if (!baseUrl || !String(token || "").trim()) throw new Error("AI_NOT_CONFIGURED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/daily-group-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Token": String(token).trim() },
        body: JSON.stringify(buildRequestPayload(payload)),
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      const { usage: rawUsage, source = "ai", fallback = false, ...rawPlan } = data || {};
      const validation = validateGroupPlan(rawPlan, payload.dailyTarget);
      if (!validation.valid) throw new Error("AI_INVALID_RESPONSE");
      return {
        plan: validation.value,
        source: source === "local" || fallback ? "local" : "ai",
        usage: {
          promptTokens: toCount(rawUsage?.promptTokens),
          completionTokens: toCount(rawUsage?.completionTokens),
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  app.dailyGroupService = {
    DEFAULT_BREAK_MINUTES,
    MIN_GROUP_SIZE,
    MAX_GROUP_SIZE,
    MIN_BREAK_MINUTES,
    MAX_BREAK_MINUTES,
    MAX_REASON_LENGTH,
    REQUEST_FIELDS,
    createFallbackGroupSizes,
    createFallbackPlan,
    validateGroupPlan,
    normalizeGroupPlan,
    buildGroupBoundaries,
    getGroupProgress,
    buildRequestPayload,
    requestDailyGroupPlan,
  };
})(window.CETWords);
