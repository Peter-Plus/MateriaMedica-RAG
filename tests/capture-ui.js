// Optional visual smoke check: run with client/node_modules/electron/dist/electron.exe.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const chatMode = process.env.BCRAG_SMOKE_CHAT === '1';
  if (chatMode) {
    ipcMain.handle('api:request', (_event, request) => {
      if (request.route === '/api/auth/register') return { token: 'test', user: { id: 1, username: 'demo' } };
      if (request.route === '/api/conversations') return { conversations: [] };
      if (request.route === '/api/knowledge/status') return { documents: [{ chunk_count: 3360 }], embedded_chunks: 0 };
      if (request.route === '/api/chat') return {
        conversation_id: 1,
        message: { id: 2, role: 'assistant', content: '《本草綱目》将甘草又称为“国老”[1]。这是古籍记载，仅供资料查询。',
          sources: [{ id: 1, document: '本草綱目-全文.txt', section: '草之一', title: '甘草',
            start_line: 17666, end_line: 17690, excerpt: '甘草 （《本經》上品）\n釋名\n密甘、國老。' }] }
      };
      throw new Error('Unmocked route: ' + request.route);
    });
  }
  const window = new BrowserWindow({
    show: false, width: 1180, height: 780,
    webPreferences: {
      preload: path.join(root, 'client', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  await window.loadFile(path.join(root, 'client', 'renderer', 'index.html'));
  if (chatMode) {
    await window.webContents.executeJavaScript(`
      document.getElementById('register-tab').click();
      document.getElementById('username').value='demo';
      document.getElementById('password').value='password123';
      document.getElementById('auth-form').requestSubmit();
    `);
    await new Promise(resolve => setTimeout(resolve, 300));
    await window.webContents.executeJavaScript(`
      document.getElementById('question').value='甘草的别名是什么？';
      document.getElementById('chat-form').requestSubmit();
    `);
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const output = path.join(root, 'data', chatMode ? 'chat-preview.png' : 'ui-preview.png');
  fs.writeFileSync(output, (await window.webContents.capturePage()).toPNG());
  console.log(output);
  app.quit();
});
