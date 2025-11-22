/**
 * 클립보드 데이터 관리 전용 인터페이스
 * @interface
 */
class IClipboardRepository {
  /**
   * 클립보드 항목 저장
   * @param {object} item
   * @param {object} meta
   * @returns {Promise<void>}
   */
  async save(item, meta) { throw new Error("Not Implemented"); }

  /**
   * ID로 항목 조회
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async getById(id) { throw new Error("Not Implemented"); }

  /**
   * 모든 항목 조회 (UI 표시용)
   * @returns {Promise<Array<object>>}
   */
  async getAll() { throw new Error("Not Implemented"); }

  /**
   * 검색
   * @param {string} query
   * @param {object} options
   */
  async search(query, options) { throw new Error("Not Implemented"); }
  
  /**
   * 항목 삭제
   * @param {string} id
   */
  async delete(id) { throw new Error("Not Implemented"); }
}

module.exports = IClipboardRepository;