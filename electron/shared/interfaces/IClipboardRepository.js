/**
 * Clipboard Data Management Interface
 * @interface
 */
class IClipboardRepository {
  /**
   * Get clipboard item by ID
   * @param {string} id - The ID of the clipboard item to retrieve
   * @returns {object|null} The clipboard item or null if not found
   */
  getById(id) {
    throw new Error("Not Implemented");
  }

  /**
   * Get all clipboard items
   * @param {object} [options] - Optional query parameters
   * @returns {Array<object>} Array of clipboard items
   */
  getAll(options) {
    throw new Error("Not Implemented");
  }

  /**
   * Search clipboard items
   * @param {string} query - Search query string
   * @param {object} filters - Additional filters for the search
   * @returns {Array<object>} Array of matching clipboard items
   */
  search(query, filters) {
    throw new Error("Not Implemented");
  }

  /**
   * Save a clipboard item
   * @param {object} item - The clipboard item to save
   * @param {object} [meta] - Additional metadata (e.g., for images)
   * @returns {Promise<void>}
   */
  async save(item, meta) {
    throw new Error("Not Implemented");
  }

  /**
   * Delete a clipboard item
   * @param {string} id - The ID of the item to delete
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error("Not Implemented");
  }

  /**
   * Attach tags to a clipboard item
   * @param {string} dataId - The ID of the clipboard item
   * @param {Array<string>} tagNames - Array of tag names to attach
   * @returns {Promise<void>}
   */
  async attachTags(dataId, tagNames) {
    throw new Error("Not Implemented");
  }
}

module.exports = IClipboardRepository;
