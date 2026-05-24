const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

let shuttingDown = false;

function spawnChild(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    ...options,
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(poll, 500);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    poll();
  });
}

const vite = spawnChild('npm', ['run', 'dev', '--', '--host', '127.0.0.1']);

waitForUrl(viteUrl)
  .then(() => {
    const electron = spawnChild('npx', ['electron', '.'], {
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: viteUrl,
      },
    });

    electron.on('exit', (code) => {
      shutdown(code || 0);
    });
  })
  .catch((error) => {
    console.error(error);
    shutdown(1);
  });

function shutdown(code) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (!vite.killed) {
    vite.kill();
  }

  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
