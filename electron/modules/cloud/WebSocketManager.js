const EventEmitter = require("events");
const WebSocket = require("ws");
const CorrelationId = require("../../shared/utility/CorrelationId");

class WebSocketManager extends EventEmitter {
  constructor(apiBaseURL) {
    super();
    this.apiBaseURL = apiBaseURL.replace("http", "ws");
    this.ws = null;
    this.userId = null;
    this.reconnectInterval = 5000;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  /**
   * WebSocket 연결
   * @param {string} userId
   * @param {string} token - 인증 토큰
   */
  connect(userId, token) {
    this.userId = userId;
    this.token = token;
    const correlationId = CorrelationId.generate();
    const url = `${this.apiBaseURL}/ws/${userId}`;

    console.log(CorrelationId.formatLog(correlationId, `Connecting to ${url}`));
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        [CorrelationId.HEADER_NAME]: correlationId,
      },
    });

    this.ws.on("open", () => {
      console.log(
        CorrelationId.formatLog(correlationId, "WebSocket Connected")
      );
      this.emit("connected");
      this._setupHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(message);
      } catch (error) {
        console.error("[WebSocketManager] Invalid message:", error);
      }
    });

    this.ws.on("close", () => {
      console.log(
        CorrelationId.formatLog(correlationId, "WebSocket Disconnected")
      );
      this.emit("disconnected");
      this._clearHeartbeat();
      this._setupReconnect();
    });

    this.ws.on("error", (error) => {
      console.error(
        CorrelationId.formatLog(
          correlationId,
          `WebSocket Error: ${error.message}`
        )
      );
      this.emit("error", error);
    });
  }

  /**
   * WebSocket 연결 해제
   */
  disconnect() {
    console.log("[WebSocketManager] Disconnecting");
    this._clearHeartbeat();
    this._clearReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.userId = null;
  }

  /**
   * 메시지 전송
   * @param {Object} message
   * @param {string} [correlationId] - 선택적 correlation ID (없으면 자동 생성)
   */
  send(message, correlationId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const cid = correlationId || CorrelationId.generate();
      const messageWithCid = {
        ...message,
        [CorrelationId.WS_FIELD_NAME]: cid,
      };

      console.log(
        CorrelationId.formatLog(cid, `Sending WS message: ${message.type}`)
      );

      this.ws.send(JSON.stringify(messageWithCid));
    } else {
      console.warn("[WebSocketManager] WebSocket not open");
    }
  }

  /**
   * 재연결 설정 (private)
   */
  _setupReconnect() {
    this._clearReconnect();

    this.reconnectTimer = setTimeout(() => {
      console.log("[WebSocketManager] Attempting reconnect...");
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
        this.send({ type: "ping" });
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
    const correlationId = message[CorrelationId.WS_FIELD_NAME];
    console.log(
      CorrelationId.formatLog(
        correlationId,
        `Received WS message: ${message.type}`
      )
    );

    switch (message.type) {
      case "pong":
        // Heartbeat 응답
        break;

      case "sync-notification":
        // 다른 디바이스에서 동기화 발생
        this.emit("sync-notification", message.data);
        break;

      case "item-updated":
        // 클립보드 아이템 업데이트 알림
        this.emit("item-updated", message.data);
        break;

      default:
        this.emit("message", message);
    }
  }
}

module.exports = WebSocketManager;
