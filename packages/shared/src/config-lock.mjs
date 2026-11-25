import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

// Windows named pipes provide a process-owned mutex that disappears on process exit.
// Other platforms keep the existing exclusive-file lock; automatic recovery is disabled.
export async function acquireConfigMutex(filePath, { waitMs = 2500 } = {}) {
  if (process.platform !== 'win32') return async () => {};
  const directory = await fs.realpath(path.dirname(path.resolve(filePath)));
  const identity = path.join(directory, path.basename(filePath)).toLowerCase();
  const name = `\\\\.\\pipe\\cxrg-config-${crypto.createHash('sha256').update(identity).digest('hex')}`;
  const deadline = Date.now() + waitMs;
  while (true) {
    const server = net.createServer(socket => socket.destroy());
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(name, resolve);
      });
      let release;
      return () => release ??= new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (Date.now() >= deadline) return null;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}
