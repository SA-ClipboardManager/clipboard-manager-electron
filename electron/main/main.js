// electron/main/main.js
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const AppContainer = require('./core/AppContainer');

// 인스턴스 식별자 (다중 인스턴스 테스트용)
const INSTANCE_ID = process.env.ELECTRON_INSTANCE_ID || 'default';
console.log(`[Main] Starting Electron - Instance: ${INSTANCE_ID}`);

// 캐시 디렉토리 설정 (권한 문제 해결)
const userDataPath = app.getPath('userData');
app.setPath('userData', userDataPath);

// GPU 캐시 오류 방지 (선택사항)
// app.disableHardwareAcceleration();

let mainWindow = null;
const SCHEME = 'ccd';
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, bypassCSP: true },
  },
]);

async function registerCcdProtocol() {
  const FILE_ROOT = path.join(app.getPath('documents'), 'CCD');
  const IMAGES_ROOT = path.join(app.getPath('userData'), 'images');

  await protocol.handle(SCHEME, async (request) => {
    try {
      const u = new URL(request.url); // ccd://local/<encoded path> or ccd://images/...
      // pathname은 '/...' 형태 → 선행 슬래시 제거
      const relPath = decodeURIComponent(u.pathname.replace(/^\/+/, ''));

      // 빈 경로 체크 (루트 디렉터리 요청 방지)
      if (!relPath || relPath === '') {
        throw new Error('Empty path requested');
      }

      // Check if this is a cloud images path
      let finalPath;
      let normalizedRoot;

      if (relPath.startsWith('images/')) {
        // Cloud images path: ccd://images/thumb_xxx.jpg
        const imageRelPath = relPath.substring('images/'.length);
        finalPath = path.join(IMAGES_ROOT, imageRelPath);
        normalizedRoot = path.normalize(IMAGES_ROOT);
      } else {
        // Local clipboard path: ccd://local/...
        finalPath = path.join(FILE_ROOT, relPath);
        normalizedRoot = path.normalize(FILE_ROOT);
      }

      // 보안: 루트 밖으로 나가는 경로 차단
      const normalizedFinal = path.normalize(finalPath);
      if (!normalizedFinal.startsWith(normalizedRoot)) {
        throw new Error('Path escapes root directory');
      }

      // 파일 존재 및 타입 검사
      let stat;
      try {
        stat = await fs.promises.stat(finalPath);
      } catch (e) {
        console.error(`[ccd protocol] File not found:`, {
          relPath,
          finalPath,
          FILE_ROOT,
          IMAGES_ROOT,
          error: e.message,
        });
        throw new Error(`File not found: ${relPath} (resolved to: ${finalPath})`);
      }
      if (stat.isDirectory()) {
        console.error(`[ccd protocol] Directory requested: "${relPath}" -> "${finalPath}"`);
        throw new Error('Requested path is a directory: ' + relPath);
      }

      const buf = await fs.promises.readFile(finalPath);

      const ext = path.extname(finalPath).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';

      return new Response(buf, {
        status: 200,
        headers: { 'Content-Type': type },
      });
    } catch (error) {
      console.error(`Error loading file via ${SCHEME} protocol:`, error);
      return new Response(new Blob([error.message]), {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  });
}

async function createWindow() {
  try {
    await AppContainer.initialize(ipcMain); // PostgreSQL 비동기 초기화 필요
  } catch (err) {
    console.error('AppContainer.initialize failed:', err);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: INSTANCE_ID === 'default' ? 'Clipboard Manager' : `Clipboard Manager [${INSTANCE_ID.toUpperCase()}]`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true, // Ensure devTools are enabled
      // GPU 캐시 비활성화
      disableHardwareAcceleration: false,
    },
    show: false, // Don't show until ready-to-show
  });

  // Open dev tools immediately after the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.openDevTools();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // 1) 창 생성 전 프로토콜 먼저 등록
  await registerCcdProtocol();
  // 2) 창 로드
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 앱 종료 시 클라우드 데이터 정리
app.on('before-quit', async () => {
  try {
    const clipboardRepository = AppContainer.get('ClipboardRepository');
    if (clipboardRepository) {
      const deletedCount = await clipboardRepository.deleteAllCloudItems(); // PostgreSQL 비동기
      console.log(`[App] Cleaned up ${deletedCount} cloud items on exit`);
    }
  } catch (error) {
    console.error('[App] Failed to cleanup cloud data on exit:', error);
  }
});
