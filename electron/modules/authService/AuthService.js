// modules/auth/AuthService.js (Auth Module)
// CommonJS

const { IAuthService } = require("../core/IAuthService");
const CCDError = require("../shared/errors/CCDError");
// Electron의 안전한 저장소 사용을 가정 (예: electron-store 또는 파일 시스템)
const { localStore } = require("./local-store-util");

const API_ENDPOINT = "YOUR_CLOUD_API_BASE_URL";
const TOKEN_KEY = "auth_tokens";

/**
 * IAuthService 인터페이스를 구현하며, 클라우드 인증 API와 통신합니다.
 * @implements {IAuthService}
 */
class AuthService extends IAuthService {
  constructor() {
    super();
    this.tokens = localStore.get(TOKEN_KEY) || null; // 로컬 저장소에서 초기 토큰 로드
  }

  /**
   * @inheritdoc
   */
  async login(email, password) {
    const url = `${API_ENDPOINT}/auth/login`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        // 401 Unauthorized 또는 다른 오류 처리
        const errorData = await response.json();
        throw new Error(errorData.detail || response.statusText);
      }

      const { access_token, refresh_token, expires_in } = await response.json();

      // 토큰 만료 시간 계산 (현재 시간 + expires_in 초)
      const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

      this.tokens = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiresAt,
      };

      // 안전한 로컬 저장소에 토큰 저장
      localStore.set(TOKEN_KEY, this.tokens);

      return this.tokens;
    } catch (error) {
      throw CCDError.create("E501", {
        module: "AuthService",
        context: "로그인 요청 실패",
        message: error.message,
        cause: error,
      });
    }
  }

  /**
   * @inheritdoc
   */
  async logout() {
    // 서버 측 로그아웃 엔드포인트 호출 (선택 사항, 리프레시 토큰 무효화)
    // ...

    // 로컬 저장소 및 메모리에서 토큰 제거
    this.tokens = null;
    localStore.delete(TOKEN_KEY);

    return true;
  }

  /**
   * @inheritdoc
   */
  getAuthToken() {
    // 토큰이 만료되었는지 간단히 확인하는 로직 추가 가능
    if (this.tokens && this.tokens.expiresAt < Math.floor(Date.now() / 1000)) {
      console.warn("Access token expired locally.");
      // 실제 사용 시, 여기서 refreshAccessToken()을 호출하도록 유도해야 함
      return null;
    }
    return this.tokens;
  }

  /**
   * @inheritdoc
   */
  async refreshAccessToken() {
    // 리프레시 토큰을 사용하여 새로운 액세스 토큰을 받아오는 로직 구현
    // ...
    throw new Error("Refresh token implementation required.");
  }
}

module.exports = { AuthService };
