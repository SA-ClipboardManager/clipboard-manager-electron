const { randomUUID } = require("crypto");

/**
 * Correlation ID 생성 및 관리 유틸리티
 * 요청 추적을 위한 고유 ID를 생성하고 관리합니다.
 */
class CorrelationId {
  /**
   * 새로운 correlation ID 생성
   * @returns {string} UUID v4 형식의 correlation ID
   */
  static generate() {
    return randomUUID();
  }

  /**
   * HTTP 요청 헤더명
   */
  static get HEADER_NAME() {
    return "X-Correlation-ID";
  }

  /**
   * WebSocket 메시지 필드명
   */
  static get WS_FIELD_NAME() {
    return "correlationId";
  }

  /**
   * 로그 출력용 포맷
   * @param {string} correlationId
   * @param {string} message
   * @returns {string}
   */
  static formatLog(correlationId, message) {
    return `[CID: ${correlationId?.slice(0, 8) || "N/A"}] ${message}`;
  }
}

module.exports = CorrelationId;
