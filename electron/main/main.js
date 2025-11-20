// electron/main/main.js
const { app, BrowserWindow, ipcMain, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const AppContainer = require("./core/AppContainer");
let mainWindow = null;

const SCHEME = "ccd";
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, bypassCSP: true },
  },
]);

async function registerCcdProtocol() {
  const FILE_ROOT = path.join(app.getPath("documents"), "CCD");
  await protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url); // ccd://local/<encoded path>
      // pathname은 '/...' 형태 → 선행 슬래시 제거
      const relPath = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      const finalPath = path.join(FILE_ROOT, relPath);

      const buf = await fs.promises.readFile(finalPath);

      const ext = path.extname(finalPath).toLowerCase();
      const type =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
          ? "image/webp"
          : "application/octet-stream";

      return new Response(buf, {
        status: 200,
        headers: { "Content-Type": type },
      });
    } catch (error) {
      console.error(`Error loading file via ${SCHEME} protocol:`, error);
      return new Response(null, { status: 404 });
    }
  });
}

async function createWindow() {
  try {
    AppContainer.initialize(ipcMain);
  } catch (err) {
    console.error("AppContainer.initialize failed:", err);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(async () => {
  // 1) 창 생성 전 프로토콜 먼저 등록
  await registerCcdProtocol();
  // 2) 창 로드
  await createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
