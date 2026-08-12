(function registerAiJudge(app) {
  const REQUEST_TIMEOUT_MS = 12 * 1000;
  const MAX_USER_ANSWER_LENGTH = 300;
  const VALID_RESULTS = new Set(["correct", "partial", "wrong"]);
  const UNKNOWN_ANSWERS = /^(不会|不知道|不记得|忘了|忘记了|想不起来|不清楚)[。！!？?]*$/;

  class AIJudgeError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = "AIJudgeError";
      this.code = code;
      this.status = options.status || 0;
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[；;,，、/|]+/g, "；")
      .replace(/[。！？!?：:“”‘’"'（）()\[\]{}]/g, "")
      .replace(/\s+/g, "");
  }

  function stripPartOfSpeech(value) {
    return String(value || "")
      .replace(/(^|[；;,，、/\s])(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|aux|modal|interj)\s*\./gi, "$1")
      .replace(/^\s*[a-z]{1,6}\s*\.\s*/i, "")
      .trim();
  }

  function splitMeanings(value) {
    return stripPartOfSpeech(value)
      .split(/[；;,，、/|]+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  function extractMeaningSegments(word) {
    const values = [word?.coreMeaning, word?.shortMeaning, word?.meaning];
    if (Array.isArray(word?.meanings)) {
      word.meanings.forEach((item) => values.push(item?.meaning || item?.translation));
    }
    if (word?.meaningsByPos && typeof word.meaningsByPos === "object") {
      Object.values(word.meaningsByPos).forEach((items) => {
        if (Array.isArray(items)) items.forEach((item) => values.push(item));
      });
    }
    return [...new Set(values.flatMap(splitMeanings))];
  }

  function localMeaningJudge(word, userAnswer) {
    const rawAnswer = String(userAnswer || "").trim();
    if (!rawAnswer) return { decision: "empty" };
    if (UNKNOWN_ANSWERS.test(rawAnswer.replace(/\s+/g, ""))) {
      return {
        decision: "judged",
        result: "wrong",
        source: "local",
        confidence: 1,
        matchedMeaning: "",
        feedback: "已按不会处理",
      };
    }

    const answerParts = rawAnswer
      .split(/[；;,，、/|]+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
    const meanings = extractMeaningSegments(word);
    for (const answer of answerParts) {
      for (const meaning of meanings) {
        const exact = answer === meaning;
        const conservativeContainment = answer.length >= 2
          && meaning.includes(answer)
          && answer.length / meaning.length >= 0.5;
        if (exact || conservativeContainment) {
          return {
            decision: "judged",
            result: "correct",
            source: "local",
            confidence: exact ? 1 : 0.98,
            matchedMeaning: meaning,
            feedback: "意思正确",
          };
        }
      }
    }
    return { decision: "needs-ai" };
  }

  function normalizeProxyUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function buildJudgePayload(word, userAnswer) {
    const meanings = Array.isArray(word?.meanings)
      ? word.meanings.slice(0, 12).map((item) => ({
        pos: String(item?.pos || item?.partOfSpeech || "").slice(0, 30),
        meaning: String(item?.meaning || item?.translation || "").slice(0, 500),
      }))
      : [];
    const meaningsByPos = {};
    if (word?.meaningsByPos && typeof word.meaningsByPos === "object") {
      Object.entries(word.meaningsByPos).slice(0, 12).forEach(([partOfSpeech, items]) => {
        const normalized = Array.isArray(items)
          ? items.slice(0, 6).map((item) => String(item || "").slice(0, 500)).filter(Boolean)
          : [];
        if (normalized.length) meaningsByPos[String(partOfSpeech).slice(0, 30)] = normalized;
      });
    }
    return {
      word: String(word?.word || "").slice(0, 100),
      coreMeaning: String(word?.coreMeaning || word?.shortMeaning || word?.meaning || "").slice(0, 500),
      meanings,
      meaningsByPos,
      userAnswer: String(userAnswer || "").trim().slice(0, MAX_USER_ANSWER_LENGTH),
    };
  }

  function normalizeJudgement(raw) {
    if (!raw || typeof raw !== "object" || !VALID_RESULTS.has(raw.result)) {
      throw new AIJudgeError("AI_INVALID_RESPONSE", "AI 返回了无法识别的判定结果");
    }
    const confidence = Number(raw.confidence);
    return {
      result: raw.result,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      matchedMeaning: String(raw.matchedMeaning || "").slice(0, 120),
      feedback: String(raw.feedback || "").slice(0, 120),
      usage: {
        promptTokens: Math.max(0, Math.floor(Number(raw.usage?.promptTokens) || 0)),
        completionTokens: Math.max(0, Math.floor(Number(raw.usage?.completionTokens) || 0)),
      },
      source: "deepseek",
    };
  }

  async function fetchJson(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        const code = typeof data?.error === "string" ? data.error : `HTTP_${response.status}`;
        throw new AIJudgeError(code, data?.message || "AI 判断暂时不可用", { status: response.status });
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new AIJudgeError("AI_TIMEOUT", "AI 判断超时，请稍后再试");
      }
      if (error instanceof AIJudgeError) throw error;
      throw new AIJudgeError("AI_NETWORK_ERROR", "无法连接 AI 代理，请检查网络或配置");
    } finally {
      clearTimeout(timer);
    }
  }

  async function judgeMeaning({ word, userAnswer, proxyUrl, token, timeoutMs = REQUEST_TIMEOUT_MS }) {
    const baseUrl = normalizeProxyUrl(proxyUrl);
    if (!baseUrl || !String(token || "").trim()) {
      throw new AIJudgeError("AI_NOT_CONFIGURED", "AI 中文释义判断尚未配置");
    }
    const answer = String(userAnswer || "").trim();
    if (!answer) throw new AIJudgeError("EMPTY_ANSWER", "请输入你记得的中文意思");
    const data = await fetchJson(`${baseUrl}/api/judge-meaning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": String(token).trim(),
      },
      body: JSON.stringify(buildJudgePayload(word, answer)),
    }, timeoutMs);
    return normalizeJudgement(data);
  }

  async function testConnection({ proxyUrl, token, timeoutMs = REQUEST_TIMEOUT_MS }) {
    const baseUrl = normalizeProxyUrl(proxyUrl);
    if (!baseUrl || !String(token || "").trim()) {
      throw new AIJudgeError("AI_NOT_CONFIGURED", "请填写代理地址和个人访问 Token");
    }
    const data = await fetchJson(`${baseUrl}/health`, {
      method: "GET",
      headers: { "X-App-Token": String(token).trim() },
    }, timeoutMs);
    if (data?.ok !== true || data?.service !== "shi-ci-ai") {
      throw new AIJudgeError("AI_INVALID_HEALTH", "代理返回了无法识别的健康状态");
    }
    return data;
  }

  app.aiJudge = {
    REQUEST_TIMEOUT_MS,
    MAX_USER_ANSWER_LENGTH,
    AIJudgeError,
    normalizeText,
    extractMeaningSegments,
    localMeaningJudge,
    buildJudgePayload,
    normalizeJudgement,
    judgeMeaning,
    testConnection,
  };
})(window.CETWords);
