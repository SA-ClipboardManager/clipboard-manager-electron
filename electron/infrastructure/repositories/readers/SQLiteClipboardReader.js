// infrastructure/repositories/readers/SQLiteClipboardReader.js
const path = require("path");
const { app } = require("electron");
const fs = require("fs-extra");
const CCDError = require("../../../shared/errors/CCDError");

class SQLiteClipboardReader {
  /**
   * @param {import('better-sqlite3').Database} db - DatabaseContext에서 주입된 인스턴스
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * ID로 단일 클립보드 항목 조회 (태그, 이미지 메타데이터 포함)
   * @param {string} id
   * @returns {object | null}
   */
  getClipboardItem(id) {
    try {
      // 1. 클립보드 기본 정보 + 이미지 메타데이터 조인 조회
      const stmt = this.db.prepare(`
        SELECT 
          c.*, 
          im.width, im.height, im.file_size, im.file_path, im.thumbnail_path
        FROM clipboard c
        LEFT JOIN image_meta im ON c.id = im.data_id
        WHERE c.id = ?
      `);

      const row = stmt.get(id);
      if (!row) return null;

      // 2. 이미지 파일 존재 여부 확인 (읽기 시점 유효성 검사)
      // 주의: CQRS Reader에서는 데이터를 삭제(Delete)하지 않고, 유효하지 않으면 null을 반환하거나 그대로 둡니다.
      if (row.type === "img" && row.file_path) {
        if (!fs.existsSync(row.file_path)) {
          console.warn(`[Reader] 원본 파일 누락 확인: ${row.id}`);
          // 원본 코드는 여기서 삭제 로직을 호출했지만, Reader는 조회만 담당하므로
          // null을 반환하여 UI에서 제외하거나, 호출부(Service)에서 처리하도록 합니다.
          return null;
        }
      }

      // 3. 태그 조회
      const tagsStmt = this.db.prepare(`
        SELECT t.name, t.tag_id, t.source, t.local_id
        FROM tag t
        JOIN data_tag dt ON t.local_id = dt.tag_id
        WHERE dt.data_id = ?
      `);
      const tags = tagsStmt.all(id);

      // 이미지 메타데이터 추출
      const imageMeta = row.file_path
        ? {
            data_id: row.id,
            width: row.width,
            height: row.height,
            file_size: row.file_size,
            file_path: row.file_path,
            thumbnail_path: row.thumbnail_path,
          }
        : null;

      return this._mapRowToEntity(row, imageMeta, tags);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardReader",
        context: "getClipboardItem",
        message: error.message,
      });
    }
  }

  /**
   * 모든 클립보드 항목 조회
   * @returns {Array<object>}
   */
  getAllClipboardItems() {
    try {
      // GROUP_CONCAT을 사용하여 태그 정보를 한 번에 조회 (성능 최적화)
      // 주의: 태그가 많을 경우 GROUP_CONCAT 길이 제한에 걸릴 수 있으나 일반적인 경우 효율적임
      const stmt = this.db.prepare(`
        SELECT 
          c.*, 
          im.width, im.height, im.file_size, im.file_path, im.thumbnail_path,
          GROUP_CONCAT(t.name) as _tag_names,
          GROUP_CONCAT(t.source) as _tag_sources,
          GROUP_CONCAT(t.local_id) as _tag_ids
        FROM clipboard c
        LEFT JOIN image_meta im ON c.id = im.data_id
        LEFT JOIN data_tag dt ON c.id = dt.data_id
        LEFT JOIN tag t ON dt.tag_id = t.local_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `);

      const rows = stmt.all();

      return rows.map((row) => {
        // GROUP_CONCAT 결과를 태그 객체 배열로 변환
        let tags = [];
        if (row._tag_names) {
          const names = row._tag_names.split(",");
          const sources = row._tag_sources ? row._tag_sources.split(",") : [];
          const ids = row._tag_ids ? row._tag_ids.split(",") : [];

          tags = names.map((name, idx) => ({
            name: name,
            tag_id: null, // GROUP_CONCAT에서는 tag_id를 가져오지 않았으므로 null
            source: sources[idx] || "auto",
            local_id: ids[idx],
          }));
        }

        // 이미지 메타데이터 추출
        const imageMeta = row.file_path
          ? {
              data_id: row.id,
              width: row.width,
              height: row.height,
              file_size: row.file_size,
              file_path: row.file_path,
              thumbnail_path: row.thumbnail_path,
            }
          : null;

        return this._mapRowToEntity(row, imageMeta, tags);
      });
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardReader",
        context: "getAllClipboardItems",
        message: error.message,
      });
    }
  }

  /**
   * 검색어에 일치하는 항목 ID 목록 반환 (FTS5 + LIKE 하이브리드 검색)
   * @param {string} query
   * @param {object} options { limit: number, offset: number }
   * @returns {string[]} ID 배열
   */
  search(query, options = {}) {
    try {
      const cleanQuery = query.trim().replace(/\s+/g, " ");
      if (!cleanQuery) return [];

      const limit = options.limit || 50;
      const offset = options.offset || 0;

      // 1. FTS5 (Full Text Search) 검색
      // trigram 토크나이저를 사용하므로 부분 일치 검색에 강력함
      const ftsQuery = `
        SELECT fts.data_id
        FROM clipboard_fts fts
        WHERE clipboard_fts MATCH ?
        ORDER BY bm25(clipboard_fts) DESC
        LIMIT ? OFFSET ?
      `;

      // "검색어*" 형태의 와일드카드 지원 (FTS 문법)
      const ftsParam = cleanQuery.includes(" ")
        ? `"${cleanQuery}"`
        : `${cleanQuery}*`;
      const ftsRows = this.db.prepare(ftsQuery).all(ftsParam, limit, offset);
      const ftsIds = ftsRows.map((r) => r.data_id);

      // 2. LIKE 패턴 검색 (FTS가 놓칠 수 있는 패턴이나 태그 부분 일치 보완)
      const likePattern = `%${cleanQuery}%`;
      const fallbackQuery = `
        SELECT DISTINCT c.id
        FROM clipboard c
        LEFT JOIN data_tag dt ON c.id = dt.data_id
        LEFT JOIN tag t ON dt.tag_id = t.local_id
        WHERE c.content LIKE ? OR t.name LIKE ?
        LIMIT ? OFFSET ?
      `;

      const likeRows = this.db
        .prepare(fallbackQuery)
        .all(likePattern, likePattern, limit, offset);
      const likeIds = likeRows.map((r) => r.id);

      // 3. 결과 병합 및 중복 제거 (순서는 FTS 결과 우선)
      const combinedIds = Array.from(new Set([...ftsIds, ...likeIds]));

      return combinedIds;
    } catch (error) {
      console.error("Search failed:", error);
      // 검색 실패는 앱 전체 크래시보다는 빈 결과 반환이 UX상 나음 (선택 사항)
      return [];
    }
  }

  /**
   * 이미지 메타데이터 조회 (단일 항목)
   * @param {string} dataId
   * @returns {object | null}
   */
  getImageMeta(dataId) {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM image_meta WHERE data_id = ?"
      );
      return stmt.get(dataId) || null;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardReader",
        context: "getImageMeta",
        message: error.message,
      });
    }
  }

  /**
   * 모든 이미지 메타데이터 조회 (CleanupService용)
   * @returns {Array<object>}
   */
  getAllImageMeta() {
    try {
      const stmt = this.db.prepare(
        "SELECT data_id, file_path, thumbnail_path FROM image_meta"
      );
      return stmt.all();
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardReader",
        context: "getAllImageMeta",
        message: error.message,
      });
    }
  }

  // =================================================================
  // Private Helper Methods
  // =================================================================

  /**
   * DB Row 데이터를 도메인 엔티티 구조로 변환 (기존 transformItem 로직 통합)
   * @param {object} item - clipboard 테이블의 Row
   * @param {object|null} imageMeta - image_meta 테이블의 Row
   * @param {Array} tags - 태그 객체 배열
   * @returns {object}
   */
  _mapRowToEntity(item, imageMeta = null, tags = []) {
    let processedImageMeta = null;

    const root = path.join(app.getPath("documents"), "CCD");

    const makeFileUrl = (absPath) => {
      if (!absPath) return null;
      if (/^(https?:|data:)/i.test(absPath)) return absPath;
      const rel = path.relative(root, absPath); // thumbnails/ 포함
      const posix = rel.split(path.sep).join("/");
      return `ccd://${encodeURI(posix)}`;
    };

    if (item.type === "img" && imageMeta) {
      const originalExists =
        imageMeta.file_path && fs.existsSync(imageMeta.file_path);
      const thumbExists =
        imageMeta.thumbnail_path && fs.existsSync(imageMeta.thumbnail_path);

      const originalUrl = originalExists
        ? makeFileUrl(imageMeta.file_path)
        : null;
      const thumbnailUrl = thumbExists
        ? makeFileUrl(imageMeta.thumbnail_path)
        : originalUrl;

      processedImageMeta = {
        ...imageMeta,
        originalUrl,
        thumbnailUrl,
      };
    }

    // 기존 LocalRepository.transformItem과 동일한 반환 구조
    return {
      id: item.id,
      type: item.type,
      format: item.format,
      content: item.content,
      created_at: item.created_at,
      is_synced: item.is_synced,
      is_cloud_item: item.is_cloud_item || 0,
      tags: tags,
      imageMeta: processedImageMeta,
      thumbnail_path: processedImageMeta?.thumbnailUrl || null,
    };
  }
}

module.exports = SQLiteClipboardReader;
