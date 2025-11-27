const BaseModule= require( "../../main/core/BaseModule");
const CCDError = require("../../shared/errors/CCDError")

class SearchModule extends BaseModule{

    constructor(services) {
        super(services, "search");
        this.service = services.SearchService;
    }

    registerIpcHandler(ipcMain) {
        ipcMain.handle("search-keyword", async (_, {keyword, model})=>{
            try {
                if (!keyword || !model) {
                    const err = CCDError.create("E611", {
                        module: "DataSearchModule",
                        context: "검색 요청 유효성 검사",
                        message: "검색어 또는 모델 정보가 없습니다.",
                    });
                    console.error(err);
                    return err.toJSON();
                }
                console.log("In search-keyword");
                let resultItems = [];
                //TODO Cloud에서만 검색 여부 + ui에서 넘겨주는 인자 변경
                if(model === "local_mobilenet"){
                    console.log("In if");
                    resultItems = await this.service.keywordLocalSearch(keyword);
                }
                else if(model === "cloud_mobilenet"){
                    resultItems = await this.service.keywordCloudSearch(keyword);
                }else if(model === "both_mobilenet"){
                    resultItems = await this.service.keywordLocalCloudSearch(keyword);
                }else if(model === "clip"){
                    resultItems = await this.service.vectorCloudSearch(keyword);
                }
                return {success: true, data: resultItems};
            }catch (err){
                const wrapped =
                    err instanceof CCDError
                ? err : CCDError.create("E621", {
                            module: "DataSearchModule",
                            context: "검색 처리 중",
                            details: err,
                        });
                console.error("SearchData 오류: ",wrapped);
                return wrapped.toJSON();
            }
        })
    }
}
module.exports = SearchModule;