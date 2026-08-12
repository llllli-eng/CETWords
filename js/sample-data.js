/**
 * 直接双击 index.html 时，部分浏览器会禁止读取本地 JSON。
 * 这里保留一组小型兜底数据；通过本地静态服务运行时会优先使用完整 JSON 测试词库。
 */

window.CETWords = window.CETWords || {};

window.CETWords.FALLBACK_WORDS = {
  cet4: [
    {
      word: "abandon",
      phonetic: "/əˈbændən/",
      meaning: "v. 放弃；遗弃",
      example: "He abandoned his original plan.",
      translation: "他放弃了原来的计划。",
    },
    {
      word: "acquire",
      phonetic: "/əˈkwaɪə(r)/",
      meaning: "v. 获得；习得",
      example: "She acquired a good knowledge of French.",
      translation: "她掌握了很好的法语知识。",
    },
    {
      word: "acknowledge",
      phonetic: "/əkˈnɒlɪdʒ/",
      meaning: "v. 承认；确认收到",
      example: "He acknowledged that he had made a mistake.",
      translation: "他承认自己犯了错误。",
    },
    {
      word: "adapt",
      phonetic: "/əˈdæpt/",
      meaning: "v. 适应；改编",
      example: "It took him a while to adapt to the new school.",
      translation: "他花了一些时间才适应新学校。",
    },
    {
      word: "adequate",
      phonetic: "/ˈædɪkwət/",
      meaning: "adj. 足够的；适当的",
      example: "The room provides adequate space for six people.",
      translation: "这个房间为六个人提供了足够的空间。",
    },
    {
      word: "approach",
      phonetic: "/əˈprəʊtʃ/",
      meaning: "n. 方法；接近 v. 靠近",
      example: "We need a different approach to the problem.",
      translation: "我们需要用不同的方法处理这个问题。",
    },
    {
      word: "available",
      phonetic: "/əˈveɪləbl/",
      meaning: "adj. 可获得的；有空的",
      example: "The information is available online.",
      translation: "这些信息可以在网上获取。",
    },
    {
      word: "benefit",
      phonetic: "/ˈbenɪfɪt/",
      meaning: "n. 益处 v. 使受益",
      example: "Regular exercise benefits both body and mind.",
      translation: "经常锻炼对身心都有益。",
    },
  ],
  cet6: [
    {
      word: "abolish",
      phonetic: "/əˈbɒlɪʃ/",
      meaning: "v. 废除；取消",
      example: "The country decided to abolish the outdated law.",
      translation: "这个国家决定废除那项过时的法律。",
    },
    {
      word: "accumulate",
      phonetic: "/əˈkjuːmjəleɪt/",
      meaning: "v. 积累；聚集",
      example: "Small savings can accumulate over time.",
      translation: "少量储蓄可以随着时间积累起来。",
    },
    {
      word: "advocate",
      phonetic: "/ˈædvəkeɪt/",
      meaning: "v. 提倡；拥护 n. 支持者",
      example: "Many doctors advocate regular exercise.",
      translation: "许多医生提倡经常锻炼。",
    },
    {
      word: "ambiguous",
      phonetic: "/æmˈbɪɡjuəs/",
      meaning: "adj. 模棱两可的；含糊的",
      example: "The wording of the agreement is ambiguous.",
      translation: "这份协议的措辞含糊不清。",
    },
    {
      word: "anticipate",
      phonetic: "/ænˈtɪsɪpeɪt/",
      meaning: "v. 预期；预先考虑",
      example: "We anticipate a rise in demand next month.",
      translation: "我们预计下个月需求会上升。",
    },
    {
      word: "coherent",
      phonetic: "/kəʊˈhɪərənt/",
      meaning: "adj. 连贯的；条理清楚的",
      example: "She presented a coherent argument.",
      translation: "她提出了一个条理清楚的论点。",
    },
    {
      word: "compel",
      phonetic: "/kəmˈpel/",
      meaning: "v. 强迫；迫使",
      example: "The evidence compelled him to admit the truth.",
      translation: "证据迫使他承认真相。",
    },
    {
      word: "comprehensive",
      phonetic: "/ˌkɒmprɪˈhensɪv/",
      meaning: "adj. 全面的；综合的",
      example: "The report provides a comprehensive review of the issue.",
      translation: "这份报告对该问题作了全面回顾。",
    },
  ],
};
