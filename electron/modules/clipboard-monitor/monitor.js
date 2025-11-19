const { EventEmitter } = require("events");
const ImageProcessor = require("../fileUtility/imageProcessor");
const { clipboard, app } = require("electron");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const crypto = require("crypto");
const CCDError = require("../shared/errors/CCDError");

let intervalId = null;
let isProcessingImage = false;
let lastImageHash = null;

let skipCopyContent = new Set();
let skipContentType = null;
let skipTimestamp = 0;

let recentImageHashes = new Set();
let recentImageTimestamps = new Map();

// imageDir 초기화는 app ready 이후에 수행하도록 변경
let imageDir = null;
const imageProcessor = new ImageProcessor();
async function ensureImageDir() {
  try {
    await app.whenReady();
    const documentsDir = app.getPath("documents");
    imageDir = path.join(documentsDir, "CCD", "original");
    console.log("[monitor] imageDir:", imageDir);
  } catch (err) {
    console.error("[monitor] ensureImageDir error", err);
    throw err;
  }
}

function getImageHash(nativeImage) {
  const buffer = nativeImage.toPNG();
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function start() {
  if (intervalId) return null;
  ensureImageDir();
  const emitter = new EventEmitter();

  intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const text = clipboard.readText();

      // Text 감지
      if (text && text !== undefined) {
        // skip
        if (
          skipContentType === "text" &&
          skipContentType.has(text) &&
          now - skipTimestamp < 3000
        ) {
          return;
        }

        const id = uuidv4();

        const payload = {
          id,
          type: "txt",
          format: "text/plain",
          content: text,
          created_at: now,
        };

        emitter.emit("item", payload);
        return;
      }

      // Image 감지
      const image = clipboard.readImage();
      if (!image.isEmpty() && !isProcessingImage) {
        const currentHash = getImageHash(image);

        // 최근 이미지 중복 방지
        if (
          recentImageHashes.has(currentHash) &&
          now - (recentImageTimestamps.get(currentHash) || 0) < 3000
        ) {
          lastImageHash = currentHash;
          return;
        }

        recentImageHashes.add(currentHash);
        recentImageTimestamps.set(currentHash, now);
        setTimeout(() => {
          recentImageHashes.delete(currentHash);
          recentImageTimestamps.delete(currentHash);
        }, 5000);

        if (currentHash === lastImageHash) return;

        // skip
        if (
          skipContentType === "image" &&
          skipCopyContent.has(currentHash) &&
          now - skipTimestamp < 3000
        ) {
          lastImageHash = currentHash;
          return;
        }

        lastImageHash = currentHash;
        isProcessingImage = true;

        try {
          const id = uuidv4();
          const imageBuffer = image.toPNG();

          const savedMeta = await imageProcessor.saveClipboardImage(
            imageBuffer,
            imageDir,
            id
          );

          const payload = {
            id,
            type: "img",
            format: "png",
            content: savedMeta.file_path,
            created_at: now,
            imageMeta: savedMeta,
          };

          emitter.emit("item", payload);
        } catch (saveErr) {
          console.error("이미지 저장 중 오류:", saveErr);
        } finally {
          isProcessingImage = false;
        }
      }
    } catch (err) {
      const error = CCDError.create("E630", {
        module: "monitor.js",
        context: "monitor start",
        details: err,
      });
    }
  }, 1000);

  return emitter;
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function skipNextCopy(content, type) {
  skipCopyContent.add(content);
  skipContentType = type;
  skipTimestamp = Date.now();

  setTimeout(() => {
    skipCopyContent.delete(content);
  }, 3000);
}

module.exports = { start, stop, skipNextCopy };
