// electron/modules/cloud/CloudModule.js
const { BrowserWindow } = require('electron');
const BaseModule = require('../../main/core/BaseModule');
const { makeFileUrl } = require('../../shared/utility/pathUtils');

class CloudModule extends BaseModule {
  constructor(services) {
    super(services, 'cloud');

    // Single dependency
    this.cloudService = services.CloudService;
    this.syncCoordinator = services.SyncCoordinator;
    this.dbContext = services.DatabaseContext; // DB 컨텍스트 주입

    if (!this.cloudService) {
      console.error('[CloudModule] CloudService not initialized');
      return;
    }

    // Forward WebSocket events to renderer
    this._setupWebSocketForwarding();

    // Forward SyncCoordinator events to renderer
    this._setupSyncEventForwarding();
  }

  _transformItemPaths(item) {
    if (item.type === 'img') {
      const contentUrl = makeFileUrl(item.content);
      if (contentUrl) {
        item.content = contentUrl;
      }
      if (item.meta && item.meta.thumbnail_path) {
        const thumbnailUrl = makeFileUrl(item.meta.thumbnail_path);
        if (thumbnailUrl) {
          item.meta.thumbnail_path = thumbnailUrl;
        }
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

    wsManager.on('sync-notification', async (data) => {
      // Extract item ID from either data.id or data.data_id
      const itemId = data.data_id || data.id;

      console.log(`[CloudModule] Sync notification received:`, {
        itemId,
        data_id: data.data_id,
        id: data.id,
        event: data.event,
        isProcessing: this.syncCoordinator.isItemProcessing(itemId),
      });

      // If an item is currently being uploaded by this client, its state will be
      // managed by the upload-success event, not by this general sync event.
      // Ignoring this prevents a race condition where this incomplete WS event
      // overwrites the local item meta before the upload is finished.
      if (itemId && this.syncCoordinator.isItemProcessing(itemId)) {
        console.log(`[CloudModule] ⚠️ IGNORING sync-notification for item currently being uploaded: ${itemId}`);
        return;
      }

      console.log('[CloudModule] Processing sync notification from server:', data);

      try {
        // data_id가 있는 경우 (crud:imgSave_success, crud:txtSave_success 등)
        if (data.data_id) {
          // 서버에서 해당 아이템의 전체 정보를 다시 조회
          const response = await this.cloudService.uploadClient.get(`/api/v1/clipboard/${data.data_id}`);
          const fullItem = response.data;

          // 전체 정보로 저장
          await this.cloudService._saveRemoteItemToLocal(fullItem);
          console.log('[CloudModule] Item saved to local DB:', data.data_id);

          // Renderer에 알림 전송하여 UI 갱신
          this._sendToRenderer('sync-notification', fullItem);
        } else {
          // 기존 로직 (전체 아이템 정보가 포함된 경우)
          await this.cloudService._saveRemoteItemToLocal(data);
          console.log('[CloudModule] Item saved to local DB:', data.id);

          this._sendToRenderer('sync-notification', data);
        }
      } catch (error) {
        console.error('[CloudModule] Failed to save synced item:', error);
      }
    });

    wsManager.on('item-updated', (data) => {
      console.log('[CloudModule] Item updated from server:', data);
      const transformedItem = this._transformItemPaths(data);
      this._sendToRenderer('item-updated', transformedItem);
    });

    // 태깅 결과 수신 시 로컬 DB에 태그 저장
    try {
      const TaggingSync = require('./TaggingSync');
      const taggingSync = new TaggingSync(this.dbContext);
      wsManager.on('tagging-result', ({ dataId, tags }) => {
        try {
          taggingSync.handleTaggingResult({ dataId, tags });
          this._sendToRenderer('tagging-result', { dataId, tags });
        } catch (e) {
          console.error('[CloudModule] Failed to persist tagging-result:', e);
        }
      });
    } catch (e) {
      console.error('[CloudModule] TaggingSync setup failed:', e);
    }

    // Forward connection state changes
    wsManager.on('connected', () => {
      this._sendToRenderer('ws-connected');
    });

    wsManager.on('disconnected', () => {
      this._sendToRenderer('ws-disconnected');
    });
  }

  _setupSyncEventForwarding() {
    this.syncCoordinator.on('upload-success', (data) => {
      console.log('[CloudModule] Upload success:', data.itemId);
      console.log('[CloudModule] Upload success data:', JSON.stringify(data, null, 2));

      if (!data.item) {
        console.error('[CloudModule] ⚠️ WARNING: data.item is missing in upload-success event!');
      } else {
        console.log('[CloudModule] Transforming item paths...');
        data.item = this._transformItemPaths(data.item);
        console.log('[CloudModule] Transformed item:', JSON.stringify(data.item, null, 2));
      }

      console.log('[CloudModule] Sending upload-success to renderer...');
      this._sendToRenderer('upload-success', data);
    });

    this.syncCoordinator.on('upload-failed', (data) => {
      console.log('[CloudModule] Upload failed:', data.itemId);
      // Error 객체는 직렬화할 수 없으므로 message만 추출
      const serializableData = {
        itemId: data.itemId,
        error: data.error?.message || data.error || 'Unknown error',
      };
      this._sendToRenderer('upload-failed', serializableData);
    });

    // 초기 동기화 완료 이벤트 전달
    if (this.cloudService && this.cloudService.on) {
      this.cloudService.on('initial-sync-complete', (data) => {
        this._sendToRenderer('initial-sync-complete', data);
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
      console.error('[CloudModule] Error checking initial login state:', error);
    }
  }

  registerIpcHandler(ipcMain) {
    ipcMain.handle('upload-selected-items', async (_, itemIds) => {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return { success: false, message: 'No items selected for upload.' };
      }

      try {
        console.log(`[CloudModule] Requesting priority upload for ${itemIds.length} items.`);
        for (const itemId of itemIds) {
          this.cloudService.requestUpload(itemId, true); // true for priority
        }

        // Immediately trigger processing for priority items
        this.syncCoordinator.processPendingUploads();

        return { success: true };
      } catch (error) {
        console.error('[CloudModule] Error requesting priority upload:', error);
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
