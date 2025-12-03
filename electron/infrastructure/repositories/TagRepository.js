const DatabaseContext = require('../database/DatabaseContext');

/**
 * TagRepository
 * - CCD LocalData 스키마를 참고한 태그/데이터-태그 테이블 생성 및 CRUD
 * - 테이블:
 *   - tag(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, source TEXT)
 *   - data_tag(id INTEGER PRIMARY KEY AUTOINCREMENT, data_id TEXT, tag_id INTEGER)
 */
class TagRepository {
  constructor(dbContext = DatabaseContext.getInstance()) {
    this.db = dbContext.db;
    this._init();
  }

  _init() {
    this.db.serialize(() => {
      this.db.run(
        `CREATE TABLE IF NOT EXISTS tag (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE,
          source TEXT
        )`
      );
      this.db.run(
        `CREATE TABLE IF NOT EXISTS data_tag (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data_id TEXT,
          tag_id INTEGER,
          UNIQUE(data_id, tag_id)
        )`
      );
    });
  }

  getOrCreateTag(name, source = 'auto') {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM tag WHERE name = ?', [name], (err, row) => {
        if (err) return reject(err);
        if (row && row.id) return resolve(row.id);
        this.db.run(
          'INSERT INTO tag(name, source) VALUES(?, ?)',
          [name, source],
          function (insertErr) {
            if (insertErr) {
              // UNIQUE 제약 위반 시 다시 조회
              if (insertErr.code === 'SQLITE_CONSTRAINT') {
                return resolve(null);
              }
              return reject(insertErr);
            }
            resolve(this.lastID);
          }
        );
      });
    }).then((id) => {
      if (id) return id;
      // 방금 UNIQUE 충돌로 인해 id가 없을 수 있으므로 재조회
      return new Promise((resolve, reject) => {
        this.db.get('SELECT id FROM tag WHERE name = ?', [name], (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.id : null);
        });
      });
    });
  }

  linkDataTag(dataId, tagId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO data_tag(data_id, tag_id) VALUES(?, ?)',
        [dataId, tagId],
        function (err) {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  }

  async saveTaggingResult(dataId, tags) {
    for (const t of tags) {
      const name = t.name || t.label || t.tag;
      const source = t.source || 'auto';
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
