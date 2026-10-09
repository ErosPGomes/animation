(function () {
'use strict';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const CATS = window.CATS, TERMS = window.TERMS;
const usedIds = new Set();
TERMS.forEach((t, i) => { t.i = i; t.id = slug(t.en); if (usedIds.has(t.id)) t.id += '-' + t.c; usedIds.add(t.id); t.num = String(i + 1).padStart(3, '0'); t.tk = t.tk || t.en.toLowerCase(); t.bk = t.g || t.c; });
const catOf = id => CATS.find(c => c.id === id);
const byId = id => TERMS.find(t => t.id === id);

// ─── Persistência local (conveniência por navegador; tudo funciona sem ela)
const store = {
  get(k, d) { try { const v = localStorage.getItem('lexico.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lexico.' + k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } }
};
const seen = new Set(store.get('seen', []));
function markSeen(t) {
  if (seen.has(t.id)) return; seen.add(t.id); store.set('seen', [...seen]); updateProgress();
  const dot = $(`#termList [data-id="${t.id}"] .dot`); if (dot) dot.classList.add('on');
}
function updateProgress() { $('#seenCount').textContent = seen.size; $('#totalCount').textContent = TERMS.length; $('#seenBar').style.width = (seen.size / TERMS.length * 100) + '%'; }
$('#countTerms').textContent = TERMS.length + ' termos';
$('.slate span:nth-child(3)').textContent = CATS.length + ' categorias';

function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 1800); }
async function copy(text, okMsg, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) {
    if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast('Texto selecionado: use Ctrl+C / ⌘C');
  }
}

// ─── Monitores
function hudFor(fig) {
  const tc = $('[data-tc]', fig), lens = $('[data-lens]', fig);
  return {
    update({ t, info, spec }) {
      const f = Math.floor(t * 24), ff = f % 24, s = Math.floor(f / 24) % 60, m = Math.floor(f / 1440) % 60;
      tc.textContent = `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
      if (lens) lens.textContent = info ? `${Math.round(info.f)}mm · f/${info.N >= 10 ? Math.round(info.N) : info.N.toFixed(1).replace('.0', '')}` : (spec.p2d ? 'papel de animação' : spec.trans ? 'edição' : '');
    }
  };
}
const V = {};
[['v1', 'cv1', 'mon1'], ['v2', 'cv2', 'mon2'], ['v3', 'cv3', 'mon3']].forEach(([k, cv, fig]) => { V[k] = new Anim.Viewer(document.getElementById(cv), hudFor(document.getElementById(fig))); });
V.v3.quiet = true;
function wireMonitor(fig, v) {
  $$('.mon-ctrl button', fig).forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'pause') { const p = v.toggle(); b.setAttribute('aria-pressed', p); b.textContent = p ? 'Continuar' : 'Pausar'; $('.dom-stage', fig).classList.toggle('paused', p); }
    else { v.guides[a] = !v.guides[a]; b.setAttribute('aria-pressed', v.guides[a]); v.draw(); }
  }));
}
wireMonitor($('#mon1'), V.v1); wireMonitor($('#mon2'), V.v2);

// ─── Demos em código (HTML/CSS/JS reais) montadas no palco do monitor
const DEMOS = (window.MOTION && window.MOTION.DEMOS) || {};
{ const st = document.createElement('style'); st.id = 'demo-css'; st.textContent = Object.values(DEMOS).map(d => d.css || '').join('\n'); document.head.appendChild(st); }
const FIG = { v1: 'mon1', v2: 'mon2', v3: 'mon3' }, cleanup = {};
const demoCode = d => d.code || [d.css, d.js && d.js.toString()].filter(Boolean).join('\n\n');
function play(vk, x) {
  const fig = document.getElementById(FIG[vk]), stage = $('.dom-stage', fig), v = V[vk];
  if (cleanup[vk]) { try { cleanup[vk](); } catch (e) { /* demo já removida */ } cleanup[vk] = null; }
  stage.innerHTML = '';
  if (x && x.dom && DEMOS[x.dom]) {
    const d = DEMOS[x.dom];
    v.cv.hidden = true; stage.hidden = false; v.set(null); fig.classList.add('is-dom');
    stage.innerHTML = `<div class="demo demo-${x.dom}">${d.html}</div>`;
    if (d.js) cleanup[vk] = d.js(stage.firstElementChild) || null;
    const lens = $('[data-lens]', fig); if (lens) lens.textContent = 'HTML · CSS · JS';
    const tc = $('[data-tc]', fig); if (tc) tc.textContent = 'AO VIVO';
  } else {
    stage.hidden = true; v.cv.hidden = false; fig.classList.remove('is-dom'); v.resize(); v.set(x);
  }
}

// ─── Abas
const TABS = { explorar: 'v1', montar: 'v2', treinar: 'v3' };
function showTab(id) {
  $$('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.getAttribute('aria-controls') === id));
  $$('.view').forEach(s => { s.hidden = s.id !== id; });
  Object.entries(TABS).forEach(([tab, v]) => { tab === id ? (V[v].resize(), V[v].start()) : V[v].stop(); });
  store.set('tab', id);
  if (id === 'treinar' && !quiz.cur) quiz.next();
}
$$('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => showTab(b.getAttribute('aria-controls'))));

// ─── Explorar
let curCat = store.get('cat', 'plano'), curTerm = null, query = '';
function renderCats() {
  $('#cats').innerHTML = CATS.map(c => `<button class="cat${c.code ? ' code' : ''}" role="tab" data-cat="${c.id}" aria-selected="${c.id === curCat && !query}"><b>${esc(c.pt)}</b><small>${esc(c.en)} · ${TERMS.filter(t => t.c === c.id).length}</small></button>`).join('');
}
$('#cats').addEventListener('click', e => {
  const b = e.target.closest('.cat'); if (!b) return;
  curCat = b.dataset.cat; store.set('cat', curCat); query = ''; $('#q').value = '';
  renderCats(); renderList(); const first = TERMS.find(t => t.c === curCat); if (first) select(first);
});
function listTerms() {
  if (!query) return TERMS.filter(t => t.c === curCat);
  const q = slug(query).replace(/-/g, ' ');
  return TERMS.filter(t => [t.en, t.pt, t.d, t.tk].some(s => slug(s).replace(/-/g, ' ').includes(q)));
}
function renderList() {
  const items = listTerms(), ol = $('#termList');
  if (!items.length) { ol.innerHTML = `<li class="empty">Nenhum termo para “${esc(query)}”. Tente em inglês ou português: pan, foco, luz.</li>`; return; }
  let html = '', lastCat = null;
  for (const t of items) {
    if (query && t.c !== lastCat) { html += `<li class="group">${esc(catOf(t.c).pt)}</li>`; lastCat = t.c; }
    html += `<li><button data-id="${t.id}" aria-current="${curTerm === t}"><span class="n">${t.num}</span><span class="en">${esc(t.en)}</span><span class="pt">${esc(t.pt)}</span><span class="dot${seen.has(t.id) ? ' on' : ''}"></span></button></li>`;
  }
  ol.innerHTML = html;
}
$('#termList').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) select(byId(b.dataset.id)); });
$('#termList').addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const bs = $$('#termList button[data-id]'), i = bs.indexOf(document.activeElement); if (i < 0) return;
  e.preventDefault(); const n = bs[Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; n.focus(); select(byId(n.dataset.id));
});
$('#q').addEventListener('input', e => { query = e.target.value.trim(); renderCats(); renderList(); });

function highlightPrompt(p, t) {
  // destaca o trecho que corresponde ao termo (melhor esforço, sem regex do usuário)
  const keys = [t.tk, t.en].map(s => s.toLowerCase().replace(/\s*\(.*\)/, ''));
  const low = p.toLowerCase();
  for (const k of keys) { const i = low.indexOf(k); if (i >= 0) return esc(p.slice(0, i)) + '<mark>' + esc(p.slice(i, i + k.length)) + '</mark>' + esc(p.slice(i + k.length)); }
  const first = t.en.toLowerCase().split(/[\s-]/)[0], i = low.indexOf(first);
  return i >= 0 ? esc(p.slice(0, i)) + '<mark>' + esc(p.slice(i, i + first.length)) + '</mark>' + esc(p.slice(i + first.length)) : esc(p);
}
function select(t, opts) {
  if (!t) return; curTerm = t;
  if (!query && t.c !== curCat) { curCat = t.c; store.set('cat', curCat); renderCats(); renderList(); }
  $$('#termList button[data-id]').forEach(b => b.setAttribute('aria-current', b.dataset.id === t.id));
  const cat = catOf(t.c), list = TERMS.filter(x => x.c === t.c), pos = list.indexOf(t);
  $('#detail').innerHTML = `
    <div class="d-head"><span class="cat-tag">${esc(cat.pt)} · ${esc(cat.en)}</span><span>Nº ${t.num} · ${pos + 1}/${list.length} na categoria</span></div>
    <div class="d-title"><h2>${esc(t.en)}</h2><p>${esc(t.pt)}</p></div>
    <div class="d-grid"><div class="d-cell"><h3>O que é</h3><p>${esc(t.d)}</p></div><div class="d-cell"><h3>Efeito · quando usar</h3><p>${esc(t.u)}</p></div></div>
    <div class="prompt-box"><h3>${cat.code ? 'Peça ao Claude' : 'Como escrever no prompt'}</h3><code id="exPrompt">${highlightPrompt(t.p, t)}</code>
      <div class="pb-row"><button class="btn ghost" type="button" data-do="copy">Copiar exemplo</button>${cat.code ? '' : '<button class="btn" type="button" data-do="use">Usar no montador</button>'}</div></div>
    ${t.x.dom && DEMOS[t.x.dom] ? `<div class="code-box"><div class="cb-head"><h3>Código desta demo</h3><button class="link-btn" type="button" data-do="code">Copiar código</button></div><pre id="exCode">${esc(demoCode(DEMOS[t.x.dom]))}</pre></div>` : ''}
    ${t.v ? `<p class="vs"><b>Não confunda</b>${esc(t.v)}</p>` : ''}
    <div class="d-actions"><div class="d-nav"><button class="btn ghost" type="button" data-do="prev" ${pos === 0 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" type="button" data-do="next" ${pos === list.length - 1 ? 'disabled' : ''}>Próximo →</button></div><span class="kbd">↑ ↓ na lista navega</span></div>`;
  play('v1', t.x);
  markSeen(t);
  if (!opts || !opts.noHash) { try { history.replaceState(null, '', '#' + t.id); } catch (e) { /* sandbox */ } }
}
$('#detail').addEventListener('click', e => {
  const b = e.target.closest('[data-do]'); if (!b || !curTerm) return;
  const list = TERMS.filter(x => x.c === curTerm.c), pos = list.indexOf(curTerm);
  if (b.dataset.do === 'copy') copy(curTerm.p, 'Exemplo copiado', $('#exPrompt'));
  if (b.dataset.do === 'code') copy($('#exCode').textContent, 'Código copiado', $('#exCode'));
  if (b.dataset.do === 'prev' && pos > 0) select(list[pos - 1]);
  if (b.dataset.do === 'next' && pos < list.length - 1) select(list[pos + 1]);
  if (b.dataset.do === 'use') { builder.setTerm(curTerm); showTab('montar'); toast(`“${curTerm.en}” adicionado à folha`); }
});

// ─── Montar prompt
const BSEL = [
  ['plano', 'Plano', 'enquadramento'], ['angulo', 'Ângulo', 'de onde olha'], ['movimento', 'Movimento', 'câmera'], ['lente', 'Lente', 'focal'],
  ['foco', 'Foco', 'profundidade'], ['luz', 'Luz', ''], ['composicao', 'Composição', ''], ['atmos', 'Atmosfera', 'clima / fx'],
  ['estilo', 'Estilo', 'técnica'], ['cor', 'Cor', 'grade / textura'], ['tempo', 'Tempo', 'ritmo'], ['principios', 'Atuação', 'princípio'], ['edicao', 'Transição', 'edição']
];
const SENT = { movimento: 'Camera: ', lente: 'Lens: ', luz: 'Lighting: ', composicao: 'Composition: ', atmos: 'Atmosphere: ', estilo: 'Style: ', cor: 'Color: ', tempo: 'Timing: ', principios: 'Animation: ', edicao: 'Transition: ' };
const builder = {
  sel: {},
  init() {
    $('#bSelects').innerHTML = BSEL.map(([k, name, hint]) => {
      const opts = TERMS.filter(t => t.bk === k);
      return `<div class="fsel"><label for="s-${k}">${name}${hint ? `<small>${hint}</small>` : ''}</label><select id="s-${k}" data-k="${k}"><option value="">—</option>${opts.map(t => `<option value="${t.id}">${esc(t.en)} · ${esc(t.pt)}</option>`).join('')}</select></div>`;
    }).join('');
    const saved = store.get('builder', null);
    const def = saved || { plano: 'medium-shot', angulo: 'low-angle', movimento: 'push-in', lente: '85mm-portrait-lens', foco: 'shallow-depth-of-field', luz: 'golden-hour', cor: '35mm-film-look' };
    if (saved && saved.text) ['bSubject', 'bAction', 'bSetting'].forEach((id, i) => { if (saved.text[i] != null) $('#' + id).value = saved.text[i]; });
    BSEL.forEach(([k]) => { const s = $('#s-' + k); s.value = def[k] && byId(def[k]) ? def[k] : ''; });
    $('#bform').addEventListener('input', () => this.update());
    $('#bform').addEventListener('submit', e => e.preventDefault());
    $('#bClear').addEventListener('click', () => { BSEL.forEach(([k]) => { $('#s-' + k).value = ''; }); this.update(); });
    $('#bRandom').addEventListener('click', () => {
      ['plano', 'angulo', 'movimento', 'lente', 'luz', 'estilo', 'cor'].forEach(k => { const o = TERMS.filter(t => t.bk === k); $('#s-' + k).value = o[Math.floor(Math.random() * o.length)].id; });
      ['foco', 'composicao', 'atmos', 'tempo', 'principios', 'edicao'].forEach(k => { $('#s-' + k).value = ''; });
      this.update();
    });
    $('#copyPrompt').addEventListener('click', () => copy(this.prompt, 'Prompt copiado', $('#promptText')));
    $('#copyNeg').addEventListener('click', () => copy($('#negText').textContent, 'Negativo copiado', $('#negText')));
    this.update();
  },
  setTerm(t) { const s = $('#s-' + t.bk); if (s) { s.value = t.id; this.update(); } },
  read() { const o = {}; BSEL.forEach(([k]) => { const v = $('#s-' + k).value; o[k] = v ? byId(v) : null; }); return o; },
  spec(sel) {
    const S = { shot: 'ms', fx: [] };
    const take = (t, keys) => { if (!t || !t.x) return; for (const k of keys) { const v = t.x[k]; if (v === undefined) continue; if (k === 'fx') S.fx.push(...v); else if (k === 'lens') S.lens = Object.assign({}, S.lens, v); else S[k] = v; } };
    take(sel.plano, ['shot']); take(sel.angulo, ['angle']); take(sel.lente, ['lens', 'fx']); take(sel.foco, ['lens', 'rack', 'fx']);
    take(sel.movimento, ['move', 'act', 'mb']); take(sel.luz, ['light', 'fx']); take(sel.composicao, ['comp', 'fx']); take(sel.atmos, ['fx']);
    take(sel.estilo, ['style']); take(sel.cor, ['grade', 'fx']); take(sel.tempo, sel.tempo && sel.tempo.x.p2d ? [] : ['time', 'act', 'mb', 'fx']);
    if (sel.foco && sel.foco.x.lens && sel.lente && sel.lente.x.lens) S.lens.f = sel.lente.x.lens.f; // a lente escolhida manda na focal
    if (sel.foco && sel.foco.id === 'bokeh' && !sel.luz) S.light = 'blue';
    return S;
  },
  update() {
    const sel = this.read(), text = ['bSubject', 'bAction', 'bSetting'].map(id => $('#' + id).value.trim());
    BSEL.forEach(([k]) => $('#s-' + k).classList.toggle('set', !!sel[k]));
    store.set('builder', Object.assign({ text }, Object.fromEntries(BSEL.map(([k]) => [k, sel[k] ? sel[k].id : '']))));
    // frase-cabeça: plano + ângulo, depois assunto/ação/cenário
    const segs = [];
    const head = [sel.plano && sel.plano.tk, sel.angulo && sel.angulo.tk].filter(Boolean);
    if (head.length) segs.push({ k: 'plano', t: cap(head.join(', ')) + '. ' });
    const subj = [text[0], text[1]].filter(Boolean).join(' ') + (text[2] ? ', ' + text[2] : '');
    if (subj.trim()) segs.push({ k: null, t: cap(subj) + '. ' });
    const lensTxt = [sel.lente && sel.lente.tk, sel.foco && sel.foco.tk].filter(Boolean).join(', ');
    for (const k of ['movimento', 'lente', 'luz', 'composicao', 'atmos', 'estilo', 'cor', 'tempo', 'principios', 'edicao']) {
      if (k === 'lente') { if (lensTxt) segs.push({ k, t: SENT.lente + lensTxt + '. ' }); continue; }
      if (sel[k]) segs.push({ k, t: SENT[k] + sel[k].tk + '. ' });
    }
    this.prompt = segs.map(s => s.t).join('').trim();
    $('#promptText').innerHTML = segs.length ? segs.map(s => `<span class="${s.k ? '' : 'fixed'}">${esc(s.t)}</span>`).join('') : '<span class="fixed">Escolha ao menos um termo ou escreva o assunto.</span>';
    const words = this.prompt ? this.prompt.split(/\s+/).length : 0;
    $('#pMeta').textContent = `${words} palavras · ${this.prompt.length} caracteres`;
    // folha (tabela)
    const rows = []; const lab = Object.fromEntries(BSEL.map(([k, n]) => [k, n]));
    for (const [k] of BSEL) if (sel[k]) rows.push(`<tr><td>${esc(lab[k])}</td><td>${esc(sel[k].en)}<br><small>${esc(sel[k].pt)}</small></td><td>${esc(sel[k].tk)}</td></tr>`);
    $('#xsTable tbody').innerHTML = rows.join('') || '<tr><td colspan="3">Nenhuma camada definida.</td></tr>';
    // negativo
    const neg = ['morphing', 'warped limbs', 'extra fingers', 'flickering', 'distorted face', 'text', 'watermark'];
    if (sel.movimento && sel.movimento.id === 'static-shot') neg.unshift('camera movement', 'camera shake');
    if (sel.movimento && ['steadicam', 'dolly-in', 'push-in', 'dolly-out', 'crane-shot'].includes(sel.movimento.id)) neg.unshift('shaky camera');
    if (sel.estilo && ['hand-drawn-2d-animation', 'anime-style', 'paper-cutout', 'pixel-art', 'watercolor'].includes(sel.estilo.id)) neg.unshift('3D render', 'photorealistic');
    if (sel.estilo && sel.estilo.id === '3d-cgi-animation') neg.unshift('flat 2D');
    if (sel.cor && sel.cor.id === 'black-and-white') neg.unshift('color');
    if (sel.foco && sel.foco.id === 'deep-focus') neg.unshift('background blur');
    $('#negText').textContent = neg.join(', ');
    play('v2', this.spec(sel));
  }
};

// ─── Treinar
const quiz = {
  mode: 'watch', cat: '', cur: null, ok: 0, streak: 0, best: store.get('best', 0), recent: [],
  init() {
    $('#qCat').innerHTML = '<option value="">Todas</option>' + CATS.map(c => `<option value="${c.id}">${esc(c.pt)}</option>`).join('');
    $('#qCat').addEventListener('change', e => { this.cat = e.target.value; this.next(); });
    $$('.q-modes [data-mode]').forEach(b => b.addEventListener('click', () => {
      this.mode = b.dataset.mode; $$('.q-modes [data-mode]').forEach(x => x.setAttribute('aria-checked', x === b)); this.next();
    }));
    $('#qNext').addEventListener('click', () => this.next());
    $('#qBest').textContent = this.best;
  },
  next() {
    const pool = TERMS.filter(t => !this.cat || t.c === this.cat);
    let cand = pool.filter(t => !this.recent.includes(t.id)); if (!cand.length) cand = pool;
    const ans = cand[Math.floor(Math.random() * cand.length)];
    this.recent.push(ans.id); if (this.recent.length > Math.min(12, pool.length - 1)) this.recent.shift();
    let same = TERMS.filter(t => t.c === ans.c && t !== ans);
    if (same.length < 3) same = same.concat(TERMS.filter(t => t.c !== ans.c && t !== ans));
    const opts = [ans]; while (opts.length < 4) { const o = same.splice(Math.floor(Math.random() * Math.min(same.length, 12)), 1)[0]; if (o) opts.push(o); else break; }
    opts.sort(() => Math.random() - .5);
    this.cur = ans;
    const watch = this.mode === 'watch';
    $('#mon3').hidden = !watch; $('#qRead').hidden = watch;
    if (watch) play('v3', ans.x); else { play('v3', null); $('#qDef').textContent = ans.d; }
    $('#qAsk').textContent = watch ? 'Que termo descreve esta demonstração?' : 'Que termo corresponde a esta definição?';
    $('#qOpts').innerHTML = opts.map(o => `<button class="q-opt" type="button" data-id="${o.id}"><b>${esc(o.en)}</b><small>${esc(o.pt)}</small></button>`).join('');
    $('#qFeedback').textContent = ''; $('#qFeedback').className = 'q-feedback';
  },
  answer(id) {
    const right = id === this.cur.id, t = this.cur;
    $$('#qOpts .q-opt').forEach(b => { b.disabled = true; if (b.dataset.id === t.id) b.classList.add('right'); else if (b.dataset.id === id) b.classList.add('wrong'); });
    if (right) { this.ok++; this.streak++; if (this.streak > this.best) { this.best = this.streak; store.set('best', this.best); } }
    else this.streak = 0;
    $('#qOk').textContent = this.ok; $('#qStreak').textContent = this.streak; $('#qBest').textContent = this.best;
    const fb = $('#qFeedback'); fb.className = 'q-feedback ' + (right ? 'ok' : 'bad');
    fb.textContent = (right ? 'Certo. ' : `Era ${t.en} (${t.pt}). `) + t.d;
    markSeen(t); $('#qNext').focus();
  }
};
$('#qOpts').addEventListener('click', e => { const b = e.target.closest('.q-opt'); if (b && !b.disabled) quiz.answer(b.dataset.id); });

// ─── Início
updateProgress(); renderCats(); renderList(); builder.init(); quiz.init();
const fromHash = location.hash ? byId(location.hash.slice(1)) : null;
select(fromHash || TERMS.find(t => t.c === curCat) || TERMS[0], { noHash: !fromHash });
const startTab = store.get('tab', 'explorar');
showTab(TABS[startTab] ? startTab : 'explorar');
const cur = $('#termList [aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
})();
