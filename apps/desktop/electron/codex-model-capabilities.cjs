// Share validation with the actual Gateway in development and packaged builds.
const path = require('node:path');
module.exports = require(process.resourcesPath && __dirname.includes('app.asar')
  ? path.join(process.resourcesPath, 'runtime/packages/shared/src/model-capabilities.cjs')
  : path.resolve(__dirname, '../../../packages/shared/src/model-capabilities.cjs'));
