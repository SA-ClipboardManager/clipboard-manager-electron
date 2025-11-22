/**
 * 클라우드 동기화 전용 인터페이스
 * @interface
 */
class ISyncRepository {
  /**
   * 대기 중인 동기화 이벤트(Outbox) 조회
   * @returns {Array<object>}
   */
  getPendingItems() {
    throw new Error("Not Implemented");
  }

  /**
   * 특정 항목을 클라우드 동기화 대상으로 마킹 (INSERT 이벤트 발생)
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async markAsCloudItem(id) {
    throw new Error("Not Implemented");
  }

  /**
   * 서버로부터 확정된 태그 ID 업데이트
   * @param {string} localId
   * @param {string} serverId
   */
  async updateTagId(localId, serverId) {
    throw new Error("Not Implemented");
  }

  /**
   * 재시도 카운트 및 다음 시도 시간 업데이트 (Backoff)
   * @param {string} id
   * @param {number} retryCount
   * @param {number} nextAttemptAt
   */
  updatePendingSyncRetry(id, retryCount, nextAttemptAt) {
    throw new Error("Not Implemented");
  }
}

module.exports = ISyncRepository;
