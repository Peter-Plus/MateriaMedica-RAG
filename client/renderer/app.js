const $ = id => document.getElementById(id);
const state = { mode: 'login', user: null, conversationId: null, busy: false };

function showError(id, error) { $(id).textContent = error?.message || String(error || ''); }
function showApp() { $('auth-view').classList.add('hidden'); $('app-view').classList.remove('hidden'); }
function showAuth() { $('app-view').classList.add('hidden'); $('auth-view').classList.remove('hidden'); }

function closeMobileSidebar() {
  $('app-view').classList.remove('menu-open');
  $('history-toggle').setAttribute('aria-expanded', 'false');
}

function enterApp(user) {
  state.user = user;
  state.conversationId = null;
  $('username-label').textContent = user.username;
  $('password').value = '';
  $('chat-title').textContent = '开始一次检索';
  $('question').value = '';
  showError('chat-error', '');
  closeMobileSidebar();
  showApp();
  welcome();
}

function setBusy(busy) {
  state.busy = busy;
  for (const button of document.querySelectorAll('#app-view button')) button.disabled = busy;
  $('question').disabled = busy;
  $('messages').setAttribute('aria-busy', String(busy));
}

async function refreshSidebar() {
  try { await loadSidebar(); }
  catch (error) { showError('chat-error', `侧栏刷新失败：${error.message}`); }
}

function setMode(mode) {
  state.mode = mode;
  $('login-tab').classList.toggle('active', mode === 'login');
  $('register-tab').classList.toggle('active', mode === 'register');
  $('auth-submit').textContent = mode === 'login' ? '登录' : '创建账号';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showError('auth-error', '');
}

async function loadSidebar() {
  const [list, kb] = await Promise.all([
    window.bcrag.request('/api/conversations'),
    window.bcrag.request('/api/knowledge/status')
  ]);
  const nav = $('conversations');
  nav.replaceChildren();
  for (const item of list.conversations) {
    const button = document.createElement('button');
    button.className = 'conversation' + (item.id === state.conversationId ? ' active' : '');
    button.textContent = item.title;
    button.title = item.title;
    button.disabled = state.busy;
    if (item.id === state.conversationId) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => openConversation(item));
    nav.appendChild(button);
  }
  if (!list.conversations.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '暂无历史对话。发送问题后，对话会保存在这里。';
    nav.appendChild(empty);
  }
  const count = kb.documents.reduce((sum, item) => sum + item.chunk_count, 0);
  $('knowledge-status').textContent = `已收录 ${kb.documents.length} 部文献 · ${count} 段原文`;
}

function welcome() {
  $('messages').replaceChildren($('welcome-template').content.cloneNode(true));
}

function addMessage(message) {
  const container = $('messages');
  const welcomeNode = container.querySelector('.welcome');
  if (welcomeNode) welcomeNode.remove();
  const article = document.createElement('article');
  article.className = 'message ' + message.role;
  const heading = document.createElement('div');
  heading.className = 'message-heading';
  heading.textContent = message.role === 'user' ? '你' : '本草问答';
  const content = document.createElement('div');
  content.className = 'message-content';
  if (message.role === 'assistant') {
    content.classList.add('markdown');
    content.innerHTML = renderAnswerMarkdown(message.content);
  } else {
    content.textContent = message.content;
  }
  article.append(heading, content);
  if (message.sources?.length) {
    const details = document.createElement('details');
    details.className = 'sources';
    const summary = document.createElement('summary');
    summary.textContent = `查看 ${message.sources.length} 处古籍出处`;
    details.appendChild(summary);
    for (const source of message.sources) {
      const item = document.createElement('div');
      item.className = 'source';
      const label = document.createElement('strong');
      label.textContent = `[${source.id}] ${source.document} · ${source.section} · ${source.title} · 第 ${source.start_line}–${source.end_line} 行`;
      const excerpt = document.createElement('p');
      excerpt.textContent = source.excerpt;
      item.append(label, excerpt);
      details.appendChild(item);
    }
    article.appendChild(details);
  }
  container.appendChild(article);
  container.scrollTop = container.scrollHeight;
  return article;
}

async function openConversation(item) {
  if (state.busy) return;
  setBusy(true);
  showError('chat-error', '');
  try {
    const result = await window.bcrag.request(`/api/conversations/${item.id}/messages`);
    state.conversationId = item.id;
    closeMobileSidebar();
    $('chat-title').textContent = item.title;
    $('messages').replaceChildren();
    for (const message of result.messages) addMessage(message);
    if (!result.messages.length) welcome();
    await refreshSidebar();
  } catch (error) { showError('chat-error', error); }
  finally { setBusy(false); }
}

async function onAuth(event) {
  event.preventDefault();
  showError('auth-error', '');
  $('auth-submit').disabled = true;
  try {
    const result = await window.bcrag.request(`/api/auth/${state.mode}`, 'POST', {
      username: $('username').value.trim(), password: $('password').value
    });
    enterApp(result.user);
    await refreshSidebar();
    $('question').focus();
  } catch (error) { showError('auth-error', error); }
  finally { $('auth-submit').disabled = false; }
}

async function onChat(event) {
  event.preventDefault();
  const question = $('question').value.trim();
  if (!question || state.busy) return;
  setBusy(true);
  $('send').textContent = '回答中…';
  showError('chat-error', '');
  $('question').value = '';
  const draft = addMessage({ role: 'user', content: question });
  const pending = addMessage({ role: 'assistant', content: '正在检索原文并整理回答…' });
  pending.classList.add('pending');
  try {
    const result = await window.bcrag.request('/api/chat', 'POST', {
      question, conversation_id: state.conversationId
    });
    state.conversationId = result.conversation_id;
    pending.remove();
    const answer = addMessage(result.message);
    answer.scrollIntoView({ block: 'start' });
    if ($('chat-title').textContent === '开始一次检索') $('chat-title').textContent = question.slice(0, 32);
    await refreshSidebar();
  } catch (error) {
    draft.remove();
    pending.remove();
    $('question').value = question;
    if (!$('messages').children.length) welcome();
    showError('chat-error', error);
  } finally { setBusy(false); $('send').textContent = '发送 ↑'; $('question').focus({ preventScroll: true }); }
}

async function openSettings() {
  if (state.busy || window.bcrag.isWeb) return;
  try {
    const settings = await window.bcrag.getSettings();
    const endpoint = new URL(settings.debugServerUrl);
    $('local-debug').checked = settings.localDebug;
    $('server-url').value = `${endpoint.protocol}//${endpoint.hostname}`;
    $('server-port').value = endpoint.port || (endpoint.protocol === 'https:' ? '443' : '80');
    syncDebugFields();
    showError('settings-error', '');
    $('settings-dialog').showModal();
  } catch (error) { showError(state.user ? 'chat-error' : 'auth-error', error); }
}

async function saveSettings(event) {
  event.preventDefault();
  $('settings-save').disabled = true;
  try {
    const result = await window.bcrag.setSettings({ localDebug: $('local-debug').checked,
      address: $('server-url').value.trim(), port: $('server-port').value });
    $('settings-dialog').close();
    if (result.serverChanged) {
      state.user = null;
      state.conversationId = null;
      $('conversations').replaceChildren();
      welcome();
      showAuth();
      showError('auth-error', result.localDebug ? '已切换至本地调试，请登录对应服务。' : '已恢复线上服务，请重新登录。');
    }
  } catch (error) { showError('settings-error', error); }
  finally { $('settings-save').disabled = false; }
}

function syncDebugFields() {
  const enabled = $('local-debug').checked;
  $('debug-fields').classList.toggle('hidden', !enabled);
  $('debug-fields').disabled = !enabled;
}

async function openWebsite() {
  try { await window.bcrag.openWebsite(); }
  catch (_) { showError(state.user ? 'chat-error' : 'auth-error', '无法打开浏览器，请手动访问 https://brag.worldlinesite.com/。'); }
}

$('login-tab').addEventListener('click', () => setMode('login'));
$('register-tab').addEventListener('click', () => setMode('register'));
$('auth-form').addEventListener('submit', onAuth);
$('chat-form').addEventListener('submit', onChat);
$('question').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('chat-form').requestSubmit();
  }
});
$('new-chat').addEventListener('click', async () => {
  if (state.busy) return;
  closeMobileSidebar();
  state.conversationId = null;
  $('chat-title').textContent = '开始一次检索';
  $('question').value = '';
  showError('chat-error', '');
  welcome();
  for (const button of $('conversations').querySelectorAll('button')) {
    button.classList.remove('active');
    button.removeAttribute('aria-current');
  }
  $('question').focus();
});
$('logout').addEventListener('click', async () => {
  if (state.busy) return;
  setBusy(true);
  try { await window.bcrag.request('/api/auth/logout', 'POST'); } catch (_) {}
  state.user = null;
  state.conversationId = null;
  setBusy(false);
  showAuth();
});
$('settings-auth').addEventListener('click', openSettings);
$('settings-app').addEventListener('click', openSettings);
$('website-auth').addEventListener('click', openWebsite);
$('website-app').addEventListener('click', openWebsite);
$('local-debug').addEventListener('change', syncDebugFields);
$('settings-form').addEventListener('submit', saveSettings);
$('settings-cancel').addEventListener('click', () => $('settings-dialog').close());
$('history-toggle').addEventListener('click', () => {
  const open = $('app-view').classList.toggle('menu-open');
  $('history-toggle').setAttribute('aria-expanded', String(open));
});
window.addEventListener('bcrag:unauthorized', () => {
  state.user = null;
  state.conversationId = null;
  showAuth();
  showError('auth-error', '登录已失效，请重新登录。');
});
welcome();
async function restoreWebSession() {
  if (!window.bcrag.isWeb || !window.bcrag.hasSession()) return;
  $('auth-submit').disabled = true;
  try {
    const result = await window.bcrag.request('/api/me');
    enterApp(result.user);
    await refreshSidebar();
  } catch (error) { showError('auth-error', error); }
  finally { $('auth-submit').disabled = false; }
}
restoreWebSession();
