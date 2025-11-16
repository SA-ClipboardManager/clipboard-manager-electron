import {BaseModule} from "../../core/BaseModule.js";
import {wrap} from "../../core/errorHandler.js";

export class CloudModule extends BaseModule {
    constructor(app) {
        super(app, "cloud");
        this.service = app.services.CloudService;
    }

    registerIpcHandler(ipc) {
        ipc.handle(
            this.route.build("upload"),
            wrap((_, ids) => this.service.uploadSelectedItems(ids), "CloudModule", "upload")
        );


    }
}