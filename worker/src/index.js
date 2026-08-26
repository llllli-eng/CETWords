const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MEANINGS = 12;
const MAX_DAILY_REVIEW_BODY_BYTES = 24 * 1024;
const MAX_DAILY_GROUP_BODY_BYTES = 8 * 1024;
const MAX_CONFUSABLE_BODY_BYTES = 4 * 1024;
const MAX_CONFUSABLE_MATCH_BODY_BYTES = 8 * 1024;
const MAX_DAILY_WEAK_WORDS = 10;
const MAX_DAILY_CORRECTED_WORDS = 5;
const REQUEST_TIMEOUT_MS = 12 * 1000;
const VALID_RESULTS = new Set(["correct", "partial", "wrong"]);
const ALLOWED_FIELDS = new Set(["word", "coreMeaning", "meanings", "meaningsByPos", "userAnswer"]);
const DAILY_REVIEW_FIELDS = new Set(["date", "level", "statistics", "weakWords", "correctedWords"]);
const DAILY_GROUP_FIELDS = new Set([
  "dailyTarget", "todayDueReviewCount", "todayRecoveryPendingCount",
  "todayPendingReinforcementCount", "todayChoiceRetryCount", "yesterdayStudied",
  "yesterdayDailyTarget", "yesterdayCompletedNewWords", "yesterdayTaskCompleted",
  "yesterdayTotalAnswers", "yesterdayActiveRecallPerformance", "recentCompletionRate",
  "recentAverageAnswers",
]);
const CONFUSABLE_SUGGEST_FIELDS = new Set(["word", "coreMeaning", "meanings"]);
const CONFUSABLE_FIND_FIELDS = new Set(["currentWord", "description"]);
const CONFUSABLE_MATCH_EXISTING_FIELDS = new Set(["currentWord", "userAnswer", "candidates"]);
const CONFUSABLE_TYPES = new Set(["spelling", "meaning", "usage"]);

const SYSTEM_PROMPT = `你是大学英语四六级单词中文释义判题器。

任务：判断用户输入的中文含义是否属于给定英文单词在现代标准英语中的正确、常见含义。

重要说明：
传入的 coreMeaning、meanings、meaningsByPos 是重要参考资料，但不是绝对完整、绝对正确的唯一标准。
词库可能存在义项缺失、核心义排序不合理或少量释义错误。
因此，你必须同时结合你对该英文单词现代标准英语常见词义的可靠知识进行判断。

判定原则：
1. 用户不需要逐字匹配标准答案。
2. 同义词、近义表达、自然中文解释，只要语义明确正确即可。
3. 多义词只要用户明确答出任一现代、常见且正确的义项，就判 correct，不要求覆盖全部义项。
4. 如果用户答案属于该英文单词公认的常见正确含义，即使该含义没有出现在传入的 coreMeaning、meanings 或 meaningsByPos 中，也应判 correct。
5. 不得仅因为“用户答案不在词库释义中”就判 wrong。
6. 如果词库释义与该单词公认的现代常见含义存在明显冲突，不要默认词库一定正确；只有当你对该常见义有较高把握时，才依据可靠英语词义知识修正判断。
7. 如果用户答出的是正确但较次要的常见义，仍判 correct；feedback 可以简短提醒优先掌握 coreMeaning。
8. 如果用户答案与正确含义有明显关联，但表达过于模糊、范围偏差较大或只表达了不完整概念，判 partial。
9. 如果含义错误、相反或无关，判 wrong。
10. 不要为了迁就用户而接受极罕见、古旧、方言、专业术语或牵强的上下文延伸义。
11. 判断标准以大学英语四六级学习场景下的现代常见词义为主。
12. 不要依据用户自信程度，只判断语义。
13. 必须只输出合法 JSON，不得输出 Markdown 或额外文字。

示例：
- fast → “快速” => correct
- assume → “假设” => correct
- fix → “修理” => correct
- regard → “认为” => correct
即使这些义项因词库缺失而未出现在传入释义中，也不能仅因此判错。

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

const DAILY_GROUP_SYSTEM_PROMPT = `你是大学英语四六级每日新词分组助手。

你只根据输入的少量聚合统计，为已经确定的 dailyTarget 建议分组大小和组间休息时间。

要求：
1. groupSizes 所有值为正整数，且总和必须严格等于 dailyTarget。
2. dailyTarget >= 5 时，每组 5～15 个；目标小于 5 时使用一个小组。
3. breakMinutes 必须为 2～10 的整数。
4. 不修改每日总量、单词顺序、smart/random、SRS、Recovery、mastery 或任何复习时间。
5. 复习积压多、昨天未完成时倾向较小组；正常负担约 8～12 个；不要过度碎片化。
6. reason 使用简短中文，不超过 180 字。
7. 只输出合法 JSON，不输出 Markdown 或额外文字。

JSON 格式：
{"groupSizes":[10,10,10],"breakMinutes":5,"reason":""}`;

const CONFUSABLE_SUGGEST_SYSTEM_PROMPT = `你是大学英语四六级易混词辅助器。

只推荐现代标准英语中，四六级学习场景真正容易因为拼写、词义或用法发生混淆的词。
不要为了凑数推荐弱相关词，不要推荐极罕见、专业、古旧义。
返回 0～4 个高质量候选；types 只能使用 spelling、meaning、usage，每项最多两个类型。
reason 不超过 120 个字符，difference 不超过 160 个字符。
只输出合法 JSON，不输出 Markdown 或额外文字。

JSON 格式：
{"items":[{"word":"","types":["spelling"],"reason":"","difference":""}]}`;

const CONFUSABLE_FIND_SYSTEM_PROMPT = `根据用户对一个忘记拼写的四六级单词的描述，给出最可能的候选。

描述可能包含中文意思、首字母、大概拼写、发音印象、与当前词相似等。
只给 1～5 个最可能的现代常用候选；没有可靠候选时允许返回空数组。
不要为了凑数返回弱相关词，不要输出极罕见、专业或古旧词。
reason 不超过 120 个字符。只输出合法 JSON，不输出 Markdown 或额外文字。

JSON 格式：
{"items":[{"word":"","reason":""}]}`;

const CONFUSABLE_MATCH_EXISTING_SYSTEM_PROMPT = `你是大学英语四六级个人易混词语义匹配器。

当前题已经被其他判题流程最终判为 wrong。你不得重新判断当前题对错。
你只判断用户的错误中文答案，是否高置信属于所给某一个 existing personal-pair candidate 的现代、标准、常见英语义项。

要求：
1. 只能从请求中的 candidates 选择，绝不能发明或返回候选外单词。
2. 只接受适合四六级学习的现代常见义；拒绝古义、方言、极窄专业义、罕见义、弱相关概念和牵强延伸。
3. 同义改写可以命中，但必须语义明确且置信度高。
4. 若多个候选都合理或无法唯一确定，返回 match=false、reason=ambiguous，不要猜。
5. 若没有高置信候选，返回 match=false、reason=no_match。
6. 只有唯一且高置信命中时返回 match=true，confidence 必须为 high。
7. 只输出合法 JSON，不输出 Markdown 或额外文字。

JSON 格式：
命中：{"match":true,"word":"candidate exact spelling","confidence":"high"}
未命中：{"match":false,"reason":"no_match|ambiguous"}`;

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

function validateConfusableSuggestPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !CONFUSABLE_SUGGEST_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };
  const word = validateString(raw.word, "word", 100);
  const coreMeaning = validateString(raw.coreMeaning, "coreMeaning", 300);
  if (word.error || coreMeaning.error) return { error: word.error || coreMeaning.error };
  if (!Array.isArray(raw.meanings) || raw.meanings.length > 8) return { error: "meanings 格式不正确" };
  const meanings = [];
  let totalLength = 0;
  for (const entry of raw.meanings) {
    if (typeof entry !== "string" || entry.length > 180) return { error: "meanings 格式不正确" };
    const value = entry.trim();
    if (!value) continue;
    totalLength += value.length;
    if (totalLength > 1200) return { error: "meanings 总长度超出限制" };
    meanings.push(value);
  }
  return { value: { word: word.value, coreMeaning: coreMeaning.value, meanings } };
}

function validateConfusableFindPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !CONFUSABLE_FIND_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };
  const currentWord = validateString(raw.currentWord, "currentWord", 100);
  const description = validateString(raw.description, "description", 500);
  if (currentWord.error || description.error) return { error: currentWord.error || description.error };
  return { value: { currentWord: currentWord.value, description: description.value } };
}

function validateConfusableMatchExistingPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !CONFUSABLE_MATCH_EXISTING_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };
  const currentWord = validateString(raw.currentWord, "currentWord", 100);
  const userAnswer = validateString(raw.userAnswer, "userAnswer", 500);
  if (currentWord.error || userAnswer.error) return { error: currentWord.error || userAnswer.error };
  if (!Array.isArray(raw.candidates) || !raw.candidates.length || raw.candidates.length > 8) {
    return { error: "candidates 格式不正确" };
  }
  const candidates = [];
  const seen = new Set();
  let totalMeaningLength = 0;
  for (const rawCandidate of raw.candidates) {
    if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) {
      return { error: "candidate 格式不正确" };
    }
    const allowed = new Set(["word", "coreMeaning", "shortMeaning", "meanings"]);
    const extra = Object.keys(rawCandidate).find((key) => !allowed.has(key));
    if (extra) return { error: `candidate 不允许的字段：${extra}` };
    const word = validateString(rawCandidate.word, "candidate.word", 100);
    const coreMeaning = validateString(rawCandidate.coreMeaning, "candidate.coreMeaning", 300);
    const shortMeaning = validateString(rawCandidate.shortMeaning, "candidate.shortMeaning", 300);
    if (word.error || coreMeaning.error || shortMeaning.error) {
      return { error: word.error || coreMeaning.error || shortMeaning.error };
    }
    totalMeaningLength += coreMeaning.value.length + shortMeaning.value.length;
    if (totalMeaningLength > 6000) return { error: "candidate 释义总长度超出限制" };
    const normalizedWord = word.value.toLocaleLowerCase("en-US");
    if (seen.has(normalizedWord)) return { error: "candidate.word 不能重复" };
    seen.add(normalizedWord);
    if (!Array.isArray(rawCandidate.meanings) || rawCandidate.meanings.length > 4) {
      return { error: "candidate.meanings 格式不正确" };
    }
    const meanings = [];
    for (const entry of rawCandidate.meanings) {
      if (typeof entry !== "string" || entry.length > 180) return { error: "candidate.meanings 格式不正确" };
      const value = entry.trim();
      if (!value) continue;
      totalMeaningLength += value.length;
      if (totalMeaningLength > 1800) return { error: "candidate 释义总长度超出限制" };
      meanings.push(value);
    }
    candidates.push({
      word: word.value,
      coreMeaning: coreMeaning.value,
      shortMeaning: shortMeaning.value,
      meanings,
    });
  }
  return { value: { currentWord: currentWord.value, userAnswer: userAnswer.value, candidates } };
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
    "historicalErrorRate", "dailyRiskScore", "formalReviewResult", "recoveryAttempts",
    "recoveryFinalResult", "recoveryPending",
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
  const countFields = ["choiceWrongCount", "choiceRetryCount", "reinforcementWrongCount", "reinforcementPartialCount", "historicalErrorRate", "dailyRiskScore", "recoveryAttempts"];
  const counts = {};
  for (const key of countFields) {
    const checked = validateCount(raw[key] ?? 0, `${field}.${key}`, key.endsWith("Rate") || key.endsWith("Score") ? 100 : 1000);
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
      formalReviewResult: ["correct", "partial", "wrong"].includes(raw.formalReviewResult)
        ? raw.formalReviewResult
        : null,
      recoveryAttempts: counts.recoveryAttempts,
      recoveryFinalResult: ["correct", "partial", "wrong"].includes(raw.recoveryFinalResult)
        ? raw.recoveryFinalResult
        : null,
      recoveryPending: Boolean(raw.recoveryPending),
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
    "reinforcementWrong", "reinforcementPassRate", "formalReviewStats", "recoveryStats", "enToZh", "zhToEn", "repeatedErrorWords", "correctedWords",
  ]);
  if (Object.keys(raw.statistics).some((key) => !statisticFields.has(key))) return { error: "statistics 包含不允许的字段" };
  const statistics = {};
  for (const key of [...statisticFields].filter((item) => !["enToZh", "zhToEn", "formalReviewStats", "recoveryStats"].includes(item))) {
    const checked = validateCount(raw.statistics[key], `statistics.${key}`, key.endsWith("Accuracy") || key.endsWith("Rate") ? 100 : 100000);
    if (checked.error) return checked;
    statistics[key] = checked.value;
  }
  for (const [group, keys] of [
    ["formalReviewStats", ["correct", "partial", "wrong"]],
    ["recoveryStats", ["entered", "attempts", "correct", "partial", "wrong", "pendingCount"]],
  ]) {
    const value = raw.statistics[group] ?? Object.fromEntries(keys.map((key) => [key, 0]));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `statistics.${group} 格式不正确` };
    if (Object.keys(value).some((key) => !keys.includes(key))) return { error: `statistics.${group} 包含不允许的字段` };
    statistics[group] = {};
    for (const key of keys) {
      const checked = validateCount(value[key], `statistics.${group}.${key}`, 100000);
      if (checked.error) return checked;
      statistics[group][key] = checked.value;
    }
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

function validateDailyGroupPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "请求体必须是 JSON 对象" };
  const unexpected = Object.keys(raw).find((key) => !DAILY_GROUP_FIELDS.has(key));
  if (unexpected) return { error: `不允许的字段：${unexpected}` };
  const target = validateCount(raw.dailyTarget, "dailyTarget", 1000);
  if (target.error || target.value < 1) return { error: "dailyTarget 格式不正确" };
  const result = { dailyTarget: target.value };
  const countFields = [
    "todayDueReviewCount", "todayRecoveryPendingCount", "todayPendingReinforcementCount",
    "todayChoiceRetryCount", "yesterdayDailyTarget", "yesterdayCompletedNewWords",
    "yesterdayTotalAnswers", "recentAverageAnswers",
  ];
  for (const key of countFields) {
    const checked = validateCount(raw[key] ?? 0, key, 100000);
    if (checked.error) return checked;
    result[key] = checked.value;
  }
  for (const key of ["recentCompletionRate", "yesterdayActiveRecallPerformance"]) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const checked = validateCount(raw[key], key, 100);
    if (checked.error) return checked;
    result[key] = checked.value;
  }
  result.yesterdayStudied = Boolean(raw.yesterdayStudied);
  result.yesterdayTaskCompleted = Boolean(raw.yesterdayTaskCompleted);
  return { value: result };
}

function createFallbackGroupSizes(dailyTarget) {
  if (dailyTarget < 5) return [dailyTarget];
  const count = Math.max(1, Math.ceil(dailyTarget / 10));
  const base = Math.floor(dailyTarget / count);
  const remainder = dailyTarget % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function createFallbackDailyGroupPlan(dailyTarget) {
  return {
    groupSizes: createFallbackGroupSizes(dailyTarget),
    breakMinutes: 5,
    reason: "AI 分组暂不可用，已使用约 10 个新词一组的本地方案。",
  };
}

function normalizeDailyGroupModelResult(content, dailyTarget) {
  if (typeof content !== "string" || !content.trim()) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const allowed = new Set(["groupSizes", "breakMinutes", "reason"]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) return null;
  if (!Array.isArray(parsed.groupSizes) || !parsed.groupSizes.length) return null;
  const groupSizes = parsed.groupSizes.map(Number);
  if (groupSizes.some((size) => !Number.isInteger(size) || size <= 0)) return null;
  if (dailyTarget >= 5 && groupSizes.some((size) => size < 5 || size > 15)) return null;
  if (dailyTarget < 5 && (groupSizes.length !== 1 || groupSizes[0] !== dailyTarget)) return null;
  if (groupSizes.reduce((total, size) => total + size, 0) !== dailyTarget) return null;
  const breakMinutes = Number(parsed.breakMinutes);
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  if (!Number.isInteger(breakMinutes) || breakMinutes < 2 || breakMinutes > 10 || !reason || reason.length > 180) return null;
  return { groupSizes, breakMinutes, reason };
}

function parseJsonObject(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeConfusableSuggestModelResult(content) {
  const parsed = parseJsonObject(content);
  if (!parsed || Object.keys(parsed).some((key) => key !== "items") || !Array.isArray(parsed.items) || parsed.items.length > 4) return null;
  const items = [];
  for (const raw of parsed.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Object.keys(raw).some((key) => !["word", "types", "reason", "difference"].includes(key))) return null;
    const word = typeof raw.word === "string" ? raw.word.trim() : "";
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    const difference = typeof raw.difference === "string" ? raw.difference.trim() : "";
    if (!word || word.length > 100 || !reason || reason.length > 120 || !difference || difference.length > 160) return null;
    if (!Array.isArray(raw.types) || !raw.types.length || raw.types.length > 2) return null;
    const types = [...new Set(raw.types)];
    if (types.some((type) => !CONFUSABLE_TYPES.has(type))) return null;
    items.push({ word, types, reason, difference });
  }
  return { items };
}

function normalizeConfusableFindModelResult(content) {
  const parsed = parseJsonObject(content);
  if (!parsed || Object.keys(parsed).some((key) => key !== "items") || !Array.isArray(parsed.items) || parsed.items.length > 5) return null;
  const items = [];
  for (const raw of parsed.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Object.keys(raw).some((key) => !["word", "reason"].includes(key))) return null;
    const word = typeof raw.word === "string" ? raw.word.trim() : "";
    const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    if (!word || word.length > 100 || !reason || reason.length > 120) return null;
    items.push({ word, reason });
  }
  return { items };
}

function normalizeConfusableMatchExistingModelResult(content) {
  const parsed = parseJsonObject(content);
  if (!parsed || typeof parsed.match !== "boolean") return null;
  if (parsed.match === false) {
    if (Object.keys(parsed).some((key) => !["match", "reason"].includes(key))) return null;
    if (!["no_match", "ambiguous"].includes(parsed.reason)) return null;
    return { match: false, reason: parsed.reason };
  }
  if (Object.keys(parsed).some((key) => !["match", "word", "confidence"].includes(key))) return null;
  const word = typeof parsed.word === "string" ? parsed.word.trim() : "";
  if (!word || word.length > 100 || parsed.confidence !== "high") return null;
  return { match: true, word, confidence: "high" };
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

function buildDailyGroupDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: DAILY_GROUP_SYSTEM_PROMPT },
      { role: "user", content: `请只输出合法 JSON，根据以下本地聚合统计生成今日新词分组：\n${JSON.stringify(payload)}` },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0.2,
    max_tokens: 400,
  };
}

function buildConfusableSuggestDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: CONFUSABLE_SUGGEST_SYSTEM_PROMPT },
      { role: "user", content: `请只输出合法 JSON，为以下单词推荐易混词：\n${JSON.stringify(payload)}` },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0.1,
    max_tokens: 560,
  };
}

function buildConfusableFindDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: CONFUSABLE_FIND_SYSTEM_PROMPT },
      { role: "user", content: `请只输出合法 JSON，根据以下线索查找单词：\n${JSON.stringify(payload)}` },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0.1,
    max_tokens: 360,
  };
}

function buildConfusableMatchExistingDeepSeekBody(payload) {
  return {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: CONFUSABLE_MATCH_EXISTING_SYSTEM_PROMPT },
      { role: "user", content: `请只输出合法 JSON，在以下已建立的候选中做唯一高置信语义匹配：\n${JSON.stringify(payload)}` },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0,
    max_tokens: 160,
  };
}

async function callDeepSeek(payload, env, fetchImpl, options = {}) {
  const bodyBuilder = options.bodyBuilder || buildDeepSeekBody;
  const resultNormalizer = options.resultNormalizer || normalizeModelResult;
  const maximumAttempts = Number.isInteger(options.maxAttempts)
    ? Math.max(1, options.maxAttempts)
    : 2;
  let promptTokens = 0;
  let completionTokens = 0;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
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
  if (![
    "/api/judge-meaning",
    "/api/daily-review",
    "/api/daily-group-plan",
    "/api/confusable-suggest",
    "/api/confusable-find",
    "/api/confusable-match-existing",
  ].includes(url.pathname)) {
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
  const maximumBodyBytes = url.pathname === "/api/daily-review"
    ? MAX_DAILY_REVIEW_BODY_BYTES
    : url.pathname === "/api/daily-group-plan"
      ? MAX_DAILY_GROUP_BODY_BYTES
      : url.pathname === "/api/confusable-match-existing"
        ? MAX_CONFUSABLE_MATCH_BODY_BYTES
      : url.pathname.startsWith("/api/confusable-") ? MAX_CONFUSABLE_BODY_BYTES : MAX_BODY_BYTES;
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
    : url.pathname === "/api/daily-group-plan"
      ? validateDailyGroupPayload(rawPayload)
      : url.pathname === "/api/confusable-suggest"
        ? validateConfusableSuggestPayload(rawPayload)
        : url.pathname === "/api/confusable-find"
          ? validateConfusableFindPayload(rawPayload)
          : url.pathname === "/api/confusable-match-existing"
            ? validateConfusableMatchExistingPayload(rawPayload)
          : validatePayload(rawPayload);
  if (validation.error) return errorResponse(request, 400, "INVALID_INPUT", validation.error);

  try {
    let result;
    if (url.pathname === "/api/daily-review") {
      result = await callDeepSeek(validation.value, env, fetchImpl, {
        bodyBuilder: buildDailyReviewDeepSeekBody,
        resultNormalizer: normalizeDailyReviewModelResult,
      });
    } else if (url.pathname === "/api/daily-group-plan") {
      try {
        result = await callDeepSeek(validation.value, env, fetchImpl, {
          bodyBuilder: buildDailyGroupDeepSeekBody,
          resultNormalizer: (content) => normalizeDailyGroupModelResult(content, validation.value.dailyTarget),
          maxAttempts: 1,
        });
        result.source = "ai";
      } catch {
        result = { ...createFallbackDailyGroupPlan(validation.value.dailyTarget), source: "local", fallback: true, usage: { promptTokens: 0, completionTokens: 0 } };
      }
    } else if (url.pathname === "/api/confusable-suggest") {
      result = await callDeepSeek(validation.value, env, fetchImpl, {
        bodyBuilder: buildConfusableSuggestDeepSeekBody,
        resultNormalizer: normalizeConfusableSuggestModelResult,
        maxAttempts: 1,
      });
    } else if (url.pathname === "/api/confusable-find") {
      result = await callDeepSeek(validation.value, env, fetchImpl, {
        bodyBuilder: buildConfusableFindDeepSeekBody,
        resultNormalizer: normalizeConfusableFindModelResult,
        maxAttempts: 1,
      });
    } else if (url.pathname === "/api/confusable-match-existing") {
      result = await callDeepSeek(validation.value, env, fetchImpl, {
        bodyBuilder: buildConfusableMatchExistingDeepSeekBody,
        resultNormalizer: normalizeConfusableMatchExistingModelResult,
        maxAttempts: 1,
      });
      if (result.match) {
        const allowedCandidates = new Set(validation.value.candidates.map((candidate) => (
          candidate.word.toLocaleLowerCase("en-US")
        )));
        if (!allowedCandidates.has(result.word.toLocaleLowerCase("en-US"))) {
          result = { match: false, reason: "invalid_candidate", usage: result.usage };
        }
      }
    } else {
      result = await callDeepSeek(validation.value, env, fetchImpl);
    }
    if (url.pathname === "/api/daily-review") {
      const allowedFocusWords = new Set(validation.value.weakWords.map((entry) => entry.word));
      result.focusWords = result.focusWords.filter((entry) => allowedFocusWords.has(entry.word));
    }
    return jsonResponse(request, result);
  } catch (error) {
    const code = error?.message || "AI_UPSTREAM_UNAVAILABLE";
    const status = code === "AI_TIMEOUT" ? 504 : 502;
    let invalidResponseMessage = "AI 返回了无法识别的判定结果";
    if (url.pathname === "/api/daily-review") invalidResponseMessage = "AI 返回了无法识别的复盘结果";
    else if (url.pathname === "/api/confusable-suggest") invalidResponseMessage = "AI 返回了无法识别的易混词结果";
    else if (url.pathname === "/api/confusable-find") invalidResponseMessage = "AI 返回了无法识别的找词结果";
    else if (url.pathname === "/api/confusable-match-existing") invalidResponseMessage = "AI 返回了无法识别的易混语义结果";
    const message = code === "AI_INVALID_RESPONSE"
      ? invalidResponseMessage
      : code === "AI_TIMEOUT"
        ? "AI 判断超时，请稍后再试"
        : "AI 服务暂时不可用";
    return errorResponse(request, status, code, message);
  }
}

export {
  buildConfusableMatchExistingDeepSeekBody,
  buildConfusableFindDeepSeekBody,
  buildConfusableSuggestDeepSeekBody,
  buildDailyGroupDeepSeekBody,
  buildDailyReviewDeepSeekBody,
  buildDeepSeekBody,
  createFallbackDailyGroupPlan,
  handleRequest,
  normalizeDailyGroupModelResult,
  normalizeDailyReviewModelResult,
  normalizeConfusableMatchExistingModelResult,
  normalizeConfusableFindModelResult,
  normalizeConfusableSuggestModelResult,
  normalizeModelResult,
  validateDailyGroupPayload,
  validateDailyReviewPayload,
  validateConfusableMatchExistingPayload,
  validateConfusableFindPayload,
  validateConfusableSuggestPayload,
  validatePayload,
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
