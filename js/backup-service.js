/**
 * 拾词 · 备份与恢复服务
 * 导出全部用户状态；导入时统一调用 storage 的现有迁移与校验入口。
 */

(function registerBackupService(app) {
  const { storage } = app;
  const APP_NAME = "拾词";
  const EXPORT_VERSION = 1;

  function getFileDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createBackup(now = Date.now()) {
    const exportTime = new Date(now).toISOString();
    storage.setLastExportTime(exportTime);
    return {
      app: APP_NAME,
      exportVersion: EXPORT_VERSION,
      exportTime,
      data: storage.loadUserData(),
    };
  }

  function exportBackup(options = {}) {
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const backup = createBackup(now);
    const text = JSON.stringify(backup, null, 2);
    const fileName = `shi-ci-backup-${getFileDate(now)}.json`;

    if (options.download !== false && typeof document !== "undefined") {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    return { backup, text, fileName };
  }

  function parseCandidate(input) {
    if (typeof input === "string") return JSON.parse(input);
    return input;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function summarizeData(data) {
    const summary = { cet4Learned: 0, cet6Learned: 0, favorite: 0, wrong: 0 };
    for (const bookId of ["cet4", "cet6"]) {
      const words = data.books[bookId].words;
      Object.values(words).forEach((progress) => {
        if (progress?.learned) summary[`${bookId}Learned`] += 1;
        if (progress?.favorite) summary.favorite += 1;
        if (progress?.inWrongBook) summary.wrong += 1;
      });
    }
    return summary;
  }

  function validateBackup(input) {
    let parsed;
    try {
      parsed = parseCandidate(input);
    } catch {
      return { valid: false, error: "备份文件不是合法 JSON" };
    }

    if (!isPlainObject(parsed)) return { valid: false, error: "备份文件格式不正确" };

    let data;
    let metadata;
    if (parsed.app === APP_NAME && Number(parsed.exportVersion) === EXPORT_VERSION) {
      data = parsed.data;
      metadata = { app: parsed.app, exportVersion: parsed.exportVersion, exportTime: parsed.exportTime || null };
    } else if ([1, 2, 3, 4, 5, 6, 7].includes(Number(parsed.version))) {
      data = parsed;
      metadata = { app: APP_NAME, exportVersion: 0, exportTime: null, legacy: true };
    } else {
      return { valid: false, error: "这不是可识别的拾词备份文件" };
    }

    if (!isPlainObject(data) || ![1, 2, 3, 4, 5, 6, 7].includes(Number(data.version))) {
      return { valid: false, error: "备份数据版本无法识别" };
    }
    if (!isPlainObject(data.books) || !isPlainObject(data.books.cet4) || !isPlainObject(data.books.cet6)) {
      return { valid: false, error: "备份缺少 CET-4 或 CET-6 数据" };
    }
    for (const bookId of ["cet4", "cet6"]) {
      if (!isPlainObject(data.books[bookId].words) || !isPlainObject(data.books[bookId].daily)) {
        return { valid: false, error: `备份中的 ${bookId.toUpperCase()} 数据不完整` };
      }
    }

    return { valid: true, data, metadata, summary: summarizeData(data) };
  }

  function importBackup(input) {
    const validation = validateBackup(input);
    if (!validation.valid) throw new Error(validation.error);
    const saved = storage.saveUserData(validation.data);
    if (!saved) throw new Error("无法写入本地学习数据");
    return storage.loadUserData();
  }

  app.backupService = {
    APP_NAME,
    EXPORT_VERSION,
    createBackup,
    exportBackup,
    validateBackup,
    importBackup,
  };
})(window.CETWords);
