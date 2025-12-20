const EventEmitter = require('events');
const WebSocket = require('ws');
const CorrelationId = require('../../shared/utility/correlationId');
const { correlationIdManager } = CorrelationId;

class WebSocketManager extends EventEmitter {
  constructor(apiBaseURL) {
    super();
    this.apiBaseURL = apiBaseURL.replace('http', 'ws');
    this.ws = null;
    this.userId = null;
    this.reconnectInterval = 5000;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.shouldReconnect = true; // 재연결 활성화 플래그
  }

  /**
   * WebSocket 연결
   * @param {string} userId
   * @param {string} token - 인증 토큰
   */
  connect(userId, token) {
    this.userId = userId;
    this.token = token;
    this.shouldReconnect = true; // 연결 시작 시 재연결 활성화
    const correlationId = CorrelationId.generate();
    const url = `${this.apiBaseURL}/ws/${userId}`;

    console.log(CorrelationId.formatLog(correlationId, `Connecting to ${url}`));
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        [CorrelationId.HEADER_NAME]: correlationId,
      },
    });

    this.ws.on('open', () => {
      console.log(CorrelationId.formatLog(correlationId, 'WebSocket Connected'));
      this.emit('connected');
      this._setupHeartbeat();
    });

    this.ws.on('message', (data) => {
      console.log(`[WebSocketManager] RAW MESSAGE RECEIVED: ${data.toString()}`);
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(message);
      } catch (error) {
        console.error('[WebSocketManager] Invalid message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log(CorrelationId.formatLog(correlationId, 'WebSocket Disconnected'));
      this.emit('disconnected');
      this._clearHeartbeat();
      this._setupReconnect();
    });

    this.ws.on('error', (error) => {
      console.error(CorrelationId.formatLog(correlationId, `WebSocket Error: ${error.message}`));
      this.emit('error', error);
    });
  }

  /**
   * WebSocket 연결 해제
   */
  disconnect() {
    console.log('[WebSocketManager] Disconnecting');
    this.shouldReconnect = false; // 재연결 비활성화
    this._clearHeartbeat();
    this._clearReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.userId = null;
    this.token = null;
  }

  /**
   * 메시지 전송
   * @param {Object} message
   * @param {string} [correlationId] - 선택적 correlation ID
   */
  send(message, correlationId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const cId = correlationIdManager.getOrCreate(correlationId);
      const payload = {
        ...message,
        correlationId: cId,
      };
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WebSocketManager] WebSocket not open');
    }
  }

  /**
   * 재연결 설정 (private)
   */
  _setupReconnect() {
    // 재연결이 비활성화되었으면 스킵 (로그아웃 등)
    if (!this.shouldReconnect) {
      console.log('[WebSocketManager] Reconnect disabled, skipping...');
      return;
    }

    this._clearReconnect();

    this.reconnectTimer = setTimeout(() => {
      console.log('[WebSocketManager] Attempting reconnect...');
      if (this.userId && this.token) {
        this.connect(this.userId, this.token);
      }
    }, this.reconnectInterval);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Heartbeat 설정 (private)
   */
  _setupHeartbeat() {
    this._clearHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // 30초마다
  }

  _clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 메시지 처리 (private)
   */
  _handleMessage(message) {
    const correlationId = message.correlationId || null;
    console.log(`[WebSocketManager] Received (correlationId: ${correlationId}):`, message);

    // 서버는 'event' 필드를 사용하지만, 클라이언트는 'type'을 기대
    // event -> type으로 매핑하고 'service.' 접두어를 제거하여 하위 호환 유지
    const rawType = message.type || message.event;
    const messageType = rawType ? rawType.replace(/^service\./, '') : rawType;

    console.log(CorrelationId.formatLog(correlationId, `Received WS message: ${messageType}`));

    switch (messageType) {
      case 'pong':
        // Heartbeat 응답
        break;

      // 새로운 이벤트 형식 (점 구분자)
      case 'crud.item.saved.txt':
      case 'crud.item.saved.img':
      case 'crud.item.deleted':
      case 'crud.item.tags.synced':
      // 기존 이벤트 형식 (하위 호환성)
      case 'crud:txtSave_success':
      case 'crud:imgSave_success':
      case 'clip_created':
      case 'clip_synced_tags':
      case 'data_deleted':
        // 다른 디바이스에서 동기화 발생
        this.emit('sync-notification', message.data);
        break;

      case 'sync-notification':
        // 다른 디바이스에서 동기화 발생
        this.emit('sync-notification', message.data);
        break;

      case 'item-updated':
        // 클립보드 아이템 업데이트 알림
        this.emit('item-updated', message.data);
        break;

      case 'tagging_result':
        // 태깅 결과 수신: 로컬 DB에 반영 이벤트 발생
        // notification-service에서 변환한 형식:
        // {type: "tagging_result", event: "service.tagging.success", data_id, user_id, tags, ...}
        const taggingResult = {
          dataId: message.data_id || message.dataId,
          userId: message.user_id || message.userId,
          tags: (message.tags || []).map((t) => {
            // tags가 {label, score} 형식이면 그대로 사용
            if (t && typeof t === 'object' && t.label) {
              return { label: t.label, score: t.score };
            }
            // tags가 배열 [label, score] 형식이면 변환
            if (Array.isArray(t)) {
              return { label: t[0], score: t[1] };
            }
            // tags가 문자열이면 label로 사용
            if (typeof t === 'string') {
              return { label: t, score: 1.0 };
            }
            return t;
          }),
        };
        console.log('[WebSocketManager] tagging_result parsed:', taggingResult);
        this.emit('tagging-result', taggingResult);
        break;

      default:
        console.log(CorrelationId.formatLog(correlationId, `Unknown message type: ${messageType}`));
        this.emit('message', message);
    }
  }
}

module.exports = WebSocketManager;
