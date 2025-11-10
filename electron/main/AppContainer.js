class AppContainer {
  static modules = {};
  static initializeModules() {
    // 모듈 인스턴스 생성 및 등록
  }

  // 모든 모듈의 IPC 핸들러를 등록
  static registerIpcHandlers() {
    for (const [name, moduleInstance] of Object.entries(this.modules)) {
      if (typeof moduleInstance.registerIpcHandlers === "function") {
        moduleInstance.registerIpcHandlers(ipcMain, this);
      }
    }
  }
}
export default AppContainer;
