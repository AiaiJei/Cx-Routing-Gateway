import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? process.execPath : 'npm';
const npmPrefix = process.platform === 'win32' ? [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')] : [];
const commands = [
  ['runtime tests', npmCommand, [...npmPrefix, 'test'], root],
  ['desktop tests', npmCommand, [...npmPrefix, 'test'], `${root}/apps/desktop`],
  ['desktop build', npmCommand, [...npmPrefix, 'run', 'build'], `${root}/apps/desktop`],
  ['release manifest', npmCommand, [...npmPrefix, 'run', 'verify:release'], root],
  ['packaged smoke', process.execPath, ['scripts/smoke-packaged.mjs'], root],
];

function run([name, command, args, cwd]) {
  return new Promise((resolve, reject) => {
    const windowsAudit = process.platform === 'win32' && name === 'production audit';
    const child = windowsAudit
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'npm.cmd audit --omit=dev --ignore-scripts --allow-scripts='], { cwd, stdio: 'inherit', shell: false })
      : spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code}`)));
  });
}

for (const command of commands) {
  console.log(`\n== ${command[0]} ==`);
  await run(command);
}
console.log('\nAll local verification commands passed. Production dependency audit runs separately in CI and via `npm audit --omit=dev --ignore-scripts --allow-scripts=` from `apps/desktop`.');
