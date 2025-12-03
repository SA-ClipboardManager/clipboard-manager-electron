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
     * @returns {object|null}
     */
    getById(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT c.*,
                       im.width,
                       im.height,
                       im.file_size,
                       im.file_path,
                       im.thumbnail_path
                FROM clipboard c
                         LEFT JOIN image_meta im ON c.id = im.data_id
                WHERE c.id = ?
            `);

            const row = stmt.get(id);
            if (!row) return null;

            const tags = this._getTags(id);

            const meta = (row.width || row.height || row.file_path)
                ? {
                    data_id: id,
                    width: row.width,
                    height: row.height,
                    file_size: row.file_size,
                    file_path: row.file_path,
                    thumbnail_path: row.thumbnail_path
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
     * @returns {Array<object>}
     */
    getAll(options = {}) {
        try {
            const stmt = this.db.prepare(`
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
            const rows = stmt.all();
            return rows.map((row) => {
                const tags = this._getTags(row.id);
                const meta = (row.width || row.height || row.file_path)
                    ? {
                        data_id: row.id,
                        width: row.width,
                        height: row.height,
                        file_size: row.file_size,
                        file_path: row.file_path,
                        thumbnail_path: row.thumbnail_path
                    }
                    : null;
                return this._mapToDto(row, meta, tags);
            });
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
     * @returns {Array<object>}
     */
    search(query, filters = {}) {
        try {
            // Implement search logic here
            // This is a simplified example
            const stmt = this.db.prepare(`
                SELECT *
                FROM clipboard
                WHERE content LIKE :query
                  AND (:isCloud IS NULL or is_cloud_item = :isCloud)
                ORDER BY created_at DESC
            `);
            return stmt.all({
                isCloud: filters.isCloud ?? null,
                query: `%${query}%`
            });
        } catch (error) {
            throw CCDError.create("E610", {
                module: "ClipboardRepository",
                context: "search",
                message: error.message,
            });
        }
    }

    getByIds(ids) {
        if (!ids || ids.length === 0) return [];

        try {
            // ids 배열을 SQL 쿼리용 문자열로 변환 (예: ?,?,?)
            const placeholders = ids.map(() => '?').join(',');

            // WHERE c.id IN (?,?,?) 구문 사용
            const stmt = this.db.prepare(`
                SELECT c.*,
                       im.width,
                       im.height,
                       im.file_size,
                       im.file_path,
                       im.thumbnail_path
                FROM clipboard c
                         LEFT JOIN image_meta im ON c.id = im.data_id
                WHERE c.id IN (${placeholders})
            `);

            // 배열을 전개(...)해서 인자로 전달
            const rows = stmt.all(...ids);

            // 결과 매핑
            return rows.map(row => {
                const tags = this._getTags(row.id); // 태그 가져오기 (N+1이 발생하긴 하지만 태그는 가벼우므로 일단 패스)

                const meta = (row.width || row.height || row.file_path)
                    ? {
                        data_id: row.id,
                        width: row.width,
                        height: row.height,
                        file_size: row.file_size,
                        file_path: row.file_path,
                        thumbnail_path: row.thumbnail_path
                    }
                    : null;

                return this._mapToDto(row, meta, tags);
            });

        } catch (error) {
            throw CCDError.create("E611", { // 에러 코드 구분
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
        const tx = this.db.transaction(() => {
            // Save to clipboard table
            const stmt = this.db.prepare(`
                INSERT
                OR REPLACE INTO clipboard 
        (id, type, format, content, is_synced, is_cloud_item, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const clipboardResult = stmt.run(
                item.id,
                item.type,
                item.format,
                item.content,
                item.is_synced || 0,
                item.is_cloud_item || 0,
                item.created_at || now
            );

            console.log(`[ClipboardRepository] Clipboard insert:`, {
                changes: clipboardResult.changes,
            });

            // Save to image_meta if exists
            if (meta) {
                const metaStmt = this.db.prepare(`
                    INSERT
                    OR REPLACE INTO image_meta 
          (data_id, width, height, file_size, file_path, thumbnail_path)
          VALUES (?, ?, ?, ?, ?, ?)
                `);
                const metaResult = metaStmt.run(
                    item.id,
                    meta.width,
                    meta.height,
                    meta.file_size,
                    meta.file_path,
                    meta.thumbnail_path
                );

                console.log(`[ClipboardRepository] Image_meta insert:`, {
                    changes: metaResult.changes,
                    data_id: item.id,
                });
            }
        });

        try {
            tx();
            console.log(`[ClipboardRepository] Transaction completed for ${item.id}`);
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
            const stmt = this.db.prepare("DELETE FROM clipboard WHERE id = ?");
            stmt.run(id);

            // Delete associated image files if they exist
            const meta = this._getImageMeta(id);
            if (meta && meta.file_path) {
                await fs.remove(meta.file_path).catch(() => {
                });
            }
            if (meta && meta.thumbnail_path) {
                await fs.remove(meta.thumbnail_path).catch(() => {
                });
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
            const tx = this.db.transaction(() => {
                // 1. 기존 태그 연결 제거
                this.db.prepare("DELETE FROM data_tag WHERE data_id = ?").run(dataId);

                // 2. 태그 저장 및 연결 (Source는 'user'로 고정 가정)
                const insertTagStmt = this.db.prepare(`
                    INSERT
                    OR IGNORE INTO tag (local_id, name, source) VALUES (?, ?, 'user')
                `);

                const getTagIdStmt = this.db.prepare(`
                    SELECT local_id
                    FROM tag
                    WHERE name = ?
                      AND source = 'user'
                `);

                const linkStmt = this.db.prepare(`
                    INSERT
                    OR IGNORE INTO data_tag (data_id, tag_id) 
          VALUES (?, ?)
                `);

                for (const name of tagNames) {
                    // 2-1. 태그가 없으면 생성 (UUID 생성 필요)
                    // INSERT OR IGNORE이므로 이미 있으면 무시됨
                    const newTagId = crypto.randomUUID();
                    insertTagStmt.run(newTagId, name);

                    // 2-2. 태그 ID 조회 (방금 넣은 것 혹은 기존 것)
                    const tagRow = getTagIdStmt.get(name);

                    if (tagRow) {
                        // 2-3. 연결 테이블에 저장
                        linkStmt.run(dataId, tagRow.local_id);
                    }
                }
            });

            tx();
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
    updateImagePaths(id, {file_path, thumbnail_path}) {
        console.log(`[ClipboardRepository] updateImagePaths(${id}):`, {
            file_path,
            thumbnail_path,
        });

        const updates = [];
        const params = [];

        if (file_path !== undefined) {
            updates.push("file_path = ?");
            params.push(file_path);
        }
        if (thumbnail_path !== undefined) {
            updates.push("thumbnail_path = ?");
            params.push(thumbnail_path);
        }

        // 업데이트할 내용이 없으면 종료
        if (updates.length === 0) {
            console.log(`[ClipboardRepository] No paths to update for ${id}`);
            return;
        }

        params.push(id); // WHERE 조건용 id

        const stmt = this.db.prepare(`
            UPDATE image_meta
            SET ${updates.join(", ")}
            WHERE data_id = ?
        `);

        const result = stmt.run(...params);
        console.log(`[ClipboardRepository] updateImagePaths result:`, {
            changes: result.changes,
            affectedRows: result.changes,
        });
    }

    // --- Private helper methods ---

    /**
     * Get image metadata
     * @private
     * @param {string} dataId
     * @returns {object|null}
     */
    _getImageMeta(dataId) {
        const stmt = this.db.prepare(`
            SELECT *
            FROM image_meta
            WHERE data_id = ?
        `);
        return stmt.get(dataId) || null;
    }

    /**
     * Get tags for a clipboard item
     * @private
     * @param {string} dataId
     * @returns {Array<object>}
     */
    _getTags(dataId) {
        // tag.id -> tag.local_id 로 수정
        const stmt = this.db.prepare(`
            SELECT t.*
            FROM tag t
                     JOIN data_tag dt ON t.local_id = dt.tag_id
            WHERE dt.data_id = ?
        `);
        return stmt.all(dataId);
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

    getAllClipboardWithMetaAndTags() {
        try {
            // Aggregate tags and image meta per clipboard item
            const stmt = this.db.prepare(`
                SELECT c.id,
                       c.type,
                       c.format,
                       c.content,
                       c.created_at,
                       GROUP_CONCAT(t.name) AS tag_names,
                       im.width,
                       im.height,
                       im.file_size,
                       im.file_path,
                       im.thumbnail_path
                FROM clipboard c
                         LEFT JOIN data_tag dt ON c.id = dt.data_id
                         LEFT JOIN tag t ON t.local_id = dt.tag_id
                         LEFT JOIN image_meta im ON c.id = im.data_id
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `);

            const rows = stmt.all();
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
    markAsSynced(id) {
        try {
            const stmt = this.db.prepare(`
                UPDATE clipboard
                SET is_synced     = 1,
                    is_cloud_item = 1
                WHERE id = ?
            `);
            stmt.run(id);
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
     * @returns {number} Number of deleted items
     */
    deleteAllCloudItems() {
        try {
            const stmt = this.db.prepare(`
                DELETE
                FROM clipboard
                WHERE is_cloud_item = 1
            `);
            const result = stmt.run();

            console.log(
                `[ClipboardRepository] Deleted ${result.changes} cloud items`
            );
            return result.changes;
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
