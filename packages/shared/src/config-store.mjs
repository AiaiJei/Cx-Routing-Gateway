import fs from 'node:fs/promises';
import path from 'node:path';

export const emptyConfig = () => ({
  version: 1,
  upstreams: [],
  routes: [],
  clientKeys: [],
  usage: [],
  settings: { gatewayHost: '127.0.0.1', gatewayPort: 4318, usageRetentionCount: 1000 },
});

export class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const value = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (value.version !== 1 || !Array.isArray(value.upstreams) || !Array.isArray(value.routes) || !Array.isArray(value.clientKeys)) {
        throw new Error('Unsupported configuration format');
      }
      if (!Array.isArray(value.usage)) value.usage = [];
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const initial = emptyConfig();
      await this.write(initial, false);
      return initial;
    }
  }

  async update(mutator) {
    const operation = this.writeQueue.then(async () => {
      const release = await this.acquireLock();
      try {
        const current = await this.read();
        const next = await mutator(structuredClone(current));
        if (!next || next.version !== 1) throw new Error('Invalid configuration update');
        await this.write(next, true);
        return next;
      } finally { await release(); }
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async acquireLock() {
    const lockPath = `${this.filePath}.lock`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const handle = await fs.open(lockPath, 'wx');
        return async () => { await handle.close(); await fs.rm(lockPath, { force: true }); };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error('Configuration store is busy');
  }

  async write(value, keepBackup) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    if (keepBackup) {
      try { await fs.copyFile(this.filePath, `${this.filePath}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    // Windows readers/scanners can briefly deny replacement. Retry only rename,
    // while holding the store lock; never replay the caller's mutation.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await fs.rename(temporary, this.filePath);
        return;
      } catch (error) {
        if (!['EPERM', 'EBUSY'].includes(error.code) || attempt === 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
}
