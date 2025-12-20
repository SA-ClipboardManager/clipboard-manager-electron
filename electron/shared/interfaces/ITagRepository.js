/**
 * Tag Repository Interface
 * @interface
 */
class ITagRepository {
  /**
   * Get or create a tag with the given name
   * @param {string} name - Tag name
   * @param {string} [source='auto'] - Tag source ('auto', 'manual', etc.)
   * @returns {string} Tag ID
   */
  getOrCreateTag(name, source = 'auto') {
    throw new Error("Not Implemented");
  }

  /**
   * Link a data item to a tag
   * @param {string} dataId - Data item ID
   * @param {string} tagId - Tag ID
   * @returns {boolean} Success status
   */
  linkDataTag(dataId, tagId) {
    throw new Error("Not Implemented");
  }

  /**
   * Save tagging results for a data item
   * @param {string} dataId - Data item ID
   * @param {Array<string|object>} tags - Array of tags (can be strings, objects with name/label/tag property, or arrays)
   * @returns {boolean} Success status
   */
  saveTaggingResult(dataId, tags) {
    throw new Error("Not Implemented");
  }
}

module.exports = ITagRepository;
