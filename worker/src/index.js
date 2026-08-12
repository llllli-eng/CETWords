const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MEANINGS = 12;
const REQUEST_TIMEOUT_MS = 12 * 1000;
const VALID_RESULTS = new Set(["correct", "partial", "wrong"]);
const ALLOWED_FIELDS = new Set(["word", "partOfSpeech", "shortMeaning", "meanings", "userAnswer"]);

const SYSTEM_PROMPT = `你是大学英语四六级单词中文释义判题器。

任务：判断用户输入的中文含义是否能正确表达给定英文单词的标准释义。

判定原则：
1. 用户不需要逐字匹配标准答案。
2. 同义词、近义表达、自然口语解释，只要语义正确即可。
3. 多义词只要用户明确答出至少一个正确的主要义项，就判 correct。
4. 不得因为用户没有写出全部义项而判错。
5. 如果含义相关但过于模糊、范围偏差明显，判 partial。
6. 如果含义错误、相反或无关，判 wrong。
7. 不要依据用户自信程度，只判断语义。
8. 优先且主要依据传入的标准四六级释义判断，不要用偏门、专业、古旧或词库外义项替用户找理由。
9. 必须只输出合法 JSON，不得输出 Markdown 或额外文字。

JSON 格式：
{"result":"correct|partial|wrong","confidence":0.0,"matchedMeaning":"","feedback":""}`;

function getAllowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean));
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "") || "";
  return Boolean(origin && getAllowedOrigins(env).has(origin));
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "") || "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}

function errorResponse(request, status, error, message) {
  return jsonResponse(request, { error, message }, status);
}

function safeTokenEqual(provided, expected) {
  const left = new TextEncoder().encode(String(provided || ""));
  const right = new TextEncoder().encode(String(expected || ""));
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] || 0) ^ (right[index] || 0);
  }
  return mismatch === 0 && right.length > 0;
}

function validateString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${field} 不能为空` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) return { error: `${field} 超出长度限制` };
  return { value: normalized };
}

function validatePayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !ALLOWED_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };

  const word = validateString(raw.word, "word", 100);
  const shortMeaning = validateString(raw.shortMeaning, "shortMeaning", 500);
  const userAnswer = validateString(raw.userAnswer, "userAnswer", 300);
  if (word.error || shortMeaning.error || userAnswer.error) {
    return { error: word.error || shortMeaning.error || userAnswer.error };
  }

  const partOfSpeech = typeof raw.partOfSpeech === "string" ? raw.partOfSpeech.trim().slice(0, 30) : "";
  if (raw.partOfSpeech !== undefined && (typeof raw.partOfSpeech !== "string" || raw.partOfSpeech.length > 30)) {
    return { error: "partOfSpeech 格式不正确" };
  }
  if (raw.meanings !== undefined && !Array.isArray(raw.meanings)) return { error: "meanings 必须是数组" };
  const meanings = [];
  let totalMeaningLength = 0;
  for (const item of (raw.meanings || [])) {
    if (meanings.length >= MAX_MEANINGS) return { error: "meanings 数量超出限制" };
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "meanings 项格式不正确" };
    const keys = Object.keys(item);
    if (keys.some((key) => !["partOfSpeech", "translation"].includes(key))) {
      return { error: "meanings 包含不允许的字段" };
    }
    const translation = validateString(item.translation, "translation", 500);
    if (translation.error) return { error: translation.error };
    const pos = typeof item.partOfSpeech === "string" ? item.partOfSpeech.trim() : "";
    if (pos.length > 30) return { error: "meanings 词性超出长度限制" };
    totalMeaningLength += translation.value.length + pos.length;
    if (totalMeaningLength > 3000) return { error: "meanings 总长度超出限制" };
    meanings.push({ partOfSpeech: pos, translation: translation.value });
  }

  return {
    value: {
      word: word.value,
      partOfSpeech,
      shortMeaning: shortMeaning.value,
      meanings,
      userAnswer: userAnswer.value,
    },
  };
}

function normalizeModelResult(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !VALID_RESULTS.has(parsed.result)) return null;
  if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence)) return null;
  return {
    result: parsed.result,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    matchedMeaning: String(parsed.matchedMeaning || "").slice(0, 120),
    feedback: String(parsed.feedback || "").slice(0, 120),
  };
}

function buildDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `请只输出合法 JSON，判断以下答案：\n${JSON.stringify(payload)}`,
      },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0,
    max_tokens: 160,
  };
}

async function callDeepSeek(payload, env, fetchImpl) {
  let promptTokens = 0;
  let completionTokens = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildDeepSeekBody(payload)),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI_TIMEOUT");
      throw new Error("AI_UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new Error("AI_UPSTREAM_ERROR");
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("AI_UPSTREAM_ERROR");
    }
    promptTokens += Math.max(0, Number(data.usage?.prompt_tokens) || 0);
    completionTokens += Math.max(0, Number(data.usage?.completion_tokens) || 0);
    const normalized = normalizeModelResult(data.choices?.[0]?.message?.content);
    if (normalized) {
      return {
        ...normalized,
        usage: {
          promptTokens: Math.floor(promptTokens),
          completionTokens: Math.floor(completionTokens),
        },
      };
    }
  }
  throw new Error("AI_INVALID_RESPONSE");
}

async function handleRequest(request, env, fetchImpl = fetch) {
  if (!isOriginAllowed(request, env)) {
    return errorResponse(request, 403, "ORIGIN_NOT_ALLOWED", "当前来源不允许访问此服务");
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!env.APP_PROXY_TOKEN || !env.DEEPSEEK_API_KEY) {
    return errorResponse(request, 503, "SERVICE_NOT_CONFIGURED", "AI 代理尚未完成 Secret 配置");
  }
  if (!safeTokenEqual(request.headers.get("X-App-Token"), env.APP_PROXY_TOKEN)) {
    return errorResponse(request, 401, "UNAUTHORIZED", "个人访问 Token 不正确");
  }

  const url = new URL(request.url);
  if (url.pathname === "/health") {
    if (request.method !== "GET") return errorResponse(request, 405, "METHOD_NOT_ALLOWED", "请求方法不允许");
    return jsonResponse(request, { ok: true, service: "shi-ci-ai", model: "deepseek-v4-flash" });
  }
  if (url.pathname !== "/api/judge-meaning") {
    return errorResponse(request, 404, "NOT_FOUND", "接口不存在");
  }
  if (request.method !== "POST") {
    return errorResponse(request, 405, "METHOD_NOT_ALLOWED", "请求方法不允许");
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse(request, 415, "UNSUPPORTED_MEDIA_TYPE", "只接受 application/json");
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(request, 413, "PAYLOAD_TOO_LARGE", "请求体过大");
  }
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) {
    return errorResponse(request, 413, "PAYLOAD_TOO_LARGE", "请求体过大");
  }
  let rawPayload;
  try {
    rawPayload = JSON.parse(bodyText);
  } catch {
    return errorResponse(request, 400, "INVALID_JSON", "请求体不是合法 JSON");
  }
  const validation = validatePayload(rawPayload);
  if (validation.error) return errorResponse(request, 400, "INVALID_INPUT", validation.error);

  try {
    const result = await callDeepSeek(validation.value, env, fetchImpl);
    return jsonResponse(request, result);
  } catch (error) {
    const code = error?.message || "AI_UPSTREAM_UNAVAILABLE";
    const status = code === "AI_TIMEOUT" ? 504 : 502;
    const message = code === "AI_INVALID_RESPONSE"
      ? "AI 返回了无法识别的判定结果"
      : code === "AI_TIMEOUT"
        ? "AI 判断超时，请稍后再试"
        : "AI 服务暂时不可用";
    return errorResponse(request, status, code, message);
  }
}

export { buildDeepSeekBody, handleRequest, normalizeModelResult, validatePayload };

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
