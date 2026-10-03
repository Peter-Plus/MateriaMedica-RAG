const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let window;
let token = null;
const DEFAULT_SERVER_URL = 'https://brag.worldlinesite.com';
let serverUrl = DEFAULT_SERVER_URL;

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function validServerUrl(raw) {
  const parsed = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error('公网服务器必须使用 HTTPS；本地调试可使用 HTTP。');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('请输入服务器根地址，不要包含账号、参数或片段。');
  }
  return parsed.origin + parsed.pathname.replace(/\/$/, '');
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    serverUrl = validServerUrl(raw.serverUrl);
  } catch (_) {
    serverUrl = DEFAULT_SERVER_URL;
  }
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
  ipcMain.handle('settings:get', () => ({ serverUrl }));
  ipcMain.handle('settings:set', (_event, value) => {
    const next = validServerUrl(value);
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ serverUrl: next }, null, 2), 'utf8');
    serverUrl = next;
    token = null;
    return { serverUrl };
  });
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
      throw new Error(`无法连接服务器 ${serverUrl}。请在“服务器设置”中检查地址和网络。${reason ? `（${reason}）` : ''}`);
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
