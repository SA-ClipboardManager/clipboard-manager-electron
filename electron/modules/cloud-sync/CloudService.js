// modules/cloud-sync/CloudService.js
// CommonJS

const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const WebSocket = require("ws");

const { ICloudService } = require("../interfaces/ICloudService");
const { ILocalRepository } = require("../interfaces/ILocalRepository");
const CCDError = require("../shared/errors/CCDError");

// 토큰 관리를 위한 안전한 로컬 저장소 유틸리티 필요
const TOKEN_STORAGE = { accessToken: null, refreshToken: null };

const MAX_RETRIES = 5;

/**
 * ICloudService 인터페이스를 구현하는 실제 통신 서비스
 * @implements {ICloudService}
 */
class CloudService extends ICloudService {
  /**
   * @param {ILocalRepository} repository - 재시도 상태 업데이트 및 Outbox 관리를 위한 로컬 저장소.
   * @param {object} config - 초기 설정 객체 { apiBaseURL, authToken, refreshToken }
   */
  constructor(repository, config) {
    super();
    this.repository = repository;
    this.apiBaseURL = config.apiBaseURL;
    this.tokenStorage = TOKEN_STORAGE; // 전역 토큰 저장소 사용 가정
    this.socketClient = null;
    this.isRefreshing = false;
    this.refreshSubscribers = [];

    this.axiosInstance = this._setupAxiosInstance();
  }

  // --- 초기화 및 인증 관리 ---

  _setupAxiosInstance() {
    const instance = axios.create({
      baseURL: this.apiBaseURL,
      headers: { "Content-Type": "application/json" },
    });

    // 1. 요청 인터셉터 (Bearer 토큰 추가)
    instance.interceptors.request.use(
      (config) => {
        if (this.tokenStorage.accessToken) {
          config.headers.Authorization = `Bearer ${this.tokenStorage.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 2. 응답 인터셉터 (401 토큰 갱신 로직)
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        // 기존 코드의 401 및 토큰 갱신 로직 그대로 사용
        if (error.response?.status === 401 && !originalRequest._retry) {
          // ... (기존 코드의 토큰 갱신 처리 로직) ...
          // 로직이 길므로 생략하지만, 기존 CloudDataModule의 인터셉터 로직을 사용합니다.

          if (this.isRefreshing) {
            // 대기 로직
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newTokens = await this.refreshAccessToken();
            this.updateTokenStorage(newTokens); // 갱신된 토큰 저장
            // ... 구독자 알림 및 재시도 로직 ...
            originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`;
            return instance(originalRequest);
          } catch (refreshError) {
            // 토큰 갱신 실패 시 로그아웃
            this.logout();
            throw CCDError.create("E610", {
              module: "CloudService",
              context: "토큰 갱신 실패",
              message: "세션이 만료되었습니다. 다시 로그인 해주세요.",
            });
          } finally {
            this.isRefreshing = false;
          }
        }
        return Promise.reject(error);
      }
    );
    return instance;
  }

  // ------------------- ICloudService 메서드 구현 -------------------

  /**
   * @inheritdoc
   */
  updateTokenStorage(tokens) {
    this.tokenStorage.accessToken = tokens.access_token;
    this.tokenStorage.refreshToken = tokens.refresh_token;
    // 실제 앱에서는 여기서 안전한 로컬 저장소(electron-store 등)에 저장해야 합니다.
  }

  /**
   * @inheritdoc
   */
  async login(credentials) {
    try {
      const response = await axios.post(
        `${this.apiBaseURL}/login`,
        credentials
      );

      // 토큰 저장 및 반환
      this.updateTokenStorage(response.data);
      return response.data;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "CloudService",
        context: "로그인 요청 실패",
        message: error.response?.data?.detail || "로그인 실패",
      });
    }
  }
  /**
   * @inheritdoc
   */
  async fetchInitialMetadata() {
    const config = await this.repository.getConfig();
    const lastSyncTime = config.last_modified || 0;

    const url = `/sync/initial-metadata`;

    try {
      // 1. 서버에 마지막 동기화 시간 이후의 메타데이터 요청
      const response = await this.axiosInstance.get(url, {
        params: { last_sync_time: lastSyncTime },
      });

      const { items, new_last_modified } = response.data;

      if (!items || items.length === 0) {
        console.log("No new metadata to sync.");
        return new_last_modified || lastSyncTime;
      }

      console.log(
        `[Sync] Received ${items.length} new metadata items. Starting bulk thumbnail download.`
      );

      // 2. 메타데이터와 썸네일 다운로드 및 DB 삽입을 트랜잭션으로 묶기
      await this.repository.db.transaction(async () => {
        const thumbnailDownloadPromises = [];

        for (const item of items) {
          const clipData = this._transformServerToLocalClip(item);
          const imageMeta = item.image_meta
            ? this._transformServerToLocalMeta(item.image_meta)
            : null;

          // A. 로컬 DB 삽입 (메타데이터)
          this.repository.insertSyncedItemDirectly(clipData, imageMeta);

          // B. 태그 연결
          for (const tag of item.tags) {
            this.repository.insertTagAndConnect(
              clipData.id,
              { name: tag.name, source: tag.source },
              tag.tag_id
            );
          }

          // C. 썸네일 즉시 다운로드 예약 (비동기)
          if (imageMeta && imageMeta.thumbnail_path) {
            thumbnailDownloadPromises.push(
              this._downloadThumbnailAndSave(
                item.id,
                imageMeta.thumbnail_path, // 로컬 저장 경로
                item.image_meta.thumbnail_url // 서버 다운로드 URL
              )
            );
          }
        }

        // 3. 모든 썸네일 다운로드 완료 대기
        await Promise.allSettled(thumbnailDownloadPromises);

        // 4. 로컬 설정 업데이트
        await this.repository.updateConfig({
          last_modified: new_last_modified,
        });
      })(); // 트랜잭션 실행

      return new_last_modified;
    } catch (error) {
      throw CCDError.create("E702", {
        module: "CloudService",
        context: "초기 메타데이터 및 썸네일 동기화 실패",
        message: error.message,
        cause: error,
      });
    }
  }

  /**
   * 썸네일 파일을 서버에서 다운로드하고 로컬 파일 시스템에 저장합니다.
   * @private
   * @param {string} id - 클립 ID.
   * @param {string} localPath - 로컬 저장 경로.
   * @param {string} serverUrl - 서버 다운로드 URL.
   * @returns {Promise<void>}
   */
  async _downloadThumbnailAndSave(id, localPath, serverUrl) {
    try {
      // 썸네일 URL은 상대 경로일 수 있으므로 API Base URL과 결합
      const fullUrl = `${this.apiBaseURL}${serverUrl}`;

      // 1. 서버에 썸네일 파일을 바이너리 형태로 요청
      const response = await this.axiosInstance.get(fullUrl, {
        responseType: "arraybuffer", // 바이너리 데이터를 받아옴
      });

      // 2. ImageProcessor를 사용하여 로컬 파일 시스템에 저장 (파일 I/O 책임 분리)
      await this.imageProcessor.saveFile(localPath, response.data);
    } catch (error) {
      console.error(
        `[Thumbnail Download Failed] ID: ${id}, URL: ${serverUrl}`,
        error
      );
      // 썸네일 다운로드 실패는 치명적이지 않으므로, 오류를 다시 throw하지 않고 로깅만 합니다.
      // CleanupService가 나중에 썸네일 누락을 감지하고 재생성할 것입니다.
    }
  }

  /**
   * @inheritdoc
   */
  async refreshAccessToken() {
    try {
      const response = await axios.post(`${this.apiBaseURL}/refresh`, {
        refresh_token: this.tokenStorage.refreshToken,
      });
      return response.data; // { access_token, refresh_token } 반환
    } catch (error) {
      throw CCDError.create("E610", {
        module: "CloudService",
        context: "토큰 갱신",
        message: "토큰 갱신 실패",
        details: error.response?.data,
      });
    }
  }

  /**
   * @inheritdoc
   */
  async uploadSyncEvents(pendingItems) {
    const payload = pendingItems.map((item) => ({
      operation: item.op,
      data_id: item.data_id,
      args: JSON.parse(item.op_args),
      correlation_id: `${item.data_id}-${item.created_at}`,
      local_outbox_id: item.id,
    }));

    const url = `/sync/events`; // axiosInstance 사용 시 상대 경로

    try {
      const response = await this.axiosInstance.post(url, payload);

      // 1. 태그 ID 매핑 정보 처리 (핵심 동기화 로직)
      const tagMappings = response.data.tag_mappings || [];

      if (tagMappings.length > 0) {
        for (const mapping of tagMappings) {
          // LocalRepository의 updateTagId 호출하여 로컬 DB에 서버 ID 확정
          await this.repository.updateTagId(
            mapping.local_id, // 로컬 ID
            mapping.server_id // 서버 확정 tag_id
          );
        }
      }

      // 성공 시, 서버 응답 데이터 전체를 반환하여 호출 측(CloudSyncModule)이 추가 처리를 하도록 함
      return response.data;
    } catch (error) {
      // 통신 실패 또는 HTTP 오류 발생 시 Exponential Backoff 적용
      await this._applyExponentialBackoff(pendingItems, error);
      return null; // 실패 시 null 반환
    }
  }

  /**
   * @inheritdoc
   */
  async uploadImage(id, filePath, format, created_at) {
    // 기존 코드의 uploadImage 로직 그대로 사용
    if (!fs.existsSync(filePath)) {
      // ... error handling
    }
    try {
      // ... FormData 구성 및 axiosInstance.post("/items/image", ...) 호출
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);

      formData.append("file", fileStream);
      formData.append("id", id);
      formData.append("format", format);
      formData.append("created_at", created_at);

      const response = await this.axiosInstance.post("/items/image", formData, {
        headers: formData.getHeaders(),
      });
      return response.data;
    } catch (error) {
      // ... error handling
    }
  }

  /**
   * @inheritdoc
   */
  async searchByCLIP(keyword) {
    // 기존 코드의 searchByCLIP 로직 그대로 사용
    try {
      const response = await this.axiosInstance.post("/search-text", {
        query: keyword,
      });
      return response.data.ids || [];
    } catch (error) {
      // ... error handling
    }
  }

  /**
   * @private
   * 서버 통신 실패 시 Exponential Backoff를 적용합니다.
   * (LocalRepository의 updatePendingSyncRetry 메서드 호출 필요)
   */
  async _applyExponentialBackoff(failedItems, error) {
    // ... (이전 답변에서 정의된 Exponential Backoff 로직 사용) ...
    const nowInSeconds = Math.floor(Date.now() / 1000);

    for (const item of failedItems) {
      const newRetryCount = item.retry_count + 1;

      if (newRetryCount > MAX_RETRIES) {
        console.error(
          `[Backoff] Item ${item.data_id} failed after max retries (${MAX_RETRIES}).`
        );
        continue;
      }

      const delaySeconds = Math.pow(2, newRetryCount) * 5; // 예시: 5s, 10s, 20s...
      const nextAttemptAt = nowInSeconds + delaySeconds;

      await this.repository.updatePendingSyncRetry(
        item.id,
        newRetryCount,
        nextAttemptAt
      );
    }

    throw CCDError.create("E701", {
      module: "CloudService",
      context: "클라우드 동기화 요청 실패",
      message: `재시도 로직 적용됨: ${error.message}`,
      cause: error,
    });
  }
  /**
   * WebSocket 연결을 시작하고 실시간 메시지 수신을 설정합니다.
   * @inheritdoc
   * @param {string} userId - 현재 로그인된 사용자 ID.
   * @param {Function} onMessageCallback - 렌더러 프로세스에 알릴 콜백 함수 (notifyRenderer).
   */
  initWebSocket(userId, onMessageCallback) {
    if (this.socketClient && this.socketClient.readyState === WebSocket.OPEN) {
      console.log("[WebSocket] 이미 연결됨");
      return;
    }

    // WebSocket URL 구성 (http/https 대신 ws/wss 사용)
    const wsUrl = `${this.apiBaseURL.replace(/^http/, "ws")}/ws/${userId}`;

    try {
      this.socketClient = new WebSocket(wsUrl);
      console.log(`[WebSocket] 연결 시도: ${wsUrl}`);

      this.socketClient.on("open", () => {
        console.log("[WebSocket] 연결 성공");
      });

      this.socketClient.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.handleWebSocketMessage(parsed);
          if (onMessageCallback) onMessageCallback(parsed);
        } catch (err) {
          console.error("[WebSocket] 수신 메시지 파싱 실패:", err);
        }
      });

      this.socketClient.on("close", () => {
        console.log("[WebSocket] 연결 종료됨");
        this.socketClient = null;
        // 연결 종료 시 로컬 캐시를 무효화하고 UI 업데이트를 트리거하여
        // 다음 접속 시 동기화 누락을 방지합니다. (로컬 데이터 모듈에 의존)
        this.repository.invalidateCache();
        onMessageCallback({ event: "connection_closed" });
      });

      this.socketClient.on("error", (err) => {
        console.error("[WebSocket] 오류 발생:", err);
        // 오류 발생 시 연결을 명시적으로 닫아 재연결을 유도할 수 있습니다.
        this.closeWebSocket();
      });
    } catch (error) {
      throw CCDError.create("E703", {
        module: "CloudService",
        context: "WebSocket 연결 초기화 실패",
        message: error.message,
      });
    }
  }

  /**
   * WebSocket 연결 해제
   */
  closeWebSocket() {
    if (this.socketClient && this.socketClient.readyState === WebSocket.OPEN) {
      this.socketClient.close(1000, "User Logout/App Close");
      console.log("[WebSocket] 연결 수동 종료");
    }
    this.socketClient = null;
  }

  /**
   * WebSocket 메시지 처리 (서버에서 클라이언트로의 Downstream 동기화)
   * @param {object} msg - 서버로부터 수신된 JSON 메시지
   */
  handleWebSocketMessage(msg) {
    switch (msg.event) {
      case "tag_id_confirmed":
        // 태그 ID 확정 이벤트 수신
        console.log(`[WS] Tag ID 확정: ${msg.local_id} -> ${msg.server_id}`);
        // **LocalRepository를 통해 DB 업데이트**
        this.repository.updateTagId(msg.local_id, msg.server_id);
        break;

      case "item_added":
      case "item_deleted":
        // 다른 기기에서 항목이 추가/삭제된 이벤트 수신
        console.log(`[WS] 클라우드 변경 이벤트: ${msg.event}`);
        // 즉시 해당 항목의 메타데이터를 서버에서 가져와 로컬 DB를 업데이트하는
        // 소규모 동기화 로직 (fetchSingleItemMetadata)이 필요합니다.
        // 또는 간단하게 로컬 캐시를 무효화하고 UI 업데이트를 알립니다.
        this.repository.invalidateCache();
        break;

      default:
        console.warn("[WebSocket] 알 수 없는 이벤트:", msg.event);
    }
    // UI에 업데이트 필요함을 알리기 위해 onMessageCallback이 호출됨
  }
}

module.exports = { CloudService };
