const serviceConfig = require('./serviceConfig');

class AppContainer {
  constructor() {
    this.serviceConfig = null;
    this.modules = [];
  }
  // 서비스 등록
  static initServices() {
    try {
      this.serviceConfig = new serviceConfig();
      this.serviceConfig.initializeInfrastructure();
      this.serviceConfig.initializeRepositories();
      this.serviceConfig.initializeServices();

      this.services = this.serviceConfig.getServices();

      console.log('[AppContainer] All Services initialized via serviceConfig.');
    } catch (err) {
      throw err;
    }
  }

  static initializeModules() {
    const AuthModule = require('../../modules/authService/AuthModule');
    const SearchModule = require("../../modules/search/SearchModule");
    const NotifyModule = require('../../modules/notify/notifyModule.js');
    const ClipboardModule = require('../../modules/clipboard/ClipboardModule');
    const CloudModule = require('../../modules/cloud/CloudModule');

    this.modules = [
      new AuthModule(this.services),
      new CloudModule(this.services),
      new ClipboardModule(this.services),
      new SearchModule(this.services),
      new NotifyModule(this.services),
    ];
  }

  // 모든 모듈의 IPC 핸들러를 등록
  static registerIpcHandlers(ipcMain) {
    for (const moduleInstance of this.modules) {
      if (typeof moduleInstance.registerIpcHandler === 'function') {
        try {
          moduleInstance.registerIpcHandler(ipcMain);
        } catch (err) {
          console.error(`[AppContainer] Failed to register IPC for ${moduleInstance.constructor.name}:`, err);
        }
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
