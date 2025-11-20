const serviceConfig = require("./serviceConfig");

class AppContainer {
  static service = {};
  static modules = {};

  // 서비스 등록
  static initServices() {
    for (const [name, factory] of Object.entries(serviceConfig)) {
      try {
        // 서비스 생성 시도
        this.service[name] = factory(this.service);
        console.log(
          `[AppContainer] ✅ Service registered: ${name}`,
          this.service[name] ? "OK" : "FAIL"
        );
      } catch (err) {
        console.error(`[AppContainer] ❌ Service init failed: ${name}`, err);
      }
    }
  }

  static initializeModules() {
    const AuthModule = require("../../modules/authService/AuthModule");
    // const CloudModule = require("../../modules/cloud-sync/CloudModule");
    const SearchModule = require("../../modules/search/SearchModule");
    const EtcModule = require("../../modules/etc/EtcModule.js");
    const {
      initClipboardModule,
    } = require("../../modules/clipboard-monitor/index.js");

    // 모듈 인스턴스 생성 및 등록
    this.modules.authModule = new AuthModule(this);
    // this.modules.cloudModule = new CloudModule(this);
    this.modules.searchModule = new SearchModule(this);
    this.modules.etcModule = new EtcModule(this);
    initClipboardModule(this.service);
  }

  // 모든 모듈의 IPC 핸들러를 등록
  static registerIpcHandlers(ipcMain) {
    for (const [name, moduleInstance] of Object.entries(this.modules)) {
      if (typeof moduleInstance.registerIpcHandler === "function") {
        moduleInstance.registerIpcHandler(ipcMain);
      }
    }
  }

  static initialize(ipcMain) {
    this.initServices();
    this.initializeModules();
    this.registerIpcHandlers(ipcMain);
  }
}

module.exports = AppContainer;
