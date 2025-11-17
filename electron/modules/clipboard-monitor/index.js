// ccd-main/features/clipboard/index.js
// 클립보드 모듈 초기화 + event routing 역할만 맡음

const { app, ipcMain, globalShortcut, BrowserWindow } = require("electron");
const monitor = require("./monitor");
const CCDError = require("../shared/errors/CCDError");
const { LocalRepository } = require("../local-data/LocalRepository");
const localRepo = LocalRepository;
const {
  getCloudUploadEnabled,
  toggleCloudUploadEnabled,
} = require("../cloudUploadState");

/**
 * 클립보드 모듈 초기화
 */
function initClipboardModule() {
  setupToggleShortcut();
  startMonitoring();
  notifyRenderer("clipboard-upload-status", getCloudUploadEnabled());
}

/**
 * 모니터링 시작 — monitor는 감지만, index는 저장 담당
 */
function startMonitoring() {
  const emitter = monitor.start();

  if (!emitter) return;

  emitter.on("item", async (payload) => {
    try {
      // monitor는 "txt", "img" 형태로 넘기므로 그대로 사용
      const createdAtSeconds = Math.floor(payload.created_at / 1000);

      const savedItem = await repo.saveItem(payload, saveMode);

      // id는 DB에서 다시 발급될 수 있으므로 갱신
      payload.id = savedItem?.id ?? payload.id;

      const itemToSave = {
        id: payload.id,
        type: payload.type,
        format: payload.format,
        content: payload.content,
        created_at: createdAtSeconds,
        is_synced: 0, // 새 항목이므로 동기화되지 않음
      };

      const success = await localRepo.saveClipboardItem(itemToSave, imageMeta);

      if (!success) {
        throw new Error("Local repository save failed.");
      }
      notifyRenderer("clipboard-new-item", {
        id: payload.id,
        type: payload.type,
        created_at: createdAtSeconds,
        content: payload.content,
        format: payload.format,
      });
    } catch (err) {
      const error = CCDError.create("E630", {
        module: "index",
        context: "클립보드 감지/저장 실패",
        details: err,
      });
      console.error(error);
    }
  });
}

module.exports = { initClipboardModule };
