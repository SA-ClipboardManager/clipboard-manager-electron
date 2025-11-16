// electron/main/main.js
import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {ipcMain} from "electron";
import AppContainer from "./core/AppContainer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

async function createWindow() {
  // 모듈 초기화
  AppContainer.initializeModules();
  AppContainer.registerIpcHandlers(ipcMain);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true, // 안전한 IPC 사용
      nodeIntegration: false, // Renderer에서 Node.js 직접 접근 금지
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

// Electron 앱 이벤트 처리
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
