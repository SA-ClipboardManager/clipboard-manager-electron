const BaseModule = require("../../main/core/BaseModule");
const CCDError = require("../../shared/errors/CCDError");
const { BrowserWindow } = require("electron");
class CloudModule extends BaseModule {
  constructor(services) {
    super(services, "cloud");
    this.service = services.CloudService;
    const authService = services.AuthService;

    authService.on("login-success", (userId) => {
      console.log(
        `[CloudModule] Login detected for ${userId}. Connecting WebSocket...`
      );
    });

    authService.on("logout-success", () => {
      console.log(`[CloudModule] Logout detected. Closing WebSocket...`);
      this.service.closeWebSocket();
    });
    this._checkInitialLoginState(services.AuthService);
  }
  async _checkInitialLoginState(authService) {
    const state = await authService.getLoginState();
    if (state.isLoggedIn) {
      // 이미 로그인 상태라면 소켓 즉시 연결
      // (주의: userId를 가져오는 메서드가 AuthService에 필요할 수 있음)
      const userId = authService.getCurrentUserId();
    }
  }

  registerIpcHandler(ipcMain) {
    ipcMain.handle("upload-selected-items", async (_, itemIds) => {
      try {
        if (!itemIds || !Array.isArray(itemIds)) {
          throw new Error("Invalid itemIds");
        }

        const result = await this.service.uploadSpecificItems(itemIds);

        return { success: true, result };
      } catch (err) {
        const error = CCDError.create("E653", {
          module: "ipcHandler",
          context: "선택 항목 업로드",
          details: err.message,
        });
        console.error(error);
        return error.toJSON();
      }
    });

    ipcMain.handle("delete-item", async (_, { dataId, deleteOption }) => {
      try {
        await this.service.deleteItem(dataId, deleteOption);
        return { deletionResult: true, refreshReq: true };
      } catch (err) {
        const error = CCDError.create("E650", {
          module: "ipcHandler",
          context: "데이터 삭제",
          details: err.message,
        });
        console.error(error);
        return error.toJSON();
      }
    });
  }
}

module.exports = CloudModule;
