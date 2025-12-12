const serviceConfig = require("./serviceConfig");

class AppContainer {
  constructor() {
    this.serviceConfig = null;
    this.modules = [];
  }
  // 서비스 등록
  static async initServices() {
    try {
      this.serviceConfig = new serviceConfig();
      await this.serviceConfig.initializeInfrastructure(); // PostgreSQL은 비동기 필요
      this.serviceConfig.initializeRepositories();
      this.serviceConfig.initializeServices();

      this.services = this.serviceConfig.getServices();

      console.log("[AppContainer] All Services initialized via serviceConfig.");
    } catch (err) {
      throw err;
    }
  }

  static initializeModules() {
    const AuthModule = require("../../modules/authService/AuthModule");
    const SearchModule = require("../../modules/search/SearchModule");
    const NotifyModule = require("../../modules/notify/notifyModule.js");
    const ClipboardModule = require("../../modules/clipboard/ClipboardModule");
    const CloudModule = require("../../modules/cloud/CloudModule");

    this.modules = [new AuthModule(this.services), new CloudModule(this.services), new ClipboardModule(this.services), new SearchModule(this.services), new NotifyModule(this.services)];
  }

  // 모든 모듈의 IPC 핸들러를 등록
  static registerIpcHandlers(ipcMain) {
    for (const moduleInstance of this.modules) {
      if (typeof moduleInstance.registerIpcHandler === "function") {
        try {
          moduleInstance.registerIpcHandler(ipcMain);
        } catch (err) {
          console.error(`[AppContainer] Failed to register IPC for ${moduleInstance.constructor.name}:`, err);
        }
      }
    }
  }

  static async initialize(ipcMain) {
    await this.initServices(); // PostgreSQL 비동기 초기화 필요
    this.initializeModules();
    this.registerIpcHandlers(ipcMain);
  }

  // 서비스 조회 헬퍼 메서드
  static get(serviceName) {
    if (!this.services) {
      throw new Error("Services not initialized. Call initialize() first.");
    }
    return this.services[serviceName];
  }
}

module.exports = AppContainer;
