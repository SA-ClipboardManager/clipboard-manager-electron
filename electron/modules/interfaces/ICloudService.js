// modules/core/ICloudService.js (Core Module)
// CommonJS

/**
 * @typedef {import('./ILocalRepository').PendingSyncItem} PendingSyncItem
 * * CloudService가 서버와 통신하기 위한 데이터 전송 규격을 정의
 * @interface ICloudService
 */
class ICloudService {
  /**
   * Outbox에 쌓인 동기화 이벤트를 클라우드 서버에 전송
   * @param {Array<PendingSyncItem>} pendingItems - 로컬 Outbox에서 조회된 이벤트 목록.
   * @returns {Promise<boolean>} 서버가 모든 항목을 성공적으로 처리했는지 여부.
   */
  async uploadSyncEvents(pendingItems) {
    throw new Error("Method must be implemented");
  }

  /**
   * [구현 예정] 서버에서 로컬로 다운로드할 변경 사항을 요청합니다.
   * @param {number} lastSyncTime - 마지막 동기화 성공 시각 (Unix Timestamp).
   * @returns {Promise<object>} 서버 변경 사항 목록 및 새로운 lastSyncTime.
   */
  async fetchSyncChanges(lastSyncTime) {
    throw new Error("Method must be implemented");
  }
}

module.exports = { ICloudService };
