const IpcRoute = require("./IpcRoute");

class BaseModule {
  constructor(app, prefix) {
    this.app = app;
    this.route = new IpcRoute(prefix);
  }

  //각 module에서 override하는 함수
  registerIpcHandler(ipcMain) {}
}
module.exports = BaseModule;
