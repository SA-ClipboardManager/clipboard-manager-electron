// CCDError.js (CommonJS Module)

/**
 * @typedef {object} ErrorDetails
 * @property {string} module - 오류가 발생한 주요 모듈
 * @property {string} context - 오류가 발생한 기능 또는 작업의 컨텍스트
 * @property {string} message - 사용자에게 표시할 간결한 오류 메시지
 * @property {Error | string} [cause] - 이 오류를 유발한 원본 오류 객체 또는 메시지
 */

/**
 * Clipboard Cloud Data (CCD) 프로젝트를 위한 사용자 정의 오류 클래스
 * 오류 코드와 컨텍스트 정보를 포함
 * @class CCDError
 * @extends {Error}
 */
class CCDError extends Error {
  /**
   * @param {string} code - 오류 코드
   * @param {ErrorDetails} details - 오류의 상세 정보
   */
  constructor(code, details) {
    // 표준 Error 생성자 호출
    // 외부 메시지(message)와 코드, 컨텍스트를 조합하여 사용자에게 전달할 최종 메시지 생성
    const fullMessage = `[${code}] ${details.context}: ${details.message}`;
    super(fullMessage);

    // 표준 속성 설정
    this.name = "CCDError";

    // 사용자 정의 속성 추가
    this.code = code;
    this.module = details.module;
    this.context = details.context;
    this.cause = details.cause;

    // 스택 트레이스 캡처
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CCDError);
    } else {
      this.stack = new Error().stack;
    }
  }

  /**
   * 새로운 CCDError 인스턴스를 생성하는 정적 팩토리 메서드
   * @static
   * @param {string} code - 오류 코드
   * @param {ErrorDetails} details - 오류의 상세 정보
   * @returns {CCDError}
   */
  static create(code, details) {
    return new CCDError(code, details);
  }

  /**
   * 오류 상세 정보를 객체 형태로 반환
   * @returns {object}
   */
  toObject() {
    return {
      name: this.name,
      code: this.code,
      module: this.module,
      context: this.context,
      message: this.message,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

module.exports = CCDError;
