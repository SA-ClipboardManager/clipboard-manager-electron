export const closeWindow = () => {
  return window.electronAPI?.closeWindow?.();
};

export const loadClipboardRecords = async (opts) => {
  return window.electronAPI?.loadClipboardRecords?.(opts);
};

export const deleteItem = async (id, opts) => {
  return window.electronAPI?.deleteItem?.(id, opts);
};

export const toggleCloudUpload = async () => {
  return window.electronAPI?.toggleCloudUpload?.();
};

export const onClipboardUpdated = (handler) => {
  window.electronAPI?.onClipboardUpdated?.(handler);
};

export const offClipboardUpdated = (handler) => {
  window.electronAPI?.offClipboardUpdated?.(handler);
};

export const pasteItem = async (id) => {
  return window.electronAPI?.pasteItem?.(id);
};

export const uploadSelectedItems = async (ids) => {
  return window.electronAPI?.uploadSelectedItems?.(ids);
};

export const downloadSelectedItems = async (ids) => {
  return window.electronAPI?.downloadSelectedItems?.(ids);
};

export const loginUser = async (id, pw) => {
  return window.electronAPI?.loginUser?.(id, pw);
};

export const logoutUser = async () => {
  return window.electronAPI?.logoutUser?.();
};

export const registerUser = async (id, pw) => {
  return window.electronAPI?.registerUser?.(id, pw);
};

export const onCloudUploadStatusChange = (handler) => {
  window.electronAPI?.onCloudUploadStatusChange?.(handler);
};

export const searchKeyword = async (keyword, model) => {
  return window.electronAPI?.searchKeyword?.(keyword, model);
};

// 초기 동기화 완료 이벤트
export const onInitialSyncComplete = (handler) => {
  window.electronAPI?.onInitialSyncComplete?.(handler);
};
export const offInitialSyncComplete = (handler) => {
  window.electronAPI?.offInitialSyncComplete?.(handler);
};

// 실시간 동기화 알림 이벤트 (다른 디바이스에서 변경)
export const onSyncNotification = (handler) => {
  window.electronAPI?.onSyncNotification?.(handler);
};
export const offSyncNotification = (handler) => {
  window.electronAPI?.offSyncNotification?.(handler);
};

// 클라우드 데이터 삭제 알림 이벤트 (로그아웃 시)
export const onCloudDataCleared = (handler) => {
  window.electronAPI?.onCloudDataCleared?.(handler);
};
export const offCloudDataCleared = (handler) => {
  window.electronAPI?.offCloudDataCleared?.(handler);
};

// 업로드 성공/실패 이벤트
export const onUploadSuccess = (handler) => {
  window.electronAPI?.onUploadSuccess?.(handler);
};
export const offUploadSuccess = (handler) => {
  window.electronAPI?.offUploadSuccess?.(handler);
};

export const onUploadFailed = (handler) => {
  window.electronAPI?.onUploadFailed?.(handler);
};
export const offUploadFailed = (handler) => {
  window.electronAPI?.offUploadFailed?.(handler);
};

// 아이템 업데이트 이벤트
export const onItemUpdated = (handler) => {
  window.electronAPI?.onItemUpdated?.(handler);
};
export const offItemUpdated = (handler) => {
  window.electronAPI?.offItemUpdated?.(handler);
};
