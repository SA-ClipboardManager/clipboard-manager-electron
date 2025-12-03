const TagRepository = require('../../infrastructure/repositories/TagRepository');

class TaggingSync {
  constructor(dbContext) {
    if (!dbContext) {
      throw new Error('TaggingSync requires a DatabaseContext instance');
    }
    this.tagRepository = new TagRepository(dbContext);
  }

  handleTaggingResult({ dataId, tags }) {
    if (!dataId || !Array.isArray(tags)) return;
    try {
      this.tagRepository.saveTaggingResult(String(dataId), tags);
      console.log(`[TaggingSync] Saved ${tags.length} tags for ${dataId}`);
    } catch (err) {
      console.error('[TaggingSync] Failed to save tags:', err);
    }
  }
}

module.exports = TaggingSync;
