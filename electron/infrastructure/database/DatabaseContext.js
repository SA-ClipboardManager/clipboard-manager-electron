// infrastructure/database/DatabaseContext.js
const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");
const fs = require("fs-extra");
const CCDError = require("../../shared/errors/CCDError");

class DatabaseContext {
  constructor() {
    // 환경변수로 인스턴스 ID 설정 가능 (다중 인스턴스 테스트용)
    const instanceId = process.env.ELECTRON_INSTANCE_ID || "default";
    const dbFileName =
      instanceId === "default"
        ? "clipboard-manager.db"
        : `clipboard-manager-${instanceId}.db`;

    this.dbPath = path.join(app.getPath("userData"), dbFileName);
    this.db = null;

    console.log(
      `[DatabaseContext] Instance: ${instanceId}, DB: ${this.dbPath}`
    );
  }

  /**
   * 데이터베이스 연결 및 초기화 (테이블, 인덱스, FTS 생성)
   * 앱 시작 시점에 한 번만 호출되어야 합니다.
   */
  initialize() {
    try {
      // 1. DB 폴더 확보
      fs.ensureDirSync(path.dirname(this.dbPath));

      // 2. DB 연결 (better-sqlite3는 동기식)
      this.db = new Database(this.dbPath); // 필요 시 { verbose: console.log } 옵션 추가

      // 3. 필수 Pragma 설정
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("journal_mode = WAL"); // 성능 향상을 위해 WAL 모드 추천

      // 4. 스키마 생성
      this._createTables();
      this._createIndexes();
      this._setupFTS();

      console.log("DatabaseContext initialized successfully at:", this.dbPath);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "DatabaseContext",
        context: "데이터베이스 초기화 실패",
        message: error.message,
      });
    }
  }

  getDb() {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * 연결 종료 (앱 종료 시 호출)
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // =================================================================
  // Private Methods: Schema Definitions (Moved from LocalRepository)
  // =================================================================

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

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'UPLOAD',
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        next_attempt_at INTEGER,
        metadata TEXT,
        FOREIGN KEY (data_id) REFERENCES clipboard(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS data_tag (
        data_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        CONSTRAINT data_tag_pk PRIMARY KEY (data_id,tag_id),
        CONSTRAINT data_tag_clipboard_FK_1 FOREIGN KEY (data_id) REFERENCES clipboard(id) ON DELETE CASCADE,
        CONSTRAINT data_tag_tag_FK_1 FOREIGN KEY (tag_id) REFERENCES tag(local_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

    `);
  }

  _createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard(created_at);
      CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);
      CREATE INDEX IF NOT EXISTS idx_data_tag ON data_tag(data_id, tag_id);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_created_at ON sync_outbox(created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_next_attempt ON sync_outbox(next_attempt_at);
    `);
  }

  _setupFTS() {
    // FTS5 테이블 및 트리거 설정
    // 기존 LocalRepository.js의 setupFTS 로직과 동일
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
        data_id UNINDEXED,
        content,
        tags,
        format,
        tokenize = 'trigram'
      );
      
      -- 기존 트리거 제거 (재정의를 위해)
      DROP TRIGGER IF EXISTS after_clipboard_insert;
      DROP TRIGGER IF EXISTS after_clipboard_update;
      DROP TRIGGER IF EXISTS after_clipboard_delete;
      DROP TRIGGER IF EXISTS after_data_tag_insert;
      DROP TRIGGER IF EXISTS after_data_tag_delete;
      DROP TRIGGER IF EXISTS after_tag_update;
      
      -- 트리거 생성: clipboard 테이블 INSERT 시 FTS 테이블에도 자동 반영
      CREATE TRIGGER after_clipboard_insert AFTER INSERT ON clipboard BEGIN
        INSERT INTO clipboard_fts (data_id, content, tags, format) VALUES (
          new.id,
          CASE WHEN new.type = 'txt' THEN new.content ELSE '' END,
          (SELECT GROUP_CONCAT(t.name, ' ') FROM tag t JOIN data_tag dt ON t.tag_id = dt.tag_id WHERE dt.data_id = new.id),
          new.format
        );
      END;
      
      -- (참고) Update, Delete, Tag 관련 트리거도 필요하다면 여기에 추가해야 완벽한 동기화가 됩니다.
      -- 현재는 원본 코드에 있는 INSERT 트리거만 가져왔습니다.
    `);

    // 기존 데이터에 대한 FTS 인덱싱 보정
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
  }
}

module.exports = DatabaseContext;
