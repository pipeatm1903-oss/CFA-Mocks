/* App shell: home (mock board), results/review and performance tracker. */
const App = {
  el: null,
  async init() {
    Store.load();
    Sync.load();
    this.el = document.getElementById('app');
    await loadBank();
    window.addEventListener('hashchange', () => this.route());
    this.route();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') Sync.flush();
      else if (!Exam.root) this.pullAndRefresh();
    });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  },
  async pullAndRefresh() {
    if (!Sync.enabled()) return;
    const changed = await Sync.syncNow();
    if (changed && !Exam.root && BANK) this.route();
  },
  route() {
    if (Exam.root) return;
    if (Sync.enabled() && Date.now() - (this._lastPull || 0) > 15000) { this._lastPull = Date.now(); setTimeout(() => this.pullAndRefresh(), 0); }
    const h = location.hash || '#/';
    if (!BANK) return this.renderImport();
    if (h.startsWith('#/tracker')) return this.renderTracker();
    if (h.startsWith('#/result/')) return this.renderResult(h.split('/')[2]);
    return this.renderHome();
  },
  shell(active, inner) {
    this.el.innerHTML = `
      <div class="topbar"><div class="wrap">
        <div class="brand"><div class="mark">L I</div><div><div class="t1">CFA Mock Exams 2026</div><div class="t2">Level I · Simulador Prometric</div></div></div>
        <nav class="tabs">
          <button type="button" data-h="#/" class="${active === 'home' ? 'on' : ''}">${icon('home')} Mock Exams</button>
          <button type="button" data-h="#/tracker" class="${active === 'tracker' ? 'on' : ''}">${icon('chart')} Performance Tracker</button>
        </nav><span class="sync-badge"></span></div></div>
      <main class="wrap">${inner}</main>`;
    Sync.paint();
    this.el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.h; });
    window.scrollTo(0, 0);
  },

  /* ---------------- import ---------------- */
  renderImport() {
    this.el.innerHTML = `
      <div class="topbar"><div class="wrap"><div class="brand"><div class="mark">L I</div><div><div class="t1">CFA Mock Exams 2026</div><div class="t2">Level I · Simulador Prometric</div></div></div></div></div>
      <main class="wrap"><div class="import" id="drop">
        <h2>Carga las preguntas de los mocks</h2>
        <p>Selecciona el archivo <b>mocks-cfa-2026.json</b>. Solo hace falta una vez: las preguntas se quedan guardadas en este ordenador y nunca se suben a internet.</p>
        <label class="btn">${icon('upload')} Elegir archivo<input type="file" accept=".json,application/json" hidden></label>
        <div class="err" hidden></div>
      </div></main>`;
    const inp = this.el.querySelector('input[type=file]'), drop = this.el.querySelector('#drop'), err = this.el.querySelector('.err');
    const handle = async f => {
      try { await importBank(f); this.route(); }
      catch (e) { err.hidden = false; err.textContent = e.message || 'No se pudo leer el archivo.'; }
    };
    inp.onchange = () => inp.files[0] && handle(inp.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]); };
  },

  /* ---------------- home ---------------- */
  mockStats(m) {
    const atts = Store.data.attempts.filter(a => a.mock === m);
    const ps = atts.map(a => attemptTotals(a).pct);
    return { n: atts.length, avg: ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : null, last: ps[ps.length - 1] };
  },
  renderHome() {
    const cur = Store.data.current;
    let banner = '';
    if (cur) {
      const where = cur.phase === 'break' ? 'en la pausa entre sesiones' : `Sesión ${cur.session} · ${cur.phase === 'start' ? 'sin empezar' : `${hms(cur.remaining)} restantes`}`;
      banner = `<div class="resume"><div><b>Mock Exam ${cur.mock} en curso</b> · ${where}</div>
        <div class="acts"><button class="btn" data-a="resume">${icon('play')} Continuar</button><button class="btn ondark" data-a="abandon">Abandonar</button></div></div>`;
    }
    const tiles = Array.from({ length: N_MOCKS }, (_, k) => {
      const m = k + 1, s = this.mockStats(m), inprog = cur && cur.mock === m;
      return `<button class="mock ${inprog ? 'inprog' : ''}" type="button" data-m="${m}">
        <span class="go">${icon('play')}</span>
        <span class="lab">${inprog ? 'En curso' : 'Mock Exam'}</span>
        <span class="num">${String(m).padStart(2, '0')}</span>
        <span class="meta"><span>Completado <b>${s.n}</b> ${s.n === 1 ? 'vez' : 'veces'}</span><span>Media <b>${s.avg == null ? '—' : pct(s.avg)}</b></span></span>
        <span class="meter">${s.avg == null ? '' : `<i style="width:${s.avg}%"></i>`}<span class="pass" title="70 %"></span></span>
      </button>`;
    }).join('');
    this.shell('home', `
      <div class="phead"><div><div class="eyebrow">CFA Level I · Febrero 2027</div><h1>Elige un mock</h1>
        <div class="sub">180 preguntas en 2 sesiones de 2 h 15 min, con pausa opcional de 30 min. La línea marca el 70 %.</div></div></div>
      ${banner}<div class="board">${tiles}</div>`);
    this.el.querySelectorAll('.mock').forEach(b => b.onclick = () => this.startMock(+b.dataset.m));
    const r = this.el.querySelector('[data-a=resume]'); if (r) r.onclick = async () => { r.disabled = true; await Sync.syncNow(); this.openExam(); };
    const a = this.el.querySelector('[data-a=abandon]');
    if (a) a.onclick = () => { if (confirm('¿Abandonar el mock en curso? Se perderán las respuestas de este intento.')) { Store.data.deleted.push(Store.data.current.id); Store.data.current = null; Store.save(); this.renderHome(); } };
  },
  startMock(m) {
    const cur = Store.data.current;
    if (cur) {
      if (cur.mock === m) return this.openExam();
      if (!confirm(`Tienes el Mock ${cur.mock} en curso. ¿Abandonarlo y empezar el Mock ${m}?`)) return;
      Store.data.deleted.push(cur.id);
    }
    Exam.newAttempt(m);
    this.openExam();
  },
  openExam() {
    this.el.innerHTML = '';
    Exam.open(res => {
      Sync.flush();
      if (res && res.finished) location.hash = '#/result/' + res.finished;
      else location.hash = '#/';
      this.route();
    });
  },

  /* ---------------- results / review ---------------- */
  renderResult(id) {
    const att = Store.data.attempts.find(a => a.id === id);
    if (!att) { location.hash = '#/tracker'; return; }
    const T = attemptTotals(att);
    const s1 = att.s[1] ? scoreSession(att.mock, 1, att.s[1].ans) : 0;
    const s2 = att.s[2] ? scoreSession(att.mock, 2, att.s[2].ans) : 0;
    const ts = attemptTopicStats(att);
    const pass = T.pct >= PASS_LINE;
    this.rv = this.rv && this.rv.id === id ? this.rv : { id, session: 1, filter: 'all', limit: 30 };
    this.shell('tracker', `
      <div class="phead"><div><div class="eyebrow">Corrección · ${fmtDate(att.finishedAt)}</div><h1>Mock Exam ${att.mock}</h1></div>
        <div><button class="btn ghost" data-a="back">${icon('chevL')} Volver</button></div></div>
      <div class="res-hero">
        <div class="first"><div class="k">Nota total</div><div class="big">${pct(T.pct)}</div>
          <div class="verdict">${icon(pass ? 'check' : 'warn')} ${pass ? 'Por encima del 70 %' : 'Por debajo del 70 %'}</div>
          <div class="d" style="color:#cfd6d9;margin-top:8px">${T.c} de ${T.n} correctas</div></div>
        <div><div class="k">Sesión 1</div><div class="mid">${pct((100 * s1) / 90)}</div><div class="d">${s1}/90 · ${hms(att.s[1]?.used || 0)}</div></div>
        <div><div class="k">Sesión 2</div><div class="mid">${pct((100 * s2) / 90)}</div><div class="d">${s2}/90 · ${hms(att.s[2]?.used || 0)}</div></div>
        <div><div class="k">Tiempo medio por pregunta</div><div class="mid">${mmss(T.secs / T.n)}</div><div class="d">Ritmo del examen real: 1:30</div></div>
      </div>
      <div class="panel"><h3>Nota por área</h3><div class="hint">Porcentaje de aciertos en cada área del temario en este intento.</div>${this.areaBars(ts)}</div>
      <div class="rv-bar"><div class="seg sess"></div><div class="seg filt"></div></div>
      <div id="qlist"></div>`);
    this.el.querySelector('[data-a=back]').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/tracker');
    this.renderReviewList(att);
  },
  renderReviewList(att) {
    const rv = this.rv, s = rv.session, ss = att.s[s];
    const qs = getQuestions(att.mock, s);
    const status = i => ss.ans[i] < 0 ? 'na' : ss.ans[i] === qs[i].c ? 'ok' : 'ko';
    const counts = { all: qs.length, ko: 0, na: 0, ok: 0, fl: 0 };
    qs.forEach((_, i) => { counts[status(i)]++; if (ss.flag[i]) counts.fl++; });
    this.el.querySelector('.seg.sess').innerHTML = [1, 2].map(k => `<button type="button" data-s="${k}" class="${s === k ? 'on' : ''}">Sesión ${k}</button>`).join('');
    const F = [['all', 'Todas'], ['ko', 'Incorrectas'], ['na', 'Sin responder'], ['ok', 'Correctas'], ['fl', 'Marcadas']];
    this.el.querySelector('.seg.filt').innerHTML = F.map(([k, l]) => `<button type="button" data-f="${k}" class="${rv.filter === k ? 'on' : ''}">${l}<span class="c">${counts[k]}</span></button>`).join('');
    this.el.querySelectorAll('.seg.sess button').forEach(b => b.onclick = () => { rv.session = +b.dataset.s; rv.limit = 30; this.renderReviewList(att); });
    this.el.querySelectorAll('.seg.filt button').forEach(b => b.onclick = () => { rv.filter = b.dataset.f; rv.limit = 30; this.renderReviewList(att); });
    const idx = qs.map((_, i) => i).filter(i => rv.filter === 'all' || (rv.filter === 'fl' ? ss.flag[i] : status(i) === rv.filter));
    const shown = idx.slice(0, rv.limit);
    const html = shown.map(i => {
      const q = qs[i], st = status(i), t = topicOf(att.mock, s, i);
      const pillTxt = { ok: 'Correcta', ko: 'Incorrecta', na: 'Sin responder' }[st];
      const opts = q.o.map((o, k) => {
        const isC = k === q.c, isU = ss.ans[i] === k;
        const tags = (isC ? `<span class="pill ok">${icon('check')} Respuesta correcta</span>` : '') + (isU ? `<span class="pill ${isC ? 'ok' : 'ko'}">Tu respuesta</span>` : '');
        return `<div class="ropt ${isC ? 'correct' : isU ? 'wrong' : ''}"><div class="lt">${'ABC'[k]}</div><div class="bx">${tags ? `<div class="tags">${tags}</div>` : ''}<div class="ans">${o}</div><div class="fb">${q.f[k]}</div></div></div>`;
      }).join('');
      const sel = `<select data-i="${i}">${SESSION_TOPICS[s].map(k => `<option value="${k}" ${k === t ? 'selected' : ''}>${TOPICS[k].short}</option>`).join('')}</select>`;
      return `<article class="qrev ${st}"><div class="qh"><span class="qn">Pregunta ${i + 1}</span><span class="pill ${st}">${pillTxt}</span>
        ${ss.flag[i] ? `<span class="flagged">${icon('flag')} Marcada</span>` : ''}
        <span class="qmeta"><span>${mmss(ss.qt[i] || 0)} en la pregunta</span>${sel}</span></div>
        <div class="qbody"><div class="stem">${q.stem}</div>${opts}</div></article>`;
    }).join('') || `<div class="empty-note">No hay preguntas en este filtro.</div>`;
    const list = this.el.querySelector('#qlist');
    list.innerHTML = html + (idx.length > shown.length ? `<div class="more"><button class="btn ghost" type="button">Mostrar más (${idx.length - shown.length} restantes)</button></div>` : '<div style="height:50px"></div>');
    const more = list.querySelector('.more button'); if (more) more.onclick = () => { rv.limit += 30; this.renderReviewList(att); };
    list.querySelectorAll('select').forEach(sl => sl.onchange = () => {
      const key = `${att.mock}-${s}-${sl.dataset.i}`;
      Store.data.topicOverrides[key] = sl.value;
      Store.save();
      const y = window.scrollY; this.renderResult(att.id); window.scrollTo(0, y);
    });
  },
  areaBars(ts, showN = true) {
    const rows = TOPIC_ORDER.filter(t => ts[t] && ts[t][1] > 0).map(t => {
      const [c, n] = ts[t], p = (100 * c) / n;
      return `<div class="arow" title="${TOPICS[t].name}: ${c}/${n}"><div class="nm">${TOPICS[t].short}</div>
        <div class="trk"><div class="fill" style="width:${p}%"></div><div class="p70"></div></div>
        <div class="val ${p < PASS_LINE ? 'low' : ''}">${Math.floor(p)} %${showN ? `<small>${c}/${n}</small>` : ''}</div></div>`;
    }).join('');
    return rows ? `<div class="areas">${rows}</div><div class="alegend"><span><i></i>Aciertos</span><span><i class="d"></i>Referencia 70 %</span><span style="color:var(--c-bad)">Rojo = por debajo del 70 %</span></div>` : `<div class="empty-note">Sin datos todavía.</div>`;
  },

  /* ---------------- tracker ---------------- */
  renderTracker() {
    const atts = [...Store.data.attempts].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
    const rows = atts.map(a => ({ a, T: attemptTotals(a), s1: a.s[1] ? scoreSession(a.mock, 1, a.s[1].ans) : 0, s2: a.s[2] ? scoreSession(a.mock, 2, a.s[2].ans) : 0 }));
    const n = rows.length;
    const avg = n ? rows.reduce((x, r) => x + r.T.pct, 0) / n : null;
    const best = n ? rows.reduce((m, r) => (r.T.pct > m.T.pct ? r : m), rows[0]) : null;
    const last = n ? rows[n - 1] : null;
    const secs = rows.reduce((x, r) => x + r.T.secs, 0), qn = rows.reduce((x, r) => x + r.T.n, 0);
    const agg = {}; TOPIC_ORDER.forEach(t => (agg[t] = [0, 0]));
    atts.forEach(a => { const ts = attemptTopicStats(a); TOPIC_ORDER.forEach(t => { agg[t][0] += ts[t][0]; agg[t][1] += ts[t][1]; }); });
    const weakest = TOPIC_ORDER.filter(t => agg[t][1]).sort((x, y) => agg[x][0] / agg[x][1] - agg[y][0] / agg[y][1]).slice(0, 3);
    const passed = rows.filter(r => r.T.pct >= PASS_LINE).length;

    const hist = rows.slice().reverse().map(r => `<tr class="click" data-id="${r.a.id}">
        <td>${fmtDate(r.a.finishedAt)}</td><td class="strong">Mock ${r.a.mock}</td>
        <td class="r">${pct((100 * r.s1) / 90)}</td><td class="r">${pct((100 * r.s2) / 90)}</td>
        <td class="r strong ${r.T.pct < PASS_LINE ? 'low' : 'ok'}">${pct(r.T.pct)}</td>
        <td class="r">${hms(r.T.secs)}</td><td class="r">${mmss(r.T.secs / r.T.n)}</td><td class="r">${icon('chevR')}</td></tr>`).join('');
    const perMock = Array.from({ length: N_MOCKS }, (_, k) => {
      const m = k + 1, mr = rows.filter(r => r.a.mock === m);
      if (!mr.length) return `<tr><td class="strong">Mock ${m}</td><td class="r">0</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>`;
      const ps = mr.map(r => r.T.pct), av = ps.reduce((x, y) => x + y, 0) / ps.length;
      return `<tr><td class="strong">Mock ${m}</td><td class="r">${mr.length}</td><td class="r ${av < PASS_LINE ? 'low' : 'ok'} strong">${pct(av)}</td><td class="r">${pct(Math.max(...ps))}</td><td class="r">${pct(ps[ps.length - 1])}</td></tr>`;
    }).join('');

    this.shell('tracker', `
      <div class="phead"><div><div class="eyebrow">Performance Tracker</div><h1>Tu evolución</h1>
        <div class="sub">${n ? `${n} ${n === 1 ? 'examen completado' : 'exámenes completados'} · ${passed} por encima del 70 %` : 'Todavía no has completado ningún mock.'}</div></div></div>
      <div class="kpis">
        <div class="kpi hero"><div class="k">Nota media</div><div class="v">${avg == null ? '—' : pct(avg)}</div><div class="d">de todos los intentos</div></div>
        <div class="kpi"><div class="k">Exámenes</div><div class="v">${n}</div><div class="d">${passed} ≥ 70 %</div></div>
        <div class="kpi"><div class="k">Mejor nota</div><div class="v">${best ? pct(best.T.pct) : '—'}</div><div class="d">${best ? 'Mock ' + best.a.mock : '&nbsp;'}</div></div>
        <div class="kpi"><div class="k">Última nota</div><div class="v">${last ? pct(last.T.pct) : '—'}</div><div class="d">${last ? 'Mock ' + last.a.mock : '&nbsp;'}</div></div>
        <div class="kpi"><div class="k">Tiempo / pregunta</div><div class="v">${qn ? mmss(secs / qn) : '—'}</div><div class="d">ritmo real: 1:30</div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h3>Evolución de la nota</h3><div class="hint">Nota total de cada mock completado, en orden. Línea discontinua: 70 %.</div><div class="chart" id="evo"></div></div>
        <div class="panel"><h3>Nota media por área</h3><div class="hint">${weakest.length ? `Áreas más flojas: <b>${weakest.map(t => TOPICS[t].short).join(', ')}</b>` : 'Acumulado de todos los intentos.'}</div>${this.areaBars(agg)}</div>
      </div>
      <div class="section-title">Historial</div>
      <div class="panel" style="padding:6px 12px 4px">${n ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Mock</th><th class="r">Sesión 1</th><th class="r">Sesión 2</th><th class="r">Total</th><th class="r">Tiempo</th><th class="r">Min/preg.</th><th></th></tr></thead><tbody>${hist}</tbody></table>` : '<div class="empty-note">Aquí aparecerá cada mock que termines. Pulsa una fila para ver su corrección.</div>'}</div>
      <div class="section-title">Por mock</div>
      <div class="panel" style="padding:6px 12px 4px"><table class="tbl"><thead><tr><th>Mock</th><th class="r">Intentos</th><th class="r">Media</th><th class="r">Mejor</th><th class="r">Último</th></tr></thead><tbody>${perMock}</tbody></table></div>
      <div class="section-title">Sincronización entre ordenadores</div>
      <div class="panel syncp">${Sync.enabled()
        ? `<div class="sync-on"><div><b>Conectado a GitHub</b> como <b>${esc(Sync.cfg.login || '')}</b>. Tu historial se guarda en un Gist secreto y se sincroniza solo entre tus ordenadores.<div class="hint">Las preguntas no se suben: solo tus respuestas, notas y preferencias.</div></div>
            <div class="acts"><button class="btn sm" data-a="syncnow">Sincronizar ahora</button><button class="btn ghost sm" data-a="unsync">Desconectar</button></div></div>`
        : `<p style="margin:0 0 10px">Para tener el mismo historial en el PC y en el portátil, conecta tu cuenta de GitHub con un token que solo tenga permiso <b>gist</b>. Hazlo en cada ordenador con el mismo token.</p>
           <ol class="steps"><li>En GitHub: <b>Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)</b>.</li>
             <li>Nombre: <i>CFA Mocks</i> · Expiration: <i>No expiration</i> (o 1 año) · marca solo la casilla <b>gist</b> → <b>Generate token</b>.</li>
             <li>Copia el token (empieza por <code>ghp_</code>), pégalo aquí y pulsa Conectar.</li></ol>
           <div class="tokrow"><input type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn" data-a="sync">Conectar</button></div><div class="err" hidden></div>`}</div>
      <div class="section-title">Datos</div>
      <div class="settings">
        <button class="btn ghost" data-a="exp">${icon('download')} Exportar copia de seguridad</button>
        <label class="btn ghost">${icon('upload')} Importar copia<input type="file" accept=".json" hidden data-a="imp"></label>
        <label class="btn ghost">${icon('book')} Recargar preguntas<input type="file" accept=".json" hidden data-a="bank"></label>
        <button class="btn danger" data-a="wipe">${icon('trash')} Borrar historial</button>
      </div>`);
    this.evoChart(this.el.querySelector('#evo'), rows);
    this.el.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { this.rv = null; location.hash = '#/result/' + tr.dataset.id; });
    const sb = this.el.querySelector('[data-a=sync]');
    if (sb) sb.onclick = async () => {
      const inp = this.el.querySelector('.tokrow input'), err = this.el.querySelector('.syncp .err');
      if (!inp.value.trim()) return;
      sb.disabled = true; sb.textContent = 'Conectando…'; err.hidden = true;
      try { await Sync.connect(inp.value); this.renderTracker(); }
      catch (e) { err.hidden = false; err.textContent = e.message; sb.disabled = false; sb.textContent = 'Conectar'; }
    };
    const sn = this.el.querySelector('[data-a=syncnow]');
    if (sn) sn.onclick = async () => { await Sync.syncNow(); this.renderTracker(); };
    const us = this.el.querySelector('[data-a=unsync]');
    if (us) us.onclick = () => { if (confirm('¿Desconectar este ordenador? Tu historial se queda aquí y en GitHub, pero dejará de sincronizarse.')) { Sync.disconnect(); this.renderTracker(); } };
    this.el.querySelector('[data-a=exp]').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `cfa-mocks-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    };
    this.el.querySelector('[data-a=imp]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { Store.importJSON(await f.text()); this.renderTracker(); } catch (er) { alert(er.message); }
    };
    this.el.querySelector('[data-a=bank]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { await importBank(f); alert('Preguntas actualizadas.'); this.renderTracker(); } catch (er) { alert(er.message); }
    };
    this.el.querySelector('[data-a=wipe]').onclick = () => {
      if (confirm('¿Borrar todo el historial de intentos? Exporta antes una copia si quieres conservarlo.')) { Store.data.deleted.push(...Store.data.attempts.map(a => a.id)); Store.data.attempts = []; Store.save(); this.renderTracker(); }
    };
  },

  evoChart(box, rows) {
    if (!rows.length) { box.innerHTML = '<div class="empty-note">Completa tu primer mock para ver la evolución.</div>'; return; }
    const W = 620, H = 260, L = 40, R = 16, Tp = 14, B = 40;
    const pw = W - L - R, ph = H - Tp - B;
    const lo = Math.max(0, Math.floor((Math.min(...rows.map(r => r.T.pct), PASS_LINE) - 10) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...rows.map(r => r.T.pct), PASS_LINE) + 5) / 10) * 10);
    const y = v => Tp + ph - ((v - lo) / (hi - lo)) * ph;
    const n = rows.length;
    const x = i => (n === 1 ? L + pw / 2 : L + (i * pw) / (n - 1));
    let g = '';
    for (let v = lo; v <= hi; v += 10) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    let ax = '';
    for (let v = lo; v <= hi; v += 10) ax += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    const step = Math.ceil(n / 10);
    rows.forEach((r, i) => { if (i % step === 0 || i === n - 1) ax += `<text x="${x(i)}" y="${H - B + 18}" text-anchor="middle">M${r.a.mock}</text><text x="${x(i)}" y="${H - B + 31}" text-anchor="middle">${new Date(r.a.finishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</text>`; });
    const pts = rows.map((r, i) => `${x(i)},${y(r.T.pct)}`).join(' ');
    const dots = rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.T.pct)}" r="4.5" fill="#4e8a16" stroke="#fff" stroke-width="2"/>`).join('');
    const hits = rows.map((r, i) => `<rect class="hit" data-i="${i}" x="${x(i) - Math.max(10, pw / n / 2)}" y="${Tp}" width="${Math.max(20, pw / n)}" height="${ph}" fill="transparent"/>`).join('');
    const lastR = rows[n - 1];
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de la nota por intento">
      <g class="grid">${g}</g>
      <g class="ref"><line x1="${L}" x2="${W - R}" y1="${y(PASS_LINE)}" y2="${y(PASS_LINE)}"/><text x="${L + 6}" y="${y(PASS_LINE) - 6}" text-anchor="start">70 %</text></g>
      <g class="axis">${ax}</g>
      <line class="cross" x1="0" x2="0" y1="${Tp}" y2="${Tp + ph}" stroke="#7a8488" stroke-width="1" opacity="0"/>
      ${n > 1 ? `<polyline points="${pts}" fill="none" stroke="#4e8a16" stroke-width="2" stroke-linejoin="round"/>` : ''}
      ${dots}
      <text x="${x(n - 1) + (n > 1 ? -8 : 10)}" y="${y(lastR.T.pct) - 12}" text-anchor="${n > 1 ? 'end' : 'start'}" font-size="12" font-weight="700" fill="#1f2426">${pct(lastR.T.pct)}</text>
      ${hits}</svg><div class="tip"></div>`;
    const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cross = box.querySelector('.cross');
    box.querySelectorAll('.hit').forEach(h => {
      h.onmouseenter = () => {
        const i = +h.dataset.i, r = rows[i];
        const sc = svg.getBoundingClientRect().width / W;
        tip.innerHTML = `<b>Mock ${r.a.mock}</b> · ${pct(r.T.pct)}<br>S1 ${pct((100 * r.s1) / 90)} · S2 ${pct((100 * r.s2) / 90)}<br>${fmtDate(r.a.finishedAt)}`;
        tip.style.left = x(i) * sc + 'px'; tip.style.top = y(r.T.pct) * sc + 'px'; tip.style.opacity = 1;
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
      };
      h.onmouseleave = () => { tip.style.opacity = 0; cross.setAttribute('opacity', 0); };
      h.onclick = () => { this.rv = null; location.hash = '#/result/' + rows[+h.dataset.i].a.id; };
      h.style.cursor = 'pointer';
    });
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
