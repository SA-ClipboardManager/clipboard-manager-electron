const { randomUUID } = require("crypto");

/**
 * Correlation ID 관리 유틸리티
 * 요청 추적을 위한 고유 ID 생성 및 관리
 */
class CorrelationIdManager {
  constructor() {
    // AsyncLocalStorage를 사용하면 더 좋지만, Node.js 12.17+ 필요
    // 여기서는 간단히 Map 기반으로 관리
    this.contextMap = new Map();
  }

  /**
   * 새로운 correlation ID 생성
   * @returns {string} UUID v4 형식의 correlation ID
   */
  generate() {
    return randomUUID();
  }

  /**
   * 현재 컨텍스트에 correlation ID 설정
   * @param {string} contextKey - 컨텍스트 식별자 (예: IPC event, HTTP request ID)
   * @param {string} correlationId - correlation ID
   */
  set(contextKey, correlationId) {
    this.contextMap.set(contextKey, correlationId);
  }

  /**
   * 현재 컨텍스트의 correlation ID 조회
   * @param {string} contextKey - 컨텍스트 식별자
   * @returns {string|null}
   */
  get(contextKey) {
    return this.contextMap.get(contextKey) || null;
  }

  /**
   * 컨텍스트 정리
   * @param {string} contextKey - 컨텍스트 식별자
   */
  clear(contextKey) {
    this.contextMap.delete(contextKey);
  }

  /**
   * correlation ID 생성 또는 기존 ID 반환
   * @param {string} [existingId] - 기존 correlation ID (있으면 재사용)
   * @returns {string}
   */
  getOrCreate(existingId) {
    return existingId || this.generate();
  }
}

/** 싱글톤 인스턴스 */
const correlationIdManager = new CorrelationIdManager();

module.exports = {
  CorrelationIdManager,
  correlationIdManager,
};
