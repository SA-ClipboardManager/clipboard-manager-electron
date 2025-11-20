const {pasteById} = require("./paste.js");

class EtcService {
    constructor(localRepo) {
        this.localRepo = localRepo;
    }

    async loadClipboardRecords() {
        return await this.localRepo.getAllClipboardItems();
    }

    async pasteItem(itemId){
        return await pasteById(this.localRepo, itemId);
    }
}

module.exports = EtcService;