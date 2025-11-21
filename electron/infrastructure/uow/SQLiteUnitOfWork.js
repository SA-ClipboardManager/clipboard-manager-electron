// infrastructure/uow/SQLiteUnitOfWork.js
const {
  SQLiteClipboardWriter,
} = require("../repositories/writers/SQLiteClipboardWriter");
const {
  SQLiteOutboxWriter,
} = require("../repositories/writers/SQLiteOutboxWriter");
const CCDError = require("../../shared/errors/CCDError");

/**
 * SQLite 전용 Unit of Work 구현체
 * 트랜잭션 관리 및 Writer Repository 인스턴스 생성을 담당합니다.
 */
class SQLiteUnitOfWork {
  /**
   * @param {import('../database/DatabaseContext')} databaseContext
   */
  constructor(databaseContext) {
    // DatabaseContext에서 초기화된 better-sqlite3 인스턴스를 가져옵니다.
    this.db = databaseContext.getDb();
  }

  /**
   * 작업을 단일 트랜잭션으로 묶어서 실행합니다.
   * * @param {function(object): any} workFn - 트랜잭션 안에서 실행할 콜백 함수.
   * 인자로 { clipboard: IClipboardWriter, outbox: IOutboxWriter } 형태의 컨텍스트를 받습니다.
   * @returns {any} workFn의 반환값
   */
  execute(workFn) {
    if (!this.db) {
      throw CCDError.create("E610", {
        module: "SQLiteUnitOfWork",
        context: "트랜잭션 시작 실패",
        message: "데이터베이스 연결이 없습니다.",
      });
    }

    // better-sqlite3의 transaction 메서드는 실행 가능한 함수를 반환합니다.
    // 이 함수 내부에서 실행되는 모든 동기적 DB 작업은 하나의 트랜잭션으로 묶입니다.
    const tx = this.db.transaction(() => {
      // 트랜잭션 컨텍스트 안에서 사용할 Repository(Writer) 인스턴스를 생성합니다.
      // 여기서는 같은 this.db 연결을 공유합니다.
      const context = {
        clipboard: new SQLiteClipboardWriter(this.db),
        outbox: new SQLiteOutboxWriter(this.db),
        // 필요 시 tagWriter 등 추가
      };

      // 실제 비즈니스 로직 실행
      return workFn(context);
    });

    try {
      // 트랜잭션 함수 실행 (여기서 예외 발생 시 자동 Rollback 됨)
      return tx();
    } catch (error) {
      // 이미 비즈니스 로직에서 CCDError를 던졌다면 그대로 전달
      if (error instanceof CCDError) {
        throw error;
      }

      // DB 레벨의 에러라면 래핑
      throw CCDError.create("E610", {
        module: "SQLiteUnitOfWork",
        context: "트랜잭션 실행 중 오류 발생",
        message: error.message,
        cause: error,
      });
    }
  }
}

module.exports = SQLiteUnitOfWork;
