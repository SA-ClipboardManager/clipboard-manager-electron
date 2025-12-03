const { clipboard, BrowserWindow, nativeImage } = require("electron");
const http = require("http");
const https = require("https");
const { Buffer } = require("buffer");
const crypto = require("crypto");
const CCDError = require("../../shared/errors/CCDError");
const {
  makeFileUrl,
  resolveCcdUrl,
} = require("../../shared/utility/pathUtils");

class NotifyService {
  /**
   * @param {import('../../infrastructure/repositories/ClipboardRepository')} clipboardRepository
   * @param {import('../clipboard/ClipboardService').ClipboardService} clipboardService
   * @param {import('../sync/SyncCoordinator').SyncCoordinator} syncCoordinator
   */
  constructor(clipboardRepository, clipboardService, syncCoordinator) {
    this.repository = clipboardRepository;
    this.clipboardService = clipboardService;
    this.syncCoordinator = syncCoordinator;
  }

  _transformItemPaths(item) {
    // isSynced를 shared로 변환
    // isSynced가 true면 "both" (로컬 + 클라우드), false면 "local"
    item.shared = item.isSynced ? "both" : "local";

    if (item.type === "img") {
      // Prioritize thumbnail for UI display, fallback to original content
      const displayPath = item.meta?.thumbnail_path || item.content;
      const fileUrl = makeFileUrl(displayPath);
      if (fileUrl) {
        item.content = fileUrl;
      }

      // Also transform the thumbnail_path in meta for consistency
      if (item.meta?.thumbnail_path) {
        const thumbnailUrl = makeFileUrl(item.meta.thumbnail_path);
        if (thumbnailUrl) {
          item.meta.thumbnail_path = thumbnailUrl;
        }
      }
    }
    return item;
  }

  async loadClipboardRecords() {
    const items = await this.repository.getAll();
    return items.map((item) => this._transformItemPaths(item));
  }

  async deleteItem(dataId, deleteOption) {
    try {
      const option = deleteOption || "both";
      let deletionResult = false;

      if (option === "local" || option === "both") {
        await this.repository.delete(dataId);
        deletionResult = true;
      }

      if ((option === "cloud" || option === "both") && this.syncCoordinator) {
        await this.syncCoordinator.requestDelete([dataId]);
        await this.syncCoordinator.processPendingUploads();
        deletionResult = true;
      }

      return {
        deletionResult,
        refreshReq: deletionResult,
      };
    } catch (error) {
      throw CCDError.create("E656", {
        module: "EtcService",
        context: "deleteItem",
        message: error.message,
      });
    }
  }

  async pasteItem(itemId) {
    try {
      const item = await this.repository.getById(itemId);
      if (!item) throw new Error("Data not found");

      const type = item.type === "txt" ? "text" : "image";

      if (type === "text") {
        // 1. 모니터링 제외 등록 (Service 호출)
        this.clipboardService.registerSkip(item.content, "text");
        // 2. 시스템 클립보드에 쓰기
        clipboard.writeText(item.content);
      } else if (type === "image") {
        let image;
        if (item.shared === "cloud" && item.content.startsWith("http")) {
          // URL 이미지 처리 (별도 메서드 가정)
          await this.copyImageFromUrl(item.content);
          image = clipboard.readImage(); // 쓴 것 다시 읽기
        } else {
          const realPath = resolveCcdUrl(item.content);
          image = nativeImage.createFromPath(realPath);
        }

        // 해시 계산 (Monitor와 동일한 알고리즘 사용 필수)
        const hash = crypto
          .createHash("sha256")
          .update(image.toPNG())
          .digest("hex");

        // 모니터링 제외 등록
        this.clipboardService.registerSkip(hash, "image");
        // 시스템 클립보드에 쓰기
        clipboard.writeImage(image);
      }
    } catch (error) {
      throw CCDError.create("E655", {
        module: "pasteById",
        context: "붙여넣기 실패",
        message: error.message,
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
    const transformedItems = items.map((item) =>
      this._transformItemPaths(item)
    );
    const win = BrowserWindow.getAllWindows()[0];
    if (win && win.webContents) {
      win.webContents.send("clipboard-updated", transformedItems);
    }
  }
}

module.exports = NotifyService;
