const CorrelationId = require("./correlationId");
const { correlationIdManager } = CorrelationId;

/**
 * Correlation ID를 포함한 로거 유틸리티
 */
class Logger {
  constructor(moduleName) {
    this.moduleName = moduleName;
  }

  /**
   * 로그 메시지 포맷팅 (correlation ID 포함)
   * @param {string} level - 로그 레벨 (INFO, WARN, ERROR 등)
   * @param {string} message - 로그 메시지
   * @param {string} [correlationId] - correlation ID
   * @param {Object} [context] - 추가 컨텍스트 정보
   * @returns {string}
   */
  _format(level, message, correlationId, context = {}) {
    const timestamp = new Date().toISOString();
    const cId = correlationId || "N/A";
    const contextStr =
      Object.keys(context).length > 0
        ? ` | Context: ${JSON.stringify(context)}`
        : "";
    return `[${timestamp}] [${level}] [${this.moduleName}] [CorrelationID: ${cId}] ${message}${contextStr}`;
  }

  /**
   * INFO 레벨 로그
   * @param {string} message
   * @param {string} [correlationId]
   * @param {Object} [context]
   */
  info(message, correlationId, context) {
    console.log(this._format("INFO", message, correlationId, context));
  }

  /**
   * WARN 레벨 로그
   * @param {string} message
   * @param {string} [correlationId]
   * @param {Object} [context]
   */
  warn(message, correlationId, context) {
    console.warn(this._format("WARN", message, correlationId, context));
  }

  /**
   * ERROR 레벨 로그
   * @param {string} message
   * @param {string} [correlationId]
   * @param {Object} [context]
   */
  error(message, correlationId, context) {
    console.error(this._format("ERROR", message, correlationId, context));
  }

  /**
   * DEBUG 레벨 로그
   * @param {string} message
   * @param {string} [correlationId]
   * @param {Object} [context]
   */
  debug(message, correlationId, context) {
    console.debug(this._format("DEBUG", message, correlationId, context));
  }

  /**
   * 컨텍스트 키로부터 correlation ID를 자동으로 가져와 로그
   * @param {string} level
   * @param {string} message
   * @param {string} contextKey
   * @param {Object} [additionalContext]
   */
  logWithContext(level, message, contextKey, additionalContext) {
    const correlationId = correlationIdManager.get(contextKey);
    const logMethod = this[level.toLowerCase()] || this.info;
    logMethod.call(this, message, correlationId, additionalContext);
  }
}

/**
 * 로거 인스턴스 생성 헬퍼
 * @param {string} moduleName
 * @returns {Logger}
 */
function createLogger(moduleName) {
  return new Logger(moduleName);
}

module.exports = {
  Logger,
  createLogger,
};
