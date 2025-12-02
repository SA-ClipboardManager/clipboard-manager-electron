const CCDError = require("../../shared/errors/CCDError");

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
            all: {data: null, valid: false},
        };
    }

    async keywordLocalSearch(query, {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(query, {isCloud});
            console.log(dbResults.map(item => item.id));
            return dbResults;
        } catch (error) {
            throw CCDError.create("E610", {
                module: "DataRepository",
                context: "검색 오류",
                message: error.message || error,
            });
        }
    }

    async keywordCloudSearch(query, {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(query, {isCloud});
            console.log(dbResults.map(item => item.id));
            console.log(this.cache.all.data);

            return dbResults;
        } catch (error) {
            throw CCDError.create("E610", {
                module: "SearchService",
                context: "클라우드 키워드 검색 실패",
                message: error.message,
            });
        }
    }

    async keywordLocalCloudSearch(query,  {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(query, {isCloud});
            console.log(dbResults.map(item => item.id));

            return dbResults;
        } catch (error) {
            throw CCDError.create("E610", {
                module: "SearchService",
                context: "로컬+클라우드 검색 실패",
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
    async vectorCloudSearch(query) {
        try {
            const response = await this.axios.post("/api/search/clip", {query});

            const items = response.data.items || [];

            return items.map(item => ({
                ...item,
                shared: "cloud",
            }));

        } catch (error) {
            throw CCDError.create("E610", {
                module: "SearchService",
                context: "CLIP 검색 실패",
                message: error.message,
            });
        }
    }


// async reloadCache(force = false) {
//     if (this.cache.all.valid && !force) return;
//
//     try {
//         const [localRaw, cloudRaw] = await Promise.all([
//             this.getLocalPreviewDataOnly(),
//             // this.getCloudPreviewDataOnly(),
//             Promise.resolve([]),//TODO 임시 주석 처리
//         ]);
//
//         const merged = this.mergeItems(localRaw, cloudRaw);
//         this.cache.all = {data: merged, valid: true};
//     } catch (error) {
//         console.error("캐시 재로드 실패:", error);
//         this.cache.all = {data: [], valid: false};
//     }
// }

// mergeItems(localItems, cloudItems) {
//     const mergedMap = new Map();
//
//     localItems.forEach((item) => {
//         mergedMap.set(item.id, {
//             ...item,
//             shared: item.shared || "local",
//             thumbnailUrl: item.imageMeta?.thumbnail_path,
//         });
//     });
//
//     cloudItems.forEach((item) => {
//         if (mergedMap.has(item.id)) {
//             const localItem = mergedMap.get(item.id);
//             mergedMap.set(item.id, {
//                 ...localItem,
//                 thumbnailUrl: item.imageMeta?.thumbnail_path,
//                 shared: "both",
//             });
//         } else {
//             mergedMap.set(item.id, {
//                 ...item,
//                 shared: item.shared || "cloud",
//             });
//         }
//     });
//
//     return Array.from(mergedMap.values()).sort(
//         (a, b) => b.created_at - a.created_at
//     );
// }

// async getLocalPreviewDataOnly() {
//     const raw = this.clipboardRepository.getAllClipboardWithMetaAndTags();
//
//     return raw.map(item => ({
//         id: item.id,
//         type: item.type,
//         content: item.content,
//         format: item.format,
//         created_at: item.created_at,
//         tags: item.tag_names ? item.tag_names.split(",") : [],
//         imageMeta: item.image_meta || null,
//         shared: "local",
//     }));
// }

}


module.exports = SearchService;