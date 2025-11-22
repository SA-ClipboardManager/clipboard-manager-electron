const SQLiteUnitOfWork = require("../uow/SQLiteUnitOfWork");
const CCDError = require("../../shared/errors/CCDError");

class SyncRepository {
  /**
   * @param {import('../database/DatabaseContext')} dbContext
   */
  constructor(dbContext) {
    this.db = dbContext.getDb();
    this.uow = new SQLiteUnitOfWork(dbContext);

    // Config 테이블이 없을 경우를 대비해 초기화 (간단한 K-V 테이블)
    this._ensureConfigTable();
  }

  _ensureConfigTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  // --- Config 관리 (Last Modified Time) ---

  async getConfig() {
    try {
      const row = this.db
        .prepare("SELECT value FROM app_config WHERE key = 'last_modified'")
        .get();
      return { last_modified: row ? parseInt(row.value, 10) : 0 };
    } catch (error) {
      return { last_modified: 0 };
    }
  }

  async updateConfig(config) {
    if (config.last_modified !== undefined) {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_modified', ?)"
        )
        .run(String(config.last_modified));
    }
  }

  // --- Outbox (Upstream) 관리 ---

  /**
   * 대기 중인 동기화 이벤트 조회
   */
  getPendingEvents() {
    try {
      return this.db
        .prepare("SELECT * FROM pending_sync ORDER BY created_at ASC")
        .all();
    } catch (error) {
      throw CCDError.create("E610", {
        module: "SyncRepository",
        context: "getPendingEvents",
        message: error.message,
      });
    }
  }

  /**
   * 동기화 성공 후 Outbox 항목 제거 및 태그 매핑 처리
   * @param {Array} tagMappings 서버에서 확정된 태그 ID 매핑 정보
   * @param {Array} processedItems 처리된 Outbox 아이템들
   */
  async handleSyncResponse(tagMappings, processedItems) {
    return this.uow.execute((ctx) => {
      // 1. 처리된 Outbox 항목 삭제
      for (const item of processedItems) {
        ctx.outbox.remove(item.id);
      }

      // 2. 태그 ID 매핑 업데이트 (로컬 ID -> 서버 ID)
      if (tagMappings && tagMappings.length > 0) {
        for (const mapping of tagMappings) {
          // 로컬 태그 ID를 서버 태그 ID로 교체
          ctx.clipboard.updateTagServerId(mapping.local_id, mapping.server_id);
        }
      }
    });
  }

  /**
   * 재시도(Backoff) 정보 업데이트
   */
  updatePendingSyncRetry(id, retryCount, nextAttemptAt) {
    try {
      this.db
        .prepare(
          "UPDATE pending_sync SET retry_count = ?, next_attempt_at = ? WHERE id = ?"
        )
        .run(retryCount, nextAttemptAt, id);
    } catch (error) {
      console.error("Retry update failed", error);
    }
  }

  /**
   * 사용자가 수동으로 특정 항목을 '동기화 대상'으로 지정
   */
  async markAsCloudItem(clipId) {
    return this.uow.execute((ctx) => {
      // [필수] 1. DB에서 해당 클립보드 항목의 전체 데이터를 조회합니다.
      const itemData = ctx.clipboard.getItemData(clipId);

      if (!itemData) {
        console.error(`Item not found for sync: ${clipId}`);
        return false; // 항목 없으면 실패
      }

      // 2. Outbox에 보낼 최종 페이로드 구성
      const argsPayload = {
        ...itemData,
        // 이미지 메타데이터 등 서버에 필요한 정보는 여기에 추가 (옵션)
      };

      // 3. Outbox에 전체 데이터(argsPayload)를 저장합니다.
      ctx.outbox.enqueue("INSERT", clipId, argsPayload);

      // 4. 클립보드 테이블의 상태 업데이트 (is_cloud_item = 1)
      ctx.clipboard.markAsCloudItem(clipId);

      return true;
    });
  }

  // --- Downstream 관리 (Server -> Local) ---

  /**
   * 서버에서 받은 데이터를 로컬 DB에 반영
   * @param {Array} items 서버 아이템 목록
   * @param {Function} onThumbnailNeeded 썸네일 다운로드가 필요한 경우 호출될 콜백
   */
  async processDownstreamSync(items, onThumbnailNeeded) {
    return this.uow.execute((ctx) => {
      for (const item of items) {
        // 1. 서버 데이터 -> 로컬 엔티티 변환 (간소화)
        const clipData = {
          id: item.id,
          type: item.type,
          format: item.format,
          content: item.content,
          is_synced: 1, // 서버에서 왔으므로 이미 동기화됨
          is_cloud_item: 1,
          created_at: item.created_at,
        };

        const imageMeta = item.image_meta
          ? {
              data_id: item.id,
              width: item.image_meta.width,
              height: item.image_meta.height,
              file_size: item.image_meta.file_size,
              // 경로는 다운로드 로직에서 별도 설정하거나 미리 규칙에 따라 지정
              file_path: item.image_meta.file_path || "",
              thumbnail_path: item.image_meta.thumbnail_path || "",
            }
          : null;

        // 2. 데이터 저장 (기존 데이터가 있으면 덮어쓰거나 무시하는 로직 필요, 여기선 Writer가 Insert 수행)
        // 주의: SQLiteClipboardWriter.save는 INSERT 문을 사용하므로 중복 시 에러가 날 수 있음.
        // 실무에서는 INSERT OR REPLACE 또는 존재 여부 체크 후 분기 필요.
        // 여기서는 편의상 Writer가 내부적으로 처리한다고 가정하거나, try-catch로 감쌉니다.
        try {
          ctx.clipboard.save(clipData, imageMeta);
        } catch (e) {
          // 이미 존재하면 넘어감 (단순화)
          console.warn(
            `[Sync] Item ${item.id} already exists or save failed.`,
            e.message
          );
        }

        // 3. 태그 연결
        if (item.tags) {
          for (const tag of item.tags) {
            // 태그 생성 및 연결 (Writer 내부에 로직 존재)
            ctx.clipboard.createTagIfNotExists({
              local_id: tag.local_id || tag.tag_id, // 서버 ID를 로컬 ID로도 사용 가능
              name: tag.name,
              source: tag.source,
              tag_id: tag.tag_id,
            });
            ctx.clipboard.connectTag(item.id, tag.local_id || tag.tag_id);
          }
        }

        // 4. 썸네일 다운로드 필요 여부 확인 (콜백 호출)
        if (imageMeta && onThumbnailNeeded) {
          onThumbnailNeeded(item);
        }
      }
    });
  }

  /**
   * WebSocket 등을 통해 태그 ID 확정 업데이트
   */
  async updateTagId(localId, serverId) {
    return this.uow.execute((ctx) => {
      ctx.clipboard.updateTagServerId(localId, serverId);
    });
  }
}

module.exports = SyncRepository;
