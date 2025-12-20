/**
 * Outbox Repository Interface
 * @interface
 */
class IOutboxRepository {
  /**
   * Create a new event in the outbox
   * @param {string} dataId - Data item ID
   * @param {string} [eventType='UPLOAD'] - Event type
   * @param {object|null} [metadata=null] - Additional metadata
   * @returns {object} Insert result
   */
  createEvent(dataId, eventType = "UPLOAD", metadata = null) {
    throw new Error("Not Implemented");
  }

  /**
   * Get pending items from the outbox
   * @param {number} [limit=10] - Maximum number of items to retrieve
   * @returns {Promise<Array<object>>} Array of pending items
   */
  async getPendingItems(limit = 10) {
    throw new Error("Not Implemented");
  }

  /**
   * Mark items as being processed
   * @param {Array<number>} ids - Array of item IDs
   * @returns {Promise<void>}
   */
  async markAsProcessing(ids) {
    throw new Error("Not Implemented");
  }

  /**
   * Mark an item as completed
   * @param {number} id - Item ID
   * @returns {void}
   */
  markAsCompleted(id) {
    throw new Error("Not Implemented");
  }

  /**
   * Mark an item as failed with backoff
   * @param {number} id - Item ID
   * @param {Error|string} error - Error information
   * @param {number} retryCount - Current retry count
   * @returns {void}
   */
  markAsFailed(id, error, retryCount) {
    throw new Error("Not Implemented");
  }

  /**
   * Mark an item as permanently failed
   * @param {number} id - Item ID
   * @param {Error|string} error - Error information
   * @returns {void}
   */
  markAsDead(id, error) {
    throw new Error("Not Implemented");
  }
}

module.exports = IOutboxRepository;
