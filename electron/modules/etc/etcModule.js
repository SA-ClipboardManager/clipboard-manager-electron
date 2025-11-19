const BaseModule = require("../../main/core/BaseModule");
const CCDError = require("../shared/errors/CCDError");
const {pasteById} = require ("./paste")

//TODO name 수정
class EtcModule extends BaseModule{
    constructor(app) {
        super(app, "etc");
        this.service = app.service.EtcService;
    }

    registerIpcHandler(ipcMain) {
        ipcMain.handle("load-clipboard-records", async (_, isLogin) => {
    try {
      const merged = await this.service.loadClipboardRecords(isLogin);
      return { success: true, data: merged };
    } catch (err) {
      const error = CCDError.create("E655", {
        module: "ipcHandler",
        context: "기록 보기 로딩",
        details: err.message,
      });
      console.error(error);
      return error.toJSON();
    }
  });


        ipcMain.handle("paste-item",async (_, { itemId }) => {
    try {
      await pasteById(itemId); // ← 핵심 연결
      return { paste: true };
    } catch (err) {
      const error =
        err instanceof CCDError
          ? err
          : CCDError.create("E630", {
            module: "ipcHandler",
            context: "붙여넣기",
            details: err.message,
          });
      console.error(error);
      return error.toJSON();
    }
  });
    }
}

module.exports = EtcModule;