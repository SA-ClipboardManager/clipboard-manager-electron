// localRepository.interface.js (Core Module)
// CommonJS

/**
 * @typedef {'txt' | 'img'} ClipDataType
 */

/**
 * @typedef {object} ImageMeta
 * @property {string} data_id
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [file_size]
 * @property {string} file_path
 * @property {string} [thumbnail_path]
 */

/**
 * @typedef {object} Tag
 * @property {string} tag_id - 서버에서 확정된 UUID (로컬에 저장된 tag_id). NULL일 수 있음.
 * @property {string} local_id - 클라이언트에서 생성된 UUID (로컬 PK).
 * @property {string} name - 태그 이름.
 * @property {string} source - 태그 출처 ('auto' 또는 'user').
 */

/**
 * @typedef {object} ClipData
 * @property {string} id
 * @property {ClipDataType} type
 * @property {string} format
 * @property {string} content
 * @property {number} created_at
 * @property {number} [is_synced] // 0: 대기/실패, 1: 완료
 * @property {Array<Tag>} [tags]
 */

/**
 * @typedef {object} PendingSyncItem
 * @property {number} id
 * @property {string} op // 'INSERT', 'UPDATE', 'DELETE'
 * @property {string} data_id
 * @property {string} op_args // JSON string of arguments
 * @property {number} created_at
 */

/**
 * 클립보드 데이터 저장소의 추상 인터페이스
 * @interface ILocalRepository
 */
class ILocalRepository {
  // ------------------- CRUD 메서드 -------------------
  /**
   * 클립보드 항목을 저장하고 동기화 이벤트를 아웃박스에 기록
   * @param {ClipData} item
   * @param {ImageMeta} [meta]
   * @returns {Promise<boolean>}
   */
  async saveClipboardItem(item, meta) {
    throw new Error("Method must be implemented");
  }

  /**
   * ID로 클립보드 항목을 조회 (메타데이터, 태그 포함).
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async getClipboardItem(id) {
    throw new Error("Method must be implemented");
  }

  /**
   * 모든 클립보드 항목을 메타데이터 및 태그와 함께 조회합니다.
   * @returns {Array<object>} 클립보드 항목 객체 배열.
   */
  async getAllClipboardItems() {
    throw new Error("Method must be implemented");
  }

  /**
   * 클립보드 항목을 삭제하고 동기화 이벤트를 기록
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteClipboardItem(id) {
    throw new Error("Method must be implemented");
  }

  /**
   * 로컬 검색(FTS5)을 수행하고 ID 목록을 반환
   * @param {string} query
   * @param {object} options
   * @returns {string[]}
   */
  searchItems(query, options) {
    throw new Error("Method must be implemented");
  }

  // ------------------- Outbox 메서드 -------------------
  /**
   * 동기화 대기 중인 이벤트를 조회
   * @returns {PendingSyncItem[]}
   */
  getPendingSyncItems() {
    throw new Error("Method must be implemented");
  }

  /**
   * 동기화 완료된 pending item을 제거
   * @param {number} id
   */
  clearPendingItem(id) {
    throw new Error("Method must be implemented");
  }

  // ------------------- 태그 관련 메서드 -------------------
  /**
   * 태그 ID를 변경하고 data_tag 테이블에 반영
   * @param {string} oldId
   * @param {string} newId
   * @returns {object}
   */
  updateTagId(localId, serverId) {
    throw new Error("Method must be implemented");
  }

  /**
   * 태그를 DB에 삽입하고 해당 클립보드 데이터에 연결
   * @param {string} dataId - 연결할 클립보드 항목 ID.
   * @param {object} tag - 태그 객체. { name: string, source: 'auto' | 'user' }
   * @param {string | null} [serverId] - 클라우드에서 확정된 서버 UUID (tag_id). (선택적)
   * @returns {{localId: string, isNew: boolean}} - 새로 생성된 태그의 localId 및 생성 여부
   */
  insertTagAndConnect(dataId, tag, serverId = null) {
    throw new Error("Method must be implemented");
  }

  /**
   * CleanupService를 위해 모든 이미지 메타데이터를 조회
   * @returns {Array<object>} - 이미지 메타데이터 객체 배열.
   */
  getAllImageMeta() {
    throw new Error("Method must be implemented");
  }

  /**
   * 이미지 메타데이터 테이블에서 썸네일 경로를 업데이트
   * @param {string} dataId - 클립보드 항목 ID.
   * @param {string | null} thumbnailPath - 새로운 썸네일 경로 또는 NULL.
   * @returns {void}
   */
  updateThumbnailPath(dataId, thumbnailPath) {
    throw new Error("Method must be implemented");
  }
}

module.exports = {
  ILocalRepository,
  ClipData,
  ImageMeta,
  PendingSyncItem,
  Tag,
};
