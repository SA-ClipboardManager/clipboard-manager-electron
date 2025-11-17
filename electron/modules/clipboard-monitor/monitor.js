const { EventEmitter } = require("events");
const { clipboard, app } = require("electron");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs-extra");
const crypto = require("crypto");
const CCDError = require("../CCDError"); // TODO: file path 변경
const { type } = require("os");

// TODO: path 변경
// documents/CCD 내부에 이미지 저장
// const documentsDir = app.getPath('documents');
// const imageDir = path.join(documentsDir, 'CCD', 'original');
// fs.ensureDirSync(imageDir);

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
async function ensureImageDir() {
  try {
    await app.whenReady();
    const documentsDir = app.getPath("documents");
    imageDir = path.join(documentsDir, "CCD", "original");
    fs.ensureDirSync(imageDir);
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

async function saveImageToDiskAsync(nativeImage, id) {
  try {
    const filePath = path.join(imageDir, `${id}.png`);
    const buffer = nativeImage.toPNG();
    await fs.writeFile(filePath, buffer);

    return filePath;
  } catch (err) {
    // TODO: Error
    console.error(err);
    throw err;
  }
}

function start() {
  if (intervalId) return null;

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

        const id = uuidv4();
        const filePath = await saveImageToDiskAsync(image, id);

        const payload = {
          id,
          type: "img",
          format: "png",
          content: filePath,
          imageMeta: { file_path: filePath },
        };

        emitter.emit("item", payload);
        isProcessingImage = false;
      }
    } catch (err) {
      // TODO: Error
      console.error(err);
      throw err;
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
