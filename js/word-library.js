/**
 * 拾词 · 单词浏览查询服务
 * 负责搜索、筛选、排序与分页，不直接操作 DOM。
 */

(function registerWordLibrary(app) {
  const PAGE_SIZE = 50;
  const FILTERS = Object.freeze(["all", "unlearned", "learning", "mastered", "manual-mastered", "wrong", "favorite"]);
  const SORTS = Object.freeze(["default", "az", "mastery", "errors", "recent"]);

  function matchesFilter(progress, filter) {
    if (filter === "unlearned") return !progress.learned;
    if (filter === "learning") return progress.learned && !progress.manualMastered && progress.masteryLevel < 5;
    if (filter === "mastered") return progress.learned && !progress.manualMastered && progress.masteryLevel >= 5;
    if (filter === "manual-mastered") return progress.learned && progress.manualMastered;
    if (filter === "wrong") return progress.inWrongBook;
    if (filter === "favorite") return progress.favorite;
    return true;
  }

  function filterAndSort(words, getProgress, options = {}) {
    const query = String(options.query || "").trim().toLocaleLowerCase("zh-CN");
    const filter = FILTERS.includes(options.filter) ? options.filter : "all";
    const sort = SORTS.includes(options.sort) ? options.sort : "default";

    const records = words
      .map((word, originalIndex) => ({ word, progress: getProgress(word.word), originalIndex }))
      .filter(({ word, progress }) => {
        if (!matchesFilter(progress, filter)) return false;
        if (!query) return true;
        const fullMeanings = Array.isArray(word.meanings)
          ? word.meanings.map((item) => `${item.pos || item.partOfSpeech || ""} ${item.meaning || item.translation || ""}`)
          : [];
        const searchText = [word.word, word.coreMeaning, word.shortMeaning, word.meaning, ...fullMeanings, word.example, word.translation]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("zh-CN");
        return searchText.includes(query);
      });

    records.sort((a, b) => {
      if (sort === "az") return a.word.word.localeCompare(b.word.word, "en");
      if (sort === "mastery") {
        const difference = a.progress.masteryLevel - b.progress.masteryLevel;
        return difference || a.word.word.localeCompare(b.word.word, "en");
      }
      if (sort === "errors") {
        const difference = b.progress.wrongCount - a.progress.wrongCount;
        return difference || a.word.word.localeCompare(b.word.word, "en");
      }
      if (sort === "recent") {
        const difference = (b.progress.lastStudyTime || 0) - (a.progress.lastStudyTime || 0);
        return difference || a.word.word.localeCompare(b.word.word, "en");
      }
      return a.originalIndex - b.originalIndex;
    });

    return records;
  }

  function paginate(records, requestedPage = 1, pageSize = PAGE_SIZE) {
    const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || PAGE_SIZE);
    const pageCount = Math.max(1, Math.ceil(records.length / safePageSize));
    const page = Math.min(pageCount, Math.max(1, Math.floor(Number(requestedPage)) || 1));
    const startIndex = (page - 1) * safePageSize;
    const items = records.slice(startIndex, startIndex + safePageSize);

    return {
      items,
      page,
      pageCount,
      pageSize: safePageSize,
      total: records.length,
      start: records.length ? startIndex + 1 : 0,
      end: Math.min(startIndex + items.length, records.length),
    };
  }

  app.wordLibrary = { PAGE_SIZE, FILTERS, SORTS, matchesFilter, filterAndSort, paginate };
})(window.CETWords);
