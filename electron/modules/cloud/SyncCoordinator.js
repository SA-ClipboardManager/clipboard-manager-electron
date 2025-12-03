// electron/modules/sync/SyncCoordinator.js
const { EventEmitter } = require("events");

class SyncCoordinator extends EventEmitter {
  /**
   * @param {object} params
   * @param {import('../../infrastructure/repositories/OutboxRepository')} params.outboxRepo
   * @param {import('../cloud/CloudService')} params.cloudService
   */
  constructor({ outboxRepo, cloudService }) {
    super();
    this.outboxRepo = outboxRepo;
    this.cloudService = cloudService;

    this.isProcessing = false;
    this.pollingInterval = null;
    this.INTERVAL_MS = 5000; // 5초마다 확인
    this.processingItems = new Set(); // 현재 처리 중인 아이템 ID 추적
  }

  /**
   * [Public] 특정 아이템이 현재 처리(업로드) 중인지 확인
   * @param {string} itemId
   * @returns {boolean}
   */
  isItemProcessing(itemId) {
    return this.processingItems.has(itemId);
  }

  /**
   * [Public] 백그라운드 동기화 시작
   * 앱 시작 시 호출됩니다.
   */
  start() {
    if (this.pollingInterval) return;
    console.log("[SyncCoordinator] Starting background sync...");

    // 1. 즉시 한 번 실행 (앱 켜자마자 동기화 시도)
    this._processOutbox();

    // 2. 주기적 실행 설정
    this.pollingInterval = setInterval(() => {
      this._processOutbox();
    }, this.INTERVAL_MS);
  }

  /**
   * [Public] 동기화 중지
   * 앱 종료 시 호출됩니다.
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * [Public] 즉시 Outbox 처리 트리거 (우선순위 업로드 등 수동 호출용)
   * CloudModule 등에서 processPendingUploads 호출 시 사용.
   */
  async processPendingUploads() {
    // 내부 루프를 한 번 강제로 실행
    await this._processOutbox();
  }

  /**
   * [Public] 아이템 삭제 요청
   * @param {string} itemId - 삭제할 아이템 ID
   * @param {string} deleteOption - 삭제 옵션 ('local', 'cloud', 'both')
   */
  async requestDelete(itemId, deleteOption = "both") {
    try {
      console.log(
        `[SyncCoordinator] Delete request: ${itemId}, option: ${deleteOption}`
      );

      if (deleteOption === "cloud" || deleteOption === "both") {
        // 클라우드 삭제 요청
        await this.cloudService.deleteItem(itemId);
      }

      return { success: true };
    } catch (error) {
      console.error(`[SyncCoordinator] Delete failed for ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * [Private] Outbox 처리 메인 루프
   */
  async _processOutbox() {
    // 이미 처리 중이면 스킵 (중복 실행 방지)
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;

      // 1. 대기 중인 항목 조회 (한 번에 5개씩)
      const pendingItems = await this.outboxRepo.getPendingItems(5);

      if (pendingItems.length === 0) return;

      console.log(
        `[SyncCoordinator] Found ${pendingItems.length} items to sync.`
      );

      // 2. 병렬 처리 (Promise.allSettled로 하나가 실패해도 나머지는 진행)
      await Promise.allSettled(
        pendingItems.map((item) => this._processSingleItem(item))
      );
    } catch (error) {
      console.error("[SyncCoordinator] Fatal error in sync loop:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * [Private] 개별 아이템 처리 로직
   */
  async _processSingleItem(outboxItem) {
    const itemId = outboxItem.data_id;
    this.processingItems.add(itemId); // 처리 시작 표시

    try {
      // 1. 처리 중 상태로 변경 (선택사항: 멀티 프로세스 환경 대비)
      // await this.outboxRepo.markAsProcessing([outboxItem.id]);

      // 2. CloudService에 업로드 위임
      // (SyncCoordinator는 '어떻게' 업로드하는지 모름, 그냥 시킬 뿐)
      const result = await this.cloudService.uploadItem(outboxItem);

      // 3. 성공 처리
      this.outboxRepo.markAsCompleted(outboxItem.id);
      console.log(`[SyncCoordinator] Sync Success: ${itemId}`);
      // 렌더러로 전달할 업로드 성공 이벤트 발생
      this.emit("upload-success", {
        itemId: itemId,
        result,
        item: result.local,
      });
    } catch (error) {
      console.error(
        `[SyncCoordinator] Sync Failed for ${itemId}:`,
        error.message
      );
      // 업로드 실패 이벤트 발생
      this.emit("upload-failed", { itemId: itemId, error });

      // 4. 실패 처리 (재시도 횟수 확인)
      const MAX_RETRIES = 5;
      if (outboxItem.retry_count >= MAX_RETRIES) {
        this.outboxRepo.markAsDead(outboxItem.id, error);
      } else {
        this.outboxRepo.markAsFailed(
          outboxItem.id,
          error,
          outboxItem.retry_count + 1
        );
      }
    } finally {
      this.processingItems.delete(itemId); // 처리 종료 표시
    }
  }
}

module.exports = SyncCoordinator;
