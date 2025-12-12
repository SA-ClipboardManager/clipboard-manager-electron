/**
 * TagRepository - PostgreSQL 버전
 * - 태그 및 데이터-태그 관계 테이블 CRUD
 * - 테이블:
 *   - tag(tag_id TEXT PRIMARY KEY, name TEXT UNIQUE, source TEXT)
 *   - data_tag(data_id TEXT, tag_id TEXT)
 */
const crypto = require("crypto");

class TagRepository {
  constructor(dbContext) {
    if (!dbContext || !dbContext.getDb) {
      throw new Error("TagRepository requires a valid DatabaseContext instance");
    }
    this.db = dbContext.getDb();
  }

  async getOrCreateTag(name, source = "auto") {
    try {
      // 기존 태그 확인
      const existingResult = await this.db.query("SELECT tag_id FROM tag WHERE LOWER(name) = LOWER($1) AND source = $2", [name, source]);

      if (existingResult.rows.length > 0) {
        return existingResult.rows[0].tag_id;
      }

      // 새 태그 생성
      const newId = crypto.randomUUID();
      try {
        await this.db.query("INSERT INTO tag(tag_id, name, source) VALUES($1, $2, $3)", [newId, name, source]);
        return newId;
      } catch (err) {
        // UNIQUE 제약 위반 시 재조회 (동시성 처리)
        if (err.code === "23505") {
          const retryResult = await this.db.query("SELECT tag_id FROM tag WHERE LOWER(name) = LOWER($1) AND source = $2", [name, source]);
          return retryResult.rows[0]?.tag_id || null;
        }
        throw err;
      }
    } catch (err) {
      console.error("[TagRepository] getOrCreateTag error:", err);
      throw err;
    }
  }

  async linkDataTag(dataId, tagId) {
    try {
      await this.db.query("INSERT INTO data_tag(data_id, tag_id) VALUES($1, $2) ON CONFLICT DO NOTHING", [dataId, tagId]);
      return true;
    } catch (err) {
      console.error("[TagRepository] linkDataTag failed:", err);
      return false;
    }
  }

  async saveTaggingResult(dataId, tags) {
    console.log(`[TagRepository] saveTaggingResult called for ${dataId} with tags:`, tags);
    for (const t of tags) {
      let name;
      let source = "auto";
      if (t && typeof t === "object" && !Array.isArray(t)) {
        name = t.name || t.label || t.tag;
        source = t.source || "auto";
      } else if (Array.isArray(t)) {
        // server may send [label, score]
        name = t[0];
      } else if (typeof t === "string") {
        name = t;
      }
      if (!name) continue;
      const tagId = await this.getOrCreateTag(name, source);
      if (tagId) {
        await this.linkDataTag(dataId, tagId);
      }
    }
    return true;
  }
}

module.exports = TagRepository;
