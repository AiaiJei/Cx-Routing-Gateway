import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(process.argv[2] || process.env.CXRG_DATA_DIR || './.cxrg-data');
const configPath = path.join(dataDir, 'config.json');
const backupPath = `${configPath}.bak`;
const rollbackCopy = `${configPath}.before-rollback`;

await fs.access(backupPath);
await fs.copyFile(configPath, rollbackCopy).catch((error) => { if (error.code !== 'ENOENT') throw error; });
await fs.copyFile(backupPath, configPath);
console.log(JSON.stringify({ restored: configPath, previousConfig: rollbackCopy, source: backupPath }));
