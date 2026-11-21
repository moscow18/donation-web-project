(function () {
  const SUPABASE_URL = 'https://zsjetsailonjuwawbpke.supabase.co';

  function injectLoader() {
    if (document.getElementById('kiswah-global-loader')) return;
    const loader = document.createElement('div');
    loader.id = 'kiswah-global-loader';
    loader.setAttribute('dir', 'rtl');
    loader.innerHTML = `
      <div class="kiswah-loader-emblem">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V8l7 4.5a1.5 1.5 0 0 1-.8 2.75H4.8a1.5 1.5 0 0 1-.8-2.75L11 8V6.73A2 2 0 0 1 12 3Z"></path>
          <path d="M6 15.25h12"></path>
        </svg>
      </div>
      <div class="kiswah-loader-title">كسوة</div>
      <div id="kiswah-loader-text" class="kiswah-loader-sub">جاري التحميل ومزامنة البيانات...</div>
    `;
    (document.body || document.documentElement).appendChild(loader);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectLoader);
  } else {
    injectLoader();
  }

  window.KiswahLoader = {
    show(message) {
      injectLoader();
      const el = document.getElementById('kiswah-global-loader');
      const txt = document.getElementById('kiswah-loader-text');
      if (txt && message) txt.textContent = message;
      if (el) el.classList.remove('is-hidden');
    },
    hide() {
      const el = document.getElementById('kiswah-global-loader');
      if (el) el.classList.add('is-hidden');
    }
  };

  window.addEventListener('load', () => {
    setTimeout(() => window.KiswahLoader.hide(), 350);
  });

  window.showKiswahToast = function (message) {
    let toast = document.getElementById('kiswah-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kiswah-toast';
      toast.className = 'toast-msg';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  async function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window._supabase) return window._supabase;
    if (window.sb && typeof window.sb.auth === 'object') {
      window.supabaseClient = window.sb;
      return window.supabaseClient;
    }

    const candidatePaths = ['../js/app.js', 'js/app.js', '/js/app.js'];
    let resolvedKey = window.SUPABASE_ANON_KEY || null;

    if (!resolvedKey) {
      for (const path of candidatePaths) {
        try {
          const res = await fetch(path, { cache: 'no-store' });
          if (!res.ok) continue;
          const code = await res.text();
          const jwtMatch = code.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
          if (jwtMatch) {
            resolvedKey = jwtMatch[0];
            break;
          }
        } catch (_) {}
      }
    }

    if (resolvedKey && window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, resolvedKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        },
        realtime: {
          params: { eventsPerSecond: 10 }
        }
      });
      return window.supabaseClient;
    }
    return null;
  }

  const listeners = new Set();
  let globalChannel = null;
  let debounceTimer = null;

  function notifyListeners(payload) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      listeners.forEach(fn => {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    }, 200);
  }

  window.KiswahRealtime = {
    async init() {
      const sb = await getClient();
      if (!sb || globalChannel) return sb;

      globalChannel = sb
        .channel('kiswah-global-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, notifyListeners)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'donation_items' }, notifyListeners)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'donation_photos' }, notifyListeners)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, notifyListeners)
        .subscribe();

      return sb;
    },
    subscribe(callback) {
      if (typeof callback === 'function') {
        listeners.add(callback);
        this.init();
      }
      return () => listeners.delete(callback);
    },
    getClient
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.KiswahRealtime.init();
  });
})();