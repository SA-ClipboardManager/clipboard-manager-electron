// src/main/modules/cloud/CloudService.js
const fs = require("fs");
const FormData = require("form-data");
const WebSocket = require("ws");
const CCDError = require("../../shared/errors/CCDError");
const { createHttpClient } = require("../../shared/utility/HttpClient");

class CloudService {
  /**
   * @param {import('../../infrastructure/repositories/SyncRepository')} repository
   * @param {object} dependencies
   * @param {import('../auth/AuthService').AuthService} dependencies.authService
   * @param {import('../auth/TokenStorage').TokenStorage} dependencies.tokenStorage
   * @param {import('../../shared/utils/ImageProcessor')} dependencies.imageProcessor
   * @param {string} dependencies.apiBaseURL
   */
  constructor(repository, dependencies) {
    this.repository = repository;
    this.authService = dependencies.authService;
    this.tokenStorage = dependencies.tokenStorage;
    this.imageProcessor = dependencies.imageProcessor;
    this.apiBaseURL = dependencies.apiBaseURL;

    // WebSocket 상태
    this.socketClient = null;

    // 토큰 갱신 상태 관리 (Mutex 역할)
    this.isRefreshing = false;
    this.refreshSubscribers = [];

    // Axios 인스턴스 설정
    this.axiosInstance = this._setupAxiosInstance();
  }

  /**
   * Axios 인터셉터 설정 (Auth Token 주입 및 갱신 로직)
   * @private
   */
  _setupAxiosInstance() {
    const instance = createHttpClient(this.apiBaseURL);

    // Request Interceptor: 토큰 주입
    instance.interceptors.request.use(
      (config) => {
        const token = this.tokenStorage.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response Interceptor: 401 처리 (토큰 갱신)
    instance.interceptors.response.use(
      (response) => response,
      (error) => this._handleAuthError(error, instance)
    );

    return instance;
  }

  /**
   * 401 에러 처리 및 토큰 갱신 재시도 로직
   */
  async _handleAuthError(error, instance) {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (this.isRefreshing) {
      // 이미 갱신 중이면 큐에 대기
      return new Promise((resolve, reject) => {
        this.refreshSubscribers.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return instance(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    this.isRefreshing = true;

    try {
      // AuthService를 통해 토큰 갱신 (순환 참조 없이 주입된 인스턴스 사용)
      const tokens = await this.authService.refreshAccessToken();

      this._resolveRefreshQueue(null, tokens.accessToken);
      originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return instance(originalRequest);
    } catch (refreshError) {
      this._resolveRefreshQueue(refreshError);
      await this.authService.logout();
      throw CCDError.create("E610", {
        module: "CloudService",
        context: "토큰 갱신 실패",
        message: "세션이 만료되었습니다. 다시 로그인 해주세요.",
        cause: refreshError,
      });
    } finally {
      this.isRefreshing = false;
    }
  }

  _resolveRefreshQueue(error, token) {
    while (this.refreshSubscribers.length) {
      const subscriber = this.refreshSubscribers.shift();
      if (error) subscriber.reject(error);
      else subscriber.resolve(token);
    }
  }

  /**
   * 초기 메타데이터 동기화 (Downstream)
   */
  async fetchInitialMetadata() {
    // SyncRepository를 통해 마지막 동기화 시간 조회
    const config = await this.repository.getConfig();
    const lastSyncTime = config.last_modified || 0;

    const url = `/api/v1/clipboard-data`;

    try {
      const response = await this.axiosInstance.get(url, {
        params: { last_sync_time: lastSyncTime },
      });

      const { items, new_last_modified } = response.data;

      if (!items || items.length === 0) {
        return new_last_modified || lastSyncTime;
      }

      console.log(`[Sync] Received ${items.length} new items.`);

      const thumbnailDownloads = [];

      // SyncRepository의 트랜잭션 처리 메서드 호출
      // (items 배열을 넘겨서 Repository 내부에서 일괄 처리하도록 위임)
      await this.repository.processDownstreamSync(items, async (item) => {
        // 썸네일이 필요한 경우 다운로드 예약 (Callback 방식 활용)
        if (item.image_meta && item.image_meta.thumbnail_url) {
          thumbnailDownloads.push(
            this._downloadThumbnailAndSave(
              item.id,
              item.image_meta.thumbnail_path,
              item.image_meta.thumbnail_url
            )
          );
        }
      });

      // 썸네일 다운로드 병렬 처리
      await Promise.allSettled(thumbnailDownloads);

      // 동기화 시간 업데이트
      await this.repository.updateConfig({ last_modified: new_last_modified });

      return new_last_modified;
    } catch (error) {
      throw CCDError.create("E702", {
        module: "CloudService",
        context: "초기 동기화 실패",
        message: error.message,
        cause: error,
      });
    }
  }

  /**
   * 썸네일 다운로드 및 저장
   */
  async _downloadThumbnailAndSave(id, localPath, serverUrl) {
    try {
      const fullUrl = `${this.apiBaseURL}${serverUrl}`;
      const response = await this.axiosInstance.get(fullUrl, {
        responseType: "arraybuffer",
      });

      // 주입받은 ImageProcessor 사용
      await this.imageProcessor.saveFile(localPath, response.data);
    } catch (error) {
      console.error(`[Thumbnail] Download failed for ${id}`, error);
    }
  }
  /**
   * 선택된 아이템 ID들을 동기화 대상으로 지정하고 즉시 업로드 시도
   * @param {string[]} itemIds
   */
  async uploadSpecificItems(itemIds) {
    try {
      // 1. 해당 아이템들을 클라우드 동기화 대상(is_cloud_item=1)으로 마킹하고 Outbox에 추가
      for (const id of itemIds) {
        await this.repository.markAsCloudItem(id);
      }
      const pendingItems = await this.repository.getPendingEvents();
      return await this.uploadSyncEvents(pendingItems);
    } catch (error) {
      throw CCDError.create("E653", {
        module: "CloudService",
        context: "uploadSpecificItems",
        message: error.message,
        cause: error,
      });
    }
  }

  async uploadSyncEvents(pendingItems) {
    if (!pendingItems || pendingItems.length === 0) return null;

    // 0. 이미지 업로드 전처리 (Filter: INSERT operation AND image type)
    const imageUploads = pendingItems
      .filter(
        (item) =>
          item.op === "INSERT" && JSON.parse(item.op_args).type === "img"
      )
      .map((item) => this._uploadImageFile(JSON.parse(item.op_args)));

    try {
      // [필수] 모든 파일 업로드가 성공할 때까지 대기
      await Promise.all(imageUploads);

      // 1. 모든 파일이 성공적으로 서버에 올라갔다면, 메타데이터 JSON 페이로드 구성 및 전송
      const payload = pendingItems.map((item) => ({
        operation: item.op,
        data_id: item.data_id,
        args: JSON.parse(item.op_args),
        correlation_id: `${item.data_id}-${item.created_at}`,
        local_outbox_id: item.id,
      }));

      const response = await this.axiosInstance.post("/sync/events", payload);
      // ... (나머지 로직 동일)

      await this.repository.handleSyncResponse(tag_mappings, pendingItems);
      return response.data;
    } catch (error) {
      // 파일 업로드(Promise.all) 중 하나라도 실패하면 catch 블록으로 이동
      // 이 실패는 Backoff 재시도 로직이 처리합니다.
      await this._applyExponentialBackoff(pendingItems, error);
      return null;
    }
  }
  // === src/main/modules/cloud/CloudService.js 내부에 추가 ===

  /**
   * 로컬에 저장된 이미지 파일을 서버의 /api/v1/items/image 엔드포인트로 전송
   * @param {object} itemArgs - Outbox args에 담긴 클립보드 아이템 데이터
   */
  async _uploadImageFile(itemArgs) {
    const { id, format, created_at, content } = itemArgs; // content는 로컬 파일 경로

    if (!fs.existsSync(content)) {
      console.warn(
        `[Upload] Image file not found locally for ID ${id}. Skipping file upload.`
      );
      return;
    }

    // 1. FormData 구성
    const formData = new FormData();
    formData.append("id", id);
    formData.append("format", format);
    formData.append("created_at", created_at);

    // 2. 파일 스트림 추가 (Form-Data에 파일 첨부)
    formData.append("file", fs.createReadStream(content), {
      filename: `${id}.${format.toLowerCase()}`,
      contentType: `image/${format.toLowerCase()}`,
    });

    try {
      const url = "/api/v1/items/image";

      // 3. 파일 업로드 요청
      // FormData를 사용할 때 headers에 Content-Type: multipart/form-data와 boundary를 설정해야 합니다.
      // Axios는 FormData 객체를 사용하면 자동으로 처리해주지만, 명시적으로 headers를 넘겨줍니다.
      const response = await this.axiosInstance.post(url, formData, {
        headers: {
          ...formData.getHeaders(), // FormData가 생성한 Content-Type/Boundary 헤더 주입
          // Authorization 헤더는 인터셉터가 자동으로 추가함
        },
        maxBodyLength: Infinity, // 대용량 파일 전송을 위해 필요할 수 있음
        maxContentLength: Infinity,
      });

      console.log(`[Upload] Image file for ID ${id} uploaded successfully.`);
      return response.data; // 서버에서 받은 URL이나 메타데이터 포함 가능
    } catch (error) {
      // 4xx 에러가 나면 서버에 데이터가 없으므로 재시도 불필요
      if (error.response?.status >= 400 && error.response.status < 500) {
        console.error(
          `[Upload Failed] ${id}: Check server response.`,
          error.response.data
        );
      }
      // 재시도 로직은 uploadSyncEvents의 Backoff가 처리하게 됩니다.
      throw error;
    }
  }

  async _applyExponentialBackoff(failedItems, error) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const MAX_RETRIES = 5;

    for (const item of failedItems) {
      const newRetryCount = (item.retry_count || 0) + 1;
      if (newRetryCount > MAX_RETRIES) continue;

      const delay = Math.pow(2, newRetryCount) * 5;
      await this.repository.updatePendingSyncRetry(
        item.id,
        newRetryCount,
        nowInSeconds + delay
      );
    }

    console.error(`[Sync] Upload failed. Backoff applied.`, error.message);
  }

  /**
   * WebSocket 초기화
   */
  initWebSocket(userId, onMessageCallback) {
    if (this.socketClient?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${this.apiBaseURL.replace(/^http/, "ws")}/ws/${userId}`;

    try {
      this.socketClient = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.tokenStorage.getAccessToken()}`,
        },
      });

      this.socketClient.on("open", () => console.log("[WS] Connected"));
      this.socketClient.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this._handleWebSocketMessage(parsed);
          if (onMessageCallback) onMessageCallback(parsed);
        } catch (e) {
          console.error("[WS] Parse error", e);
        }
      });
      this.socketClient.on("close", () => {
        this.socketClient = null;
        if (onMessageCallback)
          onMessageCallback({ event: "connection_closed" });
      });
    } catch (error) {
      console.error("[WS] Init failed", error);
    }
  }

  _handleWebSocketMessage(msg) {
    if (msg.event === "tag_id_confirmed") {
      this.repository
        .updateTagId(msg.local_id, msg.server_id)
        .catch((e) => console.error("[WS] Tag update failed", e));
    }
  }

  closeWebSocket() {
    if (this.socketClient) {
      this.socketClient.close();
      this.socketClient = null;
    }
  }
}

module.exports = { CloudService };
