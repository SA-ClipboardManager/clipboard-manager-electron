// electron/infrastructure/repositories/ClipboardRepository.js
const CCDError = require("../../shared/errors/CCDError");
const fs = require("fs-extra");
const ImageProcessor = require("../../shared/utility/imageProcessor");
const IClipboardRepository = require("../../shared/interfaces/IClipboardRepository");
const crypto = require("crypto");

/**
 * Implementation of IClipboardRepository for managing clipboard items
 * @implements {IClipboardRepository}
 */
class ClipboardRepository {
  /**
   * @param {import('../database/DatabaseContext')} dbContext
   */
  constructor(dbContext) {
    this.db = dbContext.getDb();
    this.imageProcessor = new ImageProcessor();
  }

  /**
   * Get clipboard item by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    try {
      const result = await this.db.query(
        `
        SELECT c.*,
               im.width,
               im.height,
               im.file_size,
               im.file_path,
               im.thumbnail_path
        FROM clipboard c
        LEFT JOIN image_meta im ON c.id = im.data_id
        WHERE c.id = $1
      `,
        [id]
      );

      const row = result.rows[0];
      if (!row) return null;

      const tags = await this._getTags(id);

      const meta =
        row.width || row.height || row.file_path
          ? {
              data_id: id,
              width: row.width,
              height: row.height,
              file_size: row.file_size,
              file_path: row.file_path,
              thumbnail_path: row.thumbnail_path,
            }
          : null;

      return this._mapToDto(row, meta, tags);
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "getById",
        message: error.message,
      });
    }
  }

  /**
   * Get all clipboard items
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async getAll(options = {}) {
    try {
      const result = await this.db.query(`
        SELECT c.*,
               im.width,
               im.height,
               im.file_size,
               im.file_path,
               im.thumbnail_path
        FROM clipboard c
        LEFT JOIN image_meta im ON c.id = im.data_id
        ORDER BY c.created_at DESC
      `);

      const rows = result.rows;
      const mappedRows = [];

      for (const row of rows) {
        const tags = await this._getTags(row.id);
        const meta =
          row.width || row.height || row.file_path
            ? {
                data_id: row.id,
                width: row.width,
                height: row.height,
                file_size: row.file_size,
                file_path: row.file_path,
                thumbnail_path: row.thumbnail_path,
              }
            : null;
        mappedRows.push(this._mapToDto(row, meta, tags));
      }

      return mappedRows;
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "getAll",
        message: error.message,
      });
    }
  }

  /**
   * Search clipboard items
   * @param {string} query
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async search(query, filters = {}) {
    try {
      // PostgreSQL FTS 또는 LIKE 검색
      const queryPattern = `%${query}%`;
      const result = await this.db.query(
        `
        SELECT *
        FROM clipboard
        WHERE (content ILIKE $1 OR format ILIKE $1)
          AND ($2::boolean IS NULL or is_cloud_item = COALESCE($2::integer, is_cloud_item))
        ORDER BY created_at DESC
      `,
        [queryPattern, filters.isCloud ?? null]
      );

      return result.rows.map((row) => this._mapToDto(row, null, []));
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "search",
        message: error.message,
      });
    }
  }

  getByIds(ids) {
    // PostgreSQL 비동기 방식
    return this._getByIdsAsync(ids);
  }

  /**
   * PostgreSQL에서 비동기로 처리하는 방식
   */
  async _getByIdsAsync(ids) {
    if (!ids || ids.length === 0) return [];

    try {
      // PostgreSQL의 ANY 문법 사용
      const result = await this.db.query(
        `
        SELECT c.*,
               im.width,
               im.height,
               im.file_size,
               im.file_path,
               im.thumbnail_path
        FROM clipboard c
        LEFT JOIN image_meta im ON c.id = im.data_id
        WHERE c.id = ANY($1::text[])
      `,
        [ids]
      );

      const rows = result.rows;
      const mappedRows = [];

      for (const row of rows) {
        const tags = await this._getTags(row.id);
        const meta =
          row.width || row.height || row.file_path
            ? {
                data_id: row.id,
                width: row.width,
                height: row.height,
                file_size: row.file_size,
                file_path: row.file_path,
                thumbnail_path: row.thumbnail_path,
              }
            : null;
        mappedRows.push(this._mapToDto(row, meta, tags));
      }

      return mappedRows;
    } catch (error) {
      throw CCDError.create("E611", {
        module: "ClipboardRepository",
        context: "getByIds",
        message: error.message,
      });
    }
  }

  /**
   * Save clipboard item
   * @param {object} item
   * @param {object} [meta]
   * @returns {Promise<void>}
   */
  async save(item, meta) {
    console.log(`[ClipboardRepository] save called:`, {
      id: item.id,
      type: item.type,
      hasMeta: !!meta,
      meta: meta,
    });

    const now = Math.floor(Date.now() / 1000);
    const client = await this.db;

    try {
      // PostgreSQL 트랜잭션 시작
      await client.query("BEGIN");

      try {
        // Save to clipboard table
        const clipboardResult = await client.query(
          `
          INSERT INTO clipboard (id, type, format, content, is_synced, is_cloud_item, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            format = EXCLUDED.format,
            content = EXCLUDED.content,
            is_synced = EXCLUDED.is_synced,
            is_cloud_item = EXCLUDED.is_cloud_item
        `,
          [item.id, item.type, item.format, item.content, item.is_synced || 0, item.is_cloud_item || 0, item.created_at || now]
        );

        console.log(`[ClipboardRepository] Clipboard insert:`, {
          rowCount: clipboardResult.rowCount,
        });

        // Save to image_meta if exists
        if (meta) {
          const metaResult = await client.query(
            `
            INSERT INTO image_meta (data_id, width, height, file_size, file_path, thumbnail_path)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (data_id) DO UPDATE SET
              width = EXCLUDED.width,
              height = EXCLUDED.height,
              file_size = EXCLUDED.file_size,
              file_path = EXCLUDED.file_path,
              thumbnail_path = EXCLUDED.thumbnail_path
          `,
            [item.id, meta.width, meta.height, meta.file_size, meta.file_path, meta.thumbnail_path]
          );

          console.log(`[ClipboardRepository] Image_meta insert:`, {
            rowCount: metaResult.rowCount,
            data_id: item.id,
          });
        }

        await client.query("COMMIT");
        console.log(`[ClipboardRepository] Transaction completed for ${item.id}`);
      } catch (transactionError) {
        await client.query("ROLLBACK");
        throw transactionError;
      }
    } catch (error) {
      console.error(`[ClipboardRepository] Transaction failed:`, error);
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "save",
        message: error.message,
      });
    }
  }

  /**
   * Delete clipboard item
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    try {
      // Delete from database
      await this.db.query("DELETE FROM clipboard WHERE id = $1", [id]);

      // Delete associated image files if they exist
      const meta = await this._getImageMeta(id);
      if (meta && meta.file_path) {
        await fs.remove(meta.file_path).catch(() => {});
      }
      if (meta && meta.thumbnail_path) {
        await fs.remove(meta.thumbnail_path).catch(() => {});
      }
    } catch (error) {
      throw CCDError.create("E630", {
        module: "ClipboardRepository",
        context: "delete",
        message: error.message,
      });
    }
  }

  /**
   * Attach tags to clipboard item
   * @param {string} dataId
   * @param {Array<string>} tagNames
   * @returns {Promise<void>}
   */
  async attachTags(dataId, tagNames) {
    try {
      const client = await this.db;

      try {
        await client.query("BEGIN");

        // 1. 기존 태그 연결 제거
        await client.query("DELETE FROM data_tag WHERE data_id = $1", [dataId]);

        // 2. 태그 저장 및 연결 (Source는 'user'로 고정 가정)
        for (const name of tagNames) {
          // 2-1. 태그가 없으면 생성 (UUID 생성)
          const newTagId = crypto.randomUUID();

          // INSERT ... ON CONFLICT로 중복 처리
          await client.query(
            `
            INSERT INTO tag (tag_id, name, source) 
            VALUES ($1, $2, 'user')
            ON CONFLICT (name, source) DO NOTHING
          `,
            [newTagId, name]
          );

          // 2-2. 태그 ID 조회
          const tagResult = await client.query(
            `
            SELECT tag_id FROM tag WHERE name = $1 AND source = 'user'
          `,
            [name]
          );

          const tagRow = tagResult.rows[0];
          if (tagRow) {
            // 2-3. 연결 테이블에 저장
            await client.query(
              `
              INSERT INTO data_tag (data_id, tag_id) 
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
              [dataId, tagRow.tag_id]
            );
          }
        }

        await client.query("COMMIT");
      } catch (transactionError) {
        await client.query("ROLLBACK");
        throw transactionError;
      }
    } catch (error) {
      throw CCDError.create("E640", {
        module: "ClipboardRepository",
        context: "attachTags",
        message: error.message,
      });
    }
  }

  /**
   * 이미지 경로만 업데이트 (Lazy Loading 완료 시 호출)
   * @param {string} id
   * @param {object} paths { file_path?: string, thumbnail_path?: string }
   */
  async updateImagePaths(id, { file_path, thumbnail_path }) {
    console.log(`[ClipboardRepository] updateImagePaths(${id}):`, {
      file_path,
      thumbnail_path,
    });

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (file_path !== undefined) {
      updates.push(`file_path = $${paramCount}`);
      params.push(file_path);
      paramCount++;
    }
    if (thumbnail_path !== undefined) {
      updates.push(`thumbnail_path = $${paramCount}`);
      params.push(thumbnail_path);
      paramCount++;
    }

    // 업데이트할 내용이 없으면 종료
    if (updates.length === 0) {
      console.log(`[ClipboardRepository] No paths to update for ${id}`);
      return;
    }

    params.push(id); // WHERE 조건용 id

    const result = await this.db.query(
      `
      UPDATE image_meta
      SET ${updates.join(", ")}
      WHERE data_id = $${paramCount}
    `,
      params
    );

    console.log(`[ClipboardRepository] updateImagePaths result:`, {
      rowCount: result.rowCount,
      affectedRows: result.rowCount,
    });
  }

  // --- Private helper methods ---

  /**
   * Get image metadata
   * @private
   * @param {string} dataId
   * @returns {Promise<object|null>}
   */
  async _getImageMeta(dataId) {
    const result = await this.db.query(
      `
      SELECT *
      FROM image_meta
      WHERE data_id = $1
    `,
      [dataId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get tags for a clipboard item
   * @private
   * @param {string} dataId
   * @returns {Promise<Array<object>>}
   */
  async _getTags(dataId) {
    const result = await this.db.query(
      `
      SELECT t.tag_id, t.name, t.source
      FROM tag t
      JOIN data_tag dt ON t.tag_id = dt.tag_id
      WHERE dt.data_id = $1
    `,
      [dataId]
    );
    return result.rows;
  }

  /**
   * Map database row to DTO
   * @private
   * @param {object} row
   * @param {object|null} meta
   * @param {Array<object>} tags
   * @returns {object}
   */
  _mapToDto(row, meta, tags) {
    return {
      id: row.id,
      type: row.type,
      format: row.format,
      content: row.content,
      isSynced: row.is_synced === 1,
      createdAt: row.created_at,
      meta: meta,
      tags: tags,
    };
  }

  /**
   * Search Service 용
   */
  async getAllClipboardWithMetaAndTags() {
    try {
      const result = await this.db.query(`
        SELECT c.id,
               c.type,
               c.format,
               c.content,
               c.created_at,
               STRING_AGG(t.name, ', ') AS tag_names,
               im.width,
               im.height,
               im.file_size,
               im.file_path,
               im.thumbnail_path
        FROM clipboard c
        LEFT JOIN data_tag dt ON c.id = dt.data_id
        LEFT JOIN tag t ON t.tag_id = dt.tag_id
        LEFT JOIN image_meta im ON c.id = im.data_id
        GROUP BY c.id, im.data_id, im.width, im.height, im.file_size, im.file_path, im.thumbnail_path
        ORDER BY c.created_at DESC
      `);

      const rows = result.rows;
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        format: r.format,
        content: r.content,
        created_at: r.created_at,
        tag_names: r.tag_names || "",
        image_meta:
          r.width || r.height || r.file_size || r.file_path || r.thumbnail_path
            ? {
                width: r.width,
                height: r.height,
                file_size: r.file_size,
                file_path: r.file_path,
                thumbnail_path: r.thumbnail_path,
              }
            : null,
      }));
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "getAllClipboardWithMetaAndTags",
        message: error.message,
      });
    }
  }

  /**
   * Mark item as successfully synced to cloud.
   * @param {string} id
   */
  async markAsSynced(id) {
    try {
      await this.db.query(
        `
        UPDATE clipboard
        SET is_synced     = 1,
            is_cloud_item = 1
        WHERE id = $1
      `,
        [id]
      );
    } catch (error) {
      throw CCDError.create("E610", {
        module: "ClipboardRepository",
        context: "markAsSynced",
        message: error.message,
      });
    }
  }

  /**
   * Delete all cloud items (called on logout/app exit)
   * @returns {Promise<number>} Number of deleted items
   */
  async deleteAllCloudItems() {
    try {
      const result = await this.db.query(`
        DELETE FROM clipboard
        WHERE is_cloud_item = 1
      `);

      console.log(`[ClipboardRepository] Deleted ${result.rowCount} cloud items`);
      return result.rowCount;
    } catch (error) {
      throw CCDError.create("E630", {
        module: "ClipboardRepository",
        context: "deleteAllCloudItems",
        message: error.message,
      });
    }
  }
}

module.exports = ClipboardRepository;
