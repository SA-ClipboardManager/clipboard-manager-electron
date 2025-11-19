// ccd-main/features/clipboard/index.js
// 클립보드 모듈 초기화 + event routing 역할만 맡음

const monitor = require("./monitor");
const CCDError = require("../shared/errors/CCDError");
const { LocalRepository } = require("../local-data/LocalRepository");

/**
 * 클립보드 모듈 초기화
 */
function initClipboardModule() {
  startMonitoring();
}

/**
 * 모니터링 시작 — monitor는 감지만, index는 저장 담당
 */
function startMonitoring() {
  const emitter = monitor.start();

  if (!emitter) return;

  emitter.on("item", async (payload) => {
    try {
      // monitor는 "txt", "img" 형태로 넘기므로 그대로 사용
      const createdAtSeconds = Math.floor(payload.created_at / 1000);

      const itemToSave = {
        id: payload.id,
        type: payload.type, // 'txt' | 'img'
        format: payload.format, // 'text/plain' | 'png'
        content: payload.content, // 텍스트 내용 또는 이미지 파일 경로
        created_at: createdAtSeconds,
        is_synced: 0, // 초기 저장 시 미동기화 상태
      };
      let meta = null;
      if (payload.type === "img" && payload.imageMeta) {
        meta = {
          data_id: payload.id,
          file_path: payload.imageMeta.file_path,
          width: null,
          height: null,
          file_size: null,
          thumbnail_path: null,
        };
      }
      const success = await LocalRepository.saveClipboardItem(itemToSave, meta);
    } catch (err) {
      const error = CCDError.create("E630", {
        module: "index",
        context: "클립보드 감지/저장 실패",
        details: err,
      });
      console.error(error);
    }
  });
}

module.exports = { initClipboardModule };
