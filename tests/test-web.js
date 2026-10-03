// Exercise built web assets over HTTP in Chromium without Electron preload APIs.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'client/dist/web');
const output = path.join(root, 'data/web-check');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
let validSession = false;
let hasChat = false;
const message = { role: 'assistant', content: '## 古籍记录\n\n**甘草** 又名国老 [1]。\n\n| 项目 | 内容 |\n| --- | --- |\n| 来源 | 本草纲目 |',
  sources: [{ id: 1, document: '本草綱目', section: '草部', title: '甘草', start_line: 1, end_line: 2, excerpt: '密甘、國老。' }] };
const server = http.createServer(async (req, res) => {
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.url.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (/^\/api\/auth\/(login|register)$/.test(req.url)) {
      if (JSON.parse(body).username === 'invalid') return json(400, { error: '用户名或密码错误' });
      validSession = true;
      return json(200, { token: 'local-test-session', user: { id: 1, username: 'demo' } });
    }
    if (!validSession || req.headers.authorization !== 'Bearer local-test-session') return json(401, { error: '请先登录' });
    if (req.url === '/api/me') return json(200, { user: { id: 1, username: 'demo' } });
    if (req.url === '/api/auth/logout') { validSession = false; return json(200, { ok: true }); }
    if (req.url === '/api/conversations') return json(200, { conversations: hasChat ? [{ id: 1, title: '甘草的别名' }] : [] });
    if (req.url === '/api/knowledge/status') return json(200, { documents: [{ chunk_count: 3360 }] });
    if (req.url === '/api/chat') { hasChat = true; return json(200, { conversation_id: 1, message }); }
    if (req.url === '/api/conversations/1/messages') return json(200, { messages: [message] });
    return json(404, { error: '接口不存在' });
  }
  const name = req.url === '/' ? 'index.html' : req.url.slice(1);
  const file = path.resolve(web, name);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'text/plain');
  res.end(fs.readFileSync(file));
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const window = new BrowserWindow({ show: false, width: 1180, height: 780,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const run = code => window.webContents.executeJavaScript(code);
  const wait = async code => {
    const end = Date.now() + 5000;
    while (!(await run(code))) { if (Date.now() > end) throw Error('Timeout: ' + code); await delay(30); }
  };
  const login = async (name = 'demo') => {
    await run(`document.getElementById('username').value=${JSON.stringify(name)};
      document.getElementById('password').value='test-password'; document.getElementById('auth-form').requestSubmit()`);
    await wait(`!document.getElementById('auth-submit').disabled`);
  };
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  assert.ok(await run(`window.bcrag.isWeb && typeof require === 'undefined' && getComputedStyle(document.querySelector('.auth-tools')).display === 'none'`));
  assert.ok(await run(`getComputedStyle(document.querySelector('.download-client')).display !== 'none' &&
    [...document.querySelectorAll('a.web-only')].every(a => a.href === 'https://github.com/Peter-Plus/MateriaMedica-RAG/releases/latest/download/BCRAG-Windows-x64.zip' && a.target === '_blank')`));
  await login('invalid');
  assert.ok(await run(`document.getElementById('auth-error').textContent.includes('用户名')`));
  await run(`document.getElementById('register-tab').click()`);
  await login();
  assert.ok(await run(`!document.getElementById('app-view').classList.contains('hidden') && sessionStorage.getItem('bcrag.session') !== null`));
  await run(`document.getElementById('question').value='甘草的别名'; document.getElementById('chat-form').requestSubmit()`);
  await wait(`!state.busy && !!document.querySelector('.assistant table')`);
  assert.ok(await run(`!!document.querySelector('.assistant strong') && !!document.querySelector('.sources')`));
  await window.reload();
  await wait(`!document.getElementById('app-view').classList.contains('hidden') && !!document.querySelector('.conversation')`);
  await run(`document.querySelector('.conversation').click()`);
  await wait(`!state.busy && !!document.querySelector('.assistant table')`);
  window.setContentSize(390, 844);
  await delay(150);
  assert.ok(await run(`document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.querySelector('.sidebar')).display === 'none'`));
  await run(`document.getElementById('history-toggle').click()`);
  assert.ok(await run(`getComputedStyle(document.querySelector('.sidebar')).display !== 'none'`));
  await run(`document.querySelector('.conversation').click()`);
  await wait(`!state.busy && !document.getElementById('app-view').classList.contains('menu-open')`);
  fs.writeFileSync(path.join(output, 'mobile.png'), (await window.webContents.capturePage()).toPNG());
  validSession = false;
  await run(`window.bcrag.request('/api/me').catch(() => {})`);
  assert.ok(await run(`!sessionStorage.getItem('bcrag.session') && !document.getElementById('auth-view').classList.contains('hidden')`));
  await login();
  await run(`document.getElementById('logout').click()`);
  await wait(`!state.busy && !document.getElementById('auth-view').classList.contains('hidden')`);
  assert.ok(await run(`!sessionStorage.getItem('bcrag.session')`));
  assert.equal(validSession, false);
  assert.ok(await run(`window.bcrag.request('https://example.com/api/me').then(() => false, () => true)`));
  console.log('PASS: web HTTP authentication, registration, Markdown, history, refresh, logout, expired session, mobile layout.');
  server.close();
  app.quit();
}).catch(error => { console.error(error); server.close(); app.exit(1); });
setTimeout(() => { console.error('Web checks timed out'); app.exit(1); }, 30000).unref();
