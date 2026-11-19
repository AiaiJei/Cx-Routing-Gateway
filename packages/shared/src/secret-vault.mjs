import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function keyFrom(masterKey) { return crypto.createHash('sha256').update(masterKey).digest(); }

export class SecretVault {
  constructor(filePath, masterKey = process.env.CXRG_MASTER_KEY) {
    if (!masterKey) throw new Error('CXRG_MASTER_KEY is required for the secret vault');
    this.filePath = filePath;
    this.key = keyFrom(masterKey);
  }

  async readAll() {
    try {
      const envelope = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]).toString('utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Secret vault could not be opened');
    }
  }

  async writeAll(values) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
    const envelope = { version: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(envelope), { mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }

  async put(secret) {
    const release = await this.acquireLock();
    try {
      const values = await this.readAll();
      const ref = `cred_${crypto.randomUUID()}`;
      values[ref] = secret;
      await this.writeAll(values);
      return ref;
    } finally { await release(); }
  }

  async get(ref) { return (await this.readAll())[ref]; }
  async remove(ref) {
    const release = await this.acquireLock();
    try { const values = await this.readAll(); delete values[ref]; await this.writeAll(values); } finally { await release(); }
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
    throw new Error('Secret vault is busy');
  }
}
