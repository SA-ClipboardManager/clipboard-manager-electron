import { serviceConfig } from "./serviceConfig.js";

class AppContainer {
  static services = {};
  static modules = {};

  // 서비스 등록
  static initServices() {
    for (const [name, factory] of Object.entries(serviceConfig)) {
      this.services[name] = factory(this);
    }
  }

  static initializeModules() {
    // 모듈 인스턴스 생성 및 등록
    this.modules.cloudModule = new CloudModule(this);
  }

  // 모든 모듈의 IPC 핸들러를 등록
  static registerIpcHandlers(ipcMain) {
    for (const [name, moduleInstance] of Object.entries(this.modules)) {
      if (typeof moduleInstance.registerIpcHandlers === "function") {
        moduleInstance.registerIpcHandlers(ipcMain);
      }
    }
  }

  static initialize(ipcMain) {
    this.initServices();
    this.initializeModules();
    this.registerIpcHandlers(ipcMain);
  }
}

export default AppContainer;
