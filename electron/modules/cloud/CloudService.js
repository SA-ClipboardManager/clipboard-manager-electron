const fs = require("fs-extra");
const path = require("path");
const FormData = require("form-data");
const { app } = require("electron");
const { EventEmitter } = require("events");
const CCDError = require("../../shared/errors/CCDError");

class CloudService extends EventEmitter {
  /**
   * @param {object} services
   * @param {import('../../infrastructure/repositories/OutboxRepository')} services.outboxRepo
   * @param {import('../../infrastructure/repositories/ClipboardRepository')} services.clipboardRepo
   * @param {import('./WebSocketManager')} services.wsManager
   * @param {import('../auth/AuthService')} services.authService
   * @param {import('axios').AxiosInstance} services.uploadClient
   * @param {string} services.apiBaseURL
   */
  constructor({
    outboxRepo,
    clipboardRepo,
    wsManager,
    authService,
    uploadClient,
    apiBaseURL,
  }) {
    super();
    this.outboxRepo = outboxRepo;
    this.clipboardRepo = clipboardRepo;
    this.wsManager = wsManager;
    this.authService = authService;
    this.uploadClient = uploadClient;
    this.apiBaseURL = apiBaseURL;

    // 이미지 저장 경로 (예: %APPDATA%/ccd-electron/images)
    this.imagesDir = path.join(app.getPath("userData"), "images");

    this._setupAuthListeners();
  }

  _setupAuthListeners() {
    this.authService.on("login-success", async (userId) => {
      console.log("[CloudService] Login detected.");

      // 1. 실시간 웹소켓 연결
      this.startRealtimeSync(userId);

      // 2. 초기 데이터(메타데이터 + 썸네일) 가져오기
      try {
        await this.fetchAndSyncMetadata();
      } catch (error) {
        console.error("[CloudService] Initial metadata sync failed:", error);
      }
    });

    this.authService.on("logout-success", () => {
      console.log("[CloudService] Logout detected. Disconnecting...");
      this.stopRealtimeSync();
    });
  }

  // =================================================================
  // Public API: UI 및 SyncCoordinator 호출용
  // =================================================================

  /**
   * [UI 호출] 사용자 업로드 요청 (Outbox에 이벤트만 등록)
   */
  async requestUpload(itemId, isPriority = false) {
    try {
      console.log(`[CloudService] Requesting upload for item: ${itemId}`);

      const item = await this.clipboardRepo.getById(itemId);
      if (!item) {
        throw new Error(`Item with ID ${itemId} not found locally.`);
      }

      // Outbox에 'UPLOAD' 이벤트 큐잉 (실제 수행은 SyncCoordinator가 담당)
      this.outboxRepo.createEvent(itemId, "UPLOAD", { isPriority });

      console.log(`[CloudService] Upload event queued for ${itemId}`);
    } catch (error) {
      console.error("[CloudService] Failed to queue upload request:", error);
      throw CCDError.create("E700", {
        module: "CloudService",
        context: "requestUpload",
        message: error.message,
      });
    }
  }

  /**
   * [SyncCoordinator 호출] 실제 서버 업로드 수행
   */
  async uploadItem(outboxItem) {
    const item = await this.clipboardRepo.getById(outboxItem.data_id);
    if (!item) {
      throw new Error(`Item with ID ${outboxItem.data_id} not found locally.`);
    }

    console.log(`[CloudService] Uploading item ${item.id} to server...`);

    const formData = new FormData();
    formData.append("id", item.id);
    formData.append("type", item.type);
    formData.append("format", item.format);
    // Unix Timestamp를 ISO String으로 변환
    formData.append(
      "created_at",
      new Date(item.createdAt * 1000).toISOString()
    );

    if (item.type === "txt") {
      formData.append("content", item.content);
    } else if (item.type === "img" && item.meta) {
      const imagePath = item.meta.file_path;
      if (await fs.pathExists(imagePath)) {
        formData.append("file", fs.createReadStream(imagePath));
      } else {
        throw new Error(`Image file missing at path: ${imagePath}`);
      }
    }

    // Axios 인스턴스(uploadClient) 사용
    const response = await this.uploadClient.post(
      "/api/v1/clipboard",
      formData,
      {
        headers: { ...formData.getHeaders() },
        timeout: 60000, // 대용량 업로드 고려 60초
      }
    );

    console.log(`[CloudService] Upload successful: ${item.id}`);
    return response.data;
  }

  /**
   * [초기 동기화] 서버 메타데이터 조회 및 로컬 동기화
   */
  async fetchAndSyncMetadata() {
    console.log("[CloudService] Fetching metadata from cloud...");

    // GET /api/v1/clipboard (페이징 없이 전체 혹은 최근 항목 조회라 가정)
    const response = await this.uploadClient.get("/api/v1/clipboard");
    const cloudItems = response.data;

    if (!Array.isArray(cloudItems) || cloudItems.length === 0) {
      console.log("[CloudService] No items found in cloud.");
      // 초기 동기화 완료 이벤트 (항목 0)
      this.emit("initial-sync-complete", { total: 0, synced: 0 });
      return;
    }

    console.log(
      `[CloudService] Received ${cloudItems.length} items. Syncing...`
    );

    // 폴더 확보
    await fs.ensureDir(this.imagesDir);

    let syncCount = 0;
    for (const remoteItem of cloudItems) {
      try {
        await this._saveRemoteItemToLocal(remoteItem);
        syncCount++;
      } catch (err) {
        console.error(
          `[CloudService] Failed to sync item ${remoteItem.id}:`,
          err
        );
      }
    }
    console.log(
      `[CloudService] Sync completed. (${syncCount}/${cloudItems.length})`
    );
    // 초기 동기화 완료 이벤트 발생
    this.emit("initial-sync-complete", {
      total: cloudItems.length,
      synced: syncCount,
    });
  }

  /**
   * [UI 호출] 원본 이미지 Lazy Loading (사용자가 클릭 시 호출)
   * @returns {Promise<string>} 로컬 파일 경로
   */
  async downloadOriginalImage(itemId) {
    const item = await this.clipboardRepo.getById(itemId);

    // 1. 이미 원본이 있으면 그 경로 반환
    if (
      item.meta &&
      item.meta.file_path &&
      (await fs.pathExists(item.meta.file_path))
    ) {
      return item.meta.file_path;
    }

    // 2. 다운로드 URL 확보 (API 호출 예시)
    console.log(`[CloudService] Downloading original image for ${itemId}...`);
    // API: GET /api/v1/clipboard/{id}/download (리다이렉트되거나 URL 반환)
    // 여기서는 스트림을 직접 받는다고 가정
    const downloadUrl = `/api/v1/clipboard/${itemId}/download`;

    const filename = `original_${itemId}.${item.format || "png"}`;
    const localPath = await this._downloadImage(downloadUrl, filename);

    // 3. 로컬 DB 업데이트 (file_path 채우기)
    // ClipboardRepository에 updateImagePaths 메서드가 필요합니다.
    await this.clipboardRepo.updateImagePaths(itemId, { file_path: localPath });

    return localPath;
  }

  // =================================================================
  // Private Helpers
  // =================================================================

  /**
   * 서버 아이템을 로컬 DB 구조로 변환 후 저장 (썸네일 다운로드 포함)
   */
  async _saveRemoteItemToLocal(remoteItem) {
    // Unix timestamp 변환 (서버가 ISO string을 준다고 가정)
    const createdAt = new Date(remoteItem.created_at).getTime() / 1000;

    const item = {
      id: remoteItem.id,
      type: remoteItem.type,
      format: remoteItem.format,
      content: remoteItem.content || "",
      createdAt: createdAt,
      isSynced: true,
    };

    let meta = null;
    if (remoteItem.type === "img" && remoteItem.image_meta) {
      let localThumbnailPath = "";

      // 1. 썸네일 우선 다운로드
      if (remoteItem.image_meta.thumbnail_url) {
        try {
          const filename = `thumb_${remoteItem.id}.jpg`;
          // full url이 아니라 상대경로라면 base url 붙여야 함
          const url = remoteItem.image_meta.thumbnail_url.startsWith("http")
            ? remoteItem.image_meta.thumbnail_url
            : `${this.apiBaseURL}${remoteItem.image_meta.thumbnail_url}`;

          localThumbnailPath = await this._downloadImage(url, filename);
        } catch (e) {
          console.warn(
            `[CloudService] Thumbnail download failed for ${remoteItem.id}`,
            e
          );
        }
      }

      meta = {
        width: remoteItem.image_meta.width,
        height: remoteItem.image_meta.height,
        file_size: remoteItem.image_meta.file_size,
        // ★ 중요: 원본 경로는 비워둠 (Lazy Loading)
        file_path: "",
        thumbnail_path: localThumbnailPath,
      };
    }

    // 로컬 DB 저장 (Outbox 이벤트 생성 안 함)
    await this.clipboardRepo.save(item, meta);
  }

  /**
   * 이미지 파일 다운로드 유틸리티
   */
  async _downloadImage(urlOrPath, filename) {
    const localPath = path.join(this.imagesDir, filename);

    // 캐싱: 이미 존재하면 다운로드 스킵
    if (await fs.pathExists(localPath)) {
      return localPath;
    }

    const response = await this.uploadClient.get(urlOrPath, {
      responseType: "stream",
    });

    const writer = fs.createWriteStream(localPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(localPath));
      writer.on("error", (err) => {
        // 실패 시 쓰다 만 파일 삭제
        fs.unlink(localPath).catch(() => {});
        reject(err);
      });
    });
  }

  // =================================================================
  // WebSocket Methods
  // =================================================================

  startRealtimeSync(userId) {
    // wsManager 내부에 isConnected 체크 로직이 있다고 가정하거나 여기서 체크
    const token = this.authService.getAccessToken();
    this.wsManager.connect(userId, token);
  }

  stopRealtimeSync() {
    this.wsManager.disconnect();
  }
}

module.exports = CloudService;
