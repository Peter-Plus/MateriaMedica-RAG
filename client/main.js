const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const settingsModel = require('./settings');

let window;
let token = null;
let settings = settingsModel.loadSettings();
let serverUrl = settingsModel.serverUrl(settings);

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = settingsModel.loadSettings(raw);
  } catch (_) {
    settings = settingsModel.loadSettings();
  }
  serverUrl = settingsModel.serverUrl(settings);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 880,
    minHeight: 620,
    title: '本草问答',
    backgroundColor: '#faf9f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Markdown links may open only ordinary web pages in the default browser.
    try {
      const parsed = new URL(url);
      if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
        shell.openExternal(parsed.href).catch(() => {});
      }
    } catch (_) {}
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
}

app.whenReady().then(() => {
  loadSettings();
  ipcMain.handle('settings:get', () => ({ ...settings, serverUrl }));
  ipcMain.handle('settings:set', (_event, value) => {
    const next = settingsModel.updateSettings(settings, value);
    const nextUrl = settingsModel.serverUrl(next);
    const serverChanged = serverUrl !== nextUrl;
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8');
    settings = next;
    serverUrl = nextUrl;
    if (serverChanged) token = null;
    return { ...settings, serverUrl, serverChanged };
  });
  ipcMain.handle('website:open', () => shell.openExternal(settingsModel.ONLINE_URL + '/'));
  ipcMain.handle('api:request', async (_event, request) => {
    const route = String(request?.route || '');
    const method = request?.method === 'POST' ? 'POST' : 'GET';
    if (!/^\/api\/(?:health|me|knowledge\/status|auth\/(?:register|login|logout)|conversations(?:\/\d+\/messages)?|chat)$/.test(route)) {
      throw new Error('不允许访问此接口');
    }
    let response;
    try {
      response = await fetch(serverUrl + route, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: method === 'POST' ? JSON.stringify(request?.body || {}) : undefined,
        signal: AbortSignal.timeout(105000)
      });
    } catch (error) {
      const reason = error?.cause?.code || error?.code;
      throw new Error(`无法连接服务。请检查网络，或在“设置”中检查本地调试选项。${reason ? `（${reason}）` : ''}`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `服务器返回 ${response.status}`);
    if ((route === '/api/auth/login' || route === '/api/auth/register') && data.token) token = data.token;
    if (route === '/api/auth/logout') token = null;
    return data;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
