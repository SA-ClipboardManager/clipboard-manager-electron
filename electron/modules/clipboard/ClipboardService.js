// src/main/modules/clipboard/ClipboardService.js
const CCDError = require("../../shared/errors/CCDError");

class ClipboardService {
  /**
   * @param {import('../../infrastructure/repositories/ClipboardRepository')} repository
   */
  constructor(repository, cloudService) {
    this.repository = repository;
    this.cloudService = cloudService;
    this.skipCopyContent = new Set();
    this.skipContentType = null;
    this.skipTimestamp = 0;
  }
  /**
   * 외부(EtcService 등)에서 클립보드를 변경했을 때, 모니터링에서 제외하도록 등록
   * @param {string} content - 텍스트 내용 또는 이미지 해시
   * @param {'text'|'image'} type
   */
  registerSkip(content, type) {
    this.skipCopyContent.add(content);
    this.skipContentType = type;
    this.skipTimestamp = Date.now();

    // 3초 후 자동 만료 (메모리 누수 방지)
    setTimeout(() => {
      this.skipCopyContent.delete(content);
    }, 3000);

    console.log(`[ClipboardService] Skip registered for ${type}`);
  }

  /**
   * 리스너가 현재 콘텐츠를 스킵해야 하는지 확인
   * @param {string} content
   * @param {'text'|'image'} type
   * @returns {boolean}
   */
  shouldSkip(content, type) {
    const now = Date.now();
    if (
      this.skipContentType === type &&
      this.skipCopyContent.has(content) &&
      now - this.skipTimestamp < 3000
    ) {
      return true;
    }
    return false;
  }

  /**
   * 감지된 클립보드 데이터를 저장 처리
   * @param {object} payload - Listener에서 넘어온 원본 데이터
   */
  async saveFromListener(payload) {
    try {
      console.log(`[ClipboardService] saveFromListener payload:`, {
        id: payload.id,
        type: payload.type,
        hasImageMeta: !!payload.imageMeta,
        imageMeta: payload.imageMeta,
      });

      // 데이터 가공 로직 (기존 index.js의 로직 이동)
      const createdAtSeconds = Math.floor(payload.created_at / 1000);

      const itemToSave = {
        id: payload.id,
        type: payload.type, // 'txt' | 'img'
        format: payload.format, // 'text/plain' | 'png'
        content: payload.content, // 텍스트 내용 또는 파일 경로
        created_at: createdAtSeconds,
        is_synced: 0,
      };

      let meta = null;
      if (payload.type === "img" && payload.imageMeta) {
        meta = {
          data_id: payload.id,
          file_path: payload.imageMeta.file_path,
          width: payload.imageMeta.width,
          height: payload.imageMeta.height,
          file_size: payload.imageMeta.file_size,
          thumbnail_path: payload.imageMeta.thumbnail_path,
        };
        console.log(`[ClipboardService] Image meta prepared:`, meta);
      }

      // 리포지토리를 통해 DB 저장
      await this.repository.save(itemToSave, meta);

      console.log(
        `[ClipboardService] Item saved: ${payload.id} (${
          payload.type
        }), hasMeta: ${!!meta}`
      );
      return itemToSave;
    } catch (error) {
      throw CCDError.create("E630", {
        module: "ClipboardService",
        context: "saveFromListener",
        message: error.message,
        cause: error,
      });
    }
  }
}

module.exports = { ClipboardService };
