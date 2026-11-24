/* Data + persistence. Questions live in IndexedDB (imported once from the
   private data file); progress, attempts and preferences live in localStorage. */
const TOPICS = {
  ETH: { name: 'Ethical and Professional Standards', short: 'Ethics', es: 'Ética' },
  QM:  { name: 'Quantitative Methods', short: 'Quant', es: 'Métodos cuantitativos' },
  EC:  { name: 'Economics', short: 'Economics', es: 'Economía' },
  FSA: { name: 'Financial Statement Analysis', short: 'FSA', es: 'Análisis de estados financieros' },
  CI:  { name: 'Corporate Issuers', short: 'Corporate Issuers', es: 'Emisores corporativos' },
  EQ:  { name: 'Equity Investments', short: 'Equity', es: 'Renta variable' },
  FI:  { name: 'Fixed Income', short: 'Fixed Income', es: 'Renta fija' },
  DER: { name: 'Derivatives', short: 'Derivatives', es: 'Derivados' },
  ALT: { name: 'Alternative Investments', short: 'Alternatives', es: 'Inversiones alternativas' },
  PM:  { name: 'Portfolio Management', short: 'Portfolio Mgmt', es: 'Gestión de carteras' },
};
const TOPIC_ORDER = ['ETH', 'QM', 'EC', 'FSA', 'CI', 'EQ', 'FI', 'DER', 'ALT', 'PM'];
const SESSION_TOPICS = { 1: ['ETH', 'QM', 'EC', 'FSA', 'CI'], 2: ['EQ', 'FI', 'DER', 'ALT', 'PM'] };
const SESSION_SECONDS = 2 * 3600 + 15 * 60;
const BREAK_SECONDS = 30 * 60;
const PASS_LINE = 70;
const N_MOCKS = 8;
const Q_PER_SESSION = 90;

/* ---------------- IndexedDB (question bank) ---------------- */
const DB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('cfa-mock-exams', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function get(key) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  }
  async function set(key, val) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
  return { get, set };
})();

let BANK = null; // { mocks: { '1': { '1': [q...], '2': [q...] } } }

async function loadBank() {
  try { BANK = await DB.get('bank'); } catch (e) { BANK = null; }
  if (!BANK) {
    // Optional: a data file placed next to the app (local use only)
    try {
      const r = await fetch('data/mocks-cfa-2026.json', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (validBank(j)) { BANK = j; await DB.set('bank', j); } }
    } catch (e) { /* not present: user imports it */ }
  }
  return BANK;
}
function validBank(j) {
  return j && j.format === 'cfa-mocks' && j.mocks && Object.keys(j.mocks).length >= 1 &&
    Array.isArray(j.mocks['1']?.['1']);
}
async function importBank(file) {
  const txt = await file.text();
  const j = JSON.parse(txt);
  if (!validBank(j)) throw new Error('El archivo no tiene el formato de preguntas esperado.');
  await DB.set('bank', j);
  BANK = j;
  return j;
}
function getQuestions(mock, session) { return BANK.mocks[String(mock)][String(session)]; }

/* ---------------- Practice bank (CFA 2027 practice questions) ---------------- */
let PBANK = null; // { readings: [{ r, t, title, qs: [...] }] }
const PTOPICS = [
  { k: 'QM', name: 'Quantitative Methods' }, { k: 'EC', name: 'Economics' }, { k: 'CF', name: 'Corporate Finance' },
  { k: 'FSA', name: 'Financial Statement Analysis' }, { k: 'EQ', name: 'Equities' }, { k: 'FI', name: 'Fixed Income' },
  { k: 'DER', name: 'Derivatives' }, { k: 'ALT', name: 'Alternative Investments' }, { k: 'PM', name: 'Portfolio Construction' },
  { k: 'ETH', name: 'Ethical and Professional Standards' },
];
const PTOPIC_NAME = Object.fromEntries(PTOPICS.map(t => [t.k, t.name]));
function validPractice(j) { return j && j.format === 'cfa-practice' && Array.isArray(j.readings) && j.readings.length > 0; }
async function loadPractice() {
  try { PBANK = await DB.get('practice'); } catch (e) { PBANK = null; }
  if (!PBANK) {
    try {
      const r = await fetch('data/practice-cfa-2027.json', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (validPractice(j)) { PBANK = j; await DB.set('practice', j); } }
    } catch (e) { /* not present */ }
  }
  return PBANK;
}
/* Import either data file; returns 'mocks' or 'practice' */
async function importAnyBank(file) {
  const j = JSON.parse(await file.text());
  if (validBank(j)) { await DB.set('bank', j); BANK = j; return 'mocks'; }
  if (validPractice(j)) { await DB.set('practice', j); PBANK = j; return 'practice'; }
  throw new Error('El archivo no es de preguntas de esta app (mocks-cfa-2026.json o practice-cfa-2027.json).');
}
function reading(r) { return PBANK.readings.find(x => x.r === r); }
function pq(qid) { const [r, i] = qid.split('-').map(Number); return reading(r).qs[i]; }

/* ---------------- localStorage state ---------------- */
const LS_KEY = 'cfaMockExams.v1';
const Store = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (e) { this.data = null; }
    if (!this.data) this.data = {};
    this.data.attempts ||= [];
    this.data.current ||= null;
    this.data.topicOverrides ||= {};
    this.data.prefs ||= { theme: null };
    this.data.deleted ||= [];
    this.data.practice ||= {};
    this.data.practice.log ||= {};        // qid -> [[timestamp, answerIdx, correct(0/1), seconds]]
    this.data.practice.sessions ||= [];   // finished quizzes
    this.data.practice.current ||= null;  // quiz in progress
    return this.data;
  },
  save(fromSync) {
    if (!fromSync) {
      this.data.savedAt = Date.now();
      if (this.data.current) this.data.current.savedAt = this.data.savedAt;
      if (this.data.practice && this.data.practice.current) this.data.practice.current.savedAt = this.data.savedAt;
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }
    catch (e) { console.error('No se pudo guardar', e); }
    if (!fromSync && typeof Sync !== 'undefined') Sync.schedule();
  },
  exportJSON() {
    return JSON.stringify({ format: 'cfa-mocks-progress', exportedAt: new Date().toISOString(), data: this.data }, null, 1);
  },
  importJSON(txt) {
    const j = JSON.parse(txt);
    if (j.format !== 'cfa-mocks-progress' || !j.data) throw new Error('No es una copia de seguridad de esta app.');
    this.data = j.data; this.load(); this.save();
  },
};

/* ---------------- scoring helpers ---------------- */
function topicOf(mock, session, i) {
  return Store.data.topicOverrides[`${mock}-${session}-${i}`] || getQuestions(mock, session)[i].t;
}
function scoreSession(mock, session, ans) {
  const qs = getQuestions(mock, session);
  let c = 0;
  ans.forEach((a, i) => { if (a === qs[i].c) c++; });
  return c;
}
function attemptTopicStats(att) {
  const out = {};
  TOPIC_ORDER.forEach(t => (out[t] = [0, 0]));
  for (const s of [1, 2]) {
    const ss = att.s[s]; if (!ss) continue;
    const qs = getQuestions(att.mock, s);
    ss.ans.forEach((a, i) => {
      const t = topicOf(att.mock, s, i);
      out[t][1]++;
      if (a === qs[i].c) out[t][0]++;
    });
  }
  return out;
}
function attemptTotals(att) {
  let c = 0, n = 0, secs = 0;
  for (const s of [1, 2]) {
    const ss = att.s[s]; if (!ss) continue;
    c += scoreSession(att.mock, s, ss.ans); n += ss.ans.length; secs += ss.used;
  }
  return { c, n, pct: n ? (100 * c) / n : 0, secs };
}

/* ---------------- formatting ---------------- */
function hms(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function pct(x, d = 1) { return (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'; }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
