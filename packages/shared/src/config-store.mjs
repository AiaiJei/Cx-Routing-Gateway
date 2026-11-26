import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { acquireConfigMutex } from './config-lock.mjs';

const LEGACY_LOCK_STALE_MS = 60_000;

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

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

  async read({ initialize = true } = {}) {
    try {
      const value = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (value.version !== 1 || !Array.isArray(value.upstreams) || !Array.isArray(value.routes) || !Array.isArray(value.clientKeys)) {
        throw new Error('Unsupported configuration format');
      }
      if (!Array.isArray(value.usage)) value.usage = [];
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!initialize) return emptyConfig();
      return this.update(config => config);
    }
  }

  async update(mutator) {
    const operation = this.writeQueue.then(async () => {
      const release = await this.acquireLock();
      try {
        const current = await this.read({ initialize: false });
        const next = await mutator(structuredClone(current));
        if (!next || next.version !== 1) throw new Error('Invalid configuration update');
        await this.write(next, true);
        return next;
      } finally { await release(); }
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async recoverStaleLock() {
    // Only Windows has a crash-released cross-process mutex in this runtime.
    if (process.platform !== 'win32') return false;
    const lockPath = `${this.filePath}.lock`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const releaseMutex = await acquireConfigMutex(this.filePath, { waitMs: 0 });
    if (!releaseMutex) return false;
    try {
      const stat = await fs.stat(lockPath);
      const lockContents = await fs.readFile(lockPath, 'utf8');
      let ownerPid;
      try { ownerPid = JSON.parse(lockContents).pid; } catch {}
      if (Number.isSafeInteger(ownerPid) && ownerPid > 0) {
        if (processIsAlive(ownerPid)) return false;
      } else {
        // A PID-less legacy writer may still be alive for hours. Only an empty lock
        // from before this OS boot can be established as orphaned.
        const bootTime = Date.now() - os.uptime() * 1000;
        if (stat.size !== 0 || lockContents !== '' || stat.mtimeMs >= bootTime - LEGACY_LOCK_STALE_MS) return false;
      }
      await fs.rm(lockPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    } finally {
      await releaseMutex();
    }
  }

  async acquireLock() {
    const lockPath = `${this.filePath}.lock`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const releaseMutex = await acquireConfigMutex(this.filePath);
    if (!releaseMutex) throw new Error('Configuration store is busy');
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const handle = await fs.open(lockPath, 'wx');
          try {
            await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
          } catch (error) {
            await handle.close();
            await fs.rm(lockPath, { force: true });
            throw error;
          }
          let released;
          return () => released ??= (async () => {
            try {
              try { await handle.close(); }
              finally { await fs.rm(lockPath, { force: true }); }
            } finally { await releaseMutex(); }
          })();
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      throw new Error('Configuration store is busy');
    } catch (error) {
      await releaseMutex();
      throw error;
    }
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
