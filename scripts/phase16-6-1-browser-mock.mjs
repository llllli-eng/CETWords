/** Local-only browser acceptance mock for Phase16.6.1. */

import http from "node:http";

const port = Math.max(1, Math.floor(Number(process.argv[2])) || 4176);

const auditByWord = {
  fast: {
    verdict: "priority_issue",
    summary: "“牢固的”是真实义项，但不适合作为四六级首要核心义。",
    commonMeanings: [
      { pos: "adj.", meaning: "快速的；迅速的" },
      { pos: "adv.", meaning: "快速地" },
    ],
    suggestedCoreMeaning: "快速的；迅速的；快速地",
    secondaryMeanings: ["牢固的；固定的"],
    cetAdvice: "四六级应优先掌握表示速度的常见义。",
    caution: "低频真实义可以保留，但不应排在核心义首位。",
  },
  assume: {
    verdict: "incomplete",
    summary: "现有释义基本正确，但缺少重要的现代常见义。",
    commonMeanings: [
      { pos: "v.", meaning: "假设；认为" },
      { pos: "v.", meaning: "承担（责任等）" },
    ],
    suggestedCoreMeaning: "假设；认为；承担",
    secondaryMeanings: [],
    cetAdvice: "优先掌握“假设；认为”，同时保留“承担责任”。",
    caution: "不要把搭配中的承担义误当成唯一核心义。",
  },
  opposite: {
    verdict: "correct",
    summary: "当前释义准确，且符合四六级常见用法。",
    commonMeanings: [
      { pos: "adj.", meaning: "相反的；对面的" },
      { pos: "n.", meaning: "对立的人或事物；对立面" },
    ],
    suggestedCoreMeaning: "相反的；对面的；对立面",
    secondaryMeanings: [],
    cetAdvice: "维持当前核心义即可。",
    caution: "",
  },
};

function send(response, status, body, origin = "*") {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

http.createServer((request, response) => {
  const origin = request.headers.origin || "*";
  if (request.method === "OPTIONS") return send(response, 204, {}, origin);
  if (request.url === "/health") return send(response, 200, { ok: true, service: "shi-ci-ai", model: "browser-qa-mock" }, origin);
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { return send(response, 400, { error: "INVALID_JSON" }, origin); }
    if (request.url === "/api/meaning-audit") {
      return send(response, 200, {
        ...(auditByWord[String(payload.word || "").toLowerCase()] || auditByWord.opposite),
        usage: { promptTokens: 10, completionTokens: 20 },
      }, origin);
    }
    if (request.url === "/api/meaning-audit-chat") {
      return send(response, 200, {
        answer: "这个义项确实存在，但四六级学习应优先掌握现代语料中更常见的核心义。",
        usage: { promptTokens: 8, completionTokens: 16 },
      }, origin);
    }
    return send(response, 404, { error: "NOT_FOUND" }, origin);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Phase16.6.1 browser mock listening on http://127.0.0.1:${port}`);
});
