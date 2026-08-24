/**
 * 拾词 · 易混词 AI 客户端
 * 仅在用户显式点击推荐或描述找词时调用 Worker。
 */

(function registerConfusableAi(app) {
  const REQUEST_TIMEOUT_MS = 12 * 1000;

  class ConfusableAIError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = "ConfusableAIError";
      this.code = code;
      this.status = options.status || 0;
    }
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

  function getConnection(options = {}) {
    const settings = app.storage.getAiJudgeSettings();
    return {
      proxyUrl: normalizeProxyUrl(options.proxyUrl || settings.proxyUrl),
      token: String(options.token || app.storage.getAiProxyToken() || "").trim(),
    };
  }

  function buildSuggestPayload(word) {
    const meanings = app.confusableWords.collectMeaningFields(word)
      .filter((entry) => entry.source !== "coreMeaning")
      .map((entry) => entry.value)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 8)
      .map((value) => value.slice(0, 180));
    return {
      word: String(word?.word || "").slice(0, 100),
      coreMeaning: String(word?.coreMeaning || word?.shortMeaning || word?.meaning || "").slice(0, 300),
      meanings,
    };
  }

  function buildFindPayload(currentWord, description) {
    return {
      currentWord: String(currentWord?.word || currentWord || "").slice(0, 100),
      description: String(description || "").trim().slice(0, 500),
    };
  }

  async function request(path, payload, options = {}) {
    const { proxyUrl, token } = getConnection(options);
    if (!proxyUrl || !token) throw new ConfusableAIError("AI_NOT_CONFIGURED", "AI推荐暂不可用");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${proxyUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": token,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        throw new ConfusableAIError(
          typeof data?.error === "string" ? data.error : `HTTP_${response.status}`,
          data?.message || "AI推荐暂不可用",
          { status: response.status },
        );
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new ConfusableAIError("AI_TIMEOUT", "AI推荐暂不可用");
      if (error instanceof ConfusableAIError) throw error;
      throw new ConfusableAIError("AI_NETWORK_ERROR", "AI推荐暂不可用");
    } finally {
      clearTimeout(timer);
    }
  }

  async function suggest(word, options = {}) {
    const data = await request("/api/confusable-suggest", buildSuggestPayload(word), options);
    return {
      items: Array.isArray(data?.items) ? data.items.slice(0, 4) : [],
      usage: data?.usage || { promptTokens: 0, completionTokens: 0 },
    };
  }

  async function find(currentWord, description, options = {}) {
    const normalizedDescription = String(description || "").trim();
    if (!normalizedDescription) throw new ConfusableAIError("EMPTY_DESCRIPTION", "请先描述你记得的线索");
    const data = await request("/api/confusable-find", buildFindPayload(currentWord, normalizedDescription), options);
    return {
      items: Array.isArray(data?.items) ? data.items.slice(0, 5) : [],
      usage: data?.usage || { promptTokens: 0, completionTokens: 0 },
    };
  }

  app.confusableAi = {
    REQUEST_TIMEOUT_MS,
    ConfusableAIError,
    normalizeProxyUrl,
    buildSuggestPayload,
    buildFindPayload,
    suggest,
    find,
  };
})(window.CETWords);
