// infrastructure/database/DatabaseContext.js
const { app } = require("electron");
const { Pool } = require("pg");
const CCDError = require("../../shared/errors/CCDError");

class DatabaseContext {
  constructor() {
    // 환경변수로 인스턴스 ID 설정 가능 (다중 인스턴스 테스트용)
    const instanceId = process.env.ELECTRON_INSTANCE_ID || "default";

    // PostgreSQL 연결 설정
    this.pool = new Pool({
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "clipboard_manager",
    });

    this.db = null;
    this.dbName = process.env.DB_NAME || "clipboard_manager";

    console.log(`[DatabaseContext] Instance: ${instanceId}, Database: ${this.dbName}`);
  }

  /**
   * 데이터베이스 연결 및 초기화 (테이블, 인덱스, FTS 생성)
   * 앱 시작 시점에 한 번만 호출되어야 합니다.
   */
  async initialize() {
    try {
      console.log("[DatabaseContext] Attempting to connect to PostgreSQL...");
      console.log("[DatabaseContext] Connection config:", {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        database: this.dbName,
        user: process.env.DB_USER || "postgres",
      });

      // 1. 풀에서 클라이언트 획득
      this.db = await this.pool.connect();
      console.log("[DatabaseContext] Connected to PostgreSQL successfully");

      // 2. 스키마 생성
      await this._createTables();
      await this._createIndexes();
      await this._setupFTS();

      console.log("DatabaseContext initialized successfully. Database:", this.dbName);
    } catch (error) {
      console.error("[DatabaseContext] Initialization failed:", error);
      throw CCDError.create("E610", {
        module: "DatabaseContext",
        context: "데이터베이스 초기화 실패",
        message: `${error.message} - PostgreSQL이 실행 중인지, 환경 변수가 올바른지 확인하세요.`,
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
  async close() {
    if (this.db) {
      await this.db.release();
      this.db = null;
    }
    if (this.pool) {
      await this.pool.end();
    }
  }

  // =================================================================
  // Private Methods: Schema Definitions (PostgreSQL 방식)
  // =================================================================

  async _createTables() {
    try {
      await this.db.query(`
        -- 기존 테이블이 있으면 삭제 (테스트 목적)
        -- DROP TABLE IF EXISTS data_tag CASCADE;
        -- DROP TABLE IF EXISTS image_meta CASCADE;
        -- DROP TABLE IF EXISTS tag CASCADE;
        -- DROP TABLE IF EXISTS sync_outbox CASCADE;
        -- DROP TABLE IF EXISTS clipboard CASCADE;

        CREATE TABLE IF NOT EXISTS clipboard (
          id TEXT NOT NULL PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('img', 'txt')),
          format TEXT NOT NULL,
          content TEXT NOT NULL,
          is_synced INTEGER NOT NULL DEFAULT 0, 
          is_cloud_item INTEGER NOT NULL DEFAULT 0, 
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS image_meta (
          data_id TEXT PRIMARY KEY REFERENCES clipboard(id) ON DELETE CASCADE,
          width INTEGER,
          height INTEGER,
          file_size INTEGER,
          file_path TEXT NOT NULL,  
          thumbnail_path TEXT
        );

        CREATE TABLE IF NOT EXISTS tag (
          tag_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('auto', 'user')),
          UNIQUE (name, source)
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
          id SERIAL PRIMARY KEY,
          data_id TEXT NOT NULL REFERENCES clipboard(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL DEFAULT 'UPLOAD',
          status TEXT NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT,
          next_attempt_at BIGINT,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS data_tag (
          data_id TEXT NOT NULL REFERENCES clipboard(id) ON DELETE CASCADE,
          tag_id TEXT NOT NULL REFERENCES tag(tag_id) ON DELETE CASCADE,
          PRIMARY KEY (data_id, tag_id)
        );
      `);

      console.log("[DatabaseContext] Tables created successfully");
    } catch (error) {
      console.error("[DatabaseContext] Error creating tables:", error);
      throw error;
    }
  }

  async _createIndexes() {
    try {
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard(created_at);
        CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(LOWER(name));
        CREATE INDEX IF NOT EXISTS idx_data_tag ON data_tag(data_id, tag_id);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_created_at ON sync_outbox(created_at);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_next_attempt ON sync_outbox(next_attempt_at);
      `);

      console.log("[DatabaseContext] Indexes created successfully");
    } catch (error) {
      console.error("[DatabaseContext] Error creating indexes:", error);
      throw error;
    }
  }

  async _setupFTS() {
    try {
      // PostgreSQL에서는 Full Text Search를 위해 gin/gist 인덱스 사용
      // 간단한 LIKE 검색을 위한 인덱스 설정 (또는 tsvector 사용 가능)

      // tsvector 컬럼 생성 및 인덱스 설정
      await this.db.query(`
        -- 기존 컬럼이 있으면 삭제 (테스트 목적)
        -- ALTER TABLE clipboard DROP COLUMN IF EXISTS search_vector CASCADE;

        ALTER TABLE clipboard ADD COLUMN IF NOT EXISTS search_vector tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(format, '')), 'B')
          ) STORED;

        CREATE INDEX IF NOT EXISTS idx_clipboard_search ON clipboard USING GIN(search_vector);
      `);

      console.log("[DatabaseContext] FTS setup completed");
    } catch (error) {
      console.warn("[DatabaseContext] FTS setup warning (may not be critical):", error.message);
      // FTS 설정이 실패해도 기본 기능은 동작하므로 warning으로 처리
    }
  }
}

module.exports = DatabaseContext;
