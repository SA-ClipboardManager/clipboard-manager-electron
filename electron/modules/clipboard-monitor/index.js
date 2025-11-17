// ccd-main/features/clipboard/index.js
// 클립보드 모듈 초기화 + event routing 역할만 맡음

const { app, ipcMain, globalShortcut, BrowserWindow } = require('electron');
const monitor = require('./monitor');
const CCDError = require('../CCDError');
const notifyRenderer = require('../notifyRenderer');
const dbmgr = require('../db_models/initModule').dataRepo;

const { getCloudUploadEnabled, toggleCloudUploadEnabled } = require('../cloudUploadState');

const ClipboardRepoHandler = require('./ClipboardRepoHandler');
const repo = new ClipboardRepoHandler(dbmgr);

/**
 * 클립보드 모듈 초기화
 */
function initClipboardModule() {
  setupToggleShortcut();
  startMonitoring();
  notifyRenderer('clipboard-upload-status', getCloudUploadEnabled());
}

/**
 * 단축키(Control+Alt+U)로 클라우드 업로드 on/off
 */
function setupToggleShortcut() {
  const shortcut = 'Control+Alt+U';

  if (globalShortcut.isRegistered(shortcut)) {
    console.log(`${shortcut} already registered, skipping.`);
    return;
  }

  const ok = globalShortcut.register(shortcut, () => {
    toggleCloudUploadEnabled();
    const newState = getCloudUploadEnabled();

    console.log(`Cloud upload ${newState ? 'enabled' : 'disabled'}`);
    notifyRenderer('clipboard-upload-status', newState);
  });

  if (!ok) {
    const error = CCDError.create('E611', {
      module: 'index',
      context: '단축키 등록 실패',
      message: `단축키 등록에 실패했습니다: ${shortcut}`,
    });
    console.error(error);
    return error.toJSON();
  }
}

/**
 * 모니터링 시작 — monitor는 감지만, index는 저장 담당
 */
function startMonitoring() {
  const emitter = monitor.start();

  if (!emitter) return;

  emitter.on('item', async (payload) => {
    try {
      // monitor는 "txt", "img" 형태로 넘기므로 그대로 사용
      const saveMode = getCloudUploadEnabled() ? 'both' : 'local';

      const savedItem = await repo.saveItem(payload, saveMode);

      // id는 DB에서 다시 발급될 수 있으므로 갱신
      payload.id = savedItem?.id ?? payload.id;

      // 저장 성공 → renderer에 상세 정보 전송
      notifyRenderer('clipboard-new-item', {
        id: payload.id,
        type: payload.type,
        created_at: payload.created_at,
        content: payload.content,
        format: payload.format,
      });

      console.log('[Clipboard] Saved:', payload.id);
    } catch (err) {
      const error = CCDError.create('E630', {
        module: 'index',
        context: '클립보드 감지/저장 실패',
        details: err,
      });
      console.error(error);
    }
  });
}

module.exports = { initClipboardModule };
