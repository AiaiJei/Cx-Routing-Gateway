const path = require('node:path');
const { fileURLToPath } = require('node:url');

function samePath(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32' ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight;
}

function isTrustedDocumentUrl({ url, appIndexPath, devServerUrl } = {}) {
  if (typeof url !== 'string' || typeof appIndexPath !== 'string') return false;
  if (url.startsWith('file://')) {
    try { return samePath(fileURLToPath(new URL(url)), appIndexPath); } catch { return false; }
  }
  if (!devServerUrl) return false;
  try { return new URL(url).origin === new URL(devServerUrl).origin; } catch { return false; }
}

module.exports = { isTrustedDocumentUrl };
