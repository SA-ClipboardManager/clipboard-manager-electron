// infrastructure/repositories/OutboxRepository.js - PostgreSQL 버전
class OutboxRepository {
  constructor(db) {
    this.db = db;
  }

  async createEvent(dataId, eventType = "UPLOAD", metadata = null) {
    const now = Date.now();
    const result = await this.db.query(
      `
      INSERT INTO sync_outbox 
      (data_id, event_type, status, created_at, next_attempt_at, metadata)
      VALUES ($1, $2, 'PENDING', $3, $4, $5)
      RETURNING id
    `,
      [dataId, eventType, now, now, metadata ? JSON.stringify(metadata) : null]
    );
    return result.rows[0];
  }

  async getPendingItems(limit = 10) {
    const now = Date.now();
    const result = await this.db.query(
      `
      SELECT * FROM sync_outbox 
      WHERE status = 'PENDING' 
        AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
      ORDER BY created_at ASC
      LIMIT $2
    `,
      [now, limit]
    );
    return result.rows;
  }

  async markAsProcessing(ids) {
    if (!ids || ids.length === 0) return;

    const nextAttempt = Date.now() + 10000;
    await this.db.query(
      `
      UPDATE sync_outbox 
      SET status = 'PROCESSING',
          retry_count = retry_count + 1,
          next_attempt_at = $1
      WHERE id = ANY($2::integer[])
    `,
      [nextAttempt, ids]
    );
  }
  /**
   * 처리 성공 처리
   */
  async markAsCompleted(id) {
    await this.db.query(
      `
      UPDATE sync_outbox 
      SET status = 'COMPLETED',
          next_attempt_at = NULL,
          updated_at = $1
      WHERE id = $2
    `,
      [Date.now(), id]
    );
  }
  /**
   * 처리 실패 처리 (Backoff 계산 포함)
   */
  async markAsFailed(id, error, retryCount) {
    const nextAttempt = Date.now() + this._calculateBackoff(retryCount);
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.db.query(
      `
      UPDATE sync_outbox 
      SET status = 'PENDING',
          error_message = $1,
          next_attempt_at = $2,
          updated_at = $3
      WHERE id = $4
    `,
      [errorMessage, nextAttempt, Date.now(), id]
    );
  }

  /**
   * 영구 실패 처리 (재시도 초과 시)
   */
  async markAsDead(id, error) {
    await this.db.query(
      `
      UPDATE sync_outbox 
      SET status = 'FAILED',
          error_message = $1,
          next_attempt_at = NULL,
          updated_at = $2
      WHERE id = $3
    `,
      [String(error), Date.now(), id]
    );
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
