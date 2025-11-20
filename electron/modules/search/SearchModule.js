const BaseModule= require( "../../main/core/BaseModule");
class SearchModule extends BaseModule{

    constructor(app) {
        super(app, "search");
        this.service = app.modules.SearchModule;
    }

    registerIpcHandler(ipcMain) {

    }
}
module.exports = SearchModule;