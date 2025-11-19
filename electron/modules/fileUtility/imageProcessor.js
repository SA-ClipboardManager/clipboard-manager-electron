// image.processor.js (File Utility Module)
// CommonJS

const fs = require("fs-extra");
const sharp = require("sharp");
const path = require("path");
const CCDError = require("../shared/errors/CCDError");

/**
 * 이미지 파일 처리 및 파일 시스템 I/O를 담당하는 유틸리티 클래스
 */
class ImageProcessor {
  constructor() {
    this.THUMBNAIL_SIZE = 200; // 썸네일 최대 크기
  }
  /**
   * 클립보드 이미지 버퍼를 파일로 저장하고 메타데이터를 반환합니다.
   * @param {Buffer} imageBuffer - Electron NativeImage에서 변환된 PNG 버퍼
   * @param {string} saveDir - 저장할 디렉토리 경로
   * @param {string} fileName - 데이터 UUID
   * @returns {Promise<object>} { filePath, width, height, file_size }
   */
  async saveClipboardImage(imageBuffer, saveDir, fileName) {
    try {
      await fs.ensureDir(saveDir);

      const filePath = path.join(saveDir, `${fileName}.png`);

      const info = await sharp(imageBuffer).png().toFile(filePath);

      const thumbnailPath = await this.generateThumbnail(filePath);

      return {
        file_path: filePath,
        width: info.width,
        height: info.height,
        file_size: info.size,
        thumbnailPath: thumbnailPath,
      };
    } catch (error) {
      throw CCDError.create("E710", {
        module: "ImageProcessor",
        context: "이미지 저장 실패",
        message: `파일명: ${fileName}`,
        cause: error.message,
      });
    }
  }

  /**
   * 지정된 경로의 파일을 삭제
   * @param {string} filePath - 삭제할 파일의 경로.
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    try {
      if (filePath && (await fs.pathExists(filePath))) {
        await fs.unlink(filePath);
      }
    } catch (error) {
      console.error(`파일 삭제 실패: ${filePath}`, error);
      // 파일 삭제 실패는 치명적이지 않을 수 있으므로 경고만 로깅하고 오류는 상위로 전파하지 않거나,
      // CCDError를 throw하여 상위 CleanupService에서 처리하도록 합니다. (여기서는 throw)
      throw CCDError.create("E711", {
        module: "ImageProcessor",
        context: "파일 삭제 실패",
        message: `경로: ${filePath}`,
        cause: error.message,
      });
    }
  }

  /**
   * 원본 이미지 경로를 originalPath 썸네일을 생성하고, 생성된 경로를 반환합니다.
   * @param {string} originalPath - 원본 이미지 파일 경로.
   * @returns {Promise<string>} 생성된 썸네일 파일 경로.
   */
  async generateThumbnail(originalPath) {
    try {
      const dir = path.dirname(originalPath);
      const ext = path.extname(originalPath);
      const name = path.basename(originalPath, ext);

      const thumbnailDir = path.join(dir, "thumbnails");
      await fs.ensureDir(thumbnailDir);

      const thumbnailPath = path.join(thumbnailDir, `thumb_${name}.png`);

      await sharp(originalPath)
        .resize({
          width: this.THUMBNAIL_SIZE,
          height: this.THUMBNAIL_SIZE,
          fit: "inside",
        })
        .png({ quality: 80 })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.error(`썸네일 생성 실패: ${imagePath}`, error);
      throw CCDError.create("E712", {
        module: "ImageProcessor",
        context: "썸네일 생성 실패",
        message: `원본 경로: ${imagePath}`,
        cause: error.message,
      });
    }
  }
}

module.exports = ImageProcessor;
