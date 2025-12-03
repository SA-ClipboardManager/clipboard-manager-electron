/**
 * TagRepository
 * - CCD LocalData 스키마를 참고한 태그/데이터-태그 테이블 생성 및 CRUD
 * - 테이블:
 *   - tag(local_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, source TEXT)
 *   - data_tag(id INTEGER PRIMARY KEY AUTOINCREMENT, data_id TEXT, tag_id INTEGER)
 */
class TagRepository {
  constructor(dbContext) {
    if (!dbContext || !dbContext.getDb) {
      throw new Error('TagRepository requires a valid DatabaseContext instance');
    }
    this.db = dbContext.getDb();
    this._init();
  }

  _init() {
    // better-sqlite3는 동기식이므로 exec 사용
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tag (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        source TEXT
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_tag (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_id TEXT,
        tag_id INTEGER,
        UNIQUE(data_id, tag_id)
      )
    `);
  }

  getOrCreateTag(name, source = 'auto') {
    const existing = this.db.prepare('SELECT local_id FROM tag WHERE name = ?').get(name);
    if (existing) return existing.local_id;

    try {
      const result = this.db.prepare('INSERT INTO tag(name, source) VALUES(?, ?)').run(name, source);
      return result.lastInsertRowid;
    } catch (err) {
      // UNIQUE 제약 위반 시 재조회
      if (err.code === 'SQLITE_CONSTRAINT' || err.message.includes('UNIQUE')) {
        const row = this.db.prepare('SELECT local_id FROM tag WHERE name = ?').get(name);
        return row ? row.local_id : null;
      }
      throw err;
    }
  }

  linkDataTag(dataId, tagId) {
    try {
      this.db.prepare('INSERT OR IGNORE INTO data_tag(data_id, tag_id) VALUES(?, ?)').run(dataId, tagId);
      return true;
    } catch (err) {
      console.error('[TagRepository] linkDataTag failed:', err);
      return false;
    }
  }

  saveTaggingResult(dataId, tags) {
    for (const t of tags) {
      let name;
      let source = 'auto';
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        name = t.name || t.label || t.tag;
        source = t.source || 'auto';
      } else if (Array.isArray(t)) {
        // server may send [label, score]
        name = t[0];
      } else if (typeof t === 'string') {
        name = t;
      }
      if (!name) continue;
      const tagId = this.getOrCreateTag(name, source);
      if (tagId) {
        this.linkDataTag(dataId, tagId);
      }
    }
    return true;
  }
}

module.exports = TagRepository;
