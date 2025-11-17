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
   * 원본 이미지 경로를 기반으로 썸네일을 생성하고, 생성된 경로를 반환합니다.
   * @param {string} imagePath - 원본 이미지 파일 경로.
   * @returns {Promise<string>} 생성된 썸네일 파일 경로.
   */
  async generateThumbnail(imagePath) {
    const ext = path.extname(imagePath);

    // 썸네일 경로: 원본 경로/thumb_[파일명].png
    const thumbnailPath = path.join(
      path.dirname(imagePath),
      `thumb_${path.basename(imagePath, ext)}.png`
    );

    try {
      await sharp(imagePath)
        .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, { fit: "inside" })
        .toFormat("png") // 썸네일은 PNG로 통일
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
