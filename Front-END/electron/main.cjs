const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const BACKEND_PORT = Number(process.env.RF_BACKEND_PORT || 8080);
const BACKEND_HOST = '127.0.0.1';
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow = null;
let backendProcess = null;
let ownsBackendProcess = false;

function resolveProjectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }

  return path.resolve(__dirname, '..', '..');
}

function resolveBackendEntry() {
  if (app.isPackaged) {
    const bundledExe = path.join(process.resourcesPath, 'backend', 'rf-tool-suite-backend.exe');
    const bundledPy = path.join(process.resourcesPath, 'backend', 'main.py');
    return { exe: bundledExe, py: bundledPy };
  }

  return {
    exe: null,
    py: path.resolve(resolveProjectRoot(), 'Back-END', 'main.py'),
  };
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(700, () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, BACKEND_HOST);
  });
}

function waitForBackend(timeoutMs = 20000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/status`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // The backend may still be starting. Keep polling until timeout.
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Backend did not become ready at ${BACKEND_URL}`));
        return;
      }

      setTimeout(poll, 500);
    };

    poll();
  });
}

async function startBackend() {
  if (await isPortOpen(BACKEND_PORT)) {
    return;
  }

  const backend = resolveBackendEntry();
  const projectRoot = resolveProjectRoot();
  const backendCwd = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(projectRoot, 'Back-END');

  if (app.isPackaged && backend.exe) {
    backendProcess = spawn(backend.exe, [], {
      cwd: backendCwd,
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    const pythonCommand = process.env.RF_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    backendProcess = spawn(pythonCommand, [backend.py], {
      cwd: backendCwd,
      windowsHide: true,
      stdio: isDev ? 'inherit' : 'ignore',
    });
  }

  ownsBackendProcess = true;

  backendProcess.once('exit', (code) => {
    if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('rf-backend-exit', { code });
    }
    backendProcess = null;
    ownsBackendProcess = false;
  });

  await waitForBackend();
}

function stopBackend() {
  if (!backendProcess || !ownsBackendProcess) {
    return;
  }

  try {
    backendProcess.kill();
  } catch {
    // Nothing else to do during app shutdown.
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'RF Tool Suite',
    backgroundColor: '#f7f9fc',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('rf-window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('rf-window-toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('rf-window-close', () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  await startBackend();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
