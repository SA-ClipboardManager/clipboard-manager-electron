// modules/core/IAuthService.js (Core Module)
// CommonJS

/**
 * @typedef {object} AuthToken
 * @property {string} accessToken - 서버에서 발급한 접근 토큰
 * @property {string} refreshToken - 토큰 갱신용 토큰
 * @property {number} expiresAt - 토큰 만료 시간 (Unix Timestamp)
 */

/**
 * 사용자 인증 기능을 위한 추상 인터페이스입니다.
 * @interface IAuthService
 */
class IAuthService {
  /**
   * 사용자 자격 증명을 사용하여 로그인합니다.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<AuthToken>} 성공 시 토큰 정보를 반환합니다.
   */
  async login(email, password) {
    throw new Error("Method must be implemented");
  }

  /**
   * 현재 활성화된 세션을 로그아웃하고 로컬 저장된 토큰을 제거합니다.
   * @returns {Promise<boolean>}
   */
  async logout() {
    throw new Error("Method must be implemented");
  }

  /**
   * 만료된 접근 토큰을 갱신합니다.
   * @returns {Promise<AuthToken>} 새로운 토큰 정보를 반환합니다.
   */
  async refreshAccessToken() {
    throw new Error("Method must be implemented");
  }

  /**
   * 현재 저장된 접근 토큰을 반환합니다.
   * @returns {AuthToken | null}
   */
  getAuthToken() {
    throw new Error("Method must be implemented");
  }
}

module.exports = { IAuthService };
