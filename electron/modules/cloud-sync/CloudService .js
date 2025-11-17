// modules/cloud-sync/CloudService.js (Cloud Sync Module)
// CommonJS

const { ICloudService } = require("../core/ICloudService");
const CCDError = require("../shared/errors/CCDError");
const { ILocalRepository } = require("../core/ILocalRepository");

const MAX_RETRIES = 5;

/**
 * ICloudService 인터페이스를 구현하며, 클라우드 서버와 통신
 * @implements {ICloudService}
 */
class CloudService extends ICloudService {
  /**
   * @param {ILocalRepository} repository - 재시도 상태 업데이트를 위한 로컬 저장소 의존성.
   * @param {string} apiBaseUrl - 클라우드 API 기본 URL.
   */
  constructor(repository, apiBaseUrl) {
    super();
    if (!(repository instanceof ILocalRepository)) {
      throw new Error(
        "CloudService requires an ILocalRepository implementation."
      );
    }
    this.repository = repository;
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * @inheritdoc
   */
  async uploadSyncEvents(pendingItems) {
    // Outbox 이벤트를 서버가 이해할 수 있는 페이로드로 변환
    const payload = pendingItems.map((item) => ({
      operation: item.op,
      data_id: item.data_id,
      args: JSON.parse(item.op_args),
      // 트랜잭션 추적을 위한 Correlation ID (data_id와 생성 시각 조합)
      correlation_id: `${item.data_id}-${item.created_at}`,
      local_outbox_id: item.id, // 서버가 응답을 매핑할 수 있도록 로컬 ID 포함
    }));

    const url = `${this.apiBaseUrl}/sync/events`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 인증 토큰 필요 시 여기에 추가
          // 'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(payload),
      });

      // 4xx 또는 5xx 오류 발생 시 (HTTP 에러)
      if (!response.ok) {
        // HTTP 상태 코드를 포함하여 오류 throw
        throw new Error(
          `HTTP Error ${response.status}: ${response.statusText}`
        );
      }

      const responseData = await response.json();

      // 1. 태그 ID 매핑 정보 추출
      const tagMappings = responseData.tag_mappings || [];

      // 2. 응답 데이터를 로컬 DB에 반영 (LocalRepository 의존)
      if (tagMappings.length > 0) {
        console.log(
          `[Sync] Received ${tagMappings.length} tag ID mappings from server. Applying updates.`
        );

        // 태그 ID 업데이트를 원자적으로 처리하기 위해 트랜잭션을 사용합니다.
        // LocalRepository에서 트랜잭션을 제공하지 않을 경우, 여러 번 호출합니다.

        for (const mapping of tagMappings) {
          // local_id를 사용하여 레코드를 찾고, tag_id 필드를 server_id로 업데이트
          await this.repository.updateTagId(
            mapping.local_id, // oldId -> localId
            mapping.server_id // newId -> serverId (서버 UUID)
          );
        }
      }

      // 3. (선택적) 데이터 항목 ID 매핑 처리 (예: 로컬 임시 ID -> 서버 확정 ID)
      // const dataMappings = responseData.data_mappings || [];
      // if (dataMappings.length > 0) { ... this.repository.updateDataId(...) 호출 ... }

      return true; // 성공적으로 서버에 전달됨
    } catch (error) {
      // 통신 실패 또는 HTTP 오류 발생
      await this._applyExponentialBackoff(pendingItems, error);
      return false;
    }
  }

  /**
   * 서버 통신 실패 시 Exponential Backoff를 적용하여 로컬 DB 상태를 업데이트합니다.
   * @private
   */
  async _applyExponentialBackoff(failedItems, error) {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    for (const item of failedItems) {
      const newRetryCount = item.retry_count + 1;

      if (newRetryCount > MAX_RETRIES) {
        console.error(
          `[Backoff] Item ${item.data_id} failed after max retries (${MAX_RETRIES}). Final failure.`
        );
        // 이 시점에서 로깅하거나, 사용자에게 알림을 보낼 수 있습니다.
        continue;
      }

      // 지수 함수: 2^n * BASE_TIME 초 후 재시도
      const baseTime = 5; // 기본 지연 시간 (5초)
      const delaySeconds = Math.pow(baseTime, newRetryCount);
      const nextAttemptAt = nowInSeconds + delaySeconds;

      console.warn(
        `[Backoff] Sync failed for ${
          item.data_id
        } (Attempt ${newRetryCount}). Retrying at ${new Date(
          nextAttemptAt * 1000
        ).toISOString()}`
      );

      // 로컬 DB의 pending_sync 테이블을 업데이트 (LocalRepository 의존)
      await this.repository.updatePendingSyncRetry(
        item.id, // pending_sync.id (PK)
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

  // ... fetchSyncChanges 등 나머지 ICloudService 메서드는 구현 필요 ...
}

module.exports = { CloudService };
