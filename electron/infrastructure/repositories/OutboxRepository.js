// infrastructure/repositories/OutboxRepository.js

/**
 * Implementation of IOutboxRepository for managing sync outbox events
 * @implements {IOutboxRepository}
 */
class OutboxRepository {
  constructor(db) {
    this.db = db;
  }

  createEvent(dataId, eventType = "UPLOAD", metadata = null) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_outbox 
      (data_id, event_type, status, created_at, next_attempt_at, metadata)
      VALUES (?, ?, 'PENDING', ?, ?, ?)
    `);

    const now = Date.now();
    return stmt.run(
      dataId,
      eventType,
      now,
      now,
      metadata ? JSON.stringify(metadata) : null
    );
  }
  async getPendingItems(limit = 10) {
    const now = Date.now();
    return this.db
      .prepare(
        `
      SELECT * FROM sync_outbox 
      WHERE status = 'PENDING' 
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `
      )
      .all(now, limit);
  }

  async markAsProcessing(ids) {
    if (!ids || ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      UPDATE sync_outbox 
      SET status = 'PROCESSING',
          retry_count = retry_count + 1,
          next_attempt_at = ?
      WHERE id IN (${placeholders})
    `);

    // 재시도 횟수는 개별적으로 계산해야 정확하지만,
    // 일괄 처리를 위해 현재 시간 + 기본 백오프로 설정하거나 루프를 돕니다.
    // 여기서는 간단하게 처리합니다.
    stmt.run(Date.now() + 10000, ...ids);
  }

  /**
   * 처리 성공 처리
   */
  markAsCompleted(id) {
    this.db
      .prepare(
        `
      UPDATE sync_outbox 
      SET status = 'COMPLETED',
          next_attempt_at = NULL,
          updated_at = ?
      WHERE id = ?
    `
      )
      .run(Date.now(), id);
  }

  /**
   * 처리 실패 처리 (Backoff 계산 포함)
   */
  markAsFailed(id, error, retryCount) {
    const nextAttempt = Date.now() + this._calculateBackoff(retryCount);
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.db
      .prepare(
        `
      UPDATE sync_outbox 
      SET status = 'PENDING',  -- 다시 PENDING으로 돌려야 다음 폴링에 잡힘 (또는 FAILED 후 별도 재시도 로직)
          error_message = ?,
          next_attempt_at = ?,
          updated_at = ?
      WHERE id = ?
    `
      )
      .run(errorMessage, nextAttempt, Date.now(), id);
  }

  // 영구 실패 처리 (재시도 초과 시)
  markAsDead(id, error) {
    this.db
      .prepare(
        `
      UPDATE sync_outbox 
      SET status = 'FAILED',
          error_message = ?,
          next_attempt_at = NULL,
          updated_at = ?
      WHERE id = ?
    `
      )
      .run(String(error), Date.now(), id);
  }

  _calculateBackoff(retryCount) {
    const baseDelay = 5000; // 5초
    const maxDelay = 300000; // 5분
    // Exponential Backoff
    const backoff = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    // Jitter 추가
    const jitter = Math.random() * (backoff * 0.1);
    return Math.floor(backoff + jitter);
  }
}

module.exports = OutboxRepository;
