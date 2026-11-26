const fs = require('node:fs');
const path = require('node:path');

function configureDesktopProfile({ app, directory, mkdir = fs.mkdirSync }) {
  if (directory === undefined || directory === '') return false;
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('CXRG_USER_DATA_DIR must be an absolute path');
  const resolved = path.resolve(directory);
  mkdir(resolved, { recursive: true });
  app.setPath('userData', resolved);
  app.setPath('sessionData', resolved);
  return true;
}

module.exports = { configureDesktopProfile };
