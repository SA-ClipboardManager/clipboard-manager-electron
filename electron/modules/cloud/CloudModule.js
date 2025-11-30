// electron/modules/cloud/CloudModule.js
const { BrowserWindow } = require("electron");
const BaseModule = require("../../main/core/BaseModule");
const { makeFileUrl } = require("../../shared/utility/pathUtils");

class CloudModule extends BaseModule {
  constructor(services) {
    super(services, "cloud");

    // Single dependency
    this.cloudService = services.CloudService;
    this.syncCoordinator = services.SyncCoordinator;

    if (!this.cloudService) {
      console.error("[CloudModule] CloudService not initialized");
      return;
    }

    // Forward WebSocket events to renderer
    this._setupWebSocketForwarding();

    // Forward SyncCoordinator events to renderer
    this._setupSyncEventForwarding();
  }

  _transformItemPaths(item) {
    if (item.type === "img") {
      item.content = makeFileUrl(item.content);
      if (item.meta && item.meta.thumbnail_path) {
        item.meta.thumbnail_path = makeFileUrl(item.meta.thumbnail_path);
      }
    }
    return item;
  }

  _sendToRenderer(channel, data) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && win.webContents) {
      win.webContents.send(channel, data);
    }
  }

  _setupWebSocketForwarding() {
    const wsManager = this.cloudService.wsManager;

    wsManager.on("sync-notification", (data) => {
      console.log("[CloudModule] Sync notification from server:", data);

      const items = Array.isArray(data) ? data : [data];
      const transformedItems = items.map(this._transformItemPaths);

      this._sendToRenderer("sync-notification", transformedItems);
    });

    wsManager.on("item-updated", (data) => {
      console.log("[CloudModule] Item updated from server:", data);
      const transformedItem = this._transformItemPaths(data);
      this._sendToRenderer("item-updated", transformedItem);
    });

    // Forward connection state changes
    wsManager.on("connected", () => {
      this._sendToRenderer("ws-connected");
    });

    wsManager.on("disconnected", () => {
      this._sendToRenderer("ws-disconnected");
    });
  }

  _setupSyncEventForwarding() {
    this.syncCoordinator.on("upload-success", (data) => {
      console.log("[CloudModule] Upload success:", data.itemId);
      this._sendToRenderer("upload-success", data);
    });

    this.syncCoordinator.on("upload-failed", (data) => {
      console.log("[CloudModule] Upload failed:", data.itemId);
      this._sendToRenderer("upload-failed", data);
    });

    // 초기 동기화 완료 이벤트 전달
    if (this.cloudService && this.cloudService.on) {
      this.cloudService.on("initial-sync-complete", (data) => {
        this._sendToRenderer("initial-sync-complete", data);
      });
    }
  }

  async onReady() {
    // Check initial login state
    try {
      const state = await this.cloudService.authService.getLoginState();
      if (state.isLoggedIn && state.userId) {
        await this.cloudService.startRealtimeSync(state.userId);
        // The outbox will be processed automatically on login
      }
    } catch (error) {
      console.error("[CloudModule] Error checking initial login state:", error);
    }
  }

  registerIpcHandler(ipcMain) {
    ipcMain.handle("upload-selected-items", async (_, itemIds) => {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return { success: false, message: "No items selected for upload." };
      }

      try {
        console.log(
          `[CloudModule] Requesting priority upload for ${itemIds.length} items.`
        );
        for (const itemId of itemIds) {
          this.cloudService.requestUpload(itemId, true); // true for priority
        }

        // Immediately trigger processing for priority items
        this.syncCoordinator.processPendingUploads();

        return { success: true };
      } catch (error) {
        console.error("[CloudModule] Error requesting priority upload:", error);
        return { success: false, message: error.message };
      }
    });
  }

  async onUnload() {
    // Cleanup resources
    this.cloudService.wsManager.disconnect();
  }
}

module.exports = CloudModule;
