/**
 * Phase16.6 · CET6 真题作文训练界面
 * 与背词存储完全隔离，正常使用只读取本地 JSON，0 AI Token。
 */

(function createWritingController(global) {
  const namespace = global.CETWords || (global.CETWords = {});
  const STORAGE_KEY = "cet6WritingPracticeV1";
  const EMPTY_RECORDS = { version: 1, topics: {} };

  const state = {
    initialized: false,
    loading: false,
    data: null,
    materials: null,
    screen: "list",
    selectedTopicId: null,
    year: "all",
    month: "all",
    type: "all",
    query: "",
    openSuggestionField: null,
    draft: {},
    result: null,
    showChinese: false,
    callbacks: { onBackHome: null, showToast: null }
  };

  const elements = {
    view: null,
    root: null,
    back: null,
    backLabel: null
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed?.version === 1 && parsed.topics && typeof parsed.topics === "object") return parsed;
    } catch (error) {
      console.warn("作文练习记录读取失败，将使用空记录。", error);
    }
    return JSON.parse(JSON.stringify(EMPTY_RECORDS));
  }

  function writeRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function getRecord(topicId) {
    return readRecords().topics[topicId] || {};
  }

  function updateRecord(topicId, updater) {
    const records = readRecords();
    const current = records.topics[topicId] || {};
    records.topics[topicId] = updater({ ...current }) || current;
    writeRecords(records);
    return records.topics[topicId];
  }

  function toast(message) {
    if (typeof state.callbacks.showToast === "function") state.callbacks.showToast(message);
  }

  function getTopic(topicId = state.selectedTopicId) {
    return state.data?.topics.find((topic) => topic.id === topicId) || null;
  }

  function sortTopics(topics) {
    return [...topics].sort((a, b) => (
      b.year - a.year
      || b.month - a.month
      || (a.set ?? 99) - (b.set ?? 99)
      || a.id.localeCompare(b.id)
    ));
  }

  function getFilteredTopics() {
    const query = state.query.trim().toLowerCase();
    return sortTopics(state.data?.topics || []).filter((topic) => {
      if (state.year !== "all" && String(topic.year) !== state.year) return false;
      if (state.month !== "all" && String(topic.month) !== state.month) return false;
      if (state.type !== "all" && topic.typeKey !== state.type) return false;
      if (!query) return true;
      return [topic.topicZh, topic.directions, topic.sourceFile, topic.type]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }

  function renderFilterOptions(items, selected, formatter = (value) => value) {
    return items.map((value) => (
      `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(formatter(value))}</option>`
    )).join("");
  }

  function renderList() {
    const records = readRecords();
    const topics = getFilteredTopics();
    const years = [...new Set(state.data.topics.map((topic) => topic.year))].sort((a, b) => b - a);
    const months = [...new Set(state.data.topics.map((topic) => topic.month))].sort((a, b) => a - b);
    const typeOptions = state.data.typeSummary.map((item) => [item.key, item.name]);
    const practicedCount = Object.values(records.topics).filter((record) => record.practiced).length;

    elements.root.innerHTML = `
      <section class="writing-hero" aria-labelledby="writing-title">
        <div>
          <p class="section-kicker">LOCAL CET6 PAST PAPERS</p>
          <h1 id="writing-title">📝 六级作文</h1>
          <p>来自本地 PDF 的 ${state.data.audit.topicRecordCount} 条来源记录 · ${state.data.audit.independentTopicCount} 道独立真题 · 已练 ${practicedCount} 道</p>
        </div>
        <div class="writing-zero-ai"><strong>0 AI Token</strong><span>浏览、素材与生成全部本地完成</span></div>
      </section>

      <section class="writing-toolbar" aria-label="筛选六级作文真题">
        <label><span>年份</span><select data-writing-filter="year"><option value="all">全部年份</option>${renderFilterOptions(years, state.year)}</select></label>
        <label><span>月份</span><select data-writing-filter="month"><option value="all">全部月份</option>${renderFilterOptions(months, state.month, (month) => `${month}月`)}</select></label>
        <label><span>题型</span><select data-writing-filter="type"><option value="all">全部题型</option>${typeOptions.map(([key, name]) => `<option value="${key}"${state.type === key ? " selected" : ""}>${name}</option>`).join("")}</select></label>
        <label class="writing-search"><span>搜索</span><input type="search" data-writing-search value="${escapeHtml(state.query)}" placeholder="主题、Directions 或来源文件" /></label>
      </section>

      <div class="writing-list-meta"><strong>找到 ${topics.length} 条</strong><span>按时间倒序</span></div>
      <section class="writing-topic-grid" aria-label="六级作文真题列表">
        ${topics.map((topic) => {
          const record = records.topics[topic.id] || {};
          return `
            <article class="writing-topic-card" data-topic-card="${topic.id}">
              <div class="writing-topic-card__meta">
                <span>${escapeHtml(namespace.writingData.formatPaperLabel(topic))}</span>
                <span class="writing-type-badge">${escapeHtml(topic.type)}</span>
              </div>
              <h2>${escapeHtml(topic.topicZh)}</h2>
              <p>来源：本地 CET6 真题</p>
              <div class="writing-topic-card__flags">
                ${record.practiced ? "<span>✓ 已练过</span>" : ""}
                ${record.favorite ? "<span>★ 已收藏</span>" : ""}
                ${topic.duplicateGroupId ? "<span>重复题组</span>" : ""}
              </div>
              <div class="writing-topic-card__actions">
                <button class="secondary-button" type="button" data-writing-detail="${topic.id}">查看原题</button>
                <button class="primary-button" type="button" data-writing-practice="${topic.id}">开始练习</button>
              </div>
            </article>`;
        }).join("")}
      </section>
      ${topics.length ? "" : `<section class="empty-state"><span class="empty-state__icon">⌕</span><h2>没有符合条件的真题</h2><p>试试清空筛选或更换关键词。</p><button class="secondary-button empty-state__button" type="button" data-writing-clear-filter>清空筛选</button></section>`}
    `;
  }

  function renderDetail() {
    const topic = getTopic();
    if (!topic) return showList();
    const record = getRecord(topic.id);
    elements.root.innerHTML = `
      <article class="writing-detail-card">
        <div class="writing-detail-card__heading">
          <div>
            <p class="section-kicker">VERIFIED LOCAL SOURCE</p>
            <h1>${escapeHtml(namespace.writingData.formatPaperLabel(topic))}</h1>
            <p>${escapeHtml(topic.topicZh)}</p>
          </div>
          <button class="writing-favorite-button${record.favorite ? " is-favorite" : ""}" type="button" data-writing-favorite="${topic.id}" aria-pressed="${String(Boolean(record.favorite))}">${record.favorite ? "★ 已收藏" : "☆ 收藏"}</button>
        </div>
        <section class="writing-source-block" aria-labelledby="writing-directions-title">
          <p class="section-kicker">真题原文</p>
          <h2 id="writing-directions-title">Directions</h2>
          <p class="writing-directions">${escapeHtml(topic.directions)}</p>
          ${topic.promptContext ? `<p class="writing-prompt-context">${escapeHtml(topic.promptContext)}</p>` : ""}
        </section>
        <dl class="writing-detail-list">
          <div><dt>主题概括</dt><dd>${escapeHtml(topic.topicZh)}</dd></div>
          <div><dt>题型</dt><dd>${escapeHtml(topic.type)}</dd></div>
          <div><dt>来源文件</dt><dd>${escapeHtml(topic.sourceFile)}</dd></div>
          <div><dt>来源页</dt><dd>第 ${topic.sourcePage} 页</dd></div>
          <div><dt>核验状态</dt><dd>✓ 已与 PDF 页面核验</dd></div>
          ${topic.sourceNote ? `<div><dt>来源说明</dt><dd>${escapeHtml(topic.sourceNote)}</dd></div>` : ""}
          ${topic.duplicateGroupId ? "<div><dt>去重说明</dt><dd>该 Directions 与同场另一来源重复，保留来源追溯并归入同一重复组。</dd></div>" : ""}
        </dl>
        <button class="primary-button writing-detail-start" type="button" data-writing-practice="${topic.id}">开始傻瓜式写作 <span aria-hidden="true">→</span></button>
      </article>
    `;
  }

  function captureDraft() {
    if (state.screen !== "form") return;
    elements.root.querySelectorAll("[data-writing-field]").forEach((input) => {
      const key = input.dataset.writingField;
      const value = input.value.trim();
      const previous = state.draft[key] || { en: "", zh: "" };
      state.draft[key] = { en: value, zh: previous.en === value ? previous.zh : "" };
    });
  }

  function saveDraft() {
    const topic = getTopic();
    if (!topic) return;
    updateRecord(topic.id, (record) => ({ ...record, draft: state.draft }));
  }

  function loadDraft(topic) {
    const saved = getRecord(topic.id).draft || {};
    const firstField = namespace.writingData.getFieldDefinitions(topic.typeKey)[0]?.key;
    const draft = {};
    namespace.writingData.getFieldDefinitions(topic.typeKey).forEach(({ key }) => {
      const value = saved[key];
      draft[key] = value && typeof value === "object"
        ? { en: String(value.en || ""), zh: String(value.zh || "") }
        : { en: String(value || ""), zh: "" };
    });
    if (firstField && !draft[firstField].en) {
      const suggestion = namespace.writingData.getSuggestions(topic, firstField, state.materials)[0];
      if (suggestion) draft[firstField] = { ...suggestion };
    }
    return draft;
  }

  function renderSuggestionPanel(topic, fieldKey) {
    if (state.openSuggestionField !== fieldKey) return "";
    const suggestions = namespace.writingData.getSuggestions(topic, fieldKey, state.materials);
    return `
      <div class="writing-suggestion-panel" role="group" aria-label="${escapeHtml(fieldKey)} 快捷素材">
        <p>先显示当前真题素材，再补充题型与通用安全表达。点一下自动填英文。</p>
        <div>
          ${suggestions.map((item, index) => `
            <button type="button" data-writing-suggestion="${escapeHtml(fieldKey)}" data-suggestion-index="${index}">
              <strong>${escapeHtml(item.zh)}</strong><span>${escapeHtml(item.en)}</span>
            </button>`).join("")}
        </div>
      </div>`;
  }

  function renderForm() {
    const topic = getTopic();
    if (!topic) return showList();
    const fields = namespace.writingData.getFieldDefinitions(topic.typeKey);
    elements.root.innerHTML = `
      <section class="writing-form-hero">
        <p class="section-kicker">FOOLPROOF WRITING</p>
        <h1>${escapeHtml(namespace.writingData.formatPaperLabel(topic))}</h1>
        <p>${escapeHtml(topic.topicZh)} · ${escapeHtml(topic.type)}</p>
        <div class="writing-form-note">只填你有把握的内容即可；空白字段会用当前真题的本地推荐素材补齐，不调用 AI。</div>
      </section>
      <form class="writing-practice-form" id="writing-practice-form">
        ${fields.map(({ key, label, placeholder }) => `
          <section class="writing-field-card">
            <div class="writing-field-card__heading">
              <label for="writing-field-${escapeHtml(key)}">${escapeHtml(label)}</label>
              <button type="button" class="writing-idea-button" data-writing-idea="${escapeHtml(key)}" aria-expanded="${String(state.openSuggestionField === key)}">不知道写什么？</button>
            </div>
            <textarea id="writing-field-${escapeHtml(key)}" data-writing-field="${escapeHtml(key)}" rows="2" maxlength="320" placeholder="${escapeHtml(placeholder)}">${escapeHtml(state.draft[key]?.en || "")}</textarea>
            ${state.draft[key]?.zh ? `<small>已选中文思路：${escapeHtml(state.draft[key].zh)}</small>` : ""}
            ${renderSuggestionPanel(topic, key)}
          </section>`).join("")}
        <button class="primary-button writing-generate-button" type="submit">生成完整英文作文 <span aria-hidden="true">→</span></button>
      </form>
    `;
  }

  function renderResult() {
    const topic = getTopic();
    if (!topic || !state.result) return showForm(topic?.id);
    const result = state.result;
    elements.root.innerHTML = `
      <section class="writing-result-hero">
        <div>
          <p class="section-kicker">YOUR CET6 ESSAY</p>
          <h1>作文已生成</h1>
          <p>${escapeHtml(namespace.writingData.formatPaperLabel(topic))} · ${escapeHtml(topic.topicZh)}</p>
        </div>
        <div class="writing-word-count"><strong>${result.wordCount}</strong><span>words · ${result.lengthLabel}</span></div>
      </section>
      <div class="writing-result-toolbar">
        <label><input type="checkbox" data-writing-chinese${state.showChinese ? " checked" : ""} /> 显示中文提示</label>
        <button class="secondary-button" type="button" data-writing-copy>复制英文作文</button>
      </div>
      <article class="writing-essay" aria-label="生成的英文作文">
        ${result.paragraphs.map((paragraph, index) => `
          <section>
            <p lang="en">${escapeHtml(paragraph)}</p>
            ${state.showChinese ? `<p class="writing-essay__zh" lang="zh-CN">${escapeHtml(result.zhParagraphs[index])}</p>` : ""}
          </section>`).join("")}
      </article>
      <div class="writing-result-actions">
        <button class="secondary-button" type="button" data-writing-restart>重新填写</button>
        <button class="primary-button" type="button" data-writing-next-topic>换一道真题</button>
      </div>
      <p class="writing-result-note">字数仅作训练提示，不代表官方唯一最佳篇幅。中文提示不会进入复制的英文作文。</p>
    `;
  }

  function setBackLabel() {
    if (!elements.backLabel) return;
    elements.backLabel.textContent = state.screen === "list"
      ? "返回首页"
      : state.screen === "detail"
        ? "返回真题列表"
        : state.screen === "form"
          ? "返回真题详情"
          : "返回填写页";
  }

  function render() {
    setBackLabel();
    if (state.loading) {
      elements.root.innerHTML = `<section class="writing-loading"><span aria-hidden="true">📝</span><h1>正在准备本地真题</h1><p>只加载整理后的作文 JSON，不加载原始 PDF。</p></section>`;
      return;
    }
    if (!state.data) return;
    if (state.screen === "detail") renderDetail();
    else if (state.screen === "form") renderForm();
    else if (state.screen === "result") renderResult();
    else renderList();
  }

  function showList() {
    state.screen = "list";
    state.selectedTopicId = null;
    state.openSuggestionField = null;
    state.result = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDetail(topicId) {
    if (!getTopic(topicId)) return;
    state.selectedTopicId = topicId;
    state.screen = "detail";
    state.openSuggestionField = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showForm(topicId) {
    const topic = getTopic(topicId || state.selectedTopicId);
    if (!topic) return showList();
    state.selectedTopicId = topic.id;
    state.screen = "form";
    state.openSuggestionField = null;
    state.draft = loadDraft(topic);
    state.result = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showNextTopic() {
    const topics = sortTopics(state.data.topics);
    const currentIndex = topics.findIndex((topic) => topic.id === state.selectedTopicId);
    const next = topics[(currentIndex + 1 + topics.length) % topics.length];
    showDetail(next.id);
  }

  function toggleFavorite(topicId) {
    const record = updateRecord(topicId, (current) => ({ ...current, favorite: !current.favorite }));
    toast(record.favorite ? "已收藏这道作文真题" : "已取消收藏");
    render();
  }

  function recordGeneration(topic, result) {
    updateRecord(topic.id, (record) => ({
      ...record,
      practiced: true,
      lastPracticedAt: new Date().toISOString(),
      generationCount: Math.max(0, Number(record.generationCount) || 0) + 1,
      draft: result.inputs
    }));
  }

  async function copyEssay() {
    const text = state.result?.english || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast("英文作文已复制");
  }

  function handleBack() {
    if (state.screen === "result") {
      state.screen = "form";
      state.result = null;
      render();
      return;
    }
    if (state.screen === "form") return showDetail(state.selectedTopicId);
    if (state.screen === "detail") return showList();
    if (typeof state.callbacks.onBackHome === "function") state.callbacks.onBackHome();
  }

  function handleClick(event) {
    const detail = event.target.closest("[data-writing-detail]");
    if (detail) return showDetail(detail.dataset.writingDetail);
    const practice = event.target.closest("[data-writing-practice]");
    if (practice) return showForm(practice.dataset.writingPractice);
    const favorite = event.target.closest("[data-writing-favorite]");
    if (favorite) return toggleFavorite(favorite.dataset.writingFavorite);
    if (event.target.closest("[data-writing-clear-filter]")) {
      state.year = "all";
      state.month = "all";
      state.type = "all";
      state.query = "";
      return renderList();
    }
    const idea = event.target.closest("[data-writing-idea]");
    if (idea) {
      captureDraft();
      saveDraft();
      state.openSuggestionField = state.openSuggestionField === idea.dataset.writingIdea ? null : idea.dataset.writingIdea;
      return renderForm();
    }
    const suggestion = event.target.closest("[data-writing-suggestion]");
    if (suggestion) {
      captureDraft();
      const topic = getTopic();
      const field = suggestion.dataset.writingSuggestion;
      const options = namespace.writingData.getSuggestions(topic, field, state.materials);
      const selected = options[Number(suggestion.dataset.suggestionIndex)];
      if (selected) state.draft[field] = { ...selected };
      saveDraft();
      state.openSuggestionField = null;
      return renderForm();
    }
    if (event.target.closest("[data-writing-copy]")) return copyEssay();
    if (event.target.closest("[data-writing-restart]")) return showForm(state.selectedTopicId);
    if (event.target.closest("[data-writing-next-topic]")) return showNextTopic();
  }

  function handleChange(event) {
    const filter = event.target.closest("[data-writing-filter]");
    if (filter) {
      state[filter.dataset.writingFilter] = filter.value;
      renderList();
      return;
    }
    if (event.target.matches("[data-writing-chinese]")) {
      state.showChinese = event.target.checked;
      renderResult();
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-writing-search]")) {
      state.query = event.target.value;
      const selectionStart = event.target.selectionStart;
      renderList();
      const nextInput = elements.root.querySelector("[data-writing-search]");
      nextInput?.focus();
      nextInput?.setSelectionRange(selectionStart, selectionStart);
      return;
    }
    if (event.target.matches("[data-writing-field]")) {
      const key = event.target.dataset.writingField;
      const previous = state.draft[key] || { en: "", zh: "" };
      state.draft[key] = { en: event.target.value, zh: previous.en === event.target.value ? previous.zh : "" };
      saveDraft();
    }
  }

  function handleSubmit(event) {
    if (event.target.id !== "writing-practice-form") return;
    event.preventDefault();
    captureDraft();
    const topic = getTopic();
    state.result = namespace.writingData.generateEssay(topic, state.draft, state.materials);
    state.draft = state.result.inputs;
    recordGeneration(topic, state.result);
    state.screen = "result";
    state.showChinese = false;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initialize(callbacks = {}) {
    if (state.initialized) {
      state.callbacks = { ...state.callbacks, ...callbacks };
      return;
    }
    elements.view = document.querySelector("#writing-view");
    elements.root = document.querySelector("#writing-root");
    elements.back = document.querySelector("#writing-back-button");
    elements.backLabel = document.querySelector("#writing-back-label");
    if (!elements.view || !elements.root || !elements.back) return;
    state.callbacks = { ...state.callbacks, ...callbacks };
    elements.back.addEventListener("click", handleBack);
    elements.root.addEventListener("click", handleClick);
    elements.root.addEventListener("change", handleChange);
    elements.root.addEventListener("input", handleInput);
    elements.root.addEventListener("submit", handleSubmit);
    state.initialized = true;
  }

  async function open() {
    if (!state.initialized) initialize();
    document.title = "六级作文真题训练 · 拾词";
    if (state.data) {
      showList();
      return;
    }
    state.loading = true;
    render();
    try {
      const loaded = await namespace.writingData.load();
      state.data = loaded.topicsData;
      state.materials = loaded.materialsData;
      state.loading = false;
      showList();
    } catch (error) {
      state.loading = false;
      console.error(error);
      elements.root.innerHTML = `<section class="empty-state writing-load-error"><span class="empty-state__icon">!</span><h2>真题数据加载失败</h2><p>${escapeHtml(error.message)}</p><button class="secondary-button empty-state__button" type="button" data-writing-retry>重新加载</button></section>`;
      elements.root.querySelector("[data-writing-retry]")?.addEventListener("click", () => {
        state.data = null;
        open();
      }, { once: true });
    }
  }

  namespace.writing = {
    STORAGE_KEY,
    initialize,
    open,
    showList,
    showDetail,
    showForm,
    getState: () => ({
      screen: state.screen,
      selectedTopicId: state.selectedTopicId,
      loaded: Boolean(state.data)
    })
  };
})(window);
