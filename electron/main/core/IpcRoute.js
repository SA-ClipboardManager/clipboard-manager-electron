const CorrelationId = require("../../shared/utility/CorrelationId");

class IpcRoute {
  constructor(prefix = "") {
    this.prefix = prefix;
  }

  build(eventName) {
    return `${this.prefix}-${eventName}`;
  }

  /**
   * IPC 이벤트 로깅 (correlation ID 포함)
   * @param {string} eventName
   * @param {string} correlationId
   * @param {string} direction - 'send' 또는 'receive'
   */
  log(eventName, correlationId, direction = "receive") {
    const fullEvent = this.build(eventName);
    console.log(
      CorrelationId.formatLog(correlationId, `IPC ${direction}: ${fullEvent}`)
    );
  }
}

module.exports = IpcRoute;
