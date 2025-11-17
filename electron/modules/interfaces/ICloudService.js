// modules/core/ICloudService.js
// CommonJS

/**
 * @typedef {import('./ILocalRepository').PendingSyncItem} PendingSyncItem
 * @typedef {object} AuthToken
 * @property {string} accessToken
 * @property {string} refreshToken
 */

/**
 * 클라우드 서버와의 통신 규격 (인터페이스).
 * @interface ICloudService
 */
class ICloudService {
  // ------------------- 동기화 및 CRUD -------------------

  /**
   * Outbox에 쌓인 동기화 이벤트를 클라우드 서버에 전송하고, ID 매핑 정보를 받음.
   * @param {Array<PendingSyncItem>} pendingItems - 로컬 Outbox에서 조회된 이벤트 목록.
   * @returns {Promise<object | null>} 성공 시 서버 응답 데이터(tag_mappings 등) 또는 null. 실패 시 Backoff 적용됨.
   */
  async uploadSyncEvents(pendingItems) {
    throw new Error("Method must be implemented");
  }

  /**
   * 클립보드 항목을 삭제 (Outbox가 아닌 즉시 삭제 필요 시 사용)
   * @param {string} itemId
   * @returns {Promise<boolean>}
   */
  async deleteItem(itemId) {
    throw new Error("Method must be implemented");
  }

  /**
   * 이미지 파일을 클라우드에 업로드합니다.
   * @param {string} id
   * @param {string} filePath
   * @param {string} format
   * @param {number} created_at
   * @returns {Promise<object>} 업로드 결과 및 URL 정보.
   */
  async uploadImage(id, filePath, format, created_at) {
    throw new Error("Method must be implemented");
  }

  // ------------------- 사용자/검색/설정 -------------------

  /**
   * ID/PW를 사용하여 로그
   * @param {object} credentials - { email, password }
   * @returns {Promise<object>} 로그인 성공 응답 및 토큰 정보.
   */
  async login(credentials) {
    throw new Error("Method must be implemented");
  }

  /**
   * 로그인 성공 후 호출되며, 서버에서 로컬 DB에 없는 초기 메타데이터를 가져옵니다.
   * @returns {Promise<number>} 새로운 최종 동기화 시각 (Last Sync Time).
   */
  async fetchInitialMetadata() {
    throw new Error("Method must be implemented");
  }

  /**
   * ko-CLIP 기반의 텍스트 검색을 요청하고 클립 ID 목록을 받습니다.
   * @param {string} keyword - 검색어
   * @returns {Promise<string[]>} 클립 ID 배열.
   */
  async searchByCLIP(keyword) {
    throw new Error("Method must be implemented");
  }

  // ------------------- 토큰/WebSocket (인증 모듈과 연동) -------------------

  /**
   * 토큰 갱신을 시도합니다. (인터셉터에서 사용)
   * @returns {Promise<AuthToken>}
   */
  async refreshAccessToken() {
    throw new Error("Method must be implemented");
  }

  /**
   * WebSocket 연결을 시작합니다.
   * @param {string} userId
   * @param {Function} onMessageCallback
   */
  initWebSocket(userId, onMessageCallback) {
    throw new Error("Method must be implemented");
  }

  /**
   * 로컬 저장소에서 토큰 정보를 업데이트합니다. (AuthService에서 사용)
   * @param {object} tokens
   */
  updateTokenStorage(tokens) {
    throw new Error("Method must be implemented");
  }
}

module.exports = { ICloudService };
