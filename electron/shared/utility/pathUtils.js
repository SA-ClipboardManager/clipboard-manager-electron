const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const root = path.join(app.getPath("documents"), "CCD");
const imagesDir = path.join(app.getPath("userData"), "images");

const makeFileUrl = (absPath) => {
  if (!absPath) return null;
  if (/^(https?:|data:)/i.test(absPath)) return absPath; // already a URL
  // 디렉터리면 무시 (파일만 허용)
  try {
    const st = fs.statSync(absPath);
    if (st.isDirectory()) {
      return null; // 디렉터리 URL 생성 회피
    }
  } catch (e) {
    // stat 실패하면 그대로 진행 (나중에 접근 시 404 처리)
  }

  // Check if path is under cloud images directory (AppData/ccd-electron/images)
  if (absPath.includes(imagesDir)) {
    const rel = path.relative(imagesDir, absPath);
    if (!rel.startsWith("..")) {
      // Valid path under images directory
      const posix = rel.split(path.sep).join("/");
      return `ccd://images/${encodeURI(posix)}`;
    }
  }

  // Otherwise, use the Documents/CCD root
  const rel = path.relative(root, absPath);
  if (!rel) return null; // root 자체일 경우 생성 안함
  const posix = rel.split(path.sep).join("/");
  return `ccd://${encodeURI(posix)}`;
};

const resolveCcdUrl = (ccdUrl) => {
  if (!ccdUrl || !ccdUrl.startsWith("ccd://")) return ccdUrl;
  const encoded = ccdUrl.replace(/^ccd:\/\//, "");
  const decodedPosix = decodeURI(encoded);

  // Check if this is a cloud images path (ccd://images/...)
  if (decodedPosix.startsWith("images/")) {
    const relPath = decodedPosix.substring("images/".length);
    const platformSegments = relPath.split("/").filter(Boolean);
    return path.join(imagesDir, ...platformSegments);
  }

  // Otherwise, use Documents/CCD root
  const platformSegments = decodedPosix.split("/").filter(Boolean);
  return path.join(root, ...platformSegments);
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

module.exports = { transformItem, makeFileUrl, resolveCcdUrl };
