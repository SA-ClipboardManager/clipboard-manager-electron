const TagRepository = require('../../infrastructure/repositories/TagRepository');

class TaggingSync {
  constructor(tagRepository = new TagRepository()) {
    this.tagRepository = tagRepository;
  }

  async handleTaggingResult({ dataId, tags }) {
    if (!dataId || !Array.isArray(tags)) return;
    await this.tagRepository.saveTaggingResult(String(dataId), tags);
  }
}

module.exports = TaggingSync;
