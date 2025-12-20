/**
 * TagRepository
 * - CCD LocalData 스키마를 참고한 태그/데이터-태그 테이블 생성 및 CRUD
 * - 테이블:
 *   - tag(local_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, source TEXT)
 *   - data_tag(id INTEGER PRIMARY KEY AUTOINCREMENT, data_id TEXT, tag_id INTEGER)
 * @implements {ITagRepository}
 */
const crypto = require('crypto');

class TagRepository {
  constructor(dbContext) {
    if (!dbContext || !dbContext.getDb) {
      throw new Error('TagRepository requires a valid DatabaseContext instance');
    }
    this.db = dbContext.getDb();
  }

  getOrCreateTag(name, source = 'auto') {
    const existing = this.db.prepare('SELECT tag_id FROM tag WHERE name = ? AND source = ?').get(name, source);
    if (existing) return existing.tag_id;

    const newId = crypto.randomUUID();
    try {
      this.db.prepare('INSERT INTO tag(tag_id, name, source) VALUES(?, ?, ?)').run(newId, name, source);
      return newId;
    } catch (err) {
      // UNIQUE 제약 위반 시 재조회
      if (err.code === 'SQLITE_CONSTRAINT' || err.message.includes('UNIQUE')) {
        const row = this.db.prepare('SELECT tag_id FROM tag WHERE name = ? AND source = ?').get(name, source);
        return row ? row.tag_id : null;
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
    console.log(`[TagRepository] saveTaggingResult called for ${dataId} with tags:`, tags);
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
