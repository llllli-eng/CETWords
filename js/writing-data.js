/**
 * Phase16.6 · CET6 真题作文数据与纯本地生成器
 * 只读取整理后的 JSON；网站运行时不读取 PDF，也不调用 AI。
 */

(function createWritingData(global) {
  const namespace = global.CETWords || (global.CETWords = {});
  const TOPICS_URL = "data/cet6-writing-topics.json";
  const MATERIALS_URL = "data/cet6-writing-materials.json";

  const FIELD_DEFINITIONS = {
    opinion: [
      ["topic", "核心主题", "例如：effective and independent learning"],
      ["opinion", "我的观点", "例如：it deserves lasting attention and practical action"],
      ["reason1", "理由 1", "写一个完整的英文分句"],
      ["benefit1", "好处 / 结果 1", "接在 help people 后，例如：make better decisions"],
      ["reason2", "理由 2", "再写一个不同角度"],
      ["benefit2", "好处 / 结果 2", "接在 more likely to 后"],
      ["example", "例子", "不用写 For example，直接写例子"],
      ["action", "行动 / 建议", "接在 we should 后"],
      ["positiveResult", "积极结果", "接在 can 后"]
    ],
    "problem-solution": [
      ["issue", "核心问题", "概括题目中的现象"],
      ["position", "我的判断", "例如：this phenomenon should be addressed in time"],
      ["cause1", "主要原因", "写一个完整的英文分句"],
      ["effect1", "负面影响", "写清楚会造成什么后果"],
      ["measure1", "对策 1", "写谁应该做什么"],
      ["result1", "对策效果", "接在 can 后"],
      ["measure2", "对策 2", "换一个行动主体或角度"],
      ["example", "例子", "给出一个具体做法"],
      ["conclusion", "总结行动", "写各方应如何共同改进"]
    ],
    chart: [
      ["trend", "图表趋势", "概括总体变化，不必抄全部数字"],
      ["achievement", "成就概括", "这一变化说明了什么"],
      ["reason1", "原因 1", "长期政策、投入或服务"],
      ["outcome1", "结果 1", "接在 can 后"],
      ["reason2", "原因 2", "执行、基础设施或人才"],
      ["outcome2", "结果 2", "接在 helps to 后"],
      ["example", "图表证据", "用趋势说明成果并非偶然"],
      ["action", "后续行动", "未来应继续做什么"],
      ["positiveResult", "积极结果", "接在 can 后"]
    ]
  };

  let dataPromise = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateData(topicsData, materialsData) {
    if (!topicsData || !Array.isArray(topicsData.topics)) throw new Error("真题数据格式无效");
    if (!materialsData || !materialsData.profiles || !materialsData.types) throw new Error("作文素材格式无效");
    const ids = new Set();
    topicsData.topics.forEach((topic) => {
      if (!topic.id || ids.has(topic.id)) throw new Error("真题 id 缺失或重复");
      if (!topic.sourceVerified || topic.needsReview) throw new Error(`未核验真题不应进入可用列表：${topic.id}`);
      ids.add(topic.id);
    });
    return { topicsData, materialsData };
  }

  async function load() {
    if (!dataPromise) {
      dataPromise = Promise.all([
        fetch(TOPICS_URL).then((response) => {
          if (!response.ok) throw new Error("无法加载六级作文真题数据");
          return response.json();
        }),
        fetch(MATERIALS_URL).then((response) => {
          if (!response.ok) throw new Error("无法加载六级作文素材数据");
          return response.json();
        })
      ]).then(([topicsData, materialsData]) => validateData(topicsData, materialsData));
    }
    return dataPromise;
  }

  function formatPaperLabel(topic) {
    const month = String(topic.month).padStart(2, "0");
    const setLabel = topic.set == null ? (topic.displaySet || "套卷待核") : `第${topic.set}套`;
    return `${topic.year}-${month} · ${setLabel}`;
  }

  function getFieldDefinitions(typeKey) {
    return (FIELD_DEFINITIONS[typeKey] || FIELD_DEFINITIONS.opinion).map(([key, label, placeholder]) => ({
      key,
      label,
      placeholder
    }));
  }

  function uniqueSuggestions(items) {
    const seen = new Set();
    return items.filter((item) => {
      const english = String(item?.en || "").trim();
      if (!english || seen.has(english.toLowerCase())) return false;
      seen.add(english.toLowerCase());
      return true;
    });
  }

  function getSuggestions(topic, fieldKey, materialsData) {
    const profile = materialsData.profiles[topic.materialProfile] || {};
    const type = materialsData.types[topic.typeKey] || {};
    return uniqueSuggestions([
      ...(profile[fieldKey] || []),
      ...(type[fieldKey] || []),
      ...(materialsData.common[fieldKey] || [])
    ]).map((item) => ({ ...item }));
  }

  function extractRequiredOpening(directions) {
    const match = String(directions || "").match(/begins with the sentence\s+[“\"]([^”\"]+)[”\"]/i);
    return match ? match[1].trim() : "";
  }

  function fallbackChinese(value) {
    const english = String(value?.en || value || "").trim();
    return String(value?.zh || "").trim() || `你填写的英文：${english}`;
  }

  function normalizeValue(value) {
    if (value && typeof value === "object") {
      return { en: String(value.en || "").trim(), zh: String(value.zh || "").trim() };
    }
    return { en: String(value || "").trim(), zh: "" };
  }

  function buildInputs(topic, values, materialsData) {
    const result = {};
    getFieldDefinitions(topic.typeKey).forEach(({ key }) => {
      const current = normalizeValue(values?.[key]);
      if (current.en) {
        result[key] = current;
        return;
      }
      const fallback = getSuggestions(topic, key, materialsData)[0] || { en: "take practical action", zh: "采取务实行动" };
      result[key] = { en: fallback.en, zh: fallback.zh };
    });
    return result;
  }

  function ensureSentence(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return /[.!?]$/.test(value) ? value : `${value}.`;
  }

  function buildOpinionEssay(topic, input) {
    const opening = extractRequiredOpening(topic.directions);
    const firstSentence = opening
      ? ensureSentence(opening)
      : `Nowadays, ${input.topic.en} has become a subject worthy of serious attention.`;
    const paragraphs = [
      `${firstSentence} This issue is closely connected with the way people study, work and live. From my perspective, ${input.opinion.en}.`,
      `There are several reasons for this view. First of all, ${input.reason1.en}. This can help people ${input.benefit1.en} and avoid many unnecessary difficulties. In addition, ${input.reason2.en}. As a result, they are more likely to ${input.benefit2.en}. For example, ${input.example.en}. This simple case shows that sound ideas become valuable only when they are translated into consistent action.`,
      `In conclusion, ${input.topic.en} is not an abstract slogan but a practical part of personal and social development. Therefore, we should ${input.action.en}. Meanwhile, schools, families and communities can provide clear guidance and supportive conditions. Only in this way can we ${input.positiveResult.en} and make steady progress in a changing world.`
    ];
    const zhParagraphs = [
      `如今，${fallbackChinese(input.topic)}值得认真关注。这个话题与人们的学习、工作和生活方式密切相关。我认为，${fallbackChinese(input.opinion)}。`,
      `主要有几方面原因。首先，${fallbackChinese(input.reason1)}，这能帮助人们${fallbackChinese(input.benefit1)}并避免不必要的困难。其次，${fallbackChinese(input.reason2)}，因此人们更有可能${fallbackChinese(input.benefit2)}。例如，${fallbackChinese(input.example)}。这个例子说明，理念只有化为持续行动才有价值。`,
      `总之，${fallbackChinese(input.topic)}不是抽象口号，而是个人与社会发展的实际部分。因此，我们应该${fallbackChinese(input.action)}。学校、家庭和社区也可以提供清晰指导与支持。只有这样，我们才能${fallbackChinese(input.positiveResult)}，并在变化的世界中稳步前进。`
    ];
    return { paragraphs, zhParagraphs };
  }

  function buildProblemEssay(topic, input) {
    const paragraphs = [
      `The passage describes a worrying situation: ${input.issue.en}. This phenomenon is more than a private matter because it can influence young people's judgement, habits and future development. In my view, ${input.position.en}.`,
      `One important cause is that ${input.cause1.en}. Consequently, ${input.effect1.en}. To improve the situation, ${input.measure1.en}. Such guidance can ${input.result1.en}. At the same time, ${input.measure2.en}. For example, ${input.example.en}. Practical experience of this kind is usually more effective than warnings alone.`,
      `In conclusion, ${input.conclusion.en}. Clear rules, patient communication and repeated opportunities to practise are all necessary. If every side accepts its share of responsibility, young people will gradually develop stronger judgement and healthier habits. The goal is not simply to stop one behavior, but to help them make sound decisions independently.`
    ];
    const zhParagraphs = [
      `短文描述了一个值得担忧的现象：${fallbackChinese(input.issue)}。这不只是个人问题，还会影响青少年的判断、习惯与未来发展。我认为，${fallbackChinese(input.position)}。`,
      `一个重要原因是${fallbackChinese(input.cause1)}，因此${fallbackChinese(input.effect1)}。为改善这一状况，${fallbackChinese(input.measure1)}，这样的引导可以${fallbackChinese(input.result1)}。与此同时，${fallbackChinese(input.measure2)}。例如，${fallbackChinese(input.example)}。这种实践通常比单纯警告更有效。`,
      `总之，${fallbackChinese(input.conclusion)}。清晰规则、耐心沟通和反复实践都不可缺少。如果各方承担责任，青少年会逐渐形成更强的判断力和更健康的习惯。目标不只是制止某种行为，而是帮助他们独立作出明智选择。`
    ];
    return { paragraphs, zhParagraphs };
  }

  function buildChartEssay(topic, input) {
    const context = topic.promptContext
      ? ` The title is “${topic.promptContext.replace(/^(Graph|Chart) title:\s*/i, "").replace(/[.。]+$/, "")}”.`
      : "";
    const paragraphs = [
      `The chart presents a clear picture of development in China.${context} Overall, ${input.trend.en}. This visible change is encouraging, and ${input.achievement.en}.`,
      `Several factors have contributed to this result. First, ${input.reason1.en}. This can ${input.outcome1.en}. Second, ${input.reason2.en}, which helps to ${input.outcome2.en}. For example, ${input.example.en}. Therefore, the figures should be understood as the result of sustained effort rather than a short-term change.`,
      `In conclusion, the chart records meaningful progress and also points to the work ahead. We should ${input.action.en}. At the same time, attention should be paid to fairness, quality and long-term sustainability. Only in this way can we ${input.positiveResult.en} and ensure that future progress benefits more people.`
    ];
    const zhParagraphs = [
      `图表清楚展示了中国的发展变化。总体来看，${fallbackChinese(input.trend)}。这一变化令人鼓舞，并且${fallbackChinese(input.achievement)}。`,
      `这一成果来自多方面因素。首先，${fallbackChinese(input.reason1)}，这能${fallbackChinese(input.outcome1)}。其次，${fallbackChinese(input.reason2)}，从而${fallbackChinese(input.outcome2)}。例如，${fallbackChinese(input.example)}。因此，这些数字体现的是长期努力，而非短期波动。`,
      `总之，图表既记录了有意义的进步，也提示了今后的任务。我们应该${fallbackChinese(input.action)}，同时重视公平、质量和长期可持续性。只有这样，我们才能${fallbackChinese(input.positiveResult)}，让未来进步惠及更多人。`
    ];
    return { paragraphs, zhParagraphs };
  }

  function countWords(text) {
    return (String(text || "").match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:\.\d+)?%?/g) || []).length;
  }

  function getLengthLabel(count) {
    if (count < 150) return "篇幅偏短";
    if (count <= 200) return "篇幅适中";
    return "篇幅偏长";
  }

  function generateEssay(topic, values, materialsData) {
    const input = buildInputs(topic, values, materialsData);
    const builder = topic.typeKey === "problem-solution"
      ? buildProblemEssay
      : topic.typeKey === "chart"
        ? buildChartEssay
        : buildOpinionEssay;
    const output = builder(topic, input);
    const english = output.paragraphs.join("\n\n");
    return {
      ...output,
      english,
      wordCount: countWords(english),
      lengthLabel: getLengthLabel(countWords(english)),
      inputs: clone(input)
    };
  }

  namespace.writingData = {
    TOPICS_URL,
    MATERIALS_URL,
    load,
    validateData,
    formatPaperLabel,
    getFieldDefinitions,
    getSuggestions,
    extractRequiredOpening,
    buildInputs,
    generateEssay,
    countWords,
    getLengthLabel
  };
})(window);
