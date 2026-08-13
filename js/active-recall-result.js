(function registerActiveRecallResult(app) {
  const FINAL_JUDGEMENTS = new Set(["correct", "partial", "wrong"]);
  const MOSTLY_VISIBLE_RATIO = 0.65;

  function isFinalResult(question) {
    return Boolean(question && FINAL_JUDGEMENTS.has(question.judgement));
  }

  function getVisibility(element, viewportHeight = window.innerHeight) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return { rect: null, visibleHeight: 0, visibleRatio: 0 };
    }
    const rect = element.getBoundingClientRect();
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const elementHeight = Math.max(0, Number(rect.height) || Number(rect.bottom) - Number(rect.top));
    const visibleTop = Math.max(0, Number(rect.top) || 0);
    const visibleBottom = Math.min(safeViewportHeight, Number(rect.bottom) || 0);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    return {
      rect,
      visibleHeight,
      visibleRatio: elementHeight > 0 ? visibleHeight / elementHeight : 0,
    };
  }

  function isElementMostlyVisible(element, viewportHeight = window.innerHeight) {
    const { rect, visibleRatio } = getVisibility(element, viewportHeight);
    if (!rect) return false;
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    return Number(rect.top) >= 0
      && Number(rect.top) <= safeViewportHeight * 0.72
      && visibleRatio >= MOSTLY_VISIBLE_RATIO;
  }

  function scrollFeedbackIntoViewIfNeeded(element, question, options = {}) {
    if (!element || !isFinalResult(question) || question.resultScrollHandled) return false;
    question.resultScrollHandled = true;
    const viewportHeight = Number(options.viewportHeight) || window.innerHeight;
    if (isElementMostlyVisible(element, viewportHeight)) return false;
    const { rect } = getVisibility(element, viewportHeight);
    if (!rect || Number(rect.bottom) <= 0 || Number(rect.bottom) <= viewportHeight) return false;
    const reducedMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
    return true;
  }

  app.activeRecallResult = {
    FINAL_JUDGEMENTS,
    MOSTLY_VISIBLE_RATIO,
    isFinalResult,
    getVisibility,
    isElementMostlyVisible,
    scrollFeedbackIntoViewIfNeeded,
  };
})(window.CETWords);
