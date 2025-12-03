// src/main/modules/clipboard/ClipboardModule.js
const BaseModule = require('../../main/core/BaseModule');
const { ClipboardListener } = require('./ClipboardListener');

class ClipboardModule extends BaseModule {
  /**
   * @param {object} services
   */
  constructor(services) {
    super(services, 'clipboard');
    // this.service = services.ClipboardService; // ClipboardService 인스턴스

    this.services = services;
    this.service = services.ClipboardService;

    this.listener = new ClipboardListener(this.service);

    // 모듈 로드 시 바로 리스너 시작 (또는 필요 시점에 start 호출)
    this._initializeListener();
  }

  _initializeListener() {
    // 리스너 이벤트 -> 서비스 메서드 연결
    // this.listener.on("change", async (payload) => {
    //   try {
    //     await this.service.saveFromListener(payload);
    //   } catch (error) {
    //     console.error(
    //       "[ClipboardModule] Failed to handle clipboard change:",
    //       error
    //     );
    //   }
    // });

    this.listener.on('change', async (payload) => {
      try {
        // DB에 저장하고 저장된 항목 객체를 반환받음
        const savedItem = await this.service.saveFromListener(payload);

        // EtcService가 있으면 렌더러에 변경사항(증분)을 알림
        if (this.services && this.services.NotifyService && savedItem) {
          // notifyItemSaved은 배열을 받는 것으로 되어 있으므로 배열로 전달
            //TODO EventEmitter로 변경
          this.services.NotifyService.notifyItemSaved([savedItem]);
        }
      } catch (error) {
        console.error('[ClipboardModule] Failed to handle clipboard change:', error);
      }
    });

    // 감지 시작
    this.listener.start();
  }

  registerIpcHandler(ipcMain) {
    // 클립보드 관련 IPC (예: 복사 일시 중지, 수동 추가 등)
    ipcMain.handle('clipboard-pause', () => this.listener.stop());
    ipcMain.handle('clipboard-resume', () => this.listener.start());
  }
}

module.exports = ClipboardModule;
