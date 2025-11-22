const axios = require("axios");
const { IAuthService } = require("../../shared/interfaces/IAuthService");
const CCDError = require("../../shared/errors/CCDError");
const { tokenStorageInstance } = require("./token-storage/TokenStorage");
const EventEmitter = require("events");
const DEFAULT_API_BASE_URL = process.env.CLOUD_API_BASE_URL;

/**
 * @implements {IAuthService}
 */
class AuthService extends EventEmitter {
  /**
   * @param {TokenStorage} tokenStorage
   * @param {{ apiBaseURL?: string }} [config]
   */
  constructor(tokenStorage = tokenStorageInstance, config = {}) {
    super();
    this.tokenStorage = tokenStorage;
    this.apiBaseURL = config.apiBaseURL;
    this.httpClient = axios.create({
      baseURL: this.apiBaseURL,
      headers: { "Content-Type": "application/json" },
    });

    // warm-up cache (비동기)
    this.tokenStorage.load().catch((error) => {
      console.warn("[AuthService] Failed to load tokens:", error.message);
    });
  }

  _transformTokens(payload) {
    if (!payload) {
      throw new Error("Empty token payload");
    }
    const { access_token, refresh_token, expires_in } = payload;
    const expiresAt = Math.floor(Date.now() / 1000) + (expires_in || 0);
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
    };
  }

  /**
   * @inheritdoc
   */
  async login(userId, password) {
    try {
      const url = "/auth/v1/api/v1/auth/login";

      const response = await this.httpClient.post(url, {
        user_id: userId,
        password,
      });
      const tokens = this._transformTokens(response.data);
      await this.tokenStorage.save(tokens);
      this.emit("login-success", userId);
      return tokens;
    } catch (error) {
      throw CCDError.create("E501", {
        module: "AuthService",
        context: "로그인 요청 실패",
        message: error.response?.data?.detail || error.message,
        cause: error,
      });
    }
  }

  /**
   * @inheritdoc
   */
  async logout() {
    const refreshToken = this.tokenStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await this.httpClient.post("/auth/logout", {
          refresh_token: refreshToken,
        });
      }
    } catch (error) {
      console.warn(
        "[AuthService] Remote logout failed:",
        error.response?.data?.detail || error.message
      );
    } finally {
      await this.tokenStorage.clear();
      this.emit("logout-success");
    }
    return true;
  }

  /**
   * @inheritdoc
   */
  getAuthToken() {
    if (this.tokenStorage.isExpired()) {
      return null;
    }
    return this.tokenStorage.getTokens();
  }

  /**
   * @inheritdoc
   */
  async refreshAccessToken() {
    const refreshToken = this.tokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw CCDError.create("E502", {
        module: "AuthService",
        context: "토큰 갱신 실패",
        message: "리프레시 토큰이 없습니다.",
      });
    }

    try {
      const url = "/auth/v1/api/v1/auth/refresh";

      const response = await this.httpClient.post(url, {
        refresh_token: refreshToken,
      });
      const tokens = this._transformTokens(response.data);
      await this.tokenStorage.save(tokens);
      return tokens;
    } catch (error) {
      await this.tokenStorage.clear();
      throw CCDError.create("E502", {
        module: "AuthService",
        context: "토큰 갱신 실패",
        message: error.response?.data?.detail || error.message,
        cause: error,
      });
    }
  }

  /**
   * 현재 로그인 상태를 반환합니다.
   * @returns {Promise<{ isLoggedIn: boolean, userId?: string }>}
   */
  async getLoginState() {
    const tokens = this.getAuthToken();
    const isLoggedIn = tokens !== null && !this.tokenStorage.isExpired();

    return {
      isLoggedIn,
      // 필요시 userId 등을 추가할 수 있습니다
    };
  }
}

module.exports = { AuthService };
