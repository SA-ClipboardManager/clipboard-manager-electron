// infrastructure/repositories/writers/SQLiteClipboardWriter.js
const CCDError = require("../../../shared/errors/CCDError");

class SQLiteClipboardWriter {
  /**
   * @param {import('better-sqlite3').Database} db - UnitOfWork에서 주입된 트랜잭션 컨텍스트를 가진 DB 인스턴스
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 클립보드 기본 항목 및 (이미지일 경우) 메타데이터 저장
   * @param {object} item - 클립보드 항목 (id, type, format, content 등)
   * @param {object} [meta] - 이미지 메타데이터 (width, height, path 등)
   */
  save(item, meta) {
    try {
      // 1. clipboard 테이블 INSERT
      // created_at은 외부에서 주입받거나 없으면 현재 시간
      const createdAt = item.created_at || Math.floor(Date.now() / 1000);

      const insertClip = this.db.prepare(`
        INSERT INTO clipboard (id, type, format, content, is_synced, created_at)
        VALUES (@id, @type, @format, @content, 0, @created_at)
      `);

      insertClip.run({ ...item, created_at: createdAt });

      // 2. image_meta 테이블 INSERT (이미지 타입인 경우)
      if (item.type === "img" && meta) {
        const insertMeta = this.db.prepare(`
          INSERT INTO image_meta (data_id, width, height, file_size, file_path, thumbnail_path)
          VALUES (@data_id, @width, @height, @file_size, @file_path, @thumbnail_path)
        `);

        insertMeta.run({ ...meta, data_id: item.id });
      }

      return item; // 저장된 항목 반환 (체이닝 용도)
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "save (클립보드 저장)",
        message: error.message,
      });
    }
  }

  /**
   * 클립보드 항목 삭제
   * FK CASCADE 설정에 의해 image_meta, data_tag는 자동 삭제됨
   * @param {string} id
   */
  delete(id) {
    try {
      const stmt = this.db.prepare("DELETE FROM clipboard WHERE id = ?");
      stmt.run(id);
    } catch (error) {
      throw CCDError.create("E630", {
        module: "SQLiteClipboardWriter",
        context: "delete",
        message: error.message,
      });
    }
  }

  /**
   * 썸네일 경로 업데이트 (CleanupService 등에서 사용)
   */
  updateThumbnailPath(dataId, thumbnailPath) {
    try {
      this.db
        .prepare("UPDATE image_meta SET thumbnail_path = ? WHERE data_id = ?")
        .run(thumbnailPath, dataId);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "updateThumbnailPath",
        message: error.message,
      });
    }
  }

  /**
   * 항목을 클라우드 동기화 대상으로 마킹 (is_cloud_item = 1)
   */
  markAsCloudItem(id) {
    try {
      this.db
        .prepare(
          `
        UPDATE clipboard 
        SET is_cloud_item = 1, is_synced = 0
        WHERE id = ?
      `
        )
        .run(id);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "markAsCloudItem",
        message: error.message,
      });
    }
  }
  // === src/main/infrastructure/repositories/writers/SQLiteClipboardWriter.js 내부에 추가 ===

  /**
   * SyncRepository가 Outbox에 저장할 페이로드 데이터와 메타데이터를 조회합니다.
   * (Writer 클래스 내부에 필요한 Read 기능을 추가하여 트랜잭션 내에서 사용)
   * @param {string} id - 클립보드 ID
   * @returns {object | null}
   */
  getItemData(id) {
    try {
      // 1. 클립보드 기본 정보 + 이미지 메타데이터 조인 조회
      const stmt = this.db.prepare(`
            SELECT 
                c.id, c.type, c.format, c.content, c.created_at,
                im.width, im.height, im.file_size, im.file_path, im.thumbnail_path
            FROM clipboard c
            LEFT JOIN image_meta im ON c.id = im.data_id
            WHERE c.id = ?
        `);

      const row = stmt.get(id);
      if (!row) return null;

      // 2. 이미지 메타데이터 객체 구성
      const imageMeta = row.file_path
        ? {
            width: row.width,
            height: row.height,
            file_size: row.file_size,
            file_path: row.file_path,
            thumbnail_path: row.thumbnail_path,
            // *주의*: Content 필드에는 파일 경로 대신 URL이 포함될 수 있으므로,
            // 원본 데이터(c.content)를 사용합니다.
          }
        : null;

      // 3. 최종 Outbox Payload 형식 구성
      return {
        id: row.id,
        type: row.type,
        format: row.format,
        content: row.content,
        created_at: row.created_at,
        imageMeta: imageMeta,
        // [TODO: 태그] 태그가 있다면 여기서 조회하여 배열로 추가해야 합니다.
        tags: [],
      };
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "getItemData (Read for Outbox)",
        message: error.message,
        cause: error,
      });
    }
  }

  // --- 태그 관련 (기존 insertTagAndConnect 로직 분해) ---

  /**
   * 태그 생성 또는 조회 (Upsert 유사 동작)
   * @param {object} tag - { local_id, name, source, tag_id(optional) }
   */
  createTagIfNotExists(tag) {
    try {
      this.db
        .prepare(
          `
        INSERT OR IGNORE INTO tag (local_id, name, source, tag_id)
        VALUES (@local_id, @name, @source, @tag_id)
      `
        )
        .run(tag);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "createTagIfNotExists",
        message: error.message,
      });
    }
  }

  /**
   * 클립보드 데이터와 태그 연결
   * @param {string} dataId
   * @param {string} tagLocalId
   */
  connectTag(dataId, tagLocalId) {
    try {
      this.db
        .prepare(
          `
        INSERT OR IGNORE INTO data_tag (data_id, tag_id)
        VALUES (?, ?)
      `
        )
        .run(dataId, tagLocalId);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "connectTag",
        message: error.message,
      });
    }
  }

  /**
   * 태그의 서버 ID 업데이트 (동기화 후 호출)
   */
  updateTagServerId(localId, serverId) {
    try {
      this.db
        .prepare("UPDATE tag SET tag_id = ? WHERE local_id = ?")
        .run(serverId, localId);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "updateTagServerId",
        message: error.message,
      });
    }
  }

  /**
   * 이름과 출처로 태그 조회
   * @param {string} name
   * @param {string} source
   * @returns {object | null}
   */
  getTagByNameAndSource(name, source) {
    try {
      const stmt = this.db.prepare(`
        SELECT local_id, tag_id, name, source FROM tag
        WHERE name = ? AND source = ?
        COLLATE NOCASE
      `);
      return stmt.get(name, source) || null;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "getTagByNameAndSource",
        message: error.message,
      });
    }
  }

  /**
   * 태그 조회 (local_id로)
   * @param {string} localId
   * @returns {object | null}
   */
  getTagByLocalId(localId) {
    try {
      const stmt = this.db.prepare("SELECT * FROM tag WHERE local_id = ?");
      return stmt.get(localId) || null;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "getTagByLocalId",
        message: error.message,
      });
    }
  }

  /**
   * 태그 서버 ID 충돌 확인
   * @param {string} serverId
   * @returns {object | null}
   */
  getTagByServerId(serverId) {
    try {
      const stmt = this.db.prepare("SELECT * FROM tag WHERE tag_id = ?");
      return stmt.get(serverId) || null;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SQLiteClipboardWriter",
        context: "getTagByServerId",
        message: error.message,
      });
    }
  }
}

module.exports = { SQLiteClipboardWriter };
