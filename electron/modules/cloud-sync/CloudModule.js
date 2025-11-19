const BaseModule =  require( "../../main/core/BaseModule");
const CCDError = require("../shared/errors/CCDError");
class CloudModule extends BaseModule{

    constructor(app) {
        super(app, "cloud");
        this.service = app.modules.CloudService;
    }

    registerIpcHandler(ipcMain) {
        ipcMain.handle("upload-selected-items", async (_, itemIds) => {
            try {
                const result = await this.service.uploadSyncEvents(itemIds);
                return result;
            } catch (err) {
                const error = CCDError.create("E653", {
                    module: "ipcHandler",
                    context: "선택 항목 업로드",
                    details: err.message,
                });
                console.error(error);
                return error.toJSON();
            }
        });

        ipcMain.handle("delete-item", async (_, {dataId, deleteOption}) => {
            try {
                await this.service.deleteItem(dataId, deleteOption);
                return {deletionResult: true, refreshReq: true};
            } catch (err) {
                const error = CCDError.create("E650", {
                    module: "ipcHandler",
                    context: "데이터 삭제",
                    details: err.message,
                });
                console.error(error);
                return error.toJSON();
            }
        });
    }
}

module.exports = CloudModule;