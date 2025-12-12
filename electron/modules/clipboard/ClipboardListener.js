// src/main/modules/clipboard/ClipboardListener.js
const { EventEmitter } = require("events");
const { clipboard, app } = require("electron");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const crypto = require("crypto");
const ImageProcessor = require("../../shared/utility/imageProcessor");

class ClipboardListener extends EventEmitter {
  /**
   * @param {import('./ClipboardService').ClipboardService} clipboardService
   */
  constructor(clipboardService) {
    super();
    this.service = clipboardService;
    this.intervalId = null;
    this.imageProcessor = new ImageProcessor();

    this.POLL_INTERVAL_MS = 200;

    // 상태 변수들
    this.lastText = null;
    this.lastImageHash = null;
    this.isProcessingImage = false;

    this.recentImageHashes = new Set();
    this.recentImageTimestamps = new Map();

    this.imageDir = null;
  }

  async ensureImageDir() {
    if (this.imageDir) return;
    await app.whenReady();
    this.imageDir = path.join(app.getPath("documents"), "CCD", "original");
  }

  getImageHash(nativeImage) {
    const buffer = nativeImage.toPNG();
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  start() {
    if (this.intervalId) return;

    this.ensureImageDir().then(() => {
      console.log("[ClipboardListener] Monitoring started.");
    });

    this.intervalId = setInterval(async () => {
      await this._checkClipboard();
    }, this.POLL_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[ClipboardListener] Monitoring stopped.");
    }
  }

  async _checkClipboard() {
    try {
      const now = Date.now();
      const text = clipboard.readText();

      // 1. 텍스트 감지
      if (text && text.trim() !== "") {
        if (text === this.lastText) return;

        if (
          this.skipContentType === "text" &&
          this.skipCopyContent.has(text) &&
          now - this.skipTimestamp < 3000
        ) {
          this.lastText = text;
          return;
        }

        this.lastText = text;
        this.emit("change", {
          id: uuidv4(),
          type: "txt",
          format: "text/plain",
          content: text,
          created_at: now,
        });
        return;
      }

      // 2. 이미지 감지
      const image = clipboard.readImage();
      if (!image.isEmpty() && !this.isProcessingImage) {
        const currentHash = this.getImageHash(image);

        // 중복 방지 로직 (기존 monitor.js 로직 유지)
        if (
          this.recentImageHashes.has(currentHash) &&
          now - (this.recentImageTimestamps.get(currentHash) || 0) < 3000
        ) {
          this.lastImageHash = currentHash;
          return;
        }
        // ... (나머지 중복 체크 및 skip 로직 동일하게 적용)

        if (currentHash === this.lastImageHash) return;

        this.lastImageHash = currentHash;
        this.isProcessingImage = true;

        try {
          const id = uuidv4();
          const imageBuffer = image.toPNG();
          // 파일 저장은 여기서 수행하고 경로만 Service로 넘김
          const savedMeta = await this.imageProcessor.saveClipboardImage(
            imageBuffer,
            this.imageDir,
            id
          );

          this.emit("change", {
            id,
            type: "img",
            format: "png",
            content: savedMeta.file_path,
            created_at: now,
            imageMeta: savedMeta,
          });
        } finally {
          this.isProcessingImage = false;
        }
      }
    } catch (err) {
      console.error("[ClipboardListener] Error checking clipboard:", err);
    }
  }
}

module.exports = { ClipboardListener };
