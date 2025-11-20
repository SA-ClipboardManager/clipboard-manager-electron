// sqlite.repository.js (Local Storage Module)
// CommonJS
const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");
const fs = require("fs-extra");
const { ILocalRepository } = require("../interfaces/ILocalRepository");
const CCDError = require("../shared/errors/CCDError");

/**
 * SQLite 데이터베이스를 사용하는 클립보드 저장소 구현체
 * @implements {ILocalRepository}
 */
class LocalRepository extends ILocalRepository {
  constructor() {
    super();
    this.dbPath = path.join(app.getPath("userData"), "clipboard-manager.db");
    this.db = null;
    this.txDelete = null;
    this.txUpdateTagId = null;

    this._initialize();
  }

  _initialize() {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma("foreign_keys = ON");

      this._createTables();
      this._createIndexes();
      this.setupFTS();

      // 트랜잭션 함수 바인딩
      this.txDelete = this.db.transaction(this._deleteChain.bind(this));
      this.txUpdateTagId = this.db.transaction(this._updateTagIdTx.bind(this));

      console.log("Database initialized successfully");
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "데이터베이스 초기화 실패",
        message: error.message,
      });
    }
  }

  // --- 테이블/인덱스/FTS5 생성 로직 ---

  _createTables() {
    this.db.exec(`
          CREATE TABLE IF NOT EXISTS clipboard (
            id TEXT NOT NULL,
            type TEXT NOT NULL,
            format TEXT NOT NULL,
            content TEXT NOT NULL,
            is_synced INTEGER NOT NULL DEFAULT 0, 
            is_cloud_item INTEGER NOT NULL DEFAULT 0, 
            created_at INTEGER NOT NULL,
            CONSTRAINT clipboard_pk PRIMARY KEY (id),
            check(type IN ('img', 'txt'))
          );
          CREATE TABLE IF NOT EXISTS image_meta (
            data_id TEXT PRIMARY KEY,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            file_path TEXT NOT NULL,  
            thumbnail_path TEXT,      
            FOREIGN KEY (data_id) REFERENCES clipboard(id) ON DELETE CASCADE
          );
          
          CREATE TABLE IF NOT EXISTS tag (
            tag_id TEXT, 
            local_id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            source TEXT NOT NULL CHECK (source IN ('auto', 'user')),
            UNIQUE (name, source)  
          );
          CREATE TABLE IF NOT EXISTS data_tag (
            data_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            CONSTRAINT data_tag_pk PRIMARY KEY (data_id,tag_id),
            CONSTRAINT data_tag_clipboard_FK_1 FOREIGN KEY (data_id) REFERENCES clipboard(id) ON DELETE CASCADE,
            CONSTRAINT data_tag_tag_FK_1 FOREIGN KEY (tag_id) REFERENCES tag(local_id) ON DELETE CASCADE ON UPDATE CASCADE
          );

          CREATE TABLE IF NOT EXISTS pending_sync (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            op TEXT NOT NULL,      
            data_id TEXT,
            op_args TEXT, 
            created_at INTEGER NOT NULL,
            retry_count INTEGER DEFAULT 0,          
            next_attempt_at INTEGER DEFAULT 0       
          );
        `);
  }

  _createIndexes() {
    this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard(created_at);
        CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);
        CREATE INDEX IF NOT EXISTS idx_data_tag ON data_tag(data_id, tag_id);
      `);
  }
  setupFTS() {
    try {
      this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
            data_id UNINDEXED,
            content,
            tags,
            format,
            tokenize = 'trigram'
          );
          DROP TRIGGER IF EXISTS after_clipboard_insert;
          DROP TRIGGER IF EXISTS after_clipboard_update;
          DROP TRIGGER IF EXISTS after_clipboard_delete;
          DROP TRIGGER IF EXISTS after_data_tag_insert;
          DROP TRIGGER IF EXISTS after_data_tag_delete;
          DROP TRIGGER IF EXISTS after_tag_update;
          

          CREATE TRIGGER after_clipboard_insert AFTER INSERT ON clipboard BEGIN
            INSERT INTO clipboard_fts (data_id, content, tags, format) VALUES (
              new.id,
              CASE WHEN new.type = 'txt' THEN new.content ELSE '' END,
              (SELECT GROUP_CONCAT(t.name, ' ') FROM tag t JOIN data_tag dt ON t.tag_id = dt.tag_id WHERE dt.data_id = new.id),
              new.format
            );
          END;
        
        `);

      // 기존 데이터 인덱싱
      this.db.exec(`
          INSERT INTO clipboard_fts (data_id, content, tags, format)
          SELECT 
            c.id,
            CASE WHEN c.type = 'txt' THEN c.content ELSE '' END,
            (SELECT GROUP_CONCAT(t.name, ' ') FROM tag t JOIN data_tag dt ON t.tag_id = dt.tag_id WHERE dt.data_id = c.id),
            c.format
          FROM clipboard c
          WHERE NOT EXISTS (SELECT 1 FROM clipboard_fts WHERE data_id = c.id);
        `);
    } catch (err) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "FTS5 생성 실패",
        message: err.message,
      });
    }
  }

  // --- ILocalRepository 인터페이스 구현 ---

  /**
   * @inheritdoc
   */
  async saveClipboardItem(item, meta) {
    if (!this.db) throw new Error("Database not initialized.");

    // 트랜잭션으로 묶어 저장 및 Outbox 기록
    const tx = this.db.transaction(() => {
      const now = Math.floor(Date.now() / 1000);

      // 1. clipboard 테이블에 삽입 (is_synced = 0)
      const created_at = item.created_at || now;
      this.db
        .prepare(
          `
                INSERT INTO clipboard (id, type, format, content, is_synced, created_at)
                VALUES (@id, @type, @format, @content, 0, @created_at)
            `
        )
        .run({
          ...item,
          created_at: created_at,
        });

      // 2. 이미지 타입일 경우 image_meta 테이블에 삽입
      if (item.type === "img" && meta) {
        this.db
          .prepare(
            `
                    INSERT INTO image_meta (data_id, width, height, file_size, file_path, thumbnail_path)
                    VALUES (@data_id, @width, @height, @file_size, @file_path, @thumbnail_path)
                `
          )
          .run({
            ...meta,
            data_id: item.id,
          });
      }
    });

    try {
      tx(); // 트랜잭션 실행
      return true;
    } catch (error) {
      console.error("Save transaction failed:", error);
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "saveClipboardItem 트랜잭션 실패",
        message: error.message,
      });
    }
  }

  /**
   * @inheritdoc
   */
  async getClipboardItem(id) {
    try {
      // 1. 기본 항목 조회
      const item = this.db
        .prepare(`SELECT * FROM clipboard WHERE id = ?`)
        .get(id);
      if (!item) return null;

      // 2. 이미지 메타데이터 조회
      const meta = this.getImageMeta(id);

      // 3. 파일 존재 여부 검증 및 정리
      if (item.type === "img" && meta) {
        const fileExists = fs.existsSync(meta.file_path);

        if (!fileExists) {
          console.warn(`원본 이미지 누락: ${meta.file_path}`);
          await this._deleteFileAndDBItem(id, meta);
          return null;
        }

        if (meta.thumbnail_path && !fs.existsSync(meta.thumbnail_path)) {
          console.warn(`썸네일 누락: ${meta.thumbnail_path}`);
          await this.regenerateThumbnail(id, meta.file_path);
        }
      }

      const tags = this.db
        .prepare(
          `
                    SELECT t.name, t.tag_id, t.source FROM tag t
                    JOIN data_tag dt ON t.tag_id = dt.tag_id
                    WHERE dt.data_id = ?
                `
        )
        .all(id);

      return this.transformItem(item, meta, tags); // AS-IS transformItem 사용
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "클립보드 아이템 조회 실패",
        message: error.message,
      });
    }
  }
  /**
   * DB에 저장된 모든 클립보드 항목을 메타데이터 및 태그와 함께 조회합니다.
   * @inheritdoc
   * @returns {Array<object>} 클립보드 항목 객체 배열.
   */
  async getAllClipboardItems() {
    try {
      // AS-IS 코드에서 사용된, 모든 메타/태그를 그룹화하여 조회하는 쿼리입니다.
      const rawItems = this.db
        .prepare(
          `
      SELECT c.*, im.*, GROUP_CONCAT(t.name) as tag_names_raw
      FROM clipboard c
      LEFT JOIN image_meta im ON c.id = im.data_id
      LEFT JOIN data_tag dt ON c.id = dt.data_id
      LEFT JOIN tag t ON dt.tag_id = t.tag_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `
        )
        .all();

      // 결과를 transformItem에 맞게 가공합니다.
      return rawItems.map((rawItem) => {
        // transformItem이 단일 태그 객체 배열을 예상하므로, 여기서는 rawItem만 전달하고
        // 태그 배열로 변환하는 로직을 추가해야 합니다.
        const tags = rawItem.tag_names_raw
          ? rawItem.tag_names_raw
              .split(",")
              .map((name) => ({ name: name.trim() }))
          : [];

        // 이미지 메타데이터는 rawItem에 평탄화되어 있으므로, transformItem이 처리하도록 준비합니다.
        const meta = rawItem.data_id ? { ...rawItem } : null;

        return this.transformItem(rawItem, meta, tags);
      });
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "모든 클립보드 아이템 조회 실패",
        message: error.message,
      });
    }
  }

  async _deleteFileAndDBItem(id, meta) {
    if (meta) {
      if (meta.file_path && fs.existsSync(meta.file_path)) {
        await fs
          .unlink(meta.file_path)
          .catch((e) => console.error("File unlink error:", e));
      }
      if (meta.thumbnail_path && fs.existsSync(meta.thumbnail_path)) {
        await fs
          .unlink(meta.thumbnail_path)
          .catch((e) => console.error("File unlink error:", e));
      }
    }
    this._deleteChain(id);
  }

  _deleteChain(id) {
    // DB 삭제 로직 + Outbox 기록
    // FOREIGN KEY CASCADE로 image_meta, data_tag는 자동 삭제됨

    // Outbox Pattern 기록
    this.db
      .prepare(
        `
            INSERT INTO pending_sync (op, data_id, op_args, created_at)
            VALUES (?, ?, ?, ?)
        `
      )
      .run("DELETE", id, JSON.stringify({}), Math.floor(Date.now() / 1000));

    // clipboard 항목 삭제
    this.db.prepare("DELETE FROM clipboard WHERE id = ?").run(id);
  }

  /**
   * @inheritdoc
   */
  async deleteClipboardItem(id) {
    try {
      const meta = this.getImageMeta(id); // 파일 삭제를 위해 메타데이터 조회

      // 파일 시스템 삭제는 DB 트랜잭션 외부에서 처리 (DB Rollback 되어도 파일은 지워야 함)
      if (meta) {
        await this._deleteFileAndDBItem(id, meta); // 파일 삭제 (DB 항목은 이 함수 내부에서 삭제)
      } else {
        this.txDelete(id); // 파일이 없으면 바로 DB 트랜잭션 실행
      }

      console.log(`삭제 완료: ${id}`);
    } catch (error) {
      console.error(`삭제 실패: ${id}`, error);
      throw CCDError.create("E630", {
        module: "LocalRepository",
        context: "deleteClipboardItem",
        message: `클립보드 항목 삭제 중 오류 발생 (id=${id})`,
        cause: error,
      });
    }
  }

  /**
   * @inheritdoc
   */
  searchItems(query, options = {}) {
    try {
      const cleanQuery = query.trim().replace(/\s+/g, " ");

      if (!cleanQuery) return [];

      // FTS5 검색 쿼리 생성
      const ftsQuery = `
            SELECT fts.data_id
            FROM clipboard_fts fts
            JOIN clipboard c ON fts.data_id = c.id
            WHERE clipboard_fts MATCH ?
            ORDER BY bm25(clipboard_fts) DESC
            LIMIT ? OFFSET ?
          `;

      const stmt = this.db.prepare(ftsQuery);
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      // 와일드카드 검색 지원
      const searchTerm = cleanQuery.includes(" ")
        ? `"${cleanQuery}"`
        : `${cleanQuery}*`;

      const ftsRows = stmt.all(searchTerm, limit, offset);
      const ftsIds = ftsRows.map((r) => r.data_id);

      const likePattern = `%${cleanQuery}%`;
      const fallbackStmt = this.db.prepare(`
                SELECT DISTINCT c.id
                FROM clipboard c
                LEFT JOIN data_tag dt ON c.id = dt.data_id
                LEFT JOIN tag t ON dt.tag_id = t.tag_id
                WHERE c.content LIKE ? OR t.name LIKE ?
                LIMIT ? OFFSET ?;
              `);
      const likeRows = fallbackStmt.all(
        likePattern,
        likePattern,
        limit,
        offset
      );
      const likeIds = likeRows.map((r) => r.id);

      const allIds = Array.from(new Set([...ftsIds, ...likeIds]));
      return allIds;
    } catch (err) {
      console.error("로컬 검색 실패:", err);
      return [];
    }
  }

  /**
   * @inheritdoc
   */
  getPendingSyncItems() {
    return this.db
      .prepare("SELECT * FROM pending_sync ORDER BY created_at ASC")
      .all();
  }

  /**
   * @inheritdoc
   */
  clearPendingItem(id) {
    this.db.prepare("DELETE FROM pending_sync WHERE id = ?").run(id);
  }

  // Private Transaction for Tag ID Update
  _updateTagIdTx(localId, serverId) {
    const existing = this.db
      .prepare(`SELECT * FROM tag WHERE local_id = ?`)
      .get(localId);
    if (!existing) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: `태그 ID 확인 실패`,
        message: `존재하지 않는 로컬 태그 ID: ${localId}`,
      });
    }

    const conflict = this.db
      .prepare(`SELECT * FROM tag WHERE tag_id = ?`)
      .get(serverId);
    if (conflict) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: `태그 서버 ID 충돌`,
        message: `이미 다른 로컬 태그(${conflict.local_id})에 할당된 서버 ID: ${serverId}`,
      });
    }

    this.db
      .prepare(`UPDATE tag SET tag_id = ? WHERE local_id = ?`)
      .run(serverId, localId);
  }

  /**
   * @inheritdoc
   */
  updateTagId(localId, serverId) {
    try {
      this.txUpdateTagId(localId, serverId);
      return {
        success: true,
        message: `Tag ID updated from local ID ${localId} to server ID ${serverId}`,
      };
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "태그 ID 변경 실패",
        message: error.message || "updateTagId. 태그 동기화 오류",
      });
    }
  }

  /**
   * 이름과 출처(source)를 기반으로 태그 레코드를 조회
   * @private
   * @param {string} name
   * @param {string} source
   * @returns {object | null} 태그 레코드 (local_id, tag_id, name, source 등)
   */
  _getTagByNameAndSource(name, source) {
    try {
      // 태그의 유일성(UNIQUE) 제약 조건을 활용하여 조회합니다.
      const stmt = this.db.prepare(`
                SELECT local_id, tag_id, name, source FROM tag
                WHERE name = ? AND source = ?
                COLLATE NOCASE -- 대소문자 구분 없음
            `);
      return stmt.get(name, source);
    } catch (error) {
      // 내부 로직이므로 외부로 CCDError를 던지기보다,
      // 트랜잭션을 실행하는 상위 메서드에서 처리할 수 있도록 일반 오류를 던지거나 반환합니다.
      console.error(
        "Internal DB query failed (_getTagByNameAndSource):",
        error
      );
      throw error;
    }
  }

  /**
   * @inheritdoc
   */
  insertTagAndConnect(dataId, tag, serverId = null) {
    if (!this.db)
      throw new CCDError.create("E610", {
        /* ... */
      });

    const tx = this.db.transaction(() => {
      let tagRecord;
      let isNew = false;

      // 1. 이름과 출처로 기존 태그를 찾습니다.
      const existingTag = this._getTagByNameAndSource(tag.name, tag.source);

      if (existingTag) {
        // 1-A. 기존 태그가 있는 경우: 로컬 ID와 태그 ID를 확인
        tagRecord = existingTag;

        // 만약 서버 ID(serverId)가 전달되었는데 로컬 DB의 tag_id가 비어 있다면,
        // 이 시점에 tag_id를 업데이트합니다. (동기화된 데이터의 ID 확정)
        if (serverId && !tagRecord.tag_id) {
          this.db
            .prepare(`UPDATE tag SET tag_id = ? WHERE local_id = ?`)
            .run(serverId, tagRecord.local_id);

          tagRecord.tag_id = serverId;
        }
      } else {
        // 1-B. 새로운 태그를 삽입
        const localId = uuidv4();

        // local_id는 항상 UUID로 생성
        // tag_id는 serverId가 있으면 그 값, 없으면 NULL
        const tagIdToInsert = serverId || null;

        this.db
          .prepare(
            `
                INSERT INTO tag (local_id, name, source, tag_id)
                VALUES (@local_id, @name, @source, @tag_id)
            `
          )
          .run({
            local_id: localId,
            name: tag.name,
            source: tag.source,
            tag_id: tagIdToInsert,
          });

        tagRecord = { local_id: localId, tag_id: tagIdToInsert };
        isNew = true;
      }

      // 2. data_tag 테이블에 연결 (local_id 사용)
      // 로컬에서 연결은 local_id를 사용해야 local_id가 PK인 data_tag 테이블의 무결성이 보장됨
      this.db
        .prepare(
          `
            INSERT OR IGNORE INTO data_tag (data_id, tag_id)
            VALUES (?, ?)
        `
        )
        .run(dataId, tagRecord.local_id);

      return { localId: tagRecord.local_id, isNew: isNew };
    });
    try {
      return tx();
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "태그 삽입 및 연결 실패 (트랜잭션 롤백됨)",
        message: error.message || error,
      });
    }
  }

  /**
   * CleanupService를 위해 모든 이미지 메타데이터를 조회
   * @inheritdoc
   * @returns {ImageMeta[]}
   */
  getAllImageMeta() {
    try {
      const stmt = this.db.prepare(
        "SELECT data_id, file_path, thumbnail_path FROM image_meta"
      );
      return stmt.all();
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "모든 이미지 메타데이터 조회 실패",
        message: error.message || error,
      });
    }
  }
  /**
   * 이미지 메타데이터 테이블에서 썸네일 경로를 업데이트
   * @inheritdoc
   * @param {string} dataId - 클립보드 항목 ID
   * @param {string | null} thumbnailPath - 새로운 썸네일 경로 또는 NULL.
   * @returns {void}
   */
  updateThumbnailPath(dataId, thumbnailPath) {
    try {
      this.db
        .prepare("UPDATE image_meta SET thumbnail_path = ? WHERE data_id = ?")
        .run(thumbnailPath, dataId);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "썸네일 경로 업데이트 실패",
        message: error.message || error,
      });
    }
  }
  /**
   * 클립보드 항목을 클라우드 동기화 대상으로 지정하고 Outbox에 이벤트를 기록합니다.
   * 이 두 작업은 단일 트랜잭션으로 처리되어 데이터 무결성을 보장합니다.
   * @inheritdoc
   */
  async markItemAsCloudItem(clipId) {
    if (!this.db) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "DB 초기화 상태 오류",
        message: "Database not initialized.",
      });
    }

    try {
      // 트랜잭션으로 묶어 두 작업을 원자적으로 처리합니다.
      const tx = this.db.transaction(() => {
        const now = Math.floor(Date.now() / 1000);

        // 1. clipboard 테이블의 상태 업데이트: is_cloud_item = 1, is_synced = 0
        const updateStmt = this.db.prepare(`
                    UPDATE clipboard 
                    SET is_cloud_item = 1, is_synced = 0
                    WHERE id = ? AND is_cloud_item = 0
                `);
        const result = updateStmt.run(clipId);

        // 실제로 항목이 업데이트되었는지 확인
        if (result.changes === 0) {
          // 항목이 없거나 이미 클라우드 항목일 경우 성공으로 간주
          return true;
        }

        // 2. Outbox (pending_sync)에 INSERT 이벤트 기록
        // 이 이벤트는 CloudService에게 이 클립 데이터를 서버로 전송하라고 지시합니다.
        const enqueueStmt = this.db.prepare(`
                    INSERT INTO pending_sync (op, data_id, op_args, created_at, retry_count, next_attempt_at)
                    VALUES (?, ?, ?, ?, 0, 0)
                `);

        // 클립보드 데이터 자체를 페이로드에 포함하는 대신,
        // CloudService가 data_id를 사용해 데이터를 조회하도록 'INSERT' 오퍼레이션만 기록합니다.
        enqueueStmt.run(
          "INSERT",
          clipId,
          JSON.stringify({}), // 추가 인수는 현재 없음
          now
        );
      });

      tx(); // 트랜잭션 실행
      return true;
    } catch (error) {
      console.error("markItemAsCloudItem transaction failed:", error);
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "클라우드 동기화 지정 실패",
        message: error.message,
      });
    }
  }

  /**
   * Outbox (pending_sync 테이블)에 새로운 동기화 이벤트를 기록합니다.
   * 이 메서드는 주로 내부 헬퍼 또는 saveClipboardItem에서 Outbox 기록을 분리할 때 사용됩니다.
   * @inheritdoc
   */
  async enqueueCloudSyncEvent(dataId, operation) {
    if (!this.db) {
      throw CCDError.create("E610", {
        /* ... */
      });
    }

    try {
      const now = Math.floor(Date.now() / 1000);

      const enqueueStmt = this.db.prepare(`
                INSERT INTO pending_sync (op, data_id, op_args, created_at, retry_count, next_attempt_at)
                VALUES (?, ?, ?, ?, 0, 0)
            `);

      // 주의: 이 메서드는 data_id와 operation만 받으므로, op_args는 비워둡니다.
      // 복잡한 인수가 필요하면 상위 모듈에서 JSON 형태로 준비해야 합니다.
      enqueueStmt.run(operation, dataId, JSON.stringify({}), now);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "LocalRepository",
        context: "Outbox 이벤트 기록 실패",
        message: error.message,
      });
    }
  }

  /**
   * DB 원시 데이터를 UI에서 사용하기 쉬운 포맷으로 변환 (URL 처리 포함)
   * @param {object} item - clipboard 테이블의 Row
   * @param {object|null} imageMeta - image_meta 테이블의 Row
   * @param {Array} tags - 태그 객체 배열
   * @returns {ClipData}
   */
  transformItem(item, imageMeta = null, tags = []) {
    let content = item.content;
    let processedImageMeta = null;

    // 태그 처리 (이미 객체 배열로 들어오므로 그대로 사용)
    const tagNames = tags;

    // 이미지 타입일 경우 메타데이터에 file:// URL 추가
    if (item.type === "img" && imageMeta) {
      // 로컬 경로를 file:// URL로 변환하는 헬퍼 함수
      const makeFileUrl = (filePath) => {
        if (!filePath) return null;
        if (filePath.startsWith("http")) return filePath; // 이미 웹 URL인 경우
        // Windows 경로(\)를 URL 슬래시(/)로 변환
        return `file://${filePath.replace(/\\/g, "/")}`;
      };

      processedImageMeta = {
        ...imageMeta,
        originalUrl: makeFileUrl(imageMeta.file_path),
        thumbnailUrl: makeFileUrl(imageMeta.thumbnail_path),
      };
    }

    // 요청하신 반환 구조
    return {
      id: item.id,
      type: item.type,
      format: item.format,
      content: item.content,
      created_at: item.created_at,
      is_synced: item.is_synced,
      is_cloud_item: item.is_cloud_item,
      tags: tagNames,
      imageMeta: processedImageMeta,
      thumbnail_path: processedImageMeta?.thumbnailUrl || null,
    };
  }
}

module.exports = LocalRepository;
