/** Phase16.6.1 · 按需 AI 词义核验客户端。 */

(function registerMeaningAudit(app) {
  const REQUEST_TIMEOUT_MS = 12 * 1000;
  const VALID_VERDICTS = new Set(["correct", "incomplete", "priority_issue", "misleading", "wrong"]);
  const MAX_CHAT_MESSAGES = 8;

  class MeaningAuditError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = "MeaningAuditError";
      this.code = code;
      this.status = options.status || 0;
    }
  }

  function clean(value, maximum) {
    return typeof value === "string" ? value.trim().slice(0, maximum) : "";
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

  function normalizeMeanings(word) {
    if (!Array.isArray(word?.meanings)) return [];
    return word.meanings.slice(0, 12).map((item) => ({
      pos: clean(item?.pos || item?.partOfSpeech, 30),
      meaning: clean(item?.meaning || item?.translation || item, 300),
    })).filter((item) => item.meaning);
  }

  function normalizeMeaningsByPos(word) {
    const result = {};
    if (!word?.meaningsByPos || typeof word.meaningsByPos !== "object" || Array.isArray(word.meaningsByPos)) return result;
    Object.entries(word.meaningsByPos).slice(0, 12).forEach(([pos, items]) => {
      const values = Array.isArray(items)
        ? items.slice(0, 6).map((item) => clean(item, 300)).filter(Boolean)
        : [];
      if (values.length) result[clean(pos, 30)] = values;
    });
    return result;
  }

  function buildAuditPayload(word, personalOverride = null) {
    const normalizedOverride = app.meaningOverrides?.normalizeOverride(personalOverride);
    return {
      word: clean(word?.word, 100),
      book: word?.book === "cet6" ? "cet6" : "cet4",
      sourceLevel: clean(word?.sourceLevel || word?.book, 30),
      coreMeaning: clean(word?.coreMeaning || word?.shortMeaning || word?.meaning, 300),
      shortMeaning: clean(word?.shortMeaning || word?.coreMeaning || word?.meaning, 300),
      meanings: normalizeMeanings(word),
      meaningsByPos: normalizeMeaningsByPos(word),
      ...(normalizedOverride ? {
        personalOverride: {
          coreMeaning: normalizedOverride.coreMeaning,
          shortMeaning: normalizedOverride.shortMeaning,
          meanings: normalizedOverride.meanings,
        },
      } : {}),
    };
  }

  function normalizeAuditResult(raw) {
    if (!raw || typeof raw !== "object" || !VALID_VERDICTS.has(raw.verdict)) {
      throw new MeaningAuditError("AI_INVALID_RESPONSE", "AI 核验返回格式异常");
    }
    const suggestedCoreMeaning = clean(raw.suggestedCoreMeaning, 300);
    const summary = clean(raw.summary, 500);
    const cetAdvice = clean(raw.cetAdvice, 500);
    if (!suggestedCoreMeaning || !summary || !cetAdvice) {
      throw new MeaningAuditError("AI_INVALID_RESPONSE", "AI 核验返回格式异常");
    }
    const commonMeanings = Array.isArray(raw.commonMeanings)
      ? raw.commonMeanings.slice(0, 8).map((item) => ({
        pos: clean(item?.pos, 30),
        meaning: clean(item?.meaning, 240),
      })).filter((item) => item.meaning)
      : [];
    const secondaryMeanings = Array.isArray(raw.secondaryMeanings)
      ? raw.secondaryMeanings.slice(0, 8).map((item) => clean(item, 240)).filter(Boolean)
      : [];
    return {
      verdict: raw.verdict,
      summary,
      suggestedCoreMeaning,
      commonMeanings,
      secondaryMeanings,
      cetAdvice,
      caution: clean(raw.caution, 500),
      usage: {
        promptTokens: Math.max(0, Math.floor(Number(raw.usage?.promptTokens) || 0)),
        completionTokens: Math.max(0, Math.floor(Number(raw.usage?.completionTokens) || 0)),
      },
    };
  }

  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-MAX_CHAT_MESSAGES).map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: clean(item?.content, 600),
    })).filter((item) => item.content);
  }

  function buildChatPayload({ word, audit, personalOverride, history, question }) {
    return {
      word: clean(word?.word, 100),
      book: word?.book === "cet6" ? "cet6" : "cet4",
      audit: {
        verdict: VALID_VERDICTS.has(audit?.verdict) ? audit.verdict : "correct",
        summary: clean(audit?.summary, 500),
        suggestedCoreMeaning: clean(audit?.suggestedCoreMeaning, 300),
      },
      currentMeanings: {
        baseCoreMeaning: clean(word?.coreMeaning || word?.shortMeaning || word?.meaning, 300),
        personalCoreMeaning: clean(personalOverride?.coreMeaning, 300),
      },
      history: normalizeHistory(history),
      question: clean(question, 500),
    };
  }

  function normalizeChatResult(raw) {
    const answer = clean(raw?.answer, 1000);
    if (!answer) throw new MeaningAuditError("AI_INVALID_RESPONSE", "AI 追问返回格式异常");
    return {
      answer,
      usage: {
        promptTokens: Math.max(0, Math.floor(Number(raw.usage?.promptTokens) || 0)),
        completionTokens: Math.max(0, Math.floor(Number(raw.usage?.completionTokens) || 0)),
      },
    };
  }

  async function fetchJson(path, { proxyUrl, token, payload, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = fetch }) {
    const baseUrl = normalizeProxyUrl(proxyUrl);
    if (!baseUrl || !String(token || "").trim()) {
      throw new MeaningAuditError("AI_NOT_CONFIGURED", "请先在设置中启用 AI 中文释义功能");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Token": String(token).trim() },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        throw new MeaningAuditError(data?.error || `HTTP_${response.status}`, data?.message || "AI 核验暂时失败", { status: response.status });
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new MeaningAuditError("AI_TIMEOUT", "AI 核验暂时失败，请稍后重试");
      if (error instanceof MeaningAuditError) throw error;
      throw new MeaningAuditError("AI_NETWORK_ERROR", "AI 核验暂时失败，请稍后重试");
    } finally {
      clearTimeout(timer);
    }
  }

  async function audit({ word, personalOverride, proxyUrl, token, timeoutMs, fetchImpl }) {
    const data = await fetchJson("/api/meaning-audit", {
      proxyUrl,
      token,
      timeoutMs,
      fetchImpl,
      payload: buildAuditPayload(word, personalOverride),
    });
    return normalizeAuditResult(data);
  }

  async function chat({ word, audit: auditResult, personalOverride, history, question, proxyUrl, token, timeoutMs, fetchImpl }) {
    const payload = buildChatPayload({ word, audit: auditResult, personalOverride, history, question });
    if (!payload.question) throw new MeaningAuditError("EMPTY_QUESTION", "请先输入你的问题");
    const data = await fetchJson("/api/meaning-audit-chat", { proxyUrl, token, timeoutMs, fetchImpl, payload });
    return normalizeChatResult(data);
  }

  app.meaningAudit = {
    REQUEST_TIMEOUT_MS,
    MAX_CHAT_MESSAGES,
    VALID_VERDICTS,
    MeaningAuditError,
    buildAuditPayload,
    normalizeAuditResult,
    normalizeHistory,
    buildChatPayload,
    normalizeChatResult,
    audit,
    chat,
  };
})(window.CETWords);
