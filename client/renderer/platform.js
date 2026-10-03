// Electron supplies its bridge through preload; the website uses same-origin HTTP.
(() => {
  if (window.bcrag) return;
  document.documentElement.classList.add('web');
  const key = 'bcrag.session';
  let token = null;
  try { token = sessionStorage.getItem(key); } catch (_) {}
  function saveToken(value) {
    token = value;
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch (_) { /* Storage may be disabled; in-memory login still works. */ }
  }
  window.bcrag = Object.freeze({
    isWeb: true,
    hasSession: () => Boolean(token),
    getSettings: async () => ({ serverUrl: location.origin }),
    async request(route, method = 'GET', body = null) {
      if (!/^\/api\/(?:health|me|knowledge\/status|auth\/(?:register|login|logout)|conversations(?:\/\d+\/messages)?|chat)$/.test(route)) {
        throw new Error('不允许访问此接口');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 105000);
      try {
        const response = await fetch(route, {
          method: method === 'POST' ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
          credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal
        });
        if (response.status === 401) {
          saveToken(null);
          window.dispatchEvent(new Event('bcrag:unauthorized'));
        }
        let data;
        try { data = await response.json(); }
        catch (_) { throw new Error('服务器暂时不可用，请稍后重试。'); }
        if (!response.ok) throw new Error(data.error || `服务器返回 ${response.status}`);
        if (/^\/api\/auth\/(login|register)$/.test(route) && data.token) saveToken(data.token);
        return data;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('请求超时，请稍后重试。');
        if (error instanceof TypeError) throw new Error('无法连接服务器，请检查网络后重试。');
        throw error;
      } finally {
        clearTimeout(timeout);
        if (route === '/api/auth/logout') saveToken(null);
      }
    }
  });
})();
