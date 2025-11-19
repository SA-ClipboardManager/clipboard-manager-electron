class EtcService {
    constructor(localRepo) {
        this.localRepo = localRepo;
    }

    async loadClipboardRecords() {
        return await this.localRepo.getAllClipboardItems();
    }
}

module.exports = EtcService;