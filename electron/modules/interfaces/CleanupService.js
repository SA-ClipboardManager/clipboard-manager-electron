// cleanup.service.js (Core Module)
// CommonJS

const ImageProcessor = require("../utils/image.processor");
const { ILocalRepository } = require("../local-data/LocalRepository");
const CCDError = require("../shared/errors/CCDError");

/**
 * 로컬 클립보드 데이터의 주기적인 정리 및 유지보수 비즈니스 로직을 담당
 */
class CleanupService {
  /**
   * @param {ILocalRepository} repository
   */
  constructor(repository) {
    if (!(repository instanceof ILocalRepository)) {
      throw new Error(
        "CleanupService must be initialized with an ILocalRepository implementation."
      );
    }
    this.repository = repository;
    this.imageProcessor = new ImageProcessor();
  }

  /**
   * 주기적 정리 작업을 초기화 (24시간 주기).
   */
  initializeCleanup() {
    // 앱 시작 시 초기 정리
    this.cleanupImageFiles();

    // 24시간 주기로 정리 (86400000ms = 24시간)
    setInterval(() => this.cleanupImageFiles(), 86400000);
    console.log("CleanupService: 주기적 파일 정리 초기화됨.");
  }

  /**
   * 이미지 파일의 존재 여부를 확인하고 누락된 파일을 정리하거나 썸네일을 재생성
   */
  async cleanupImageFiles() {
    try {
      // 1. Repository를 통해 모든 이미지 메타데이터를 조회 (DB 접근)
      const allMeta = await this.repository.getAllImageMeta();

      for (const meta of allMeta) {
        const { data_id, file_path, thumbnail_path } = meta;
        const originalExists = await fs.pathExists(file_path);

        // 2. 원본 이미지가 존재하지 않는 경우
        if (!originalExists) {
          console.warn(
            `[Cleanup] 원본 이미지 누락: ${file_path}. 데이터베이스 항목 삭제 시작.`
          );

          // 썸네일 삭제 (ImageProcessor 사용)
          await this.imageProcessor.deleteFile(thumbnail_path);

          // 데이터베이스 항목 삭제 (Repository 사용)
          await this.repository.deleteClipboardItem(data_id); // deleteClipboardItem은 파일 삭제 기능이 제거되어야 함
          continue;
        }

        // 3. 썸네일이 존재하지 않는 경우
        const thumbnailExists = thumbnail_path
          ? await fs.pathExists(thumbnail_path)
          : false;

        if (!thumbnailExists) {
          await this.regenerateMissingThumbnail(data_id, file_path);
        }
      }
    } catch (error) {
      throw CCDError.create("E631", {
        module: "CleanupService",
        context: "이미지 파일 정리 실패",
        message: "내부 정리 로직 오류 발생",
        cause: error instanceof CCDError ? error.message : error,
      });
    }
  }

  /**
   * 썸네일이 누락된 항목에 대해 썸네일을 재생성하고 DB를 업데이트
   * @param {string} dataId
   * @param {string} imagePath
   */
  async regenerateMissingThumbnail(dataId, imagePath) {
    try {
      console.log(`[Cleanup] 썸네일 재생성: ${imagePath}`);
      // 1. 썸네일 생성 (ImageProcessor 사용)
      const thumbnailPath = await this.imageProcessor.generateThumbnail(
        imagePath
      );

      // 2. 데이터베이스 업데이트
      await this.repository.updateThumbnailPath(dataId, thumbnailPath); // LocalRepository 이 메서드가 추가되어야 함
    } catch (error) {
      // 재생성 실패 시 DB 항목을 NULL로 업데이트 (썸네일 경로 제거)
      await this.repository.updateThumbnailPath(dataId, null);

      throw CCDError.create("E632", {
        module: "CleanupService",
        context: "썸네일 재생성 실패",
        message: `데이터 ID: ${dataId}`,
        cause: error instanceof CCDError ? error.message : error,
      });
    }
  }
}

module.exports = CleanupService;
