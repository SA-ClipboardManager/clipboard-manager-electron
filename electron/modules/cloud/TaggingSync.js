const TagRepository = require('../../infrastructure/repositories/TagRepository');

class TaggingSync {
  constructor(dbContext) {
    if (!dbContext) {
      throw new Error('TaggingSync requires a DatabaseContext instance');
    }
    this.tagRepository = new TagRepository(dbContext);
  }

  handleTaggingResult({ dataId, tags }) {
    if (!dataId || !Array.isArray(tags)) {
      console.warn('[TaggingSync] Invalid data:', { dataId, tags });
      return;
    }
    
    try {
      // tags는 [{label, score}, ...] 형식
      const tagNames = tags.map(t => {
        if (t && typeof t === 'object' && t.label) {
          return t.label;
        }
        if (typeof t === 'string') {
          return t;
        }
        if (Array.isArray(t) && t[0]) {
          return t[0];
        }
        return null;
      }).filter(Boolean);
      
      this.tagRepository.saveTaggingResult(String(dataId), tagNames);
      console.log(`[TaggingSync] Saved ${tagNames.length} tags for ${dataId}:`, tagNames);
    } catch (err) {
      console.error('[TaggingSync] Failed to save tags:', err);
    }
  }
}

module.exports = TaggingSync;
