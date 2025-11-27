const fs = require("fs-extra");
const SQLiteClipboardReader = require("./readers/SQLiteClipboardReader");
const SQLiteUnitOfWork = require("../uow/SQLiteUnitOfWork");
const CCDError = require("../../shared/errors/CCDError");
const ImageProcessor = require("../../shared/utility/imageProcessor");

class ClipboardRepository {
  /**
   * @param {import('../database/DatabaseContext')} dbContext
   */
  constructor(dbContext) {
    this.db = dbContext.getDb();
    this.reader = new SQLiteClipboardReader(this.db);
    this.uow = new SQLiteUnitOfWork(dbContext);
    this.imageProcessor = new ImageProcessor();
  }

  /**
   * 클립보드 항목 저장 (트랜잭션 처리)
   * @param {object} item
   * @param {object} [meta]
   */
  async save(item, meta) {
    try {
      return this.uow.execute((ctx) => {
        // Writer를 통해 DB 저장
        return ctx.clipboard.save(item, meta);
      });
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "save",
        message: error.message,
        cause: error,
      });
    }
  }

  /**
   * ID로 항목 단건 조회
   * @param {string} id
   */
  getById(id) {
    try {
      const item = this.reader.getClipboardItem(id);
      if (!item) return null;

      // 이미지 파일 유효성 검사 (누락 시 DB와 파일 시스템 동기화 필요)
      if (item.type === "img" && item.imageMeta) {
        const { file_path, thumbnail_path } = item.imageMeta;

        // 원본 파일 없으면 데이터 자체가 무효함
        if (file_path && !fs.existsSync(file_path)) {
          console.warn(`[Repo] 원본 누락됨. 삭제 처리: ${id}`);
          this.delete(id).catch(console.error); // 비동기 삭제 요청
          return null;
        }

        // 썸네일만 없으면 재생성 시도
        if (thumbnail_path && !fs.existsSync(thumbnail_path)) {
          console.warn(`[Repo] 썸네일 누락됨. 재생성 시도: ${id}`);
          this._regenerateThumbnail(id, file_path).catch(console.error);
        }
      }

      return item;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "getById",
        message: error.message,
      });
    }
  }

  /**
   * 전체 항목 조회 (UI 표시용)
   */
  getAll() {
    return this.reader.getAllClipboardItems();
  }

  /**
   * 검색
   */
  search(query, options) {
    return this.reader.search(query, options);
  }

  /**
   * 항목 삭제 (파일 삭제 + DB 삭제 + Outbox 기록)
   * @param {string} id
   */
  async delete(id) {
    try {
      // 1. 파일 삭제를 위해 메타데이터 먼저 조회
      const meta = this.reader.getImageMeta(id);

      // 2. 파일 시스템에서 물리적 파일 삭제 (DB 트랜잭션 외부 수행)
      if (meta) {
        if (meta.file_path) await fs.remove(meta.file_path).catch(() => {});
        if (meta.thumbnail_path)
          await fs.remove(meta.thumbnail_path).catch(() => {});
      }

      // 3. DB 삭제 (트랜잭션)
      return this.uow.execute((ctx) => {
        // 삭제 사실을 Sync 모듈이 알 수 있도록 Outbox에 기록
        ctx.outbox.enqueue("DELETE", id, {});
        ctx.clipboard.delete(id);
      });
    } catch (error) {
      throw CCDError.create("E630", {
        module: "ClipboardRepository",
        context: "delete",
        message: `삭제 실패: ${id}`,
        cause: error,
      });
    }
  }

  /**
   * 썸네일 재생성 (내부 헬퍼)
   * @private
   */
  async _regenerateThumbnail(id, originalPath) {
    try {
      const newThumbPath = await this.imageProcessor.generateThumbnail(
        originalPath
      );
      // DB 업데이트 (단일 업데이트라 트랜잭션 없이 수행해도 무방하나 UoW 사용 권장)
      this.uow.execute((ctx) => {
        ctx.clipboard.updateThumbnailPath(id, newThumbPath);
      });
    } catch (err) {
      console.error(`[Repo] 썸네일 재생성 실패: ${id}`, err);
    }
  }

    /**
     * Search Service 용
     */

    getAllClipboardWithMetaAndTags(){
        return this.reader.getAllClipboardWithMetaAndTags();
    }


}

module.exports = ClipboardRepository;
