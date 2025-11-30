const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const root = path.join(app.getPath("documents"), "CCD");

const makeFileUrl = (absPath) => {
  if (!absPath) return null;
  if (/^(https?:|data:)/i.test(absPath)) return absPath;
  const rel = path.relative(root, absPath);
  const posix = rel.split(path.sep).join("/");
  return `ccd://${encodeURI(posix)}`;
};

function transformItem(item, imageMeta = null, tags = []) {
  let processedImageMeta = null;
  const tagNames = tags;

  if (item.type === "img" && imageMeta) {
    const originalExists =
      imageMeta.file_path && fs.existsSync(imageMeta.file_path);
    const thumbExists =
      imageMeta.thumbnail_path && fs.existsSync(imageMeta.thumbnail_path);
    const originalUrl = originalExists
      ? makeFileUrl(imageMeta.file_path)
      : null;
    const thumbnailUrl = thumbExists
      ? makeFileUrl(imageMeta.thumbnail_path)
      : originalUrl;
    processedImageMeta = {
      ...imageMeta,
      originalUrl,
      thumbnailUrl,
    };
  }
  return {
    id: item.id,
    type: item.type,
    format: item.format,
    content: item.content,
    created_at: item.created_at,
    is_synced: item.is_synced,
    is_cloud_item: item.is_cloud_item,
    tags: tagNames,
    imageMeta: processedImageMeta,
    thumbnail_path: processedImageMeta?.thumbnailUrl || null,
  };
}

module.exports = { transformItem };
