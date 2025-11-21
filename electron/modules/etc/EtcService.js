const {clipboard,BrowserWindow, nativeImage} = require("electron");
const http = require("http");
const https = require("https");
const {Buffer} = require("buffer");
const CCDError = require("../shared/errors/CCDError");
const monitor = require("../clipboard-monitor/monitor");

class EtcService {
    constructor(localRepo) {
        this.localRepo = localRepo;
    }

    async loadClipboardRecords() {
        return await this.localRepo.getAllClipboardItems();
    }

    async pasteItem(itemId) {
        try {
            const item = await this.localRepo.getClipboardItem(itemId);
            if (!item) throw new Error("해당 ID의 데이터를 찾을 수 없습니다.");

            const type =
                item.type === "txt" ? "text" : item.type === "img" ? "image" : item.type;

            if (type === "text") {
                clipboard.writeText(item.content);
                monitor.skipNextCopy(item.content, "text"); // 예외 등록
            } else if (type === "image") {
                if (item.shared === "cloud" && item.content.startsWith("http")) {
                    await this.copyImageFromUrl(item.content);
                    // URL로 복사된 이미지는 해시값을 구해 예외 등록
                    const image = clipboard.readImage();
                    const hash = require("crypto")
                        .createHash("sha256")
                        .update(image.toPNG())
                        .digest("hex");
                    monitor.skipNextCopy(hash, "image");
                } else {
                    const image = nativeImage.createFromPath(item.content);
                    clipboard.writeImage(image);
                    const hash = require("crypto")
                        .createHash("sha256")
                        .update(image.toPNG())
                        .digest("hex");
                    monitor.skipNextCopy(hash, "image");
                }
            } else {
                throw new Error(`지원하지 않는 타입: ${type}`);
            }
        } catch (error) {
            throw CCDError.create("E655", {
                module: "pasteById",
                context: "붙여넣기 실패",
                message: error,
            });
        }
    }

    copyImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith("https") ? https : http;
            client
                .get(url, (res) => {
                    const chunks = [];
                    res.on("data", (chunk) => chunks.push(chunk));
                    res.on("end", () => {
                        try {
                            const buffer = Buffer.concat(chunks);
                            const image = nativeImage.createFromBuffer(buffer);
                            clipboard.writeImage(image);
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                })
                .on("error", (err) => reject(err));
        });
    }

    notifyItemSaved(items){
        const win = BrowserWindow.getAllWindows()[0];
        if(win && win.webContents){
            win.webContents.send("clipboard-updated", items);
        }
    }
}

module.exports = EtcService;