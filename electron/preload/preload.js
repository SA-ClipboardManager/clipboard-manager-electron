window.addEventListener("DOMContentLoaded", () => {
  console.log("Preload loaded.");
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  closeWindow: () => ipcRenderer.send("close-Window"),

  loginUser: (userId, password) =>
    ipcRenderer.invoke("user-login", { userId, password }),

  logoutUser: () => ipcRenderer.invoke("user-logout"),

  registerUser: (userId, password) =>
    ipcRenderer.invoke("user-register", { userId, password }),

  getLoginState: () => ipcRenderer.invoke("get-login-state"),

  // 붙여넣기
  pasteItem: (itemId) => ipcRenderer.invoke("paste-item", { itemId }),

  // 실시간 클립보드 업데이트 감지
  onClipboardUpdated: (callback) =>
    ipcRenderer.on("clipboard-updated", (_, items) => callback(items)),

  offClipboardUpdated: (callback) =>
    ipcRenderer.removeListener("clipboard-updated", callback),

  // 검색
  searchKeyword: (keyword, model) =>
    ipcRenderer.invoke("search-keyword", { keyword, model }),

  // 클립보드 기록
  loadClipboardRecords: (isLogin) =>
    ipcRenderer.invoke("load-clipboard-records", isLogin),

  // 삭제
  deleteItem: (dataId, deleteOption) =>
    ipcRenderer.invoke("delete-item", { dataId, deleteOption }),

  // 설정
  updateSettings: (settings) => ipcRenderer.invoke("update-settings", settings),

  getSettings: () => ipcRenderer.invoke("get-settings"),

  // 클라우드
  uploadSelectedItems: (itemIds) =>
    ipcRenderer.invoke("upload-selected-items", itemIds),
  // downloadSelectedItems: (itemIds) =>
  //     ipcRenderer.invoke("download-selected-items", itemIds),

  onCloudUploadStatusChange: (callback) =>
    ipcRenderer.on("clipboard-upload-status", (_, status) => callback(status)),

  toggleCloudUpload: () => ipcRenderer.send("toggle-cloud-upload"),

  // 초기 동기화 완료 알림
  onInitialSyncComplete: (callback) =>
    ipcRenderer.on("initial-sync-complete", (_, payload) => callback(payload)),
  offInitialSyncComplete: (callback) =>
    ipcRenderer.removeListener("initial-sync-complete", callback),

  // 실시간 동기화 알림 (다른 디바이스에서 변경)
  onSyncNotification: (callback) =>
    ipcRenderer.on("sync-notification", (_, data) => callback(data)),
  offSyncNotification: (callback) =>
    ipcRenderer.removeListener("sync-notification", callback),

  // 클라우드 데이터 삭제 알림 (로그아웃 시)
  onCloudDataCleared: (callback) =>
    ipcRenderer.on("cloud-data-cleared", () => callback()),
  offCloudDataCleared: (callback) =>
    ipcRenderer.removeListener("cloud-data-cleared", callback),

  // 업로드 성공/실패 알림
  onUploadSuccess: (callback) =>
    ipcRenderer.on("upload-success", (_, data) => callback(data)),
  offUploadSuccess: (callback) =>
    ipcRenderer.removeListener("upload-success", callback),

  onUploadFailed: (callback) =>
    ipcRenderer.on("upload-failed", (_, data) => callback(data)),
  offUploadFailed: (callback) =>
    ipcRenderer.removeListener("upload-failed", callback),

  // 아이템 업데이트 알림
  onItemUpdated: (callback) =>
    ipcRenderer.on("item-updated", (_, data) => callback(data)),
  offItemUpdated: (callback) =>
    ipcRenderer.removeListener("item-updated", callback),
});
