// infrastructure/repositories/writers/SQLiteOutboxWriter.js
const CCDError = require("../../../shared/errors/CCDError");

class SQLiteOutboxWriter {
  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 동기화 이벤트 큐에 작업 추가 (Enqueue)
   * @param {string} op - 'INSERT', 'UPDATE', 'DELETE'
   * @param {string} dataId - 대상 데이터 ID
   * @param {object} [args] - 추가 인자 (JSON으로 변환됨)
   */
  enqueue(op, dataId, args = {}) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const stmt = this.db.prepare(`
        INSERT INTO pending_sync (op, data_id, op_args, created_at, retry_count, next_attempt_at)
        VALUES (?, ?, ?, ?, 0, 0)
      `);

      stmt.run(op, dataId, JSON.stringify(args), now);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteOutboxWriter",
        context: "enqueue (Outbox 기록)",
        message: error.message,
      });
    }
  }

  /**
   * 처리 완료된 동기화 항목 제거 (Dequeue/Ack)
   * @param {number} id - pending_sync 테이블의 PK (Auto Increment ID)
   */
  remove(id) {
    try {
      this.db.prepare("DELETE FROM pending_sync WHERE id = ?").run(id);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteOutboxWriter",
        context: "remove (Outbox 삭제)",
        message: error.message,
      });
    }
  }

  /**
   * (선택 사항) 재시도 횟수 증가 및 다음 시도 시간 설정
   * 동기화 실패 시 Backoff 처리를 위해 사용 가능
   * @param {number} id
   * @param {number} nextAttemptTimestamp
   */
  incrementRetry(id, nextAttemptTimestamp) {
    try {
      this.db
        .prepare(
          `
        UPDATE pending_sync 
        SET retry_count = retry_count + 1, next_attempt_at = ?
        WHERE id = ?
      `
        )
        .run(nextAttemptTimestamp, id);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteOutboxWriter",
        context: "incrementRetry",
        message: error.message,
      });
    }
  }
}

module.exports = { SQLiteOutboxWriter };
