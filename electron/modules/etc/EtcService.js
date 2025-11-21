const { clipboard, BrowserWindow, nativeImage } = require("electron");
const http = require("http");
const https = require("https");
const { Buffer } = require("buffer");
const crypto = require("crypto");
const CCDError = require("../../shared/errors/CCDError");

class EtcService {
  /**
   * @param {import('../../infrastructure/repositories/ClipboardRepository')} clipboardRepository
   * @param {import('../clipboard/ClipboardService').ClipboardService} clipboardService
   */
  constructor(clipboardRepository, clipboardService) {
    this.repository = clipboardRepository;
    this.clipboardService = clipboardService;
  }

  async loadClipboardRecords() {
    return await this.repository.getAll();
  }

  async pasteItem(itemId) {
    try {
      const item = await this.repository.getById(itemId);
      if (!item) throw new Error("Data not found");

      const type = item.type === "txt" ? "text" : "image";

      if (type === "text") {
        // 1. 시스템 클립보드에 쓰기
        clipboard.writeText(item.content);

        // 2. 모니터링 제외 등록 (Service 호출)
        this.clipboardService.registerSkip(item.content, "text");
      } else if (type === "image") {
        let image;
        if (item.shared === "cloud" && item.content.startsWith("http")) {
          // URL 이미지 처리 (별도 메서드 가정)
          await this.copyImageFromUrl(item.content);
          image = clipboard.readImage(); // 쓴 것 다시 읽기
        } else {
          image = nativeImage.createFromPath(item.content);
          clipboard.writeImage(image);
        }

        // 해시 계산 (Monitor와 동일한 알고리즘 사용 필수)
        const hash = crypto
          .createHash("sha256")
          .update(image.toPNG())
          .digest("hex");

        // 3. 모니터링 제외 등록
        this.clipboardService.registerSkip(hash, "image");
      }
    } catch (error) {
      throw CCDError.create("E655", {
        module: "pasteById",
        context: "붙여넣기 실패",
        message: error,
      });
    }
  }

  copyImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith("https") ? https : http;
      client
        .get(url, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const buffer = Buffer.concat(chunks);
              const image = nativeImage.createFromBuffer(buffer);
              clipboard.writeImage(image);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        })
        .on("error", (err) => reject(err));
    });
  }

  notifyItemSaved(items) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && win.webContents) {
      win.webContents.send("clipboard-updated", items);
    }
  }
}

module.exports = EtcService;
