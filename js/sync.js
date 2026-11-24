/* Sync progress between computers through a secret GitHub Gist.
   Only answers/scores/preferences travel; the question bank never leaves the device. */
const Sync = {
  FILE: 'cfa-mocks-progress.json',
  KEY: 'cfaMockExams.sync',
  cfg: null,          // { token, gistId, login, lastSync }
  status: 'off',      // off | syncing | ok | error
  error: '',
  _timer: null, _lastPush: 0, _busy: null,

  load() {
    try { this.cfg = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { this.cfg = null; }
    this.status = this.cfg ? 'ok' : 'off';
  },
  persist() { if (this.cfg) localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); else localStorage.removeItem(this.KEY); },
  enabled() { return !!(this.cfg && this.cfg.token && this.cfg.gistId); },

  async api(path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + this.cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    });
    if (r.status === 401) throw new Error('El token no es válido o ha caducado.');
    if (r.status === 403 || r.status === 404) throw new Error('El token no tiene permiso de "gist" o el Gist ya no existe.');
    if (!r.ok) throw new Error('GitHub respondió ' + r.status);
    return r.status === 204 ? null : r.json();
  },

  /* connect with a token: find our gist or create it */
  async connect(token) {
    this.cfg = { token: token.trim() };
    try {
      const me = await this.api('/user');
      this.cfg.login = me.login;
      let gistId = null;
      for (let page = 1; page <= 5 && !gistId; page++) {
        const list = await this.api(`/gists?per_page=100&page=${page}`);
        const g = list.find(x => x.files && x.files[this.FILE]);
        if (g) gistId = g.id;
        if (list.length < 100) break;
      }
      if (!gistId) {
        const g = await this.api('/gists', { method: 'POST', body: JSON.stringify({ description: 'CFA Mock Exams — progreso (privado)', public: false, files: { [this.FILE]: { content: this.payload() } } }) });
        gistId = g.id;
      }
      this.cfg.gistId = gistId;
      this.persist();
      await this.syncNow();
    } catch (e) { this.cfg = null; this.persist(); throw e; }
  },
  disconnect() { this.cfg = null; this.persist(); this.status = 'off'; this.paint(); },

  payload() {
    const d = Store.data;
    return JSON.stringify({ format: 'cfa-mocks-sync', v: 1, savedAt: d.savedAt || 0, attempts: d.attempts, current: d.current, topicOverrides: d.topicOverrides, prefs: d.prefs, deleted: d.deleted || [] });
  },

  async pull() {
    const g = await this.api('/gists/' + this.cfg.gistId);
    const f = g.files[this.FILE];
    if (!f) return null;
    let txt = f.content;
    if (f.truncated) txt = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    try { return JSON.parse(txt); } catch (e) { return null; }
  },
  async push() {
    await this.api('/gists/' + this.cfg.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [this.FILE]: { content: this.payload() } } }) });
    this._lastPush = Date.now();
  },

  merge(remote) {
    if (!remote || remote.format !== 'cfa-mocks-sync') return false;
    const L = Store.data;
    const before = this.fingerprint(L);
    const deleted = [...new Set([...(L.deleted || []), ...(remote.deleted || [])])];
    const byId = new Map();
    [...(remote.attempts || []), ...L.attempts].forEach(a => { if (!deleted.includes(a.id)) byId.set(a.id, a); });
    const attempts = [...byId.values()].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
    const remoteNewer = (remote.savedAt || 0) > (L.savedAt || 0);
    const topicOverrides = remoteNewer ? { ...L.topicOverrides, ...remote.topicOverrides } : { ...remote.topicOverrides, ...L.topicOverrides };
    const prefs = remoteNewer ? (remote.prefs || L.prefs) : L.prefs;
    const done = new Set(attempts.map(a => a.id));
    const cands = [L.current, remote.current].filter(c => c && !done.has(c.id) && !deleted.includes(c.id));
    const current = cands.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] || null;
    Object.assign(L, { deleted, attempts, topicOverrides, prefs, current, savedAt: Math.max(L.savedAt || 0, remote.savedAt || 0) });
    Store.save(true);
    return this.fingerprint(L) !== before;
  },
  fingerprint(d) { return JSON.stringify([d.attempts.map(a => a.id), d.current && [d.current.id, d.current.savedAt], d.topicOverrides, d.deleted]); },

  /* pull + merge + push. Returns true if local data changed. */
  async syncNow() {
    if (!this.enabled()) return false;
    if (this._busy) return this._busy;
    this.status = 'syncing'; this.paint();
    this._busy = (async () => {
      try {
        const remote = await this.pull();
        const changed = remote ? this.merge(remote) : false;
        await this.push();
        this.cfg.lastSync = Date.now(); this.persist();
        this.status = 'ok'; this.error = '';
        return changed;
      } catch (e) {
        this.status = 'error'; this.error = e.message || 'Sin conexión';
        return false;
      } finally { this._busy = null; this.paint(); }
    })();
    return this._busy;
  },

  /* called after every local save: debounce pushes (max one per minute while in an exam) */
  schedule() {
    if (!this.enabled()) return;
    const inExam = !!Exam.root;
    if (inExam && this._timer) return; // keep the pending push; don't postpone it forever
    clearTimeout(this._timer);
    const wait = inExam ? Math.max(5000, 60000 - (Date.now() - this._lastPush)) : 3000;
    this._timer = setTimeout(() => { this._timer = null; this.syncNow(); }, wait);
  },
  async flush() { clearTimeout(this._timer); this._timer = null; if (this.enabled()) await this.syncNow(); },

  paint() {
    const el = document.querySelector('.sync-badge');
    if (!el) return;
    const map = { off: ['', 'Sin sincronizar'], syncing: ['busy', 'Sincronizando…'], ok: ['ok', 'Sincronizado'], error: ['bad', 'Error de sincronización'] };
    const [cls, txt] = map[this.status];
    el.className = 'sync-badge ' + cls;
    el.title = this.status === 'error' ? this.error : this.cfg?.lastSync ? 'Última sincronización: ' + new Date(this.cfg.lastSync).toLocaleString('es-ES') : '';
    el.innerHTML = `<i></i>${txt}`;
  },
};
