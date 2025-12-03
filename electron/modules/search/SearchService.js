const CCDError = require('../../shared/errors/CCDError');
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

  async keywordLocalSearch(query, options = {}) {
    try {
      const localIds = await this.clipboardRepository.search(query, options);
      await this.reloadCache();
      const allItems = this.cache.all.data || [];
      const localResults = allItems.filter((item) => item.shared !== 'cloud' && localIds.includes(item.id));

      const lowerQuery = query.toLowerCase();

      const cloudResults = allItems.filter((item) => {
        if (item.shared !== 'cloud') return false;

        const text = item.content?.toLowerCase() || '';
        const tags = (item.tags || []).map((t) => t.name?.toLowerCase() || '').join(' ');

        return text.includes(lowerQuery) || tags.includes(lowerQuery);
      });
      return this.mergeItems(localResults, cloudResults);
    } catch (error) {
      throw CCDError.create('E610', {
        module: 'DataRepository',
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
      const localResults = await this.keywordLocalSearch(query, options);
      const cloudResults = await this.keywordCloudSearch(query);

      return this.mergeItems(localResults, cloudResults);
    } catch (error) {
      throw CCDError.create('E610', {
        module: 'SearchService',
        context: '로컬+클라우드 검색 실패',
        message: error.message,
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

  //TODO api 호출 방법에 따라 수정
  async vectorCloudSearch(query, topK = 10) {
    try {
      // Embedding-Service 게이트웨이 경로
      // nginx.conf에서 /search/v1/ -> embedding-service 로 프록시됨
      const response = await this.axios.post('/search/v1/search', {
        query,
        top_k: topK,
      });

      const results = response.data?.results || [];

      // Embedding-Service 응답을 Electron에서 사용하는 아이템 형태로 매핑
      const items = results.map((r) => ({
        id: r.uuid,
        type: 'img',
        content: r.file_path || r.metadata?.path || '',
        format: 'img',
        created_at: Date.now(), // 서버에서 제공되지 않으므로 현재 시각으로 대체
        tags: [],
        imageMeta: {
          // 썸네일/메타가 필요하면 서버 메타데이터를 확장
          originalUrl: r.file_path || r.metadata?.path || '',
          thumbnail_path: null,
        },
        shared: 'cloud',
      }));

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
        Promise.resolve([]), //TODO 임시 주석 처리
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
