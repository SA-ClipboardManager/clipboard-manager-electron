const BaseModule = require("../../main/core/BaseModule");
const CCDError = require("../../shared/errors/CCDError");

class AuthModule extends BaseModule {
  constructor(services) {
    super(services, "auth");
    this.service = services.AuthService;
    this.clipboardRepository = services.ClipboardRepository;

    if (!this.service) {
      console.error("AuthService not initialized.");
    }

    // 로그아웃 시 클라우드 데이터 삭제
    this.service.on("logout-success", () => {
      this._cleanupCloudData();
    });
  }

  /**
   * 로그아웃 시 클라우드 아이템 삭제
   * @private
   */
  _cleanupCloudData() {
    try {
      if (this.clipboardRepository) {
        const deletedCount = this.clipboardRepository.deleteAllCloudItems();
        console.log(
          `[AuthModule] Cleaned up ${deletedCount} cloud items on logout`
        );

        // 렌더러에 알림을 보내서 UI 갱신
        const { BrowserWindow } = require("electron");
        const win = BrowserWindow.getAllWindows()[0];
        if (win && win.webContents) {
          win.webContents.send("cloud-data-cleared");
        }
      }
    } catch (error) {
      console.error("[AuthModule] Failed to cleanup cloud data:", error);
    }
  }

  registerIpcHandler(ipcMain) {
    ipcMain.handle("user-login", async (_, { userId, password }) => {
      try {
        const tokens = await this.service.login(userId, password);

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
        const error =
          err instanceof CCDError
            ? err
            : CCDError.create(err.code || "E610", {
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
        // 로그인 상태 변경
        await this.service.logout();

        return { success: true, message: "로그아웃 완료" };
      } catch (err) {
        const error =
          err instanceof CCDError
            ? err
            : CCDError.create(err.code || "E610", {
                module: "AuthModule",
                context: "로그아웃 처리",
                details: err.message,
              });
        console.error(error);
        return error.toJSON();
      }
    });

    ipcMain.handle("user-register", async (_, { userId, password }) => {
      try {
        const result = await this.service.register(userId, password);
        return result;
      } catch (err) {
        const error =
          err instanceof CCDError
            ? err
            : CCDError.create(err.code || "E611", {
                module: "AuthModule",
                context: "회원가입 처리",
                details: err.message,
              });
        console.error(error);
        return { joinResultMsg: "fail", error: error.toJSON() };
      }
    });

    ipcMain.handle("get-login-state", async () => {
      try {
        const loginState = await this.service.getLoginState();
        return { success: true, ...loginState };
      } catch (err) {
        const error =
          err instanceof CCDError
            ? err
            : CCDError.create(err.code || "E610", {
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
