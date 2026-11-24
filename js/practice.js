/* Practice Questions 2027: topics → readings, study-mode quizzes, custom quizzes and tracker. */

/* ---------------- stats ---------------- */
const PS = {
  log() { return Store.data.practice.log; },
  latest(qid) { const l = this.log()[qid]; return l && l.length ? l[l.length - 1] : null; },
  qids(r) { return reading(r).qs.map((_, i) => `${r}-${i}`); },
  readingStats(r) {
    const ids = this.qids(r);
    // acc = cumulative: correct answers / all answers given (every attempt counts)
    let done = 0, ok = 0, wrong = 0, att = 0, secs = 0, ans = 0, okAll = 0;
    ids.forEach(id => {
      const l = this.log()[id]; if (!l || !l.length) return;
      done++; att += l.length;
      l.forEach(e => { secs += e[3] || 0; ans++; if (e[2]) okAll++; });
      if (l[l.length - 1][2]) ok++; else wrong++;
    });
    return { n: ids.length, done, ok, wrong, att, okAll, acc: ans ? (100 * okAll) / ans : null, secs, ans };
  },
  topicStats(k) {
    const t = { n: 0, done: 0, ok: 0, wrong: 0, att: 0, secs: 0, ans: 0, okAll: 0, readings: 0, covered: 0 };
    PBANK.readings.filter(x => x.t === k && x.qs.length).forEach(x => {
      const s = this.readingStats(x.r);
      ['n', 'done', 'ok', 'wrong', 'att', 'secs', 'ans', 'okAll'].forEach(f => (t[f] += s[f]));
      t.readings++; if (s.done === s.n) t.covered++;
    });
    t.acc = t.ans ? (100 * t.okAll) / t.ans : null;
    return t;
  },
  global() {
    const g = { n: 0, done: 0, ok: 0, okAll: 0, secs: 0, ans: 0, readings: 0, covered: 0, started: 0 };
    PBANK.readings.filter(x => x.qs.length).forEach(x => {
      const s = this.readingStats(x.r);
      g.n += s.n; g.done += s.done; g.ok += s.ok; g.okAll += s.okAll; g.secs += s.secs; g.ans += s.ans; g.readings++;
      if (s.done === s.n) g.covered++; if (s.done) g.started++;
    });
    g.acc = g.ans ? (100 * g.okAll) / g.ans : null;
    return g;
  },
};
function accCls(a) { return a == null ? '' : a < PASS_LINE ? 'low' : 'ok'; }
function accTxt(a) { return a == null ? '—' : Math.floor(a) + ' %'; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------------- views ---------------- */
const Practice = {
  route(h) {
    if (!PBANK) return App.renderImport('practice');
    if (h.startsWith('#/practice/topic/')) return this.renderTopic(h.split('/')[3]);
    if (h.startsWith('#/practice/custom')) return this.renderCustom();
    if (h.startsWith('#/practice/tracker')) return this.renderTracker();
    if (h.startsWith('#/practice/session/')) return this.renderSession(h.split('/')[3]);
    return this.renderHome();
  },
  shell(active, inner) { App.shell('practice', active, inner); },

  resumeBanner() {
    const c = Store.data.practice.current;
    if (!c) return '';
    const done = c.ans.filter(a => a >= 0).length;
    return `<div class="resume"><div><b>Quiz en curso:</b> ${esc(c.title)} · ${done}/${c.qids.length} respondidas</div>
      <div class="acts"><button class="btn" data-a="presume">${icon('play')} Continuar</button><button class="btn ondark" data-a="pdiscard">Descartar</button></div></div>`;
  },
  bindResume() {
    const r = App.el.querySelector('[data-a=presume]'); if (r) r.onclick = () => PQuiz.open();
    const d = App.el.querySelector('[data-a=pdiscard]');
    if (d) d.onclick = () => {
      if (!confirm('¿Descartar el quiz en curso? Las respuestas que ya diste siguen contando en tus estadísticas.')) return;
      Store.data.deleted.push(Store.data.practice.current.id); Store.data.practice.current = null; Store.save(); App.route();
    };
  },

  renderHome() {
    const g = PS.global();
    const tiles = PTOPICS.map(t => {
      const s = PS.topicStats(t.k);
      const rs = PBANK.readings.filter(x => x.t === t.k);
      return `<button class="ptile" type="button" data-k="${t.k}">
        <span class="lab">Readings ${rs[0].r}–${rs[rs.length - 1].r}</span>
        <span class="pname">${t.name}</span>
        <span class="meta"><span><b>${s.done}</b>/${s.n} preguntas</span><span>Acierto <b class="${accCls(s.acc)}">${accTxt(s.acc)}</b></span></span>
        <span class="meter">${s.done ? `<i style="width:${(100 * s.done) / s.n}%"></i>` : ''}</span>
      </button>`;
    }).join('');
    this.shell('ptopics', `
      <div class="phead"><div><div class="eyebrow">CFA Level I · Practice 2027</div><h1>Practice Questions</h1>
        <div class="sub">${g.n.toLocaleString('es-ES')} preguntas en ${g.readings} readings. Modo estudio: corrección y explicación al momento.</div></div>
        <div><button class="btn dark" data-a="custom">${icon('gear')} Custom quiz</button></div></div>
      ${this.resumeBanner()}
      <div class="kpis small">
        <div class="kpi hero"><div class="k">Acierto</div><div class="v">${accTxt(g.acc)}</div><div class="d">acumulado de todas tus respuestas</div></div>
        <div class="kpi"><div class="k">Respondidas</div><div class="v">${g.done.toLocaleString('es-ES')}</div><div class="d">de ${g.n.toLocaleString('es-ES')} (${Math.round((100 * g.done) / g.n)} %)</div></div>
        <div class="kpi"><div class="k">Readings completos</div><div class="v">${g.covered}</div><div class="d">de ${g.readings} · ${g.started} empezados</div></div>
        <div class="kpi"><div class="k">Tiempo / pregunta</div><div class="v">${g.ans ? mmss(g.secs / g.ans) : '—'}</div><div class="d">ritmo de examen: 1:30</div></div>
      </div>
      <div class="pboard">${tiles}</div>`);
    App.el.querySelectorAll('.ptile').forEach(b => b.onclick = () => (location.hash = '#/practice/topic/' + b.dataset.k));
    App.el.querySelector('[data-a=custom]').onclick = () => (location.hash = '#/practice/custom');
    this.bindResume();
  },

  renderTopic(k) {
    const t = PTOPICS.find(x => x.k === k); if (!t) { location.hash = '#/practice'; return; }
    const s = PS.topicStats(k);
    const rows = PBANK.readings.filter(x => x.t === k).map(x => {
      if (!x.qs.length) return `<tr class="na"><td class="rn">R${x.r}</td><td>${esc(x.title)}<div class="sub2">Sin preguntas de práctica en la web del CFA</div></td><td class="r">—</td><td></td><td class="r">—</td><td class="r">—</td><td></td></tr>`;
      const rs = PS.readingStats(x.r);
      return `<tr><td class="rn">R${x.r}</td><td class="tt">${esc(x.title)}</td><td class="r">${rs.n}</td>
        <td class="prog"><div class="trk"><i style="width:${(100 * rs.done) / rs.n}%"></i></div><span>${rs.done}/${rs.n}</span></td>
        <td class="r strong ${accCls(rs.acc)}" title="${rs.okAll} aciertos de ${rs.ans} respuestas">${accTxt(rs.acc)}</td><td class="r">${rs.att || '—'}</td>
        <td class="acts"><button class="btn sm" data-go="${x.r}">${rs.done ? 'Repetir' : 'Practicar'}</button>${rs.wrong ? `<button class="btn ghost sm" data-wr="${x.r}">Falladas (${rs.wrong})</button>` : ''}</td></tr>`;
    }).join('');
    this.shell('ptopics', `
      <div class="phead"><div><div class="eyebrow"><a href="#/practice">Practice</a> / Topic</div><h1>${t.name}</h1>
        <div class="sub">${s.n} preguntas · ${s.done} respondidas · acierto <b class="${accCls(s.acc)}">${accTxt(s.acc)}</b> · ${s.covered}/${s.readings} readings completos</div></div>
        <div class="hacts"><button class="btn ghost" data-a="back">${icon('chevL')} Topics</button><button class="btn dark" data-a="all">Practicar todo el topic</button></div></div>
      ${this.resumeBanner()}
      <div class="panel" style="padding:6px 12px 4px"><table class="tbl rtable"><thead><tr><th>Reading</th><th>Título</th><th class="r">Preg.</th><th>Progreso</th><th class="r">Acierto</th><th class="r">Respuestas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="height:50px"></div>`);
    App.el.querySelector('[data-a=back]').onclick = () => (location.hash = '#/practice');
    App.el.querySelector('[data-a=all]').onclick = () => {
      const ids = PBANK.readings.filter(x => x.t === k).flatMap(x => PS.qids(x.r));
      PQuiz.start({ kind: 'topic', title: t.name, qids: shuffle(ids), section: t.name });
    };
    App.el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      const r = +b.dataset.go, x = reading(r);
      PQuiz.start({ kind: 'reading', title: `Reading ${r} · ${x.title}`, qids: PS.qids(r), section: `Reading ${r} · ${x.title}` });
    });
    App.el.querySelectorAll('[data-wr]').forEach(b => b.onclick = () => {
      const r = +b.dataset.wr, x = reading(r);
      const ids = PS.qids(r).filter(id => { const l = PS.latest(id); return l && !l[2]; });
      PQuiz.start({ kind: 'wrong', title: `Falladas · Reading ${r}`, qids: ids, section: `Reading ${r} · Falladas` });
    });
    this.bindResume();
  },

  /* ---------------- custom quiz ---------------- */
  cq: null,
  renderCustom() {
    this.cq ||= { sel: new Set(), open: new Set(), filter: 'all', n: 20 };
    const cq = this.cq;
    const groups = PTOPICS.map(t => {
      const rs = PBANK.readings.filter(x => x.t === t.k && x.qs.length);
      const all = rs.every(x => cq.sel.has(x.r)), some = rs.some(x => cq.sel.has(x.r));
      return `<div class="cgroup ${cq.open.has(t.k) ? 'open' : ''}">
        <div class="chead"><label class="chk"><input type="checkbox" data-t="${t.k}" ${all ? 'checked' : ''}><span class="fake ${!all && some ? 'part' : ''}"></span><span class="t">${t.name}</span></label>
          <span class="cnt">${rs.filter(x => cq.sel.has(x.r)).length}/${rs.length} readings</span>
          <button class="tog" type="button" data-o="${t.k}">${icon(cq.open.has(t.k) ? 'caretUp' : 'caretDown')}</button></div>
        <div class="clist">${rs.map(x => `<label class="chk sm"><input type="checkbox" data-r="${x.r}" ${cq.sel.has(x.r) ? 'checked' : ''}><span class="fake"></span><span class="t"><b>R${x.r}</b> ${esc(x.title)} <i>(${x.qs.length})</i></span></label>`).join('')}</div>
      </div>`;
    }).join('');
    const pool = this.customPool();
    const n = Math.min(cq.n, pool.length);
    this.shell('pcustom', `
      <div class="phead"><div><div class="eyebrow">Practice 2027</div><h1>Custom quiz</h1>
        <div class="sub">Elige topics o readings, cuántas preguntas y cuáles. Se presentan en orden aleatorio.</div></div></div>
      ${this.resumeBanner()}
      <div class="cgrid">
        <div class="panel cpick"><div class="ctools"><h3>1 · Temario</h3><span><button class="lnk" data-a="selall">Todo</button> · <button class="lnk" data-a="selnone">Nada</button></span></div>${groups}</div>
        <div class="panel cside">
          <h3>2 · Qué preguntas</h3>
          <div class="seg block">${[['all', 'Todas'], ['new', 'No hechas'], ['wrong', 'Falladas']].map(([k, l]) => `<button type="button" data-f="${k}" class="${cq.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <h3 style="margin-top:22px">3 · Cuántas</h3>
          <div class="nrow"><input type="range" min="1" max="${Math.max(1, pool.length)}" value="${Math.max(1, n)}" ${pool.length ? '' : 'disabled'}><input type="number" min="1" max="${pool.length}" value="${n}" ${pool.length ? '' : 'disabled'}></div>
          <div class="presets">${[10, 20, 30, 45, 60, 90].map(v => `<button type="button" class="lnk" data-n="${v}">${v}</button>`).join('')}<button type="button" class="lnk" data-n="${pool.length}">todas</button></div>
          <div class="avail"><b>${pool.length.toLocaleString('es-ES')}</b> preguntas disponibles con esta selección</div>
          <button class="btn big" data-a="start" ${pool.length ? '' : 'disabled'}>${icon('play')} Empezar quiz de ${n} preguntas</button>
        </div>
      </div><div style="height:50px"></div>`);
    const E = App.el, rer = () => { const y = window.scrollY; this.renderCustom(); window.scrollTo(0, y); };
    E.querySelectorAll('[data-t]').forEach(cb => cb.onchange = () => { PBANK.readings.filter(x => x.t === cb.dataset.t && x.qs.length).forEach(x => cb.checked ? cq.sel.add(x.r) : cq.sel.delete(x.r)); rer(); });
    E.querySelectorAll('[data-r]').forEach(cb => cb.onchange = () => { cb.checked ? cq.sel.add(+cb.dataset.r) : cq.sel.delete(+cb.dataset.r); rer(); });
    E.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { cq.open.has(b.dataset.o) ? cq.open.delete(b.dataset.o) : cq.open.add(b.dataset.o); rer(); });
    E.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { cq.filter = b.dataset.f; rer(); });
    E.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { cq.n = Math.max(1, +b.dataset.n); rer(); });
    E.querySelector('[data-a=selall]').onclick = () => { PBANK.readings.filter(x => x.qs.length).forEach(x => cq.sel.add(x.r)); rer(); };
    E.querySelector('[data-a=selnone]').onclick = () => { cq.sel.clear(); rer(); };
    const rg = E.querySelector('.nrow input[type=range]'), nb = E.querySelector('.nrow input[type=number]'), st = E.querySelector('[data-a=start]');
    const setN = v => { v = Math.max(1, Math.min(pool.length, +v || 1)); cq.n = v; rg.value = v; nb.value = v; st.innerHTML = `${icon('play')} Empezar quiz de ${v} preguntas`; };
    rg.oninput = () => setN(rg.value); nb.onchange = () => setN(nb.value);
    st.onclick = () => {
      const ids = shuffle([...this.customPool()]).slice(0, Math.min(cq.n, pool.length));
      const topics = [...new Set([...cq.sel].map(r => reading(r).t))];
      const title = cq.sel.size === 1 ? `Custom · Reading ${[...cq.sel][0]}` : `Custom · ${topics.length === 1 ? PTOPIC_NAME[topics[0]] : topics.length + ' topics'}`;
      PQuiz.start({ kind: 'custom', title: title + (cq.filter === 'wrong' ? ' (falladas)' : cq.filter === 'new' ? ' (no hechas)' : ''), qids: ids, section: 'Custom Quiz' });
    };
    this.bindResume();
  },
  customPool() {
    const cq = this.cq;
    return [...cq.sel].sort((a, b) => a - b).flatMap(r => PS.qids(r)).filter(id => {
      const l = PS.latest(id);
      return cq.filter === 'all' || (cq.filter === 'new' ? !l : l && !l[2]);
    });
  },

  /* ---------------- tracker ---------------- */
  renderTracker() {
    const g = PS.global();
    const sessions = [...Store.data.practice.sessions].filter(s => !Store.data.deleted.includes(s.id)).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    // heatmap by topic
    const heat = PTOPICS.map(t => {
      const cells = PBANK.readings.filter(x => x.t === t.k).map(x => {
        if (!x.qs.length) return `<span class="hc none" title="R${x.r} · ${esc(x.title)} — sin preguntas">${x.r}</span>`;
        const s = PS.readingStats(x.r);
        const lvl = s.acc == null ? 'h0' : s.acc < 50 ? 'h1' : s.acc < 60 ? 'h2' : s.acc < 70 ? 'h3' : s.acc < 85 ? 'h4' : 'h5';
        return `<button class="hc ${lvl}" type="button" data-r="${x.r}" title="R${x.r} · ${esc(x.title)}&#10;${s.done}/${s.n} respondidas · acierto ${accTxt(s.acc)} (${s.okAll}/${s.ans})">${x.r}${s.done && s.done < s.n ? '<i></i>' : ''}</button>`;
      }).join('');
      return `<div class="hrow"><div class="hn">${t.name}</div><div class="hcells">${cells}</div></div>`;
    }).join('');
    const tstats = {}; PTOPICS.forEach(t => { const s = PS.topicStats(t.k); tstats[t.k] = [s.okAll, s.ans]; });
    const bars = PTOPICS.filter(t => tstats[t.k][1]).map(t => {
      const [c, n] = tstats[t.k], p = (100 * c) / n;
      return `<div class="arow" title="${t.name}: ${c}/${n}"><div class="nm">${t.name}</div><div class="trk"><div class="fill" style="width:${p}%"></div><div class="p70"></div></div><div class="val ${p < PASS_LINE ? 'low' : ''}">${Math.floor(p)} %<small>${c}/${n}</small></div></div>`;
    }).join('');
    const weak = PBANK.readings.filter(x => x.qs.length).map(x => ({ x, s: PS.readingStats(x.r) })).filter(o => o.s.done >= 3).sort((a, b) => a.s.acc - b.s.acc).slice(0, 8);
    const hist = sessions.map(s => {
      const ok = s.ans.filter((a, i) => a >= 0 && a === pq(s.qids[i]).c).length, n = s.qids.length, secs = s.qt.reduce((a, b) => a + b, 0);
      return `<tr class="click" data-id="${s.id}"><td>${fmtDate(s.finishedAt)}</td><td class="strong">${esc(s.title)}</td><td class="r">${n}</td><td class="r strong ${accCls((100 * ok) / n)}">${pct((100 * ok) / n)}</td><td class="r">${hms(secs)}</td><td class="r">${mmss(secs / n)}</td><td class="r">${icon('chevR')}</td></tr>`;
    }).join('');
    this.shell('ptracker', `
      <div class="phead"><div><div class="eyebrow">Practice 2027 · Performance Tracker</div><h1>Tu progreso en el temario</h1>
        <div class="sub">${g.done ? `${g.done.toLocaleString('es-ES')} de ${g.n.toLocaleString('es-ES')} preguntas respondidas · ${sessions.length} quizzes terminados` : 'Todavía no has respondido ninguna pregunta.'}</div></div></div>
      <div class="kpis">
        <div class="kpi hero"><div class="k">Acierto</div><div class="v">${accTxt(g.acc)}</div><div class="d">acumulado de todas tus respuestas</div></div>
        <div class="kpi"><div class="k">Respondidas</div><div class="v">${g.done.toLocaleString('es-ES')}</div><div class="d">${Math.round((100 * g.done) / g.n)} % del total</div></div>
        <div class="kpi"><div class="k">Readings completos</div><div class="v">${g.covered}/${g.readings}</div><div class="d">${g.started} empezados</div></div>
        <div class="kpi"><div class="k">Quizzes</div><div class="v">${sessions.length}</div><div class="d">terminados</div></div>
        <div class="kpi"><div class="k">Tiempo / pregunta</div><div class="v">${g.ans ? mmss(g.secs / g.ans) : '—'}</div><div class="d">ritmo de examen: 1:30</div></div>
      </div>
      <div class="panel" style="margin-bottom:26px"><h3>Mapa de los 102 readings</h3><div class="hint">Color según tu acierto en cada reading. Pulsa uno para ir a su topic.</div>
        <div class="heat">${heat}</div>
        <div class="hleg"><span><i class="hc h0"></i>Sin hacer</span><span><i class="hc h1"></i>&lt;50 %</span><span><i class="hc h2"></i>50–59 %</span><span><i class="hc h3"></i>60–69 %</span><span><i class="hc h4"></i>70–84 %</span><span><i class="hc h5"></i>≥85 %</span><span><i class="hc h4 part"><i></i></i>A medias</span></div></div>
      <div class="grid2">
        <div class="panel"><h3>Acierto por topic</h3><div class="hint">Acumulado: aciertos / respuestas, contando cada intento.</div>${bars ? `<div class="areas">${bars}</div><div class="alegend"><span><i></i>Acierto</span><span><i class="d"></i>Referencia 70 %</span></div>` : '<div class="empty-note">Sin datos todavía.</div>'}</div>
        <div class="panel"><h3>Readings más flojos</h3><div class="hint">Con al menos 3 preguntas respondidas.</div>${weak.length ? `<table class="tbl"><tbody>${weak.map(o => `<tr class="click" data-wr="${o.x.r}"><td class="rn">R${o.x.r}</td><td>${esc(o.x.title)}</td><td class="r strong ${accCls(o.s.acc)}">${accTxt(o.s.acc)}</td><td class="r">${o.s.wrong ? `<span class="lnk">Repasar ${o.s.wrong}</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-note">Aún no hay suficientes datos.</div>'}</div>
      </div>
      <div class="section-title">Historial de quizzes</div>
      <div class="panel" style="padding:6px 12px 4px">${hist ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Quiz</th><th class="r">Preg.</th><th class="r">Acierto</th><th class="r">Tiempo</th><th class="r">Min/preg.</th><th></th></tr></thead><tbody>${hist}</tbody></table>` : '<div class="empty-note">Aquí aparecerá cada quiz que termines.</div>'}</div>
      <p class="foot-note">La sincronización entre ordenadores y las copias de seguridad están en <a href="#/mocks/tracker">Mock Exams → Performance Tracker</a> y cubren también Practice.</p>
      <div style="height:40px"></div>`);
    App.el.querySelectorAll('.heat [data-r]').forEach(b => b.onclick = () => (location.hash = '#/practice/topic/' + reading(+b.dataset.r).t));
    App.el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => (location.hash = '#/practice/session/' + tr.dataset.id));
    App.el.querySelectorAll('tr[data-wr]').forEach(tr => tr.onclick = () => {
      const r = +tr.dataset.wr; const ids = PS.qids(r).filter(id => { const l = PS.latest(id); return l && !l[2]; });
      if (ids.length) PQuiz.start({ kind: 'wrong', title: `Falladas · Reading ${r}`, qids: ids, section: `Reading ${r} · Falladas` });
    });
  },

  /* ---------------- finished quiz review ---------------- */
  rv: null,
  renderSession(id) {
    const s = Store.data.practice.sessions.find(x => x.id === id);
    if (!s) { location.hash = '#/practice/tracker'; return; }
    const n = s.qids.length, ok = s.ans.filter((a, i) => a >= 0 && a === pq(s.qids[i]).c).length, na = s.ans.filter(a => a < 0).length;
    const secs = s.qt.reduce((a, b) => a + b, 0);
    const byR = {};
    s.qids.forEach((q, i) => { const r = +q.split('-')[0]; byR[r] ||= [0, 0]; byR[r][1]++; if (s.ans[i] === pq(q).c) byR[r][0]++; });
    const rrows = Object.entries(byR).sort((a, b) => a[0] - b[0]).map(([r, [c, t]]) => `<div class="arow"><div class="nm" title="${esc(reading(+r).title)}">R${r} · ${esc(reading(+r).title)}</div><div class="trk"><div class="fill" style="width:${(100 * c) / t}%"></div><div class="p70"></div></div><div class="val ${(100 * c) / t < PASS_LINE ? 'low' : ''}">${c}/${t}</div></div>`).join('');
    this.rv = this.rv && this.rv.id === id ? this.rv : { id, filter: 'all', limit: 25 };
    const pass = (100 * ok) / n >= PASS_LINE;
    this.shell('ptracker', `
      <div class="phead"><div><div class="eyebrow">Corrección · ${fmtDate(s.finishedAt)}</div><h1>${esc(s.title)}</h1></div>
        <div class="hacts"><button class="btn ghost" data-a="back">${icon('chevL')} Volver</button><button class="btn dark" data-a="again">Repetir este quiz</button></div></div>
      <div class="res-hero">
        <div class="first"><div class="k">Acierto</div><div class="big">${pct((100 * ok) / n)}</div><div class="verdict">${icon(pass ? 'check' : 'warn')} ${pass ? 'Por encima del 70 %' : 'Por debajo del 70 %'}</div></div>
        <div><div class="k">Correctas</div><div class="mid">${ok}/${n}</div><div class="d">${na ? na + ' sin responder' : 'todas respondidas'}</div></div>
        <div><div class="k">Tiempo total</div><div class="mid">${hms(secs)}</div><div class="d">${fmtDate(s.startedAt)}</div></div>
        <div><div class="k">Tiempo / pregunta</div><div class="mid">${mmss(secs / n)}</div><div class="d">ritmo de examen: 1:30</div></div>
      </div>
      ${Object.keys(byR).length > 1 ? `<div class="panel"><h3>Por reading</h3><div class="areas" style="margin-top:10px">${rrows}</div></div>` : ''}
      <div class="rv-bar"><div class="seg filt"></div></div><div id="qlist"></div>`);
    App.el.querySelector('[data-a=back]').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/practice/tracker'));
    App.el.querySelector('[data-a=again]').onclick = () => PQuiz.start({ kind: s.kind, title: s.title, qids: [...s.qids], section: s.section || 'Practice' });
    this.renderSessionList(s);
  },
  renderSessionList(s) {
    const rv = this.rv;
    const st = i => (s.ans[i] < 0 ? 'na' : s.ans[i] === pq(s.qids[i]).c ? 'ok' : 'ko');
    const counts = { all: s.qids.length, ko: 0, na: 0, ok: 0, fl: 0 };
    s.qids.forEach((_, i) => { counts[st(i)]++; if (s.flag && s.flag[i]) counts.fl++; });
    const F = [['all', 'Todas'], ['ko', 'Incorrectas'], ['na', 'Sin responder'], ['ok', 'Correctas'], ['fl', 'Marcadas']];
    App.el.querySelector('.seg.filt').innerHTML = F.map(([k, l]) => `<button type="button" data-f="${k}" class="${rv.filter === k ? 'on' : ''}">${l}<span class="c">${counts[k]}</span></button>`).join('');
    App.el.querySelectorAll('.seg.filt button').forEach(b => b.onclick = () => { rv.filter = b.dataset.f; rv.limit = 25; this.renderSessionList(s); });
    const idx = s.qids.map((_, i) => i).filter(i => rv.filter === 'all' || (rv.filter === 'fl' ? s.flag && s.flag[i] : st(i) === rv.filter));
    const html = idx.slice(0, rv.limit).map(i => reviewCard(pq(s.qids[i]), s.ans[i], `Pregunta ${i + 1}`, `R${s.qids[i].split('-')[0]}`, st(i), s.flag && s.flag[i], s.qt[i])).join('') || `<div class="empty-note">No hay preguntas en este filtro.</div>`;
    const list = App.el.querySelector('#qlist');
    list.innerHTML = html + (idx.length > rv.limit ? `<div class="more"><button class="btn ghost" type="button">Mostrar más (${idx.length - rv.limit} restantes)</button></div>` : '<div style="height:50px"></div>');
    const more = list.querySelector('.more button'); if (more) more.onclick = () => { rv.limit += 25; this.renderSessionList(s); };
  },
};

function reviewCard(q, a, label, tag, st, flagged, secs) {
  const pillTxt = { ok: 'Correcta', ko: 'Incorrecta', na: 'Sin responder' }[st];
  const opts = q.o.map((o, k) => {
    const isC = k === q.c, isU = a === k;
    const tags = (isC ? `<span class="pill ok">${icon('check')} Respuesta correcta</span>` : '') + (isU ? `<span class="pill ${isC ? 'ok' : 'ko'}">Tu respuesta</span>` : '');
    return `<div class="ropt ${isC ? 'correct' : isU ? 'wrong' : ''}"><div class="lt">${'ABC'[k]}</div><div class="bx">${tags ? `<div class="tags">${tags}</div>` : ''}<div class="ans">${o}</div>${q.of && q.of[k] ? `<div class="fb">${q.of[k]}</div>` : ''}</div></div>`;
  }).join('');
  return `<article class="qrev ${st}"><div class="qh"><span class="qn">${label}</span><span class="pill ${st}">${pillTxt}</span>${flagged ? `<span class="flagged">${icon('flag')} Marcada</span>` : ''}
    <span class="qmeta"><span>${tag}</span>${secs != null ? `<span>${mmss(secs)} en la pregunta</span>` : ''}</span></div>
    <div class="qbody"><div class="stem">${q.stem}</div>${opts}${q.f ? `<div class="fbx"><div class="fbh">Explicación</div>${q.f}</div>` : ''}</div></article>`;
}

/* ---------------- study-mode quiz (Prometric look) ---------------- */
const PQuiz = {
  root: null, tick: null, lastTs: 0,
  start({ kind, title, qids, section }) {
    if (!qids.length) { alert('No hay preguntas con esa selección.'); return; }
    const cur = Store.data.practice.current;
    if (cur && !confirm(`Tienes un quiz en curso (${cur.title}). ¿Descartarlo y empezar este?`)) return;
    if (cur) Store.data.deleted.push(cur.id);
    const n = qids.length;
    Store.data.practice.current = { id: 'p' + Date.now(), kind, title, section, qids, idx: 0, ans: Array(n).fill(-1), struck: Array.from({ length: n }, () => [0, 0, 0]), flag: Array(n).fill(0), qt: Array(n).fill(0), startedAt: new Date().toISOString() };
    Store.save();
    this.open();
  },
  get c() { return Store.data.practice.current; },
  open() {
    App.el.innerHTML = '';
    const r = document.createElement('div');
    r.className = 'exam-root pq';
    r.innerHTML = `<div class="tv">
      <header class="ex-header">
        <div class="ex-details"><p class="q-title"></p><p class="s-title"></p></div>
        <div class="ex-timer"><button class="timer-button" type="button"><span class="clock-ico">${icon('clock')}</span><span class="lbl">Time Elapsed</span><span class="val"></span></button></div>
        <div class="ex-actions"><div class="ex-progress"><div class="track"><div class="bar"></div></div><div class="ttl">Progress <span class="pc">0%</span></div></div>
          <button class="finish-button" type="button">Finish Quiz</button></div>
      </header>
      <div class="ex-info"><p><strong>Test:</strong> CFA Level I 2027 Practice · Study Mode</p><p><strong>Candidate</strong>: ${CANDIDATE}</p></div>
      <div class="ex-content">
        <nav class="q-nav"><button class="nav-arrow up" type="button">${icon('caretUp')}</button><div class="nav-scroll"><ul class="main-nav-list"></ul></div><button class="nav-arrow down" type="button">${icon('caretDown')}</button></nav>
        <div class="content-container"><div class="content-holder"><div class="item"></div></div></div>
      </div>
      <footer class="ex-footer">
        <div class="left-bar"><button class="icon-btn exit" type="button" data-tip="Save &amp; Exit">${icon('home')}</button></div>
        <div class="right-bar">
          <button class="flat-btn flag-btn" type="button" data-tip="Flag">${icon('flag')}</button>
          <button class="flat-btn back" type="button">${icon('chevL')}<span>Back</span></button>
          <button class="flat-btn next" type="button"><span>Next</span>${icon('chevR')}</button>
        </div>
      </footer></div>`;
    document.body.appendChild(r);
    this.root = r;
    const $ = s => r.querySelector(s);
    this.$ = $;
    $('.s-title').innerHTML = `<strong>Section:</strong> ${esc(this.c.section || this.c.title)}`;
    $('.next').onclick = () => this.go(this.c.idx + 1);
    $('.back').onclick = () => this.go(this.c.idx - 1);
    $('.flag-btn').onclick = () => { const c = this.c; c.flag[c.idx] = c.flag[c.idx] ? 0 : 1; this.paintNav(); this.paintFlag(); Store.save(); };
    $('.finish-button').onclick = () => this.confirmFinish();
    $('.exit').onclick = () => this.exit();
    const sc = $('.nav-scroll');
    $('.nav-arrow.up').onclick = () => { sc.scrollTop = Math.max(0, Math.round(sc.scrollTop / 28) - 10) * 28; this.arrows(); };
    $('.nav-arrow.down').onclick = () => { sc.scrollTop = (Math.round(sc.scrollTop / 28) + 10) * 28; this.arrows(); };
    sc.addEventListener('wheel', e => { sc.scrollTop = (Math.round(sc.scrollTop / 28) + (e.deltaY > 0 ? 3 : -3)) * 28; this.arrows(); e.preventDefault(); }, { passive: false });
    $('.main-nav-list').innerHTML = this.c.qids.map((_, i) => `<li><button class="nav-button" type="button" data-i="${i}"><span class="n">${i + 1}</span>${icon('flag', 'fl')}<span class="res"></span></button></li>`).join('');
    $('.main-nav-list').onclick = e => { const b = e.target.closest('.nav-button'); if (b) this.go(+b.dataset.i); };
    const item = $('.item');
    item.addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) this.answer(+o.dataset.i); });
    item.addEventListener('contextmenu', e => {
      const o = e.target.closest('.opt'); if (!o || this.c.ans[this.c.idx] >= 0) return;
      e.preventDefault(); const k = +o.dataset.i; const s = this.c.struck[this.c.idx]; s[k] = s[k] ? 0 : 1; o.classList.toggle('struck', !!s[k]); Store.save();
    });
    this.keys = e => {
      if (!this.root || this.root.querySelector('.modal-backdrop')) return;
      if (e.target.matches('input,textarea')) return;
      const k = e.key.toLowerCase();
      if (['a', 'b', 'c'].includes(k)) this.answer('abc'.indexOf(k));
      else if (e.key === 'ArrowRight' || e.key === 'Enter') this.go(this.c.idx + 1);
      else if (e.key === 'ArrowLeft') this.go(this.c.idx - 1);
    };
    document.addEventListener('keydown', this.keys);
    this.render();
    this.lastTs = performance.now();
    this.tick = setInterval(() => this.onTick(), 500);
  },
  onTick() {
    const now = performance.now(), dt = (now - this.lastTs) / 1000; this.lastTs = now;
    if (document.visibilityState === 'hidden') return;
    const c = this.c; if (!c) return;
    if (c.ans[c.idx] < 0) c.qt[c.idx] += dt; // time counts until the question is answered
    c.elapsed = (c.elapsed || 0) + dt;
    this.$('.timer-button .val').textContent = hms(c.elapsed);
    if (!this._sv || now - this._sv > 5000) { this._sv = now; Store.save(); }
  },
  close() { clearInterval(this.tick); document.removeEventListener('keydown', this.keys); this.root && this.root.remove(); this.root = null; },
  exit() { Store.save(); this.close(); Sync.flush(); location.hash = '#/practice'; App.route(); },
  go(i) { const c = this.c; if (i < 0 || i >= c.qids.length) return; c.idx = i; this.render(); Store.save(); },
  render() {
    const c = this.c, i = c.idx, q = pq(c.qids[i]), a = c.ans[i], done = a >= 0;
    const [r] = c.qids[i].split('-');
    this.$('.q-title').innerHTML = `<strong>Question:</strong> ${i + 1} of ${c.qids.length} <span class="rtag">· R${r}</span>`;
    const opts = q.o.map((o, k) => {
      const cls = ['opt'];
      if (done) { if (k === q.c) cls.push('ok'); if (k === a && a !== q.c) cls.push('ko'); if (k === a) cls.push('sel'); }
      else if (c.struck[i][k]) cls.push('struck');
      const of = done && q.of && q.of[k] ? `<div class="ofb">${q.of[k]}</div>` : '';
      return `<div class="${cls.join(' ')}" data-i="${k}"><div class="letter">${'ABC'[k]}</div><div class="box">${o}${of}</div></div>`;
    }).join('');
    let verdict = '';
    if (done) {
      const ok = a === q.c;
      verdict = `<div class="verdict-bar ${ok ? 'good' : 'bad'}">${icon(ok ? 'check' : 'close')}<b>${ok ? 'Correct' : 'Incorrect'}</b>${ok ? '' : `<span>Correct answer: ${'ABC'[q.c]}</span>`}</div>
        ${q.f ? `<div class="explain"><div class="eh">Explanation</div>${q.f}</div>` : ''}`;
    }
    this.$('.item').innerHTML = `<div class="stem">${q.stem}</div><div class="answer-options ${done ? 'locked' : ''}">${opts}</div>${verdict}`;
    this.$('.content-holder').scrollTop = 0;
    this.$('.back').disabled = i === 0;
    this.$('.next').disabled = i === c.qids.length - 1;
    this.$('.timer-button .val').textContent = hms(c.elapsed || 0);
    this.paintNav(); this.paintFlag(); this.paintProgress();
  },
  answer(k) {
    const c = this.c, i = c.idx;
    if (c.ans[i] >= 0) return;
    const q = pq(c.qids[i]);
    c.ans[i] = k;
    const ok = k === q.c ? 1 : 0;
    const log = Store.data.practice.log;
    (log[c.qids[i]] ||= []).push([Date.now(), k, ok, Math.round(c.qt[i] * 10) / 10]);
    Store.save();
    const h = this.$('.content-holder'), y = h.scrollTop;
    this.render();
    h.scrollTop = y;
  },
  paintNav() {
    const c = this.c;
    this.root.querySelectorAll('.main-nav-list .nav-button').forEach((b, i) => {
      b.classList.toggle('nav-active', i === c.idx);
      b.classList.toggle('nav-done', c.ans[i] >= 0);
      b.classList.toggle('nav-flagged', !!c.flag[i]);
      const res = c.ans[i] < 0 ? '' : c.ans[i] === pq(c.qids[i]).c ? 'good' : 'bad';
      b.querySelector('.res').className = 'res ' + res;
    });
    const sc = this.$('.nav-scroll'), rows = Math.floor(sc.clientHeight / 28), first = Math.round(sc.scrollTop / 28);
    if (c.idx < first) sc.scrollTop = c.idx * 28; else if (c.idx >= first + rows) sc.scrollTop = (c.idx - rows + 1) * 28;
    this.arrows();
  },
  arrows() {
    const sc = this.$('.nav-scroll'), over = sc.scrollHeight > sc.clientHeight + 2;
    ['up', 'down'].forEach(d => (this.$('.nav-arrow.' + d).style.display = over ? '' : 'none'));
    this.$('.nav-arrow.up').disabled = sc.scrollTop <= 0;
    this.$('.nav-arrow.down').disabled = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
  },
  paintFlag() { const on = !!this.c.flag[this.c.idx]; const b = this.$('.flag-btn'); b.classList.toggle('on', on); b.dataset.tip = on ? 'Unflag' : 'Flag'; },
  paintProgress() {
    const c = this.c, d = c.ans.filter(a => a >= 0).length, p = Math.round((100 * d) / c.qids.length);
    this.$('.ex-progress .bar').style.width = p + '%'; this.$('.ex-progress .pc').textContent = p + '%';
  },
  confirmFinish() {
    const c = this.c, un = c.ans.filter(a => a < 0).length;
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal"><div class="modal-header"><div class="modal-title">Finish Quiz</div><button class="x" type="button">${icon('close')}</button></div>
      <div class="modal-body">${un ? `${icon('warn', 'warn')}<p>You have <b>${un}</b> unanswered question${un > 1 ? 's' : ''}.</p>` : ''}<p>Finish this quiz and see your results?</p></div>
      <div class="modal-actions"><button class="flat-btn" data-k="ok" type="button">Finish</button><button class="flat-btn secondary" data-k="no" type="button">Cancel</button></div></div>`;
    this.root.appendChild(bd);
    bd.querySelector('.x').onclick = () => bd.remove();
    bd.querySelector('[data-k=no]').onclick = () => bd.remove();
    bd.querySelector('[data-k=ok]').onclick = () => { bd.remove(); this.finish(); };
  },
  finish() {
    const c = this.c;
    const s = { id: c.id, kind: c.kind, title: c.title, section: c.section, qids: c.qids, ans: c.ans, flag: c.flag, qt: c.qt.map(x => Math.round(x * 10) / 10), startedAt: c.startedAt, finishedAt: new Date().toISOString() };
    Store.data.practice.sessions.push(s);
    Store.data.practice.current = null;
    Store.save();
    this.close();
    Sync.flush();
    Practice.rv = null;
    location.hash = '#/practice/session/' + s.id;
    App.route();
  },
};
