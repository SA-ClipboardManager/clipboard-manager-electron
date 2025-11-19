const electronApi = {
  loadClipboardRecords: async (force = false) => {
    return await window.electronAPI?.loadClipboardRecords?.(force);
  },

  uploadItems: async (itemIds = []) => {
    return await window.electronAPI?.uploadItems?.(itemIds);
  },

  onClipboardUpdated: (handler) => {
    if (!window.electronAPI?.onClipboardUpdated) return null;
    const unsub = window.electronAPI.onClipboardUpdated(handler);
    if (typeof unsub === 'function') return unsub;
    return () => window.electronAPI?.offClipboardUpdated?.(handler);
  },

  closeWindow: () => {
    return window.electronAPI?.closeWindow?.();
  },

  // deleteItem: async (itemId, option = 'both') => {
  //   return await window.electronAPI?.deleteItem?.(itemId, option);
  // },

  // pasteItem: async (itemId) => {
  //   return await window.electronAPI?.pasteItem?.(itemId);
  // },
};

export default electronApi;
