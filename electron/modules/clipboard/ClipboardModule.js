// src/main/modules/clipboard/ClipboardModule.js
const BaseModule = require("../../main/core/BaseModule");
const { ClipboardListener } = require("./ClipboardListener");
const ImageProcessor = require("../../shared/utility/imageProcessor");
const { app } = require("electron");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");

class ClipboardModule extends BaseModule {
  /**
   * @param {object} services
   */
  constructor(services) {
    super(services, "clipboard");
    // this.service = services.ClipboardService; // ClipboardService 인스턴스

    this.services = services;
    this.service = services.ClipboardService;

    this.listener = new ClipboardListener(this.service);
    this.testImageProcessor = new ImageProcessor();

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

    this.listener.on("change", async (payload) => {
      try {
        // DB에 저장하고 저장된 항목 객체를 반환받음
        const savedItem = await this.service.saveFromListener(payload);

        const itemForNotify = payload.imageMeta ? { ...savedItem, meta: payload.imageMeta } : savedItem;

        // EtcService가 있으면 렌더러에 변경사항(증분)을 알림
        if (this.services && this.services.NotifyService && itemForNotify) {
          // notifyItemSaved은 배열을 받는 것으로 되어 있으므로 배열로 전달
          this.services.NotifyService.notifyItemSaved([itemForNotify]);
        }
      } catch (error) {
        console.error("[ClipboardModule] Failed to handle clipboard change:", error);
      }
    });

    // 감지 시작
    this.listener.start();
  }

  registerIpcHandler(ipcMain) {
    // 클립보드 관련 IPC (예: 복사 일시 중지, 수동 추가 등)
    ipcMain.handle("clipboard-pause", () => this.listener.stop());
    ipcMain.handle("clipboard-resume", () => this.listener.start());

    ipcMain.handle("run-ui-delay-test", async (_, { count = 100, testId } = {}) => {
      try {
        const result = await this._runUiDelayTest({ count, testId });
        return { success: true, ...result };
      } catch (error) {
        console.error("[ClipboardModule] UI delay test failed:", error);
        return { success: false, message: error.message };
      }
    });
  }

  async _runUiDelayTest({ count = 100, testId }) {
    // Generate valid 1x1 PNG buffer programmatically using sharp
    const pngBuffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const targetDir = path.join(app.getPath("documents"), "CCD", "original");
    const runId = testId || `ui-delay-${Date.now()}`;

    for (let i = 0; i < count; i += 1) {
      const id = `${runId}-${uuidv4()}`;
      const createdAt = Date.now();

      const imageMeta = await this.testImageProcessor.saveClipboardImage(pngBuffer, targetDir, id);

      const savedItem = await this.service.saveFromListener({
        id,
        type: "img",
        format: "png",
        content: imageMeta.file_path,
        created_at: createdAt,
        imageMeta,
      });

      const itemForNotify = {
        ...savedItem,
        meta: imageMeta,
        uiTestId: runId,
        uiEmittedAt: createdAt,
      };

      this.services.NotifyService.notifyItemSaved([itemForNotify]);
    }

    return { count, testId: runId };
  }
}

module.exports = ClipboardModule;
