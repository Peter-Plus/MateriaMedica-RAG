const ONLINE_URL = 'https://brag.worldlinesite.com';
const LOCAL_URL = 'http://127.0.0.1:8000';

function validServerUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw new Error('请输入有效地址，例如 http://127.0.0.1。'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error('本机调试可使用 HTTP；其他地址必须使用 HTTPS。');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('请输入服务根地址，不要包含账号、路径、参数或片段。');
  }
  return parsed.origin;
}

function loadSettings(raw = {}) {
  let debugServerUrl = LOCAL_URL;
  try {
    const candidate = raw.debugServerUrl || (raw.serverUrl !== ONLINE_URL ? raw.serverUrl : null);
    if (candidate) debugServerUrl = validServerUrl(candidate);
  } catch (_) {}
  // Legacy addresses are retained as a draft, but debugging must be explicitly enabled.
  return { localDebug: raw.localDebug === true, debugServerUrl };
}

function serverUrl(settings) {
  return settings.localDebug ? settings.debugServerUrl : ONLINE_URL;
}

function updateSettings(current, input) {
  if (typeof input?.localDebug !== 'boolean') throw new Error('调试设置无效。');
  if (!input.localDebug) return { ...current, localDebug: false };
  const address = validServerUrl(String(input.address || '').trim());
  const port = String(input.port || '').trim();
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('端口须为 1–65535 的整数。');
  }
  const parsed = new URL(address);
  parsed.port = String(Number(port));
  return { localDebug: true, debugServerUrl: parsed.origin };
}

module.exports = { ONLINE_URL, loadSettings, serverUrl, updateSettings };
