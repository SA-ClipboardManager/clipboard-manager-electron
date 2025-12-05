const { correlationIdManager } = require("../../shared/utility/correlationId");

class IpcRoute {
  constructor(prefix = "") {
    this.prefix = prefix;
  }

  build(eventName) {
    return `${this.prefix}-${eventName}`;
  }

  /**
   * IPC 이벤트에 correlation ID 추가
   * @param {Electron.IpcMainEvent} event - IPC 이벤트
   * @param {string} [correlationId] - 기존 correlation ID (없으면 생성)
   * @returns {string} correlation ID
   */
  attachCorrelationId(event, correlationId) {
    const cId = correlationIdManager.getOrCreate(correlationId);
    // event sender의 frameId를 키로 사용
    const contextKey = `ipc-${event.sender.id}-${event.frameId}`;
    correlationIdManager.set(contextKey, cId);
    return cId;
  }

  /**
   * IPC 이벤트에서 correlation ID 조회
   * @param {Electron.IpcMainEvent} event - IPC 이벤트
   * @returns {string|null} correlation ID
   */
  getCorrelationId(event) {
    const contextKey = `ipc-${event.sender.id}-${event.frameId}`;
    return correlationIdManager.get(contextKey);
  }

  /**
   * IPC 이벤트 처리 완료 시 호출
   * @param {Electron.IpcMainEvent} event - IPC 이벤트
   */
  clearCorrelationId(event) {
    const contextKey = `ipc-${event.sender.id}-${event.frameId}`;
    correlationIdManager.clear(contextKey);
  }
}
module.exports = IpcRoute;
