const fs = require("fs-extra");
const path = require("path");
const { app } = require("electron");

/**
 * TokenStorage는 인증 토큰을 안전하게 저장하고
 * 구독자에게 변경 사항을 전달합니다.
 */
class TokenStorage {
  /**
   * @param {string} [storagePath]
   */
  constructor(storagePath) {
    this.storagePath =
      storagePath ||
      path.join(app.getPath("userData"), "clipboard-auth-tokens.json");
    this.cache = null;
    this.subscribers = new Set();
  }

  /**
   * 토큰을 디스크와 메모리에 저장합니다.
   * @param {object} tokens
   * @returns {Promise<void>}
   */
  async save(tokens) {
    if (!tokens) {
      throw new Error("Cannot save empty tokens");
    }
    this.cache = tokens;
    await fs.outputJson(this.storagePath, tokens, { spaces: 2 });
    this._notify(tokens);
  }

  /**
   * 저장된 토큰을 불러옵니다.
   * @returns {Promise<object | null>}
   */
  async load() {
    if (this.cache) return this.cache;
    try {
      this.cache = await fs.readJson(this.storagePath);
      return this.cache;
    } catch (error) {
      if (error.code === "ENOENT") {
        this.cache = null;
        return null;
      }
      throw error;
    }
  }

  /**
   * 토큰을 제거합니다.
   * @returns {Promise<void>}
   */
  async clear() {
    this.cache = null;
    await fs.remove(this.storagePath);
    this._notify(null);
  }

  /**
   * 현재 메모리에 있는 토큰을 반환합니다.
   * @returns {object | null}
   */
  getTokens() {
    return this.cache;
  }

  /**
   * 액세스 토큰 문자열을 반환합니다.
   * @returns {string | null}
   */
  getAccessToken() {
    return this.cache?.accessToken || null;
  }

  /**
   * 리프레시 토큰 문자열을 반환합니다.
   * @returns {string | null}
   */
  getRefreshToken() {
    return this.cache?.refreshToken || null;
  }

  /**
   * 토큰 만료 여부를 반환합니다.
   * @returns {boolean}
   */
  isExpired() {
    if (!this.cache?.expiresAt) return true;
    return this.cache.expiresAt <= Math.floor(Date.now() / 1000);
  }

  /**
   * 토큰 변경 사항을 구독합니다.
   * @param {(tokens: object | null) => void} listener
   * @returns {() => void} unsubscribe 함수
   */
  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  _notify(tokens) {
    this.subscribers.forEach((listener) => {
      try {
        listener(tokens);
      } catch (error) {
        console.error("[TokenStorage] Subscriber error:", error);
      }
    });
  }
}

const tokenStorageInstance = new TokenStorage();

module.exports = {
  TokenStorage,
  tokenStorageInstance,
};

