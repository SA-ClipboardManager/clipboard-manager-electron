const BaseModule = require("../../main/core/BaseModule");
const CCDError = require("../../shared/errors/CCDError");

class AuthModule extends BaseModule {
  constructor(services) {
  super(services, "auth");
  this.service = services.AuthService;  // Changed from app.service.AuthService to services.AuthService
  if (!this.service) {
    console.error("AuthService not initialized.");
  }
}

  registerIpcHandler(ipcMain) {
    ipcMain.handle("user-login", async (_, { userId, password }) => {
      try {
        const tokens = await this.service.login(userId, password);
        // if (loginResult && access_token) isLogin = true;

        // 토큰 저장은 authService 내부 cloudDB 인스턴스에서 처리됨
        if (tokens && tokens.accessToken) {
          return {
            success: true,
            message: "로그인 성공",
          };
        } else {
          throw new Error("토큰 발급 실패");
        }
      } catch (err) {
        const error = CCDError.create(err.code || "E610", {
          module: "AuthModule",
          context: "로그인 처리",
          details: err.message,
        });
        console.error(error);
        return error.toJSON();
      }
    });

    ipcMain.handle("user-logout", async () => {
      try {
        // isLogin = false;
        await this.service.logout();

        return { success: true, message: "로그아웃 완료" };
      } catch (err) {
        const error = CCDError.create("E610", {
          module: "AuthModule",
          context: "로그아웃 처리",
          details: err.message,
        });
        console.error(error);
        return error.toJSON();
      }
    });

    ipcMain.handle("get-login-state", async () => {
      try {
        const loginState = await this.service.getLoginState();
        return { success: true, ...loginState };
      } catch (err) {
        const error = CCDError.create("E610", {
          module: "AuthModule",
          context: "로그인 상태 확인",
          details: err.message,
        });
        console.error(error);
        return error.toJSON();
      }
    });
  }
}
module.exports = AuthModule;
