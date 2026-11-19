import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const requested = process.argv.slice(2).join(' ');
const candidates = requested ? [requested] : ['apps/desktop/release/win-unpacked/Cx-Routing Gateway.exe', 'release/win-unpacked/Cx-Routing Gateway.exe'];
const executable = path.resolve(candidates.find((candidate) => fs.existsSync(path.resolve(candidate))) || candidates[0]);
const { version } = JSON.parse(fs.readFileSync(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'));
const child = spawn(executable, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const timeout = setTimeout(() => child.kill(), 10_000);
let stderr = '';
let stdout = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.on('error', (error) => { clearTimeout(timeout); console.error(JSON.stringify({ executable, ok: false, error: error.message })); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (code === 0 && stdout.split(/\r?\n/).some(line => line.trim() === version)) {
    console.log(JSON.stringify({ executable, ok: true, version, code, signal }));
    return;
  }
  console.error(JSON.stringify({ executable, ok: false, expectedVersion: version, stdout, code, signal, stderr }));
  process.exitCode = 1;
});
