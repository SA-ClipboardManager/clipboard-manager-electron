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

export const saveDroppedWebImage = async (data) => {
  return window.electronAPI?.saveDroppedWebImage?.(data);
};

export const saveDroppedWebText = async (data) => {
  return window.electronAPI?.saveDroppedWebText?.(data);
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
