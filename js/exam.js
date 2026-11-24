/* Exam engine: Prometric-style delivery for one mock (2 sessions + optional break). */
const CANDIDATE = 'ALONSO DEL OLMO Felipe';

const THEMES = [
  { id: null, label: 'Default Colour Scheme' },
  { tx: '#000000', bg: '#FAFAC8', label: 'Black Text with Cream Background' },
  { tx: '#000099', bg: '#FFFFFF', label: 'Blue Text with White Background' },
  { tx: '#000000', bg: '#FFFF00', label: 'Black Text with Yellow Background' },
  { tx: '#000000', bg: '#FFFFFF', label: 'Black Text with White Background' },
  { tx: '#FFFF00', bg: '#000000', label: 'Yellow Text with Black Background' },
  { tx: '#9898FE', bg: '#000000', label: 'Light Blue Text with Black Background' },
  { tx: '#000000', bg: '#AEFC92', label: 'Black Text with Light Green Background' },
  { tx: '#000000', bg: '#F9ADDE', label: 'Black Text with Light Magenta Background' },
];
const BG_SWATCHES = ['#FAFAC8', '#000000', '#FFFFFF', '#FFFF00', '#AFEAFF', '#F9ADDE', '#AEFC92'];
const TX_SWATCHES = ['#000000', '#818386', '#FFFFFF', '#FAFAC8', '#000099', '#9898FE', '#FFFF00'];

const Exam = {
  root: null, cur: null, qs: null, tick: null, lastTs: 0, pinned: false,
  reviewFilters: { un: false, at: false, fl: false },
  onExit: null,

  /* ---------- lifecycle ---------- */
  newAttempt(mock) {
    Store.data.current = {
      id: 'a' + Date.now(), mock, startedAt: new Date().toISOString(),
      session: 1, phase: 'start', timerMode: 'section', done: {},
      ...this.blankSession(),
    };
    Store.save();
  },
  blankSession() {
    return {
      idx: 0, remaining: SESSION_SECONDS, alerts: {},
      ans: Array(Q_PER_SESSION).fill(-1), struck: Array.from({ length: Q_PER_SESSION }, () => [0, 0, 0]),
      flag: Array(Q_PER_SESSION).fill(0), hl: {}, qt: Array(Q_PER_SESSION).fill(0),
    };
  },
  open(onExit) {
    this.onExit = onExit;
    this.cur = Store.data.current;
    if (!this.cur) return;
    this.qs = getQuestions(this.cur.mock, this.cur.session);
    this.buildShell();
    this.applyTheme();
    this.render();
  },
  close() {
    this.stopTimer();
    document.removeEventListener('keydown', this.keyHandler);
    if (this.root) this.root.remove();
    this.root = null;
  },
  save() { Store.data.current = this.cur; Store.save(); },

  /* ---------- timer ---------- */
  startTimer() {
    this.stopTimer();
    this.lastTs = performance.now();
    this.tick = setInterval(() => this.onTick(), 250);
  },
  stopTimer() { if (this.tick) clearInterval(this.tick); this.tick = null; },
  onTick() {
    const now = performance.now();
    const dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    const c = this.cur;
    if (c.phase === 'exam') {
      c.remaining -= dt;
      c.qt[c.idx] += dt;
      for (const m of [30, 15, 5]) {
        if (!c.alerts[m] && c.remaining <= m * 60 && c.remaining > m * 60 - 60) { c.alerts[m] = 1; this.showAlert(m); }
      }
      if (c.remaining <= 0) { c.remaining = 0; this.timeExpired(); return; }
      this.updateTimer();
    } else if (c.phase === 'break') {
      c.breakRemaining -= dt;
      if (c.breakRemaining <= 0) { c.breakRemaining = 0; this.endBreak(); return; }
      const v = this.root.querySelector('.break-timer .val'); if (v) v.textContent = hms(c.breakRemaining);
    }
    if (!this._saveAcc || now - this._saveAcc > 3000) { this._saveAcc = now; this.save(); }
  },

  /* ---------- shell ---------- */
  buildShell() {
    if (this.root) this.root.remove();
    const r = document.createElement('div');
    r.className = 'exam-root';
    r.innerHTML = `
    <div class="tv">
      <header class="ex-header">
        <div class="ex-details"><p class="q-title"></p><p class="s-title"></p></div>
        <div class="ex-timer">
          <button class="timer-button" type="button"><span class="clock-ico">${icon('clock')}</span><span class="lbl"></span><span class="val"></span></button>
          <div class="timer-alert"><p><span class="msg"></span>${icon('close')}</p></div>
        </div>
        <div class="ex-actions">
          <div class="ex-progress"><div class="track"><div class="bar" style="width:0%"></div></div><div class="ttl">Progress <span class="pc">0%</span></div></div>
          <button class="finish-button" type="button">Finish Test</button>
        </div>
      </header>
      <div class="ex-info"><p><strong>Test:</strong> <span class="test-name"></span></p><p><strong>Candidate</strong>: ${CANDIDATE}</p></div>
      <div class="ex-content">
        <nav class="q-nav">
          <button class="nav-arrow up" type="button" aria-label="Scroll up">${icon('caretUp')}</button>
          <div class="nav-scroll"><ul class="main-nav-list"></ul></div>
          <button class="nav-arrow down" type="button" aria-label="Scroll down">${icon('caretDown')}</button>
        </nav>
        <div class="content-container"><div class="content-holder"><div class="item"></div>
          <button class="hl-btn add" type="button" title="Highlight selected text">${icon('pen')}</button>
          <button class="hl-btn rem" type="button" title="Remove highlight text">${icon('eraser')}</button>
        </div></div>
      </div>
      <footer class="ex-footer">
        <div class="left-bar">
          <button class="icon-btn pref-open" type="button" data-tip="Preferences">${icon('gear')}</button>
          <button class="icon-btn review-open" type="button" data-tip="Section Review">${gridIcon()}</button>
          <button class="icon-btn help-open" type="button" data-tip="Help">${icon('help')}</button>
        </div>
        <div class="right-bar">
          <button class="flat-btn flag-btn" type="button" data-tip="Flag">${icon('flag')}</button>
          <button class="flat-btn back" type="button">${icon('chevL')}<span>Back</span></button>
          <button class="flat-btn next" type="button"><span>Next</span>${icon('chevR')}</button>
        </div>
      </footer>
      <div class="side-panel review-panel">
        <div class="panel-head"><h2>Section Review</h2>
          <button class="round-btn pin" type="button" title="Lock panel">${icon('unlock')}</button>
          <button class="round-btn x" type="button" title="Close Panel">${icon('close')}</button></div>
        <div class="filter-block">
          <div><h3>Filter by:</h3>
            <label class="chk"><input type="checkbox" data-f="un"><span class="fake"></span><span class="t">Unattempted</span></label>
            <label class="chk"><input type="checkbox" data-f="at"><span class="fake"></span><span class="t">Attempted</span></label>
            <label class="chk"><input type="checkbox" data-f="fl"><span class="fake"></span><span class="t">Flagged</span></label>
          </div>
          <button class="clear-btn" type="button" disabled>Clear</button>
        </div>
        <div class="filter-content"></div>
      </div>
      <div class="side-panel pref-panel">
        <div class="panel-head"><h2>Colour Preferences</h2><button class="round-btn x" type="button" title="Close Panel">${icon('close')}</button></div>
        <div class="pref-body"></div>
        <div class="pref-foot"><button class="flat-btn ok" type="button">OK</button><button class="flat-btn cancel" type="button">Cancel</button></div>
      </div>
    </div>`;
    document.body.appendChild(r);
    this.root = r;
    this.bind();
  },

  $(s) { return this.root.querySelector(s); },

  bind() {
    const R = this.root;
    this.$('.next').onclick = () => this.go(this.cur.idx + 1);
    this.$('.back').onclick = () => this.go(this.cur.idx - 1);
    this.$('.flag-btn').onclick = () => this.toggleFlag();
    this.$('.finish-button').onclick = () => this.confirmFinish();
    this.$('.timer-button').onclick = () => { this.cur.timerMode = this.cur.timerMode === 'section' ? 'exam' : 'section'; this.updateTimer(); this.save(); };
    this.$('.timer-alert').onclick = () => this.$('.timer-alert').classList.remove('show');
    this.$('.review-open').onclick = () => this.toggleReview();
    this.$('.review-panel .x').onclick = () => this.closeReview();
    this.$('.review-panel .pin').onclick = () => { this.pinned = !this.pinned; this.$('.review-panel .pin').innerHTML = icon(this.pinned ? 'lock' : 'unlock'); };
    R.querySelectorAll('.filter-block input').forEach(cb => cb.onchange = () => { this.reviewFilters[cb.dataset.f] = cb.checked; this.renderReview(); });
    this.$('.clear-btn').onclick = () => { this.reviewFilters = { un: false, at: false, fl: false }; R.querySelectorAll('.filter-block input').forEach(cb => cb.checked = false); this.renderReview(); };
    this.$('.pref-open').onclick = () => this.openPrefs();
    this.$('.pref-panel .x').onclick = () => this.closePrefs();
    this.$('.pref-panel .cancel').onclick = () => this.closePrefs();
    this.$('.pref-panel .ok').onclick = () => { Store.data.prefs.theme = this.pendingTheme || null; Store.save(); this.applyTheme(); this.closePrefs(); };
    this.$('.help-open').onclick = () => this.help();
    // nav scrolling
    const sc = this.$('.nav-scroll');
    this.$('.nav-arrow.up').onclick = () => { sc.scrollTop = Math.max(0, Math.round(sc.scrollTop / 28) - 10) * 28; this.updateArrows(); };
    this.$('.nav-arrow.down').onclick = () => { sc.scrollTop = (Math.round(sc.scrollTop / 28) + 10) * 28; this.updateArrows(); };
    sc.addEventListener('wheel', e => { sc.scrollTop = (Math.round(sc.scrollTop / 28) + (e.deltaY > 0 ? 3 : -3)) * 28; this.updateArrows(); e.preventDefault(); }, { passive: false });
    // options
    const item = this.$('.item');
    item.addEventListener('click', e => {
      const o = e.target.closest('.opt'); if (o) { this.choose(+o.dataset.i); return; }
      const m = e.target.closest('mark.hl'); if (m) { this.showRemoveHl(m); }
    });
    item.addEventListener('contextmenu', e => {
      const o = e.target.closest('.opt'); if (!o) return;
      e.preventDefault(); this.toggleStrike(+o.dataset.i);
    });
    // highlighting
    this.$('.content-holder').addEventListener('mouseup', e => setTimeout(() => this.onSelect(e), 0));
    this.$('.content-holder').addEventListener('scroll', () => this.hideHlBtns());
    this.$('.hl-btn.add').onmousedown = e => e.preventDefault();
    this.$('.hl-btn.add').onclick = () => this.applyHl();
    this.$('.hl-btn.rem').onclick = () => this.removeHl();
    this.keyHandler = e => {
      if (!this.root) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
        e.preventDefault();
        if (confirm('¿Salir al inicio? El examen queda guardado y el tiempo se para hasta que vuelvas.')) {
          this.save(); this.close(); this.onExit && this.onExit({});
        }
        return;
      }
      if (this.cur.phase !== 'exam' || this.root.querySelector('.modal-backdrop')) return;
      if (e.key === 'Escape') { this.closeReview(true); this.closePrefs(); }
    };
    document.addEventListener('keydown', this.keyHandler);
  },

  /* ---------- rendering ---------- */
  render() {
    const c = this.cur;
    this.$('.test-name').textContent = `CFA Level I Mock Exam ${c.mock}`;
    this.$('.s-title').innerHTML = `<strong>Section:</strong> Session ${c.session}`;
    this.root.querySelectorAll('.start-overlay,.break-overlay').forEach(n => n.remove());
    const showChrome = c.phase === 'exam';
    this.$('.q-nav').style.visibility = showChrome ? 'visible' : 'hidden';
    this.$('.right-bar').style.visibility = showChrome ? 'visible' : 'hidden';
    this.$('.finish-button').disabled = !showChrome;
    this.$('.finish-button').style.opacity = showChrome ? '' : '.65';
    this.$('.review-open').disabled = !showChrome;
    if (c.phase === 'start') return this.renderStart();
    if (c.phase === 'break') return this.renderBreak();
    this.buildNav();
    this.renderQuestion();
    this.updateTimer();
    this.updateProgress();
    this.startTimer();
  },

  renderStart() {
    const c = this.cur;
    this.stopTimer();
    this.$('.q-title').innerHTML = `<strong>Page:</strong> 1`;
    this.updateTimer();
    this.updateProgress();
    const ov = document.createElement('div');
    ov.className = 'start-overlay';
    ov.innerHTML = `
      <div class="ex-header" style="visibility:hidden"></div><div class="ex-info" style="visibility:hidden"></div>
      <div class="start-body">
        <h1>CFA Level I Mock Exam ${c.mock} &ndash; Session ${c.session}</h1>
        <p>This session contains <b>90 multiple-choice questions</b>. You have <b>2 hours 15 minutes</b> to complete it.</p>
        ${c.session === 1
          ? `<p>After you finish Session 1 you may take an <b>optional break of up to 30 minutes</b> before Session 2.</p>`
          : `<p>This is the final session of the exam.</p>`}
        <p>Click on an option to select it; click it again to unselect it. Right-click an option to strike it out. Use the <b>Flag</b> button to mark a question for review and the grid icon to open the Section Review.</p>
        <p>You will not earn or lose points for an unanswered question or incorrect answer. Once you finish the section you may not return to it.</p>
        <p><b>Click the "Start the Test" button to begin.</b></p>
      </div>
      <footer class="ex-footer"><div class="left-bar"></div><div class="right-bar"><button class="flat-btn start" type="button"><span>Start the Test</span>${icon('chevR')}</button></div></footer>`;
    ov.querySelector('.ex-header').remove(); ov.querySelector('.ex-info').remove();
    // place overlay over content + footer only
    ov.style.top = '82px';
    this.$('.tv').appendChild(ov);
    ov.querySelector('.start').onclick = () => { c.phase = 'exam'; this.save(); this.render(); };
  },

  renderBreak() {
    const c = this.cur;
    const ov = document.createElement('div');
    ov.className = 'break-overlay';
    ov.innerHTML = `<div class="break-panel"><div class="break-info">
        <h2>Optional Break</h2>
        <p>Session 1 is complete. You may take a break of up to 30 minutes before Session 2 begins.</p>
        <p>Session 2 will start automatically when the break time runs out.</p>
        <div class="break-timer">${icon('clock')}<span class="lbl">Break Time Remaining</span><span class="val">${hms(c.breakRemaining)}</span></div>
        <div class="break-buttons"><button class="break-button end" type="button">${icon('play')}<span>End Break &amp; Continue</span></button></div>
      </div></div>`;
    this.root.appendChild(ov);
    ov.querySelector('.end').onclick = () => this.endBreak();
    this.startTimer();
  },

  buildNav() {
    const ul = this.$('.main-nav-list');
    ul.innerHTML = this.qs.map((_, i) => `<li><button class="nav-button" type="button" data-i="${i}"><span class="n">${i + 1}</span>${icon('flag', 'fl')}</button></li>`).join('');
    ul.onclick = e => { const b = e.target.closest('.nav-button'); if (b) this.go(+b.dataset.i); };
    this.updateNav();
  },
  navState(b, i) {
    const c = this.cur;
    b.classList.toggle('nav-active', i === c.idx);
    b.classList.toggle('nav-done', c.ans[i] >= 0);
    b.classList.toggle('nav-flagged', !!c.flag[i]);
  },
  updateNav() {
    this.root.querySelectorAll('.main-nav-list .nav-button').forEach((b, i) => this.navState(b, i));
    // keep current visible
    const sc = this.$('.nav-scroll');
    const b = this.root.querySelectorAll('.main-nav-list .nav-button')[this.cur.idx];
    if (b) {
      const i = this.cur.idx, rows = Math.floor(sc.clientHeight / 28);
      const first = Math.round(sc.scrollTop / 28);
      if (i < first) sc.scrollTop = i * 28;
      else if (i >= first + rows) sc.scrollTop = (i - rows + 1) * 28;
      else sc.scrollTop = first * 28;
    }
    this.updateArrows();
  },
  updateArrows() {
    const sc = this.$('.nav-scroll');
    const over = sc.scrollHeight > sc.clientHeight + 2;
    this.$('.nav-arrow.up').style.display = over ? '' : 'none';
    this.$('.nav-arrow.down').style.display = over ? '' : 'none';
    this.$('.nav-arrow.up').disabled = sc.scrollTop <= 0;
    this.$('.nav-arrow.down').disabled = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
  },

  renderQuestion() {
    const c = this.cur, i = c.idx, q = this.qs[i];
    this.hideHlBtns();
    this.$('.q-title').innerHTML = `<strong>Question:</strong> ${i + 1}`;
    const stem = c.hl[i] || q.stem;
    const opts = q.o.map((o, k) => {
      const cls = ['opt']; if (c.ans[i] === k) cls.push('sel'); if (c.struck[i][k]) cls.push('struck');
      return `<div class="${cls.join(' ')}" data-i="${k}" role="radio" aria-checked="${c.ans[i] === k}"><div class="letter">${'ABC'[k]}</div><div class="box">${o}</div></div>`;
    }).join('');
    this.$('.item').innerHTML = `<div class="stem">${stem}</div><div class="answer-options">${opts}</div>`;
    this.$('.content-holder').scrollTop = 0;
    this.$('.back').disabled = i === 0;
    this.$('.next').disabled = i === this.qs.length - 1;
    this.updateFlagBtn();
  },

  updateFlagBtn() {
    const on = !!this.cur.flag[this.cur.idx];
    const b = this.$('.flag-btn');
    b.classList.toggle('on', on);
    b.dataset.tip = on ? 'Unflag' : 'Flag';
  },
  updateTimer() {
    const c = this.cur;
    const lbl = this.$('.timer-button .lbl'), val = this.$('.timer-button .val');
    if (c.timerMode === 'exam') {
      const rest = c.session === 1 ? SESSION_SECONDS : 0;
      lbl.textContent = 'Exam Time Remaining';
      val.textContent = hms((c.phase === 'start' ? SESSION_SECONDS : c.remaining) + rest);
    } else {
      lbl.textContent = 'Section Time Remaining';
      val.textContent = hms(c.phase === 'start' ? SESSION_SECONDS : c.remaining);
    }
  },
  updateProgress() {
    const done = this.cur.ans.filter(a => a >= 0).length;
    const p = Math.round((100 * done) / Q_PER_SESSION);
    this.$('.ex-progress .bar').style.width = p + '%';
    this.$('.ex-progress .pc').textContent = p + '%';
  },
  showAlert(m) {
    const a = this.$('.timer-alert');
    a.querySelector('.msg').textContent = `${m} minutes remaining`;
    a.classList.add('show');
  },

  /* ---------- interactions ---------- */
  go(i) {
    if (i < 0 || i >= this.qs.length || this.cur.phase !== 'exam') return;
    this.cur.idx = i;
    this.renderQuestion();
    this.updateNav();
    if (!this.pinned) this.closeReview();
    else this.renderReview();
    this.save();
  },
  choose(k) {
    const c = this.cur, i = c.idx;
    if (c.struck[i][k]) c.struck[i][k] = 0; // selecting a struck option cancels the strikeout
    c.ans[i] = c.ans[i] === k ? -1 : k;
    this.root.querySelectorAll('.opt').forEach((o, j) => {
      o.classList.toggle('sel', c.ans[i] === j);
      o.classList.toggle('struck', !!c.struck[i][j]);
      o.setAttribute('aria-checked', c.ans[i] === j);
    });
    this.updateNav(); this.updateProgress(); this.save();
  },
  toggleStrike(k) {
    const c = this.cur, i = c.idx;
    c.struck[i][k] = c.struck[i][k] ? 0 : 1;
    this.root.querySelectorAll('.opt')[k].classList.toggle('struck', !!c.struck[i][k]);
    this.save();
  },
  toggleFlag() {
    const c = this.cur;
    c.flag[c.idx] = c.flag[c.idx] ? 0 : 1;
    this.updateFlagBtn(); this.updateNav(); this.renderReview(); this.save();
  },

  /* ---------- highlighting ---------- */
  hideHlBtns() { this.root?.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('show')); this._remTarget = null; },
  placeBtn(btn, rect) {
    const holder = this.$('.content-holder');
    const hr = holder.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - hr.left - 18;
    const y = rect.bottom - hr.top + holder.scrollTop + 10;
    btn.style.left = Math.max(4, Math.min(x, holder.clientWidth - 44)) + 'px';
    btn.style.top = y + 'px';
    btn.classList.add('show');
  },
  onSelect(e) {
    if (!this.root || e.target.closest('.hl-btn')) return;
    const sel = window.getSelection();
    const stem = this.$('.item .stem');
    if (!stem || !sel || sel.isCollapsed || !sel.rangeCount) { if (!e.target.closest('mark.hl')) this.hideHlBtns(); return; }
    const range = sel.getRangeAt(0);
    if (!stem.contains(range.commonAncestorContainer)) { this.hideHlBtns(); return; }
    this._range = range.cloneRange();
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] || range.getBoundingClientRect();
    this.$('.hl-btn.rem').classList.remove('show');
    this.placeBtn(this.$('.hl-btn.add'), last);
  },
  applyHl() {
    const range = this._range; if (!range) return;
    const stem = this.$('.item .stem');
    const id = 'h' + Date.now();
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) { const n = walker.currentNode; if (range.intersectsNode(n) && n.nodeValue.trim() !== '' || (range.intersectsNode(n) && n === range.startContainer)) nodes.push(n); }
    nodes.forEach(n => {
      if (n.parentNode.closest && n.parentNode.closest('mark.hl')) return;
      let start = 0, end = n.nodeValue.length;
      if (n === range.startContainer) start = range.startOffset;
      if (n === range.endContainer) end = range.endOffset;
      if (end <= start) return;
      const mid = n.splitText(start); mid.splitText(end - start);
      const m = document.createElement('mark'); m.className = 'hl'; m.dataset.h = id;
      mid.parentNode.insertBefore(m, mid); m.appendChild(mid);
    });
    window.getSelection().removeAllRanges();
    this.cur.hl[this.cur.idx] = stem.innerHTML;
    this.hideHlBtns(); this.save();
  },
  showRemoveHl(m) {
    const sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    this._remTarget = m.dataset.h;
    this.$('.hl-btn.add').classList.remove('show');
    this.placeBtn(this.$('.hl-btn.rem'), m.getBoundingClientRect());
  },
  removeHl() {
    const id = this._remTarget; if (!id) return;
    const stem = this.$('.item .stem');
    stem.querySelectorAll(`mark.hl[data-h="${id}"]`).forEach(m => { m.replaceWith(...m.childNodes); });
    stem.normalize();
    this.cur.hl[this.cur.idx] = stem.innerHTML;
    this.hideHlBtns(); this.save();
  },

  /* ---------- section review ---------- */
  toggleReview() { const p = this.$('.review-panel'); if (p.classList.contains('open')) this.closeReview(true); else { this.closePrefs(); this.renderReview(); p.classList.add('open'); } },
  closeReview(force) { if (!this.root) return; if (this.pinned && !force) return; this.$('.review-panel').classList.remove('open'); if (force) { this.pinned = false; this.$('.review-panel .pin').innerHTML = icon('unlock'); } },
  renderReview() {
    if (!this.root) return;
    const c = this.cur, f = this.reviewFilters, any = f.un || f.at || f.fl;
    this.$('.clear-btn').disabled = !any;
    const items = this.qs.map((_, i) => i).filter(i => !any || (f.un && c.ans[i] < 0) || (f.at && c.ans[i] >= 0) || (f.fl && c.flag[i]));
    const box = this.$('.filter-content');
    box.innerHTML = items.length ? items.map(i => `<button class="nav-button" type="button" data-i="${i}"><span class="n">${i + 1}</span>${icon('flag', 'fl')}</button>`).join('')
      : `<div class="empty">No questions match the selected filter.</div>`;
    box.querySelectorAll('.nav-button').forEach(b => { const i = +b.dataset.i; this.navState(b, i); b.classList.remove('nav-active'); if (i === c.idx) b.style.outline = '2px solid #333'; b.onclick = () => this.go(i); });
  },

  /* ---------- colour preferences ---------- */
  applyTheme() {
    const t = Store.data.prefs.theme;
    this.root.classList.toggle('themed', !!t);
    if (t) { this.root.style.setProperty('--th-tx', t.tx); this.root.style.setProperty('--th-bg', t.bg); }
  },
  openPrefs() {
    this.closeReview(true);
    this.pendingTheme = Store.data.prefs.theme;
    this.prefTab = 'themes';
    this.renderPrefs();
    this.$('.pref-panel').classList.add('open');
  },
  closePrefs() { this.root && this.$('.pref-panel').classList.remove('open'); },
  renderPrefs() {
    const p = this.pendingTheme;
    const isActive = t => (!t.tx && !p) || (p && t.tx === p.tx && t.bg === p.bg);
    let body = `<div class="pref-tabs"><button type="button" data-tab="themes" class="${this.prefTab === 'themes' ? 'on' : ''}">Colour Schemes</button><button type="button" data-tab="custom" class="${this.prefTab === 'custom' ? 'on' : ''}">Custom Colours</button></div>`;
    if (this.prefTab === 'themes') {
      body += `<div class="theme-picker">${THEMES.map((t, k) => `<button type="button" data-k="${k}" class="${isActive(t) ? 'active' : ''}" style="${t.tx ? `color:${t.tx};background:${t.bg}` : 'background:#fff;color:#333'}">${t.label}</button>`).join('')}</div>`;
    } else {
      const cur = p || { tx: '#000000', bg: '#FFFFFF' };
      body += `<div class="custom-pick"><div class="tab-title">Background Colour</div><div class="swatches bg">${BG_SWATCHES.map(h => `<button type="button" data-h="${h}" style="background:${h}" class="${cur.bg === h ? 'active' : ''}" title="${h}"></button>`).join('')}</div>
        <div class="tab-title">Text Colour</div><div class="swatches tx">${TX_SWATCHES.map(h => `<button type="button" data-h="${h}" style="background:${h}" class="${cur.tx === h ? 'active' : ''}" title="${h}"></button>`).join('')}</div></div>`;
    }
    const pb = this.$('.pref-body');
    pb.innerHTML = body;
    pb.querySelectorAll('.pref-tabs button').forEach(b => b.onclick = () => { this.prefTab = b.dataset.tab; this.renderPrefs(); });
    pb.querySelectorAll('.theme-picker button').forEach(b => b.onclick = () => { const t = THEMES[+b.dataset.k]; this.pendingTheme = t.tx ? { tx: t.tx, bg: t.bg } : null; this.renderPrefs(); });
    pb.querySelectorAll('.swatches button').forEach(b => b.onclick = () => {
      const cur = this.pendingTheme ? { ...this.pendingTheme } : { tx: '#000000', bg: '#FFFFFF' };
      const kind = b.parentElement.classList.contains('bg') ? 'bg' : 'tx';
      if ((kind === 'bg' && cur.tx === b.dataset.h) || (kind === 'tx' && cur.bg === b.dataset.h)) return;
      cur[kind] = b.dataset.h; this.pendingTheme = cur; this.renderPrefs();
    });
  },

  /* ---------- dialogs ---------- */
  modal({ title, body, buttons, wide }) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog"><div class="modal-header"><div class="modal-title">${title}</div><button class="x" type="button" aria-label="Close">${icon('close')}</button></div>
      <div class="modal-body">${body}</div><div class="modal-actions">${buttons.map((b, k) => `<button class="flat-btn ${b.cls || ''}" type="button" data-k="${k}">${b.label}</button>`).join('')}</div></div>`;
    this.root.appendChild(bd);
    const close = () => bd.remove();
    bd.querySelector('.x').onclick = () => { close(); buttons.find(b => b.cancel)?.fn?.(); };
    bd.querySelectorAll('.modal-actions button').forEach(btn => btn.onclick = () => { close(); buttons[+btn.dataset.k].fn?.(); });
    return bd;
  },
  confirmFinish() {
    if (this.cur.phase !== 'exam') return;
    const c = this.cur;
    const un = c.ans.filter(a => a < 0).length, fl = c.flag.filter(Boolean).length;
    let extra = '';
    if (un) extra += `<p>You have <b>${un}</b> unanswered question${un > 1 ? 's' : ''}.</p>`;
    if (fl) extra += `<p>You have <b>${fl}</b> flagged question${fl > 1 ? 's' : ''}.</p>`;
    this.modal({
      title: 'Finish Test',
      body: `${icon('warn', 'warn')}${extra}<p>Are you sure you want to finish this section?</p><p>Once you leave a section, you may not return.</p>`,
      buttons: [{ label: 'Finish', fn: () => this.finishSession() }, { label: 'Cancel', cls: 'secondary', cancel: true }],
    });
  },
  timeExpired() {
    this.stopTimer();
    this.save();
    this.modal({ title: 'Time Expired', body: `<p>The time for this section has expired.</p><p>Your answers have been submitted.</p>`, buttons: [{ label: 'OK', fn: () => this.finishSession() }] });
  },
  help() {
    this.modal({
      title: 'Help', wide: true,
      body: `<ul class="help-list">
        <li><b>Answer:</b> click an option to select it (it turns darker); click it again to unselect.</li>
        <li><b>Strikeout:</b> right-click an option to strike it out; right-click again to remove it. Left-click a struck option to select it.</li>
        <li><b>Highlight:</b> select text in the question and click the highlighter button. Click highlighted text and the button again to remove it.</li>
        <li><b>Flag:</b> use the Flag button at the bottom to mark a question for review.</li>
        <li><b>Section Review:</b> the grid icon shows every question; filter by unattempted, attempted or flagged. Lock it open with the padlock.</li>
        <li><b>Timer:</b> click the clock to switch between Section and Exam time remaining. Alerts appear at 30, 15 and 5 minutes.</li>
        <li><b>Colour scheme:</b> gear icon at the bottom left.</li>
        <li><b>Finish Test:</b> ends the current session. You cannot return to it.</li></ul>
        <p style="text-align:left;margin-top:14px;font-size:14px;color:#555">Solo en este simulador: <b>Ctrl + Shift + Q</b> guarda el examen y vuelve al inicio (el tiempo se para hasta que lo retomes).</p>`,
      buttons: [{ label: 'Close' }],
    });
  },

  /* ---------- flow ---------- */
  finishSession() {
    this.stopTimer();
    const c = this.cur;
    c.done[c.session] = { ans: c.ans, qt: c.qt.map(x => Math.round(x * 10) / 10), flag: c.flag, used: Math.round(SESSION_SECONDS - c.remaining) };
    this.closeReview(true); this.closePrefs();
    if (c.session === 1) {
      Object.assign(c, this.blankSession(), { session: 2, phase: 'break', breakRemaining: BREAK_SECONDS });
      this.qs = getQuestions(c.mock, 2);
      this.save();
      this.render();
    } else {
      const att = { id: c.id, mock: c.mock, startedAt: c.startedAt, finishedAt: new Date().toISOString(), s: c.done };
      Store.data.attempts.push(att);
      Store.data.current = null;
      Store.save();
      this.close();
      this.onExit && this.onExit({ finished: att.id });
    }
  },
  endBreak() {
    this.stopTimer();
    const c = this.cur;
    c.phase = 'start';
    this.save();
    this.render();
  },
};
