const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendDir = path.join(repoRoot, 'Back-END');
const venvPython = path.join(backendDir, '.venv', 'Scripts', 'python.exe');
const python = fs.existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3');

const args = [
  '-m',
  'PyInstaller',
  '--clean',
  '--onefile',
  '--noconsole',
  '--name',
  'rf-tool-suite-backend',
  '--icon',
  'logo.ico',
  '--add-data',
  process.platform === 'win32' ? 'logic;logic' : 'logic:logic',
  '--collect-all',
  'skrf',
  '--collect-all',
  'pyvisa',
  '--hidden-import',
  'pynanovna',
  '--hidden-import',
  'pyvisa_py',
  'main.py',
];

const result = spawnSync(python, args, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const exePath = path.join(backendDir, 'dist', process.platform === 'win32' ? 'rf-tool-suite-backend.exe' : 'rf-tool-suite-backend');
if (!fs.existsSync(exePath)) {
  console.error(`Backend executable was not created at ${exePath}`);
  process.exit(1);
}

console.log(`Backend executable ready: ${exePath}`);
