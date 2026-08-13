const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MEANINGS = 12;
const MAX_DAILY_REVIEW_BODY_BYTES = 24 * 1024;
const MAX_DAILY_WEAK_WORDS = 10;
const MAX_DAILY_CORRECTED_WORDS = 5;
const REQUEST_TIMEOUT_MS = 12 * 1000;
const VALID_RESULTS = new Set(["correct", "partial", "wrong"]);
const ALLOWED_FIELDS = new Set(["word", "coreMeaning", "meanings", "meaningsByPos", "userAnswer"]);
const DAILY_REVIEW_FIELDS = new Set(["date", "level", "statistics", "weakWords", "correctedWords"]);

const SYSTEM_PROMPT = `你是大学英语四六级单词中文释义判题器。

任务：判断用户输入的中文含义是否能正确表达给定英文单词的标准释义。

判定原则：
1. 用户不需要逐字匹配标准答案。
2. 同义词、近义表达、自然口语解释，只要语义正确即可。
3. 多义词只要用户明确答出 meanings 或 meaningsByPos 中任一常见且正确的义项，就判 correct，不要求覆盖全部义项。
4. 不得因为用户没有写出全部义项而判错。
5. 如果含义相关但过于模糊、范围偏差明显，判 partial。
6. 如果含义错误、相反或无关，判 wrong。
7. 不要依据用户自信程度，只判断语义。
8. 优先且主要依据传入的标准四六级释义判断，不要用偏门、专业、古旧或词库外义项替用户找理由。
9. 如果用户答对的是非核心义，仍判 correct；feedback 可简短说明这是次要义，并建议优先掌握 coreMeaning。
10. 必须只输出合法 JSON，不得输出 Markdown 或额外文字。

JSON 格式：
{"result":"correct|partial|wrong","confidence":0.0,"matchedMeaning":"","feedback":""}`;

const DAILY_REVIEW_SYSTEM_PROMPT = `你是大学英语四六级每日学习复盘助手。

你只根据用户提供的本地聚合统计、薄弱词和已纠正词生成简洁中文复盘。

要求：
1. 不自行计算或修改正确率、完成数、熟练度、复习日期、复习间隔和学习顺序。
2. 不编造输入中没有体现的问题；数据不足时明确说明。
3. 聚焦具体错误模式和可执行建议，不输出空泛鸡汤。
4. focusWords 只能选择输入 weakWords 中的词。
5. 建议不得直接决定复习日期，只能提醒认真完成系统安排。
6. 只输出合法 JSON，不输出 Markdown 或额外文字。

JSON 格式：
{"summary":"","strengths":[""],"weaknesses":[""],"focusWords":[{"word":"","reason":"","suggestion":""}],"tomorrowAdvice":[""]}`;

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
  const coreMeaning = validateString(raw.coreMeaning, "coreMeaning", 500);
  const userAnswer = validateString(raw.userAnswer, "userAnswer", 300);
  if (word.error || coreMeaning.error || userAnswer.error) {
    return { error: word.error || coreMeaning.error || userAnswer.error };
  }
  if (raw.meanings !== undefined && !Array.isArray(raw.meanings)) return { error: "meanings 必须是数组" };
  const meanings = [];
  let totalMeaningLength = 0;
  for (const item of (raw.meanings || [])) {
    if (meanings.length >= MAX_MEANINGS) return { error: "meanings 数量超出限制" };
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "meanings 项格式不正确" };
    const keys = Object.keys(item);
    if (keys.some((key) => !["pos", "meaning"].includes(key))) {
      return { error: "meanings 包含不允许的字段" };
    }
    const meaning = validateString(item.meaning, "meaning", 500);
    if (meaning.error) return { error: meaning.error };
    const pos = typeof item.pos === "string" ? item.pos.trim() : "";
    if (pos.length > 30) return { error: "meanings 词性超出长度限制" };
    totalMeaningLength += meaning.value.length + pos.length;
    if (totalMeaningLength > 3000) return { error: "meanings 总长度超出限制" };
    meanings.push({ pos, meaning: meaning.value });
  }

  const meaningsByPos = {};
  if (raw.meaningsByPos !== undefined && (!raw.meaningsByPos || typeof raw.meaningsByPos !== "object" || Array.isArray(raw.meaningsByPos))) {
    return { error: "meaningsByPos 必须是对象" };
  }
  for (const [partOfSpeech, entries] of Object.entries(raw.meaningsByPos || {})) {
    if (!partOfSpeech || partOfSpeech.length > 30 || !Array.isArray(entries) || entries.length > 6) {
      return { error: "meaningsByPos 格式不正确" };
    }
    const normalized = [];
    for (const entry of entries) {
      const meaning = validateString(entry, "meaningsByPos meaning", 500);
      if (meaning.error) return { error: meaning.error };
      totalMeaningLength += meaning.value.length;
      if (totalMeaningLength > 3000) return { error: "释义总长度超出限制" };
      normalized.push(meaning.value);
    }
    meaningsByPos[partOfSpeech] = normalized;
  }

  return {
    value: {
      word: word.value,
      coreMeaning: coreMeaning.value,
      meanings,
      meaningsByPos,
      userAnswer: userAnswer.value,
    },
  };
}

function validateCount(value, field, maximum = 100000) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > maximum) return { error: `${field} 格式不正确` };
  return { value: number };
}

function validateDailyWord(raw, field) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: `${field} 格式不正确` };
  const allowed = new Set([
    "word", "coreMeaning", "commonMeanings", "choiceWrongCount", "choiceRetryCount",
    "reinforcementWrongCount", "reinforcementPartialCount", "eventuallyPassed", "repeatedError",
    "historicalErrorRate", "dailyRiskScore",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return { error: `${field} 包含不允许的字段` };
  const word = validateString(raw.word, `${field}.word`, 100);
  const coreMeaning = validateString(raw.coreMeaning, `${field}.coreMeaning`, 180);
  if (word.error || coreMeaning.error) return { error: word.error || coreMeaning.error };
  if (!Array.isArray(raw.commonMeanings) || raw.commonMeanings.length > 4) return { error: `${field}.commonMeanings 格式不正确` };
  const commonMeanings = [];
  for (const meaning of raw.commonMeanings) {
    if (typeof meaning !== "string" || meaning.length > 120) return { error: `${field}.commonMeanings 格式不正确` };
    if (meaning.trim()) commonMeanings.push(meaning.trim());
  }
  const countFields = ["choiceWrongCount", "choiceRetryCount", "reinforcementWrongCount", "reinforcementPartialCount", "historicalErrorRate", "dailyRiskScore"];
  const counts = {};
  for (const key of countFields) {
    const checked = validateCount(raw[key], `${field}.${key}`, key.endsWith("Rate") || key.endsWith("Score") ? 100 : 1000);
    if (checked.error) return checked;
    counts[key] = checked.value;
  }
  return {
    value: {
      word: word.value,
      coreMeaning: coreMeaning.value,
      commonMeanings,
      ...counts,
      eventuallyPassed: Boolean(raw.eventuallyPassed),
      repeatedError: Boolean(raw.repeatedError),
    },
  };
}

function validateDailyReviewPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !DAILY_REVIEW_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };
  if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return { error: "date 格式不正确" };
  if (!["cet4", "cet6"].includes(raw.level)) return { error: "level 格式不正确" };
  if (!raw.statistics || typeof raw.statistics !== "object" || Array.isArray(raw.statistics)) return { error: "statistics 格式不正确" };
  const statisticFields = new Set([
    "dailyTarget", "completedNewWords", "totalAnswers", "firstChoiceCorrect", "firstChoiceWrong",
    "firstChoiceAccuracy", "choiceRetryCount", "reinforcementCorrect", "reinforcementPartial",
    "reinforcementWrong", "reinforcementPassRate", "enToZh", "zhToEn", "repeatedErrorWords", "correctedWords",
  ]);
  if (Object.keys(raw.statistics).some((key) => !statisticFields.has(key))) return { error: "statistics 包含不允许的字段" };
  const statistics = {};
  for (const key of [...statisticFields].filter((item) => !["enToZh", "zhToEn"].includes(item))) {
    const checked = validateCount(raw.statistics[key], `statistics.${key}`, key.endsWith("Accuracy") || key.endsWith("Rate") ? 100 : 100000);
    if (checked.error) return checked;
    statistics[key] = checked.value;
  }
  for (const mode of ["enToZh", "zhToEn"]) {
    const value = raw.statistics[mode];
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `statistics.${mode} 格式不正确` };
    const modeKeys = new Set(["answers", "correct", "partial", "wrong", "accuracy"]);
    if (Object.keys(value).some((key) => !modeKeys.has(key))) return { error: `statistics.${mode} 包含不允许的字段` };
    statistics[mode] = {};
    for (const key of modeKeys) {
      const checked = validateCount(value[key], `statistics.${mode}.${key}`, key === "accuracy" ? 100 : 100000);
      if (checked.error) return checked;
      statistics[mode][key] = checked.value;
    }
  }
  if (!Array.isArray(raw.weakWords) || raw.weakWords.length > MAX_DAILY_WEAK_WORDS) return { error: "weakWords 数量超出限制" };
  if (!Array.isArray(raw.correctedWords) || raw.correctedWords.length > MAX_DAILY_CORRECTED_WORDS) return { error: "correctedWords 数量超出限制" };
  const weakWords = [];
  const correctedWords = [];
  for (let index = 0; index < raw.weakWords.length; index += 1) {
    const checked = validateDailyWord(raw.weakWords[index], `weakWords[${index}]`);
    if (checked.error) return checked;
    weakWords.push(checked.value);
  }
  for (let index = 0; index < raw.correctedWords.length; index += 1) {
    const checked = validateDailyWord(raw.correctedWords[index], `correctedWords[${index}]`);
    if (checked.error) return checked;
    correctedWords.push(checked.value);
  }
  return { value: { date: raw.date, level: raw.level, statistics, weakWords, correctedWords } };
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

function normalizeDailyReviewModelResult(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const allowed = new Set(["summary", "strengths", "weaknesses", "focusWords", "tomorrowAdvice"]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) return null;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 400) : "";
  if (!summary) return null;
  const normalizeList = (value) => Array.isArray(value)
    ? value.slice(0, 5).map((item) => String(item || "").trim().slice(0, 180)).filter(Boolean)
    : null;
  const strengths = normalizeList(parsed.strengths);
  const weaknesses = normalizeList(parsed.weaknesses);
  const tomorrowAdvice = normalizeList(parsed.tomorrowAdvice);
  if (!strengths || !weaknesses || !tomorrowAdvice || !Array.isArray(parsed.focusWords)) return null;
  const focusWords = parsed.focusWords.slice(0, MAX_DAILY_WEAK_WORDS).map((entry) => ({
    word: String(entry?.word || "").trim().slice(0, 100),
    reason: String(entry?.reason || "").trim().slice(0, 220),
    suggestion: String(entry?.suggestion || "").trim().slice(0, 220),
  })).filter((entry) => entry.word && entry.reason && entry.suggestion);
  return { summary, strengths, weaknesses, focusWords, tomorrowAdvice };
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

function buildDailyReviewDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: DAILY_REVIEW_SYSTEM_PROMPT },
      { role: "user", content: `请只输出合法 JSON，根据以下本地统计生成每日复盘：\n${JSON.stringify(payload)}` },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0.2,
    max_tokens: 800,
  };
}

async function callDeepSeek(payload, env, fetchImpl, options = {}) {
  const bodyBuilder = options.bodyBuilder || buildDeepSeekBody;
  const resultNormalizer = options.resultNormalizer || normalizeModelResult;
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
        body: JSON.stringify(bodyBuilder(payload)),
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
    const normalized = resultNormalizer(data.choices?.[0]?.message?.content);
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
  if (url.pathname !== "/api/judge-meaning" && url.pathname !== "/api/daily-review") {
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
  const maximumBodyBytes = url.pathname === "/api/daily-review" ? MAX_DAILY_REVIEW_BODY_BYTES : MAX_BODY_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return errorResponse(request, 413, "PAYLOAD_TOO_LARGE", "请求体过大");
  }
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).length > maximumBodyBytes) {
    return errorResponse(request, 413, "PAYLOAD_TOO_LARGE", "请求体过大");
  }
  let rawPayload;
  try {
    rawPayload = JSON.parse(bodyText);
  } catch {
    return errorResponse(request, 400, "INVALID_JSON", "请求体不是合法 JSON");
  }
  const validation = url.pathname === "/api/daily-review"
    ? validateDailyReviewPayload(rawPayload)
    : validatePayload(rawPayload);
  if (validation.error) return errorResponse(request, 400, "INVALID_INPUT", validation.error);

  try {
    const result = url.pathname === "/api/daily-review"
      ? await callDeepSeek(validation.value, env, fetchImpl, {
        bodyBuilder: buildDailyReviewDeepSeekBody,
        resultNormalizer: normalizeDailyReviewModelResult,
      })
      : await callDeepSeek(validation.value, env, fetchImpl);
    if (url.pathname === "/api/daily-review") {
      const allowedFocusWords = new Set(validation.value.weakWords.map((entry) => entry.word));
      result.focusWords = result.focusWords.filter((entry) => allowedFocusWords.has(entry.word));
    }
    return jsonResponse(request, result);
  } catch (error) {
    const code = error?.message || "AI_UPSTREAM_UNAVAILABLE";
    const status = code === "AI_TIMEOUT" ? 504 : 502;
    const message = code === "AI_INVALID_RESPONSE"
      ? url.pathname === "/api/daily-review"
        ? "AI 返回了无法识别的复盘结果"
        : "AI 返回了无法识别的判定结果"
      : code === "AI_TIMEOUT"
        ? "AI 判断超时，请稍后再试"
        : "AI 服务暂时不可用";
    return errorResponse(request, status, code, message);
  }
}

export {
  buildDailyReviewDeepSeekBody,
  buildDeepSeekBody,
  handleRequest,
  normalizeDailyReviewModelResult,
  normalizeModelResult,
  validateDailyReviewPayload,
  validatePayload,
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
