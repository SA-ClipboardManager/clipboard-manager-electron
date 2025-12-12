const CCDError = require('../../shared/errors/CCDError');
const { makeFileUrl, getThumbnailUrlByUuid } = require('../../shared/utility/pathUtils');

class SearchService {
  /**
   *
   * @param {*} clipboardRepository   // 로컬 검색에 필요
   * @param {*} axiosInstance         // CloudService의 axiosInstance 주입
   */

  constructor(clipboardRepository, axiosInstance) {
    this.clipboardRepository = clipboardRepository;
    this.axios = axiosInstance;
    this.cache = {
      all: { data: null, valid: false },
    };
  }

  /**
   * 향상된 로컬 검색: 부분 일치 + 우선순위 정렬 + 태그 통합 검색
   */
  async keywordLocalSearch(query, options = {}) {
    try {
      const queryLower = query.toLowerCase();

      // 로컬 모든 데이터 조회
      const allLocalItems = this.clipboardRepository.getAllClipboardWithMetaAndTags();
      console.log(`[SearchService] DB 전체 아이템 개수: ${allLocalItems.length}`);

      // 부분 일치 + 태그 검색으로 필터링
      const filteredItems = allLocalItems.filter((item) => {
        const content = item.content?.toLowerCase() || '';
        const tags = (item.tag_names || '').toLowerCase();

        return content.includes(queryLower) || tags.includes(queryLower);
      });

      console.log(`[SearchService] 필터링 후 결과 개수: ${filteredItems.length}`);

      // 우선순위 정렬: 정확 일치 > 시작 > 포함
      const results = filteredItems
        .map((item) => {
          const content = item.content?.toLowerCase() || '';
          const tags = (item.tag_names || '').toLowerCase();

          // 점수 계산 (낮을수록 높은 우선순위)
          let score = 0;

          // 정확 일치 (최고 우선순위)
          if (content === queryLower || tags === queryLower) {
            score = 0;
          }
          // 시작 (중간 우선순위)
          else if (content.startsWith(queryLower) || tags.startsWith(queryLower)) {
            score = 1;
          }
          // 포함 (낮은 우선순위)
          else {
            score = 2;
          }

          return {
            ...item,
            _score: score,
          };
        })
        .sort((a, b) => a._score - b._score || b.created_at - a.created_at)
        .map((item) => {
          const { _score, ...rest } = item;

          let imageMeta = null;
          let thumbnailUrl = null;
          if (rest.type === 'img' && rest.image_meta) {
            const meta = rest.image_meta;
            thumbnailUrl = getThumbnailUrlByUuid(rest.id);

            console.log('[SearchService] 로컬 이미지 메타 처리:', { thumbnailUrl });

            rest.content = thumbnailUrl;

            imageMeta = {
              ...meta,
              thumbnail_path: thumbnailUrl,
            };
          }

          return {
            id: rest.id,
            type: rest.type,
            content: rest.content,
            format: rest.format,
            created_at: rest.created_at,
            tags: rest.tag_names ? rest.tag_names.split(',') : [],
            imageMeta: imageMeta,
            shared: 'local',
          };
        });

      console.log(`[SearchService] 최종 정렬 후 결과 개수: ${results.length}`);
      return results;
    } catch (error) {
      throw CCDError.create('E610', {
        module: 'SearchService',
        context: '검색 오류',
        message: error.message || error,
      });
    }
  }

  async keywordCloudSearch(query) {
    try {
      const response = await this.axios.get('/api/search/text', {
        params: { query },
      });

      const items = response.data.items || [];

      return items.map((item) => ({
        ...item,
        shared: 'cloud',
      }));
    } catch (error) {
      throw CCDError.create('E610', {
        module: 'SearchService',
        context: '클라우드 키워드 검색 실패',
        message: error.message,
      });
    }
  }

  async keywordLocalCloudSearch(query, options = {}) {
    try {
      // 로컬 검색 먼저 실행 (항상 성공해야 함)
      const localResults = await this.keywordLocalSearch(query, options);
      console.log(`[SearchService] 로컬 검색 완료: ${localResults.length}개`);

      // 클라우드 검색 시도 (실패해도 로컬 결과는 반환)
      let cloudResults = [];
      try {
        cloudResults = await this.keywordCloudSearch(query);
        console.log(`[SearchService] 클라우드 검색 완료: ${cloudResults.length}개`);
      } catch (cloudError) {
        console.warn(`[SearchService] 클라우드 검색 실패 (로컬 결과만 반환): ${cloudError.message}`);
        // 클라우드 검색 실패는 무시하고 로컬 결과만 반환
      }

      return this.mergeItems(localResults, cloudResults);
    } catch (error) {
      // 로컬 검색도 실패한 경우에만 에러 throw
      console.error(`[SearchService] 검색 실패:`, error);
      throw CCDError.create('E610', {
        module: 'SearchService',
        context: '통합 검색 실패',
        message: error.message || '검색 중 오류가 발생했습니다',
      });
    }
  }

  /*
     {
      id: string,
      type: "txt" | "img",
      content: string, // txt: string, img: 이미지 URL
      format?: string,
      created_at: number,
      tags: string[],
      imageMeta?: {
      width,
      height,
      file_size,
      originalUrl,
      thumbnailUrl
    }
     */


  async vectorCloudSearch(query, topK = 10) {
    try {
      // Embedding-Service 게이트웨이 경로
      // nginx.conf에서 /search/v1/ -> embedding-service 로 프록시됨
      const response = await this.axios.post('/search/v1/search', {
        query,
        top_k: topK,
      });

      const results = response.data?.results || [];

      // 아이템 변환
      const items = results.map((r) => {
        console.log(`[SearchService] CLIP Search - Raw Result:`, r);

        // UUID를 기반으로 썸네일 경로 생성 (Documents/CCD/thumbnails/thumb_<uuid>.png)
        const thumbnailUrl = getThumbnailUrlByUuid(r.uuid);

        console.log(`[SearchService] CLIP Search - ID: ${r.uuid}, Thumbnail: ${thumbnailUrl}`);

        return {
          id: r.uuid,
          type: 'img',
          content: thumbnailUrl, // ccd://thumbnails/thumb_<uuid>.png
          format: 'img',
          created_at: Date.now(),
          tags: [],
          meta: {
            file_path: null, // 클라우드 검색 결과는 로컬 경로 없음
            thumbnail_path: thumbnailUrl,
          },
          imageMeta: {
            originalUrl: null,
            thumbnailUrl: thumbnailUrl,
          },
          shared: 'cloud',
        };
      });

      return items;
    } catch (error) {
      throw CCDError.create('E610', {
        module: 'SearchService',
        context: 'CLIP 검색 실패',
        message: error.message,
      });
    }
  }

  async reloadCache(force = false) {
    if (this.cache.all.valid && !force) return;

    try {
      const [localRaw, cloudRaw] = await Promise.all([
        this.getLocalPreviewDataOnly(),
        // this.getCloudPreviewDataOnly(),
        Promise.resolve([]),
      ]);

      const merged = this.mergeItems(localRaw, cloudRaw);
      this.cache.all = { data: merged, valid: true };
    } catch (error) {
      console.error('캐시 재로드 실패:', error);
      this.cache.all = { data: [], valid: false };
    }
  }

  mergeItems(localItems, cloudItems) {
    const mergedMap = new Map();

    localItems.forEach((item) => {
      mergedMap.set(item.id, {
        ...item,
        shared: item.shared || 'local',
        thumbnailUrl: item.imageMeta?.thumbnail_path,
      });
    });

    cloudItems.forEach((item) => {
      if (mergedMap.has(item.id)) {
        const localItem = mergedMap.get(item.id);
        mergedMap.set(item.id, {
          ...localItem,
          thumbnailUrl: item.imageMeta?.thumbnail_path,
          shared: 'both',
        });
      } else {
        mergedMap.set(item.id, {
          ...item,
          shared: item.shared || 'cloud',
        });
      }
    });

    return Array.from(mergedMap.values()).sort((a, b) => b.created_at - a.created_at);
  }

  async getLocalPreviewDataOnly() {
    const raw = this.clipboardRepository.getAllClipboardWithMetaAndTags();

    return raw.map((item) => ({
      id: item.id,
      type: item.type,
      content: item.content,
      format: item.format,
      created_at: item.created_at,
      tags: item.tag_names ? item.tag_names.split(',') : [],
      imageMeta: item.image_meta || null,
      shared: 'local',
    }));
  }

  async getCloudPreviewDataOnly() {
    try {
      const response = await this.axios.get('/api/v1/clipboard-data/preview');

      const items = response.data.items || [];

      return items.map((item) => ({
        id: item.id,
        type: item.type,
        content: item.content,
        format: item.format,
        created_at: item.created_at,
        tags: item.tags || [],
        imageMeta: item.image_meta || null,
        shared: 'cloud',
      }));
    } catch (error) {
      console.error('[SearchService] 클라우드 미리보기 조회 실패:', error);
      return [];
    }
  }
}

module.exports = SearchService;
