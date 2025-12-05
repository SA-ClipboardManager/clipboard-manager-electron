const { randomUUID } = require("crypto");

/**
 * Correlation ID 관리 유틸리티 - Static 메서드 방식
 * 요청 추적을 위한 고유 ID 생성 및 관리
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
   * HTTP 헤더 이름
   */
  static get HEADER_NAME() {
    return "X-Correlation-ID";
  }

  /**
   * 로그 포맷팅 헬퍼
   * @param {string} correlationId - correlation ID
   * @param {string} message - 로그 메시지
   * @returns {string} 포맷된 로그
   */
  static formatLog(correlationId, message) {
    return `[${correlationId}] ${message}`;
  }

  /**
   * correlation ID 생성 또는 기존 ID 반환
   * @param {string} [existingId] - 기존 correlation ID (있으면 재사용)
   * @returns {string}
   */
  static getOrCreate(existingId) {
    return existingId || this.generate();
  }
}

/**
 * Manager 방식 (호환성 유지)
 */
class CorrelationIdManager {
  constructor() {
    this.contextMap = new Map();
  }

  generate() {
    return randomUUID();
  }

  set(contextKey, correlationId) {
    this.contextMap.set(contextKey, correlationId);
  }

  get(contextKey) {
    return this.contextMap.get(contextKey) || null;
  }

  clear(contextKey) {
    this.contextMap.delete(contextKey);
  }

  getOrCreate(existingId) {
    return existingId || this.generate();
  }
}

const correlationIdManager = new CorrelationIdManager();

module.exports = CorrelationId;
module.exports.correlationIdManager = correlationIdManager;
module.exports.CorrelationIdManager = CorrelationIdManager;
