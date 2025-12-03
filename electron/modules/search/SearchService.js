const CCDError = require("../../shared/errors/CCDError");
const API_GATEWAY_URL = process.env.CLOUD_API_BASE_URL;
const CorrelationId = require("../../shared/utility/CorrelationId");

class SearchService {
    /**
     *
     * @param {*} clipboardRepository   // 로컬 검색에 필요
     * @param {*} axiosInstance         // CloudService의 axiosInstance 주입
     */

    constructor(clipboardRepository, axiosInstance) {
        this.clipboardRepository = clipboardRepository;
        this.axios = axiosInstance;
    }

    async keywordLocalSearch(keyword, {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(keyword, {isCloud});
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

    async keywordCloudSearch(keyword, {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(keyword, {isCloud});
            console.log(dbResults.map(item => item.id));

            return dbResults;
        } catch (error) {
            throw CCDError.create("E610", {
                module: "SearchService",
                context: "클라우드 키워드 검색 실패",
                message: error.message,
            });
        }
    }

    async keywordLocalCloudSearch(keyword, {isCloud} = {}) {
        try {
            const dbResults = await this.clipboardRepository.search(keyword, {isCloud});
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


    async vectorCloudSearch(keyword) {
        try {


            const correlationId = CorrelationId.generate();
            console.log(`[${correlationId}] 🚀 Sending Keyword:`, keyword);
            const response = await this.axios.post(
                `/api/search/clip`,
                {keyword: keyword},
                {headers: {[CorrelationId.HEADER_NAME]: correlationId}},
            );

            console.log(`[${correlationId}] ✅ Server Response:`, response.data);

            const items = response.data || [];    //id 리스트 반환 ["id1", "id2"]

            console.log(
                CorrelationId.formatLog(
                    correlationId,
                    `Search successful. Found ${Array.isArray(items) ? items.length : 0} items.`
                )
            );

            if (items.length > 0) {
                const dbResults = await this.clipboardRepository.getByIds(items);
                return dbResults;
            }
            return [];

        } catch (error) {
            if (error.response) {
                // 서버가 응답은 줬는데 4xx, 5xx 에러인 경우
                console.error(`[Search Fail] Status: ${error.response.status}`);
                console.error(`[Search Fail] Data:`, error.response.data);
            } else if (error.request) {
                // 요청은 갔는데 응답을 못 받은 경우 (네트워크 문제 등)
                console.error(`[Search Fail] No Response received`);
            } else {
                // 코드 설정 문제
                console.error(`[Search Fail] Config Error:`, error.message);
            }
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