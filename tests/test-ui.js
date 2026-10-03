// Local Electron integration checks; all server responses are mocked, no model calls.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const clientRoot = process.env.BCRAG_UI_ROOT || path.join(root, 'client');
const output = path.join(root, 'data', 'ui-check');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
const answer = [
  '## 甘草的古籍记载',
  '据检索原文，甘草又称 **密甘、国老** [1]。',
  '### 阅读要点',
  '- **释名**：核对古籍中的别名。\n- **出处**：展开下方来源查看原文。',
  '| 项目 | 原文记录 |\n| --- | --- |\n| 别名 | 密甘、国老 |\n| 文献 | 《本草綱目》 |',
  '> 古籍记载仅供资料参考，不代替现代医学建议。'
].join('\n\n');
const response = {
  conversation_id: 1,
  message: { role: 'assistant', content: answer, sources: [{ id: 1,
    document: '本草綱目-全文.txt', section: '草之一', title: '甘草', start_line: 17666,
    end_line: 17690, excerpt: '甘草 （《本經》上品）\n釋名\n密甘、國老。' }] }
};
let hasChat = false;
let failChat = false;
let failSidebar = false;
let releaseChat;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const settingsModel = require(path.join(clientRoot, 'settings.js'));
let settings = settingsModel.loadSettings();
let websiteOpens = 0;
ipcMain.handle('settings:get', () => ({ ...settings, serverUrl: settingsModel.serverUrl(settings) }));
ipcMain.handle('settings:set', (_event, input) => {
  const next = settingsModel.updateSettings(settings, input);
  const serverChanged = settingsModel.serverUrl(settings) !== settingsModel.serverUrl(next);
  settings = next;
  return { ...settings, serverUrl: settingsModel.serverUrl(settings), serverChanged };
});
ipcMain.handle('website:open', () => { websiteOpens++; });
ipcMain.handle('api:request', async (_event, { route }) => {
  if (route.startsWith('/api/auth/')) return { user: { id: 1, username: 'demo' } };
  if (route === '/api/knowledge/status') return { documents: [{ chunk_count: 3360 }], embedded_chunks: 1 };
  if (route === '/api/conversations') {
    if (failSidebar) throw new Error('模拟侧栏刷新失败');
    return { conversations: hasChat ? [{ id: 1, title: '甘草在《本草綱目》中有哪些记载？' }] : [] };
  }
  if (route === '/api/conversations/1/messages') return { messages: [
    { role: 'user', content: '甘草在《本草綱目》中有哪些记载？' }, response.message
  ] };
  if (route === '/api/chat') {
    await new Promise(resolve => { releaseChat = resolve; });
    if (failChat) throw new Error('模拟连接失败，请重试');
    hasChat = true;
    return response;
  }
  throw new Error('Unmocked route: ' + route);
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1180, height: 780,
    webPreferences: { preload: path.join(clientRoot, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.on('console-message', event => {
    if (event.level === 'error') console.error('Renderer:', event.message);
  });
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async code => {
    const end = Date.now() + 5000;
    while (!(await run(code))) {
      if (Date.now() > end) throw new Error('Timed out: ' + code);
      await delay(30);
    }
  };
  const capture = async name => {
    await delay(100);
    fs.writeFileSync(path.join(output, name + '.png'), (await window.webContents.capturePage()).toPNG());
  };
  await window.loadFile(path.join(clientRoot, 'renderer/index.html'));
  await waitFor(`typeof openSettings === 'function'`);
  assert.ok(await run(`getComputedStyle(document.querySelector('.download-client')).display === 'none'`));
  await capture('login');
  await run(`document.getElementById('website-auth').click(); document.getElementById('settings-auth').click()`);
  await waitFor(`document.getElementById('settings-dialog').open`);
  assert.equal(websiteOpens, 1);
  assert.ok(await run(`!document.getElementById('local-debug').checked && document.getElementById('debug-fields').disabled && getComputedStyle(document.getElementById('debug-fields')).display === 'none'`));
  await capture('settings-online');
  await run(`document.getElementById('local-debug').click()`);
  assert.ok(await run(`!document.getElementById('debug-fields').disabled && document.getElementById('server-port').value === '8000'`));
  await capture('settings-debug');
  await run(`document.getElementById('settings-cancel').click(); document.getElementById('settings-auth').click()`);
  await waitFor(`document.getElementById('settings-dialog').open`);
  assert.ok(await run(`!document.getElementById('local-debug').checked`));
  await run(`document.getElementById('local-debug').click(); document.getElementById('server-port').value='8123'; document.getElementById('settings-form').requestSubmit()`);
  await waitFor(`!document.getElementById('settings-dialog').open`);
  assert.equal(settingsModel.serverUrl(settings), 'http://127.0.0.1:8123');
  await run(`document.getElementById('settings-auth').click()`);
  await waitFor(`document.getElementById('settings-dialog').open`);
  assert.ok(await run(`document.getElementById('local-debug').checked && document.getElementById('server-port').value === '8123'`));
  await run(`document.getElementById('local-debug').click(); document.getElementById('server-url').value='invalid'; document.getElementById('settings-form').requestSubmit()`);
  await waitFor(`!document.getElementById('settings-dialog').open`);
  assert.equal(settingsModel.serverUrl(settings), settingsModel.ONLINE_URL);
  await run(`document.getElementById('username').value = 'demo';
    document.getElementById('password').value = 'password123';
    document.getElementById('auth-form').requestSubmit();`);
  await waitFor(`!document.getElementById('app-view').classList.contains('hidden') && !!document.querySelector('.history-empty')`);
  await capture('welcome');
  await run(`document.getElementById('website-app').click(); document.getElementById('settings-app').click()`);
  await waitFor(`document.getElementById('settings-dialog').open`);
  await run(`document.getElementById('settings-form').requestSubmit()`);
  await waitFor(`!document.getElementById('settings-dialog').open`);
  assert.equal(websiteOpens, 2);
  assert.ok(await run(`!!state.user && !document.getElementById('app-view').classList.contains('hidden')`));

  await run(`document.getElementById('question').value = '甘草在《本草綱目》中有哪些记载？';
    document.getElementById('chat-form').requestSubmit();`);
  await waitFor(`!!document.querySelector('.pending')`);
  assert.ok(await run(`['send', 'new-chat', 'logout', 'settings-app'].every(id => document.getElementById(id).disabled)`));
  while (!releaseChat) await delay(20);
  releaseChat();
  await waitFor(`!state.busy`);
  assert.ok(await run(`!!document.querySelector('.assistant h2') && !!document.querySelector('.assistant strong') &&
    document.querySelectorAll('.assistant li').length === 2 && !!document.querySelector('.assistant table') &&
    !!document.querySelector('.assistant blockquote')`));
  await run(`document.getElementById('messages').scrollTop = 0`);
  await capture('answer');
  await run(`document.querySelector('.sources').open = true; document.getElementById('messages').scrollTop = 99999`);
  assert.ok(await run(`document.querySelector('.source p').textContent.includes('密甘、國老')`));
  await capture('sources');

  // Loading saved messages must use exactly the same Markdown rendering path.
  await run(`document.getElementById('new-chat').click(); document.querySelector('.conversation').click()`);
  await waitFor(`!state.busy && !!document.querySelector('.assistant table')`);
  assert.ok(await run(`document.querySelector('.conversation').getAttribute('aria-current') === 'true'`));

  const unsafe = '<script>window.injected = true</script>\n<img src=x onerror="window.injected=true">\n\n' +
    '[危险](javascript:alert(1))\n\n[本地](file:///C:/Windows)\n\n![图](https://example.com/image.png)\n\n' +
    '[网页](https://example.com)\n\n```html\n<img onerror="alert(1)">\n```\n\n' +
    '3. 第三项\n4. 第四项\n\n**粗体**、*斜体*、~~删除线~~、`code`';
  const security = await run(`(() => {
    const box = document.createElement('div'); box.innerHTML = renderAnswerMarkdown(${JSON.stringify(unsafe)});
    return { unsafe: !!box.querySelector('script, img, iframe, object, [onerror], [onclick]'),
      links: [...box.querySelectorAll('a')].map(a => a.getAttribute('href')),
      target: box.querySelector('a[href="https://example.com"]').getAttribute('target'),
      code: box.querySelector('pre code').textContent,
      start: box.querySelector('ol').getAttribute('start'),
      formats: ['strong', 'em', 's', 'code'].every(tag => box.querySelector(tag)) };
  })()`);
  assert.equal(security.unsafe, false);
  assert.ok(security.links.every(link => !link || link.startsWith('https://')));
  assert.equal(security.target, '_blank');
  assert.equal(security.start, '3');
  assert.equal(security.formats, true);
  assert.ok(security.code.includes('<img onerror='));
  await run(`addMessage({role: 'user', content: '**用户输入** <img src=x>'})`);
  assert.equal(await run(`document.querySelector('.message:last-child .message-content').children.length`), 0);

  // Minimum supported window: wide Markdown tables/code must scroll internally.
  window.setSize(880, 620);
  const wide = '| ' + Array(12).fill('列标题').join(' | ') + ' |\n| ' + Array(12).fill('---').join(' | ') + ' |\n| ' +
    Array(12).fill('内容').join(' | ') + ' |\n\n```\n' + 'very_long_code_'.repeat(40) + '\n```';
  await run(`addMessage({role: 'assistant', content: ${JSON.stringify(wide)}})`);
  assert.ok(await run(`document.documentElement.scrollWidth <= innerWidth &&
    document.getElementById('messages').scrollWidth <= document.getElementById('messages').clientWidth + 1 &&
    document.querySelector('.composer').getBoundingClientRect().bottom <= innerHeight`));
  await capture('compact');

  // Failed requests restore the original draft and enable retry.
  failChat = true;
  releaseChat = null;
  await run(`document.getElementById('new-chat').click(); document.getElementById('question').value = '失败重试';
    document.getElementById('chat-form').requestSubmit()`);
  while (!releaseChat) await delay(20);
  releaseChat();
  await waitFor(`!state.busy`);
  assert.ok(await run(`document.getElementById('question').value === '失败重试' &&
    !document.getElementById('send').disabled && !document.querySelector('.pending') && !!document.querySelector('.welcome')`));

  // A sidebar failure must never remove a successfully received answer.
  failChat = false;
  failSidebar = true;
  releaseChat = null;
  await run(`document.getElementById('chat-form').requestSubmit()`);
  while (!releaseChat) await delay(20);
  releaseChat();
  await waitFor(`!state.busy`);
  assert.ok(await run(`!!document.querySelector('.assistant table') && document.getElementById('chat-error').textContent.includes('侧栏')`));
  console.log('PASS: settings toggle/cancel/save, endpoint changes, website IPC, Markdown, history, safety, retry, compact layout.');
  console.log('Screenshots: ' + output);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });

setTimeout(() => { console.error('UI checks timed out'); app.exit(1); }, 30000).unref();
